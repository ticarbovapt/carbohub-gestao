// Leitura que ESCALA — e o alarme para quando alguma não escala.
//
// ⚠️ O PostgREST corta toda resposta em 1.000 linhas e NÃO AVISA: não há erro,
// não há campo "truncado", a resposta parece completa. Vale para tabela, view
// e RPC `returns setof`/`table`. E `.limit(5000)` NÃO fura o teto: vira 1.000
// do mesmo jeito. O defeito é invisível até o volume cruzar — foi assim que o
// Dashboard Comercial perdeu meses inteiros, o Carbo Chat congelou num dia e a
// busca de Conversas deu "0 de 435" para quem tinha recebido mensagem.
//
// Por isso, num lugar só, para os oito apps:
//
//   lerSemTeto        lê TODAS as linhas, em páginas de 1.000
//   lerPorIdsSemTeto  `.in(coluna, ids)` em lotes (URL longa estoura) e cada
//                     lote lido sem teto
//   fetchQueAcusaTeto o `fetch` do cliente Supabase: toda leitura que voltar
//                     com 1.000 linhas SEM ter pedido limite foi CORTADA — ela
//                     aparece no console e vai para `carbo_teto_atingido`, a
//                     lista de trabalho que se preenche sozinha em produção.
//
// ⚠️ ORDEM ESTÁVEL é obrigatória ao paginar: a última coluna do `.order()` tem
// de ser única (`id`). Com empate (DATE, status), a mesma linha volta em duas
// páginas e outra em nenhuma — número LIGEIRAMENTE errado, que ninguém nota.
// ⚠️ Isto não é filtro. Conjunto grande se encolhe no `where`, ou é agregado
// no BANCO (view/RPC que devolve o total, não as linhas).

/* eslint-disable @typescript-eslint/no-explicit-any */

/** O teto do PostgREST neste projeto (Supabase → API → Max rows). */
export const TETO_POSTGREST = 1000;

// Sem teto de sanidade, um filtro esquecido baixa a tabela inteira e trava a
// aba. Falhar alto e explicando é melhor que rodar para sempre.
const TETO_ABSURDO = 200_000;

/**
 * Lê todas as linhas. `montar` devolve a consulta SEM `.range()` — este helper
 * põe o `.range()` de cada página. Erro SOBE: leitura que falha não vira [].
 *
 *   const pedidos = await lerSemTeto<Pedido>(() =>
 *     supabase.from("carboze_orders").select("id,total")
 *       .gte("created_at", de).order("created_at").order("id"));
 */
export async function lerSemTeto<T = any>(montar: () => any, pagina = TETO_POSTGREST): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; ; de += pagina) {
    const { data, error } = await montar().range(de, de + pagina - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    tudo.push(...lote);
    // Página incompleta = acabou. É o único sinal confiável de fim.
    if (lote.length < pagina) return tudo;
    if (tudo.length >= TETO_ABSURDO) {
      throw new Error(
        `Leitura passou de ${TETO_ABSURDO.toLocaleString("pt-BR")} linhas — falta filtro na consulta, não é volume real.`,
      );
    }
  }
}

/**
 * `.in(coluna, ids)` em lotes, cada lote lido sem teto. Ids repetidos saem.
 *
 *   const itens = await lerPorIdsSemTeto<Item>(ids, (lote) =>
 *     supabase.from("itens").select("*").in("pedido_id", lote).order("id"));
 *
 * ⚠️ Lote de ids NÃO é lote de linhas: 100 pedidos podem ter 700 itens.
 */
export async function lerPorIdsSemTeto<T = any, I = string | number>(
  ids: readonly I[],
  montar: (lote: I[]) => any,
  tamanhoDoLote = 100,
): Promise<T[]> {
  const unicos = [...new Set(ids.filter((x) => x !== null && x !== undefined))];
  if (unicos.length === 0) return [];
  const partes: T[][] = [];
  // Em SÉRIE de propósito: N lotes em paralelo são N consultas simultâneas no
  // banco por aba aberta — é o pico que derruba quando todo mundo abre a tela.
  for (let i = 0; i < unicos.length; i += tamanhoDoLote) {
    const lote = unicos.slice(i, i + tamanhoDoLote);
    partes.push(await lerSemTeto<T>(() => montar(lote)));
  }
  return partes.flat();
}

// ─────────────────────────────────────────────────────────────────────────────
// O alarme
// ─────────────────────────────────────────────────────────────────────────────

const jaAvisados = new Set<string>();

function urlDe(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function cabecalho(init: RequestInit | undefined, input: RequestInfo | URL, nome: string): string | null {
  try {
    const h = new Headers(init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
    return h.get(nome);
  } catch {
    return null;
  }
}

/**
 * O `fetch` para o `createClient(..., { global: { fetch } })`.
 *
 * ⚠️ Ele NUNCA muda a resposta e nunca lança: só olha o cabeçalho
 * `Content-Range`. Leitura que voltou com 1.000 linhas sem `limit` pedido foi
 * cortada pelo PostgREST. Avisa uma vez por (recurso, tela, colunas do filtro)
 * por aba. Os VALORES do filtro não saem daqui — podem ser telefone ou CPF.
 */
export function fetchQueAcusaTeto(app: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fetch(input, init);
    try {
      const url = urlDe(input);
      if (!url.includes("/rest/v1/")) return res;
      const u = new URL(url);
      // Pedido explícito de página (`.range()`/`.limit()`): quem pediu sabe.
      if (u.searchParams.has("limit") || cabecalho(init, input, "Range")) return res;

      const cr = res.headers.get("content-range");
      const m = cr ? /^(\d+)-(\d+)\//.exec(cr) : null;
      if (!m) return res;
      const linhas = Number(m[2]) - Number(m[1]) + 1;
      if (linhas < TETO_POSTGREST) return res;

      const recurso = u.pathname.replace(/^.*\/rest\/v1\//, "");
      if (recurso === "rpc/carbo_teto_registrar") return res;
      const tela = typeof location !== "undefined" ? location.pathname : "";
      const filtro = [...u.searchParams.keys()]
        .filter((k) => !["select", "order", "offset"].includes(k))
        .sort()
        .join(",");
      const chave = `${recurso}|${tela}|${filtro}`;
      if (jaAvisados.has(chave)) return res;
      jaAvisados.add(chave);

      console.error(
        `[teto] ${recurso} voltou com ${linhas} linhas e foi CORTADO pelo PostgREST (tela ${tela || "?"}). ` +
          "Use lerSemTeto/lerPorIdsSemTeto (@carbo/shell) ou agregue no banco.",
      );

      const apikey = cabecalho(init, input, "apikey");
      const auth = cabecalho(init, input, "Authorization");
      if (apikey && auth) {
        const base = url.slice(0, url.indexOf("/rest/v1/"));
        void fetch(`${base}/rest/v1/rpc/carbo_teto_registrar`, {
          method: "POST",
          headers: { apikey, Authorization: auth, "Content-Type": "application/json" },
          body: JSON.stringify({
            p_app: app,
            p_recurso: recurso.slice(0, 200),
            p_tela: tela.slice(0, 200),
            p_filtro: filtro.slice(0, 300),
            p_select: (u.searchParams.get("select") ?? "").slice(0, 300),
            p_linhas: linhas,
          }),
        }).catch(() => {});
      }
    } catch {
      // O alarme nunca derruba a leitura que ele observa.
    }
    return res;
  };
}
