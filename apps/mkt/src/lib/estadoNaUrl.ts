import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useParamUrl } from "@carbo/shell";
import { emptyCriteria, type Atividade, type Prazo, type SearchCriteria } from "@/lib/mktFilter";

// ─────────────────────────────────────────────────────────────────────────────
// Estado das telas dos Quadros que mora na URL — filtro, mês do calendário,
// zoom — para o F5 e o link mandado a alguém abrirem a MESMA tela. Pedido do
// dono do processo (29/10/2026): "o F5 vai persistir pela slug e não por forçar
// o código". Antes era tudo `useState` e todo F5 devolvia o quadro sem filtro.
//
// ⚠️ O valor PADRÃO não vai para a URL (mesma regra do `useParamUrl`): o
// endereço limpo continua significando "como a tela abre".
// ─────────────────────────────────────────────────────────────────────────────

/* ── O filtro do quadro (e da busca entre quadros) ───────────────────────────
 *
 *   ?busca=  &etiquetas=a,b  &sem-etiqueta=1  &membros=a,b  &sem-membro=1
 *   &meus=1  &situacao=concluido|nao-concluido  &prazos=atrasado,sem-data
 *   &atividade=1s  &modo=todas  &recolher=1  &de=AAAA-MM-DD  &ate=AAAA-MM-DD
 *
 * ⚠️ `modo` AUSENTE é "qualquer" (o padrão do filtro novo). Busca SALVA antiga
 * não tem `modo` e vale como "todas" (ver `mktFilter.ts`) — por isso, ao
 * aplicá-la, o `todas` é ESCRITO na URL, senão o F5 a transformaria em
 * "qualquer" e devolveria outros cartões.
 * ⚠️ O membro único das buscas antigas (`memberId`) entra em `membros`: são a
 * mesma pergunta, e duas chaves para ela divergiriam.
 * ⚠️ `replace`: o filtro muda a cada letra digitada, e o Voltar sai do quadro
 * em vez de desfazer o filtro letra por letra.
 */
const CHAVES_FILTRO = [
  "busca", "etiquetas", "sem-etiqueta", "membros", "sem-membro", "meus",
  "situacao", "prazos", "atividade", "modo", "recolher", "de", "ate",
] as const;
const PRAZOS: Prazo[] = ["sem_data", "atrasado", "dia", "semana", "mes"];
const ATIVIDADES: Atividade[] = ["1s", "2s", "4s", "sem4s"];
const lista = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);
// `sem_data` vira `sem-data` no endereço (hífen, como as rotas).
const prazoNaUrl = (p: Prazo) => p.replace("_", "-");

