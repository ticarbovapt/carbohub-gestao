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
  // Incrementais: só a janela dos últimos dias. São as que rodam de 30 em 30
  // minutos, para a NF da venda on-line aparecer no mesmo turno.
  "orders_recente", "nfe_recente",
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

    // ── Trabalho em SEGUNDO PLANO, resposta na hora ─────────────────────────
    //
    // O `net.http_post` do pg_cron desiste em 5 SEGUNDOS (padrão do pg_net,
    // não configurado aqui). Esta função leva minutos, então toda execução
    // deixava no `net._http_response` uma linha `timed_out = true` com
    // status_code nulo — indistinguível de "o cron não disparou". Foi
    // exatamente essa ambiguidade que travou o diagnóstico.
    //
    // Aumentar o timeout do pg_net seria pior: prenderia o worker do pg_cron
    // por minutos. O certo é devolver 202 imediatamente e seguir trabalhando —
    // é para isso que existe o `EdgeRuntime.waitUntil`, que segura a instância
    // viva depois da resposta.
    const trabalho = (async () => {
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
      console.log(`[bling2-auto-sync] fim. Fonte: ${source}. Resultado:`, JSON.stringify(resultado));
    })();

    // O runtime pode não expor `waitUntil` (versão antiga, execução local).
    // Sem ele, a instância poderia ser recolhida logo após a resposta e as
    // fases morreriam no meio — então aí voltamos a aguardar, que é lento mas
    // correto. Nunca ficar sem nenhum dos dois.
    const rt = (globalThis as any).EdgeRuntime;
    if (rt && typeof rt.waitUntil === "function") {
      rt.waitUntil(trabalho);
      // O acompanhamento é pelo `bling2_sync_log`, não por esta resposta: quem
      // dispara já foi embora quando as fases terminam.
      return new Response(
        JSON.stringify({ success: true, source, fases, aceito: true, acompanhe: "public.bling2_sync_log" }),
        { status: 202, headers: { "Content-Type": "application/json" } }
      );
    }

    console.warn("[bling2-auto-sync] EdgeRuntime.waitUntil indisponível — aguardando as fases.");
    await trabalho;
    return new Response(JSON.stringify({ success: true, source, fases }), {
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
