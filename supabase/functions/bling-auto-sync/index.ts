// bling-auto-sync — Triggered by pg_cron (no user JWT required)
// Validates X-Cron-Secret header, then calls bling-sync with entity=all

Deno.serve(async (req: Request): Promise<Response> => {
  // Validate cron secret
  const cronSecret = req.headers.get("X-Cron-Secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");

  if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
    console.warn("[bling-auto-sync] Unauthorized call — invalid or missing X-Cron-Secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const source = (body as any).source || "cron";

    console.log(`[bling-auto-sync] Starting phased pipeline. Source: ${source}, Time: ${new Date().toISOString()}`);

    // Roda uma fase do bling-sync em invocação dedicada (cada uma com seu próprio
    // orçamento de tempo). X-Cron-Secret pula a validação de JWT do usuário.
    const runPhase = async (entity: string) => {
      const resp = await fetch(`${supabaseUrl}/functions/v1/bling-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "X-Cron-Secret": cronSecret,
        },
        body: JSON.stringify({ entity, source }),
      });
      const data = await resp.json().catch(() => ({}));
      return { ok: resp.ok && data?.success !== false, status: resp.status, data };
    };

    // ── Fase 1: BUSCA + TRATAMENTO (entity=all) ──────────────────────────────
    // Pode estourar o tempo (order_details/nfe = 1 chamada por registro). Tolerante:
    // o que foi buscado fica persistido e a importação roda em invocação própria.
    try {
      const fetchRes = await runPhase("all");
      console.log(`[bling-auto-sync] sync phase (all): ok=${fetchRes.ok} status=${fetchRes.status}`);
    } catch (e) {
      console.warn("[bling-auto-sync] sync phase failed (likely timeout), continuing to bridge:", e instanceof Error ? e.message : e);
    }

    // ── Fase 2: IMPORTAÇÃO (bridge) — a que popula carboze_orders ────────────
    const bridgeRes = await runPhase("bridge");
    if (!bridgeRes.ok) {
      const errMsg = bridgeRes.data?.error || `HTTP ${bridgeRes.status}`;
      console.error("[bling-auto-sync] bridge phase failed:", errMsg);
      return new Response(JSON.stringify({ success: false, error: errMsg, phase: "bridge" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[bling-auto-sync] Phased pipeline completed. Source: ${source}`);

    return new Response(JSON.stringify({ success: true, source, bridge: bridgeRes.data?.data ?? null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[bling-auto-sync] Pipeline error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
