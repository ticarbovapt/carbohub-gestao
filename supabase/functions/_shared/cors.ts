// ─────────────────────────────────────────────────────────────────────────────
// As origens que podem chamar as funções do WhatsApp — num lugar só.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE
//
// A lista estava COPIADA em `whatsapp-responder`, `whatsapp-midia` e
// `whatsapp-midia-baixar`, e nenhuma das três aprendeu o
// `atendimento.carbohub.com.br` quando a tela de Conversas mudou de casa.
//
// O sintoma foi `Failed to fetch` no vídeo que o cliente mandou — erro do
// NAVEGADOR, antes de qualquer resposta, sem nada no log da função. Quem atende
// via o balão do vídeo e não conseguia abrir; nada explicava por quê.
//
// É a terceira vez que a mesma forma de erro aparece nesta semana: a lista de
// interfaces internas em TypeScript, o `interfaces.ts` do Admin, e agora esta.
// Todas com o mesmo desfecho — o app novo nasce e a cópia não sabe.
//
// ⚠️ App novo no hub entra AQUI. Se um dia a tela de Conversas for para outro
// subdomínio, é esta lista que precisa saber primeiro.
// ─────────────────────────────────────────────────────────────────────────────

export const ORIGENS_PERMITIDAS = [
  // ⭐ O app do Atendimento é hoje a ÚNICA casa da tela de Conversas
  // (mudou do admin/ops em 28/08/2026).
  "https://atendimento.carbohub.com.br",
  "https://admin.carbohub.com.br",
  "https://ops.carbohub.com.br",
  "https://carbohub-admin.vercel.app",
  "http://localhost:8080",
  "http://localhost:8082",
  "http://localhost:8088",
  "http://localhost:5173",
];

/**
 * Cabeçalhos de CORS para a requisição.
 *
 * ⚠️ Origem desconhecida recebe a PRIMEIRA da lista, não a que pediu — ou seja,
 * o navegador dela recusa. É o comportamento correto: devolver `*` ou ecoar
 * qualquer `Origin` deixaria qualquer site chamar estas funções com o cookie de
 * sessão de quem estivesse logado, e estas funções escrevem pelo WhatsApp da
 * empresa.
 */
export function cors(req: Request, metodos = "GET, POST, OPTIONS") {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENS_PERMITIDAS.includes(origin)
      ? origin
      : ORIGENS_PERMITIDAS[0],
    "Access-Control-Allow-Methods": metodos,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
