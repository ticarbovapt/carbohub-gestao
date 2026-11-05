// ─────────────────────────────────────────────────────────────────────────────
// Período como PAR DE DATAS — a conta de data do seletor de período dos apps
// (`components/ui/PeriodoFiltro.tsx`, idêntico nos sete fora do Finanças).
//
// Pedido do dono do processo (05/11/2026): todo seletor de período igual ao das
// Vendas Online — Hoje, Ontem, 7 e 30 dias, Este mês (até hoje), Mês fechado…,
// Por período…. A conta mora AQUI, uma vez: sete cópias de "últimos 30 dias"
// divergiriam no dia em que alguém mexesse numa.
//
// ⚠️ Mesma semântica do `getRange` do `useDashEcommerce` (admin·mkt): datas
// YYYY-MM-DD, as DUAS pontas inclusivas, "7 dias" = hoje e os 6 anteriores,
// "Este mês" = dia 1 até HOJE (parcial), "Mês fechado" = dia 1 ao último. Dia
// LOCAL (o navegador está em Brasília), nunca `toISOString()` — às 21h ele já
// diz "amanhã".
// ─────────────────────────────────────────────────────────────────────────────

/** Período vazio (`from` e `to` vazios) = sem recorte, "todo o período". */
export interface Periodo { from: string; to: string }

export type AtalhoPeriodo =
  | "todo" | "today" | "yesterday" | "7d" | "30d" | "90d" | "180d" | "365d"
  | "month" | "mes" | "custom";

const doisDig = (n: number) => String(n).padStart(2, "0");
/** YYYY-MM-DD no dia LOCAL. */
export const diaIso = (d: Date) => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;
const hoje = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const menos = (d: Date, dias: number) => { const x = new Date(d); x.setDate(x.getDate() - dias); return x; };

const ULTIMOS: Partial<Record<AtalhoPeriodo, number>> = { "7d": 7, "30d": 30, "90d": 90, "180d": 180, "365d": 365 };

/**
 * O par de datas de um atalho. Em `mes`, `ancora` é qualquer dia do mês
 * (YYYY-MM-DD ou YYYY-MM); em `custom`, devolve `ancoraCustom` ou 30 dias.
 */
export function intervaloDoAtalho(a: AtalhoPeriodo, ancora?: string): Periodo {
  const h = hoje();
  if (a === "todo") return { from: "", to: "" };
  if (a === "today") return { from: diaIso(h), to: diaIso(h) };
  if (a === "yesterday") { const d = menos(h, 1); return { from: diaIso(d), to: diaIso(d) }; }
  const n = ULTIMOS[a];
  if (n) return { from: diaIso(menos(h, n - 1)), to: diaIso(h) };
  if (a === "month") return { from: diaIso(new Date(h.getFullYear(), h.getMonth(), 1, 12)), to: diaIso(h) };
  if (a === "mes") {
    // ⚠️ Meio-dia, nunca meia-noite: num fuso negativo a meia-noite vira o
    // dia anterior e o mês âncora vira o ANTERIOR.
    const base = ancora ? new Date(`${ancora.slice(0, 7)}-01T12:00:00`) : h;
    return {
      from: diaIso(new Date(base.getFullYear(), base.getMonth(), 1, 12)),
      to: diaIso(new Date(base.getFullYear(), base.getMonth() + 1, 0, 12)),
    };
  }
  return { from: diaIso(menos(h, 29)), to: diaIso(h) };
}

/**
 * Qual atalho produz ESTE par de datas — DEDUZIDO, nunca guardado ao lado:
 * duas fontes para a mesma informação acabam discordando, e aqui a verdade é a
 * data (que é o que vai na URL e na consulta).
 *
 * ⚠️ A ordem importa: no dia 1º "Hoje" e "Este mês" dão o mesmo intervalo, e o
 * mais específico vem primeiro.
 */
export function detectarAtalho(p: Periodo, candidatos: AtalhoPeriodo[]): { atalho: AtalhoPeriodo; mes: string } {
  if (!p.from && !p.to) return { atalho: candidatos.includes("todo") ? "todo" : "custom", mes: "" };
  for (const a of candidatos) {
    if (a === "todo" || a === "mes" || a === "custom") continue;
    const r = intervaloDoAtalho(a);
    if (r.from === p.from && r.to === p.to) return { atalho: a, mes: "" };
  }
  if (candidatos.includes("mes") && p.from && p.to) {
    const r = intervaloDoAtalho("mes", p.from);
    if (r.from === p.from && r.to === p.to) return { atalho: "mes", mes: p.from.slice(0, 7) };
  }
  return { atalho: "custom", mes: "" };
}

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Meses de `desde` (YYYY-MM, padrão jan/2024) até o corrente, do mais recente ao mais antigo. */
export function mesesParaEscolher(desde = "2024-01"): { value: string; label: string }[] {
  const [a, m] = desde.split("-").map(Number);
  const cur = new Date(a, (m || 1) - 1, 1, 12);
  const agora = hoje();
  const out: { value: string; label: string }[] = [];
  while (cur.getFullYear() < agora.getFullYear()
         || (cur.getFullYear() === agora.getFullYear() && cur.getMonth() <= agora.getMonth())) {
    out.push({ value: `${cur.getFullYear()}-${doisDig(cur.getMonth() + 1)}`, label: `${MESES_CURTOS[cur.getMonth()]}/${cur.getFullYear()}` });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out.reverse();
}

/** Quantos dias o período cobre (as duas pontas inclusas). Sem recorte, null. */
export function diasDoPeriodo(p: Periodo): number | null {
  if (!p.from || !p.to) return null;
  const f = new Date(`${p.from}T12:00:00`), t = new Date(`${p.to}T12:00:00`);
  return Math.round((t.getTime() - f.getTime()) / 86_400_000) + 1;
}

/** O período imediatamente anterior, com a mesma duração (para "vs. anterior"). */
export function periodoAnterior(p: Periodo): Periodo | null {
  const n = diasDoPeriodo(p);
  if (!n) return null;
  const fim = menos(new Date(`${p.from}T12:00:00`), 1);
  return { from: diaIso(menos(fim, n - 1)), to: diaIso(fim) };
}

/** Rótulo curto do período, para texto ("últimos 7 dias", "set/2026", "01/10 a 15/10"). */
export function rotuloDoPeriodo(p: Periodo, candidatos: AtalhoPeriodo[] = [
  "todo", "today", "yesterday", "7d", "30d", "90d", "180d", "365d", "month", "mes", "custom",
]): string {
  const { atalho, mes } = detectarAtalho(p, candidatos);
  const R: Partial<Record<AtalhoPeriodo, string>> = {
    todo: "todo o período", today: "hoje", yesterday: "ontem", "7d": "últimos 7 dias", "30d": "últimos 30 dias",
    "90d": "últimos 90 dias", "180d": "últimos 6 meses", "365d": "últimos 12 meses", month: "este mês",
  };
  if (R[atalho]) return R[atalho]!;
  if (atalho === "mes") { const [a, m] = mes.split("-").map(Number); return `${MESES_CURTOS[m - 1].toLowerCase()}/${a}`; }
  const br = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return `${br(p.from)} a ${br(p.to)}`;
}