export function useFiltroUrl(): [SearchCriteria, (c: SearchCriteria) => void] {
  const [params, setParams] = useSearchParams();
  const assinatura = CHAVES_FILTRO.map((k) => params.get(k) ?? "").join("\u0001");

  const criteria = useMemo<SearchCriteria>(() => {
    const c = emptyCriteria();
    c.text = params.get("busca") ?? "";
    c.labelIds = lista(params.get("etiquetas"));
    c.semEtiquetas = params.get("sem-etiqueta") === "1";
    c.memberIds = lista(params.get("membros"));
    c.semMembros = params.get("sem-membro") === "1";
    c.atribuidosAMim = params.get("meus") === "1";
    const sit = params.get("situacao");
    c.status = sit === "concluido" ? "concluido" : sit === "nao-concluido" ? "nao_concluido" : "";
    c.prazos = lista(params.get("prazos"))
      .map((p) => PRAZOS.find((x) => prazoNaUrl(x) === p))
      .filter((p): p is Prazo => Boolean(p));
    const at = params.get("atividade") as Atividade | null;
    c.atividade = at && ATIVIDADES.includes(at) ? at : "";
    c.modo = params.get("modo") === "todas" ? "todas" : "qualquer";
    c.recolherVazias = params.get("recolher") === "1";
    c.dueFrom = params.get("de") ?? "";
    c.dueTo = params.get("ate") ?? "";
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);

  const setCriteria = useCallback((c: SearchCriteria) => {
    const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    for (const k of CHAVES_FILTRO) p.delete(k);
    const membros = [...new Set([...(c.memberIds ?? []), ...(c.memberId ? [c.memberId] : [])])];
    if (c.text) p.set("busca", c.text);
    if (c.labelIds?.length) p.set("etiquetas", c.labelIds.join(","));
    if (c.semEtiquetas) p.set("sem-etiqueta", "1");
    if (membros.length) p.set("membros", membros.join(","));
    if (c.semMembros) p.set("sem-membro", "1");
    if (c.atribuidosAMim) p.set("meus", "1");
    if (c.status) p.set("situacao", c.status === "nao_concluido" ? "nao-concluido" : c.status);
    if (c.prazos?.length) p.set("prazos", c.prazos.map(prazoNaUrl).join(","));
    if (c.atividade) p.set("atividade", c.atividade);
    if ((c.modo ?? "todas") === "todas") p.set("modo", "todas");
    if (c.recolherVazias) p.set("recolher", "1");
    if (c.dueFrom) p.set("de", c.dueFrom);
    if (c.dueTo) p.set("ate", c.dueTo);
    setParams(p, { replace: true });
  }, [setParams]);

  return [criteria, setCriteria];
}

/* ── O calendário (de um quadro e o geral) ───────────────────────────────────
 *
 *   ?data=AAAA-MM-DD   o dia de referência (ausente = hoje)
 *   ?ver=semana        (ausente = mês)
 *   ?cor=etiqueta|lista|quadro   (ausente = o padrão da tela)
 *
 * ⚠️ O dia é texto LOCAL, nunca `toISOString()` (UTC: depois das 21h viraria o
 * dia seguinte e o calendário pularia de mês no fim do mês).
 */
const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function useCalendarioUrl<C extends string>(cores: readonly C[], corPadrao: C) {
  const [dataUrl, setDataUrl] = useParamUrl("data", diaLocal(new Date()));
  const ref = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataUrl);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  }, [dataUrl]);
  const setRef = (f: Date | ((r: Date) => Date)) =>
    setDataUrl(diaLocal(typeof f === "function" ? f(ref) : f));

  const [verUrl, setVerUrl] = useParamUrl("ver", "mes");
  const mode: "month" | "week" = verUrl === "semana" ? "week" : "month";
  const setMode = (m: "month" | "week") => setVerUrl(m === "week" ? "semana" : "mes");

  // A cor fala português na URL (`etiqueta`, `lista`, `quadro`).
  const NA_URL: Record<string, string> = { label: "etiqueta", list: "lista", board: "quadro" };
  const [corUrl, setCorUrl] = useParamUrl("cor", NA_URL[corPadrao] ?? corPadrao);
  const colorBy: C = cores.find((c) => (NA_URL[c] ?? c) === corUrl) ?? corPadrao;
  const setColorBy = (c: C) => setCorUrl(NA_URL[c] ?? c);

  return { ref, setRef, mode, setMode, colorBy, setColorBy };
}

/* ── A ordem das Tabelas (do quadro e a geral) ───────────────────────────────
 *
 *   ?ordem=entrega  (crescente)   ?ordem=-entrega  (decrescente)
 *
 * A coluna fala português na URL; a chave interna é a da tabela. Campo
 * personalizado vai como `campo:<id>`. Ausente = por título, A→Z.
 */
const COLUNA_NA_URL: Record<string, string> = {
  title: "titulo", list: "lista", board: "quadro", labels: "etiquetas", members: "membros",
  start: "inicio", due: "entrega", checklist: "checklist",
};
type SortDir = "asc" | "desc";
export function useOrdemTabelaUrl(): [{ key: string; dir: SortDir }, (f: (s: { key: string; dir: SortDir }) => { key: string; dir: SortDir }) => void] {
  const [v, setV] = useParamUrl("ordem", "titulo");
  const desc = v.startsWith("-");
  const nome = desc ? v.slice(1) : v;
  const key = Object.keys(COLUNA_NA_URL).find((k) => COLUNA_NA_URL[k] === nome)
    ?? (nome.startsWith("campo:") ? `field:${nome.slice(6)}` : "title");
  const sort = { key, dir: (desc ? "desc" : "asc") as SortDir };
  const setSort = (f: (s: { key: string; dir: SortDir }) => { key: string; dir: SortDir }) => {
    const n = f(sort);
    const col = COLUNA_NA_URL[n.key] ?? (n.key.startsWith("field:") ? `campo:${n.key.slice(6)}` : n.key);
    setV(`${n.dir === "desc" ? "-" : ""}${col}`);
  };
  return [sort, setSort];
}
