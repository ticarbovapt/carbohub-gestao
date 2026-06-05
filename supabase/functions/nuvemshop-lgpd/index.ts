/**
 * nuvemshop-lgpd — endpoints obrigatórios de privacidade (LGPD) da Nuvemshop.
 *
 * A Nuvemshop exige 3 webhooks de conformidade que ela chama em eventos de
 * privacidade (loja desinstala o app, cliente pede exclusão/cópia dos dados).
 * Como NÃO armazenamos dados pessoais de clientes finais (só pedidos para
 * dedução de estoque), apenas confirmamos o recebimento com 200 OK e logamos.
 *
 * Eventos: store/redact, customers/redact, customers/data_request
 */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  let body = "";
  try { body = await req.text(); } catch { /* ignore */ }
  console.log("[nuvemshop-lgpd] Evento de privacidade recebido:", body.slice(0, 500));

  // 200 OK é o suficiente para a Nuvemshop considerar o webhook atendido.
  return new Response(JSON.stringify({ ok: true, received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
