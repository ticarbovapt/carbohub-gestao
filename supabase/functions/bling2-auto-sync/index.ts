// ═══════════════════════════════════════════════════════════════════════════
// bling2-auto-sync — disparo pelo pg_cron (sem JWT de usuário)
//
// Valida X-Cron-Secret e chama o `bling2-sync` uma FASE por invocação.
//
// ⚠️ Por que uma invocação por fase, e não `entity: "all"`: `order_details` e
// `nfe` fazem uma chamada à API do Bling POR REGISTRO. Numa invocação só, elas
// consomem o tempo da função e matam as fases seguintes no meio — foi o que
// aconteceu no Bling 1. Cada fase com orçamento de tempo próprio, e cada uma
// tolerante a erro da anterior.
// ═══════════════════════════════════════════════════════════════════════════

// Ordem = dependência: variações/estoque precisam de produtos; contas
// resolvem nome em contatos; detalhes precisam dos pedidos listados.
const FASES = [
  "products", "variacoes", "stock", "contacts", "vendedores",
  "orders", "order_details", "nfe",
  "contas_pagar", "contas_receber", "pedidos_compra",
];

Deno.serve(async (req: Request): Promise<Response> => {
  const cronSecret = req.headers.get("X-Cron-Secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");

  if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
    console.warn("[bling2-auto-sync] chamada não autorizada — X-Cron-Secret ausente ou inválido");
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
    // Permite disparar um subconjunto (ex.: só as fases lentas, num horário
    // de menos movimento) sem precisar de outra função.
    const fases: string[] = Array.isArray((body as any).fases) && (body as any).fases.length
      ? (body as any).fases.filter((f: string) => FASES.includes(f))
      : FASES;

    console.log(`[bling2-auto-sync] início. Fonte: ${source}, fases: ${fases.join(",")}`);

    const rodarFase = async (entity: string) => {
      const resp = await fetch(`${supabaseUrl}/functions/v1/bling2-sync`, {
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

    const resultado: Record<string, unknown> = {};
    for (const fase of fases) {
      try {
        const r = await rodarFase(fase);
        console.log(`[bling2-auto-sync] fase ${fase}: ok=${r.ok} status=${r.status}`);
        resultado[fase] = r.ok ? (r.data?.data?.[fase] ?? "ok") : { error: r.data?.error || `HTTP ${r.status}` };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[bling2-auto-sync] fase ${fase} falhou, seguindo:`, msg);
        resultado[fase] = { error: msg };
      }
    }

    console.log(`[bling2-auto-sync] fim. Fonte: ${source}`);
    return new Response(JSON.stringify({ success: true, source, fases: resultado }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[bling2-auto-sync] erro:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
