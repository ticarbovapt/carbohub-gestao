// ─────────────────────────────────────────────────────────────────────────────
// Regras PURAS das contas a pagar/receber do Bling — sem rede, sem banco.
//
// Usadas pelas DUAS contas: `bling-contas-baixar` (matriz, Bling 1) e
// `bling2-contas` (filial, Bling 2). Uma regra só para dar baixa: duas cópias
// divergiriam, e divergir aqui não dá erro — dá borderô diferente conforme a
// empresa. Testadas em `src/test/bling/contasRegra.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoConta = "pagar" | "receber";

/** Situações do Bling em que o título ainda tem o que pagar/receber. */
export const SITUACOES_ABERTAS = ["1", "3"] as const;
export const estaAberta = (situacao: string | null | undefined) =>
  situacao === "1" || situacao === "3";

/** Dia de Brasília de um instante (o Bling quer AAAA-MM-DD). */
export function diaBrasilia(instante: string | Date | null): string {
  const d = instante ? new Date(instante) : new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export type DecisaoBaixa =
  | { decisao: "enviar"; corpo: Record<string, unknown> }
  | { decisao: "ja_pago_no_bling" | "cancelado_no_bling" | "sem_portador"; mensagem: string };

/**
 * O que a baixa FARIA com este título do Bling (o detalhe `d`, lido AGORA) —
 * a MESMA regra no envio de verdade e no ensaio (teste por outro caminho
 * provaria o caminho errado).
 */
export function decidirBaixa(tipo: TipoConta, d: any, portadorPadrao: unknown, dia: string, quem: string | null): DecisaoBaixa {
  const situacao = d?.situacao != null ? String(d.situacao) : null;
  if (situacao === "2") return { decisao: "ja_pago_no_bling", mensagem: "Já estava baixado no Bling — nada enviado." };
  if (situacao === "4" || situacao === "5") {
    return { decisao: "cancelado_no_bling", mensagem: "O título está cancelado no Bling — a baixa não foi enviada." };
  }
  const portador = Number(d?.portador?.id) || Number(portadorPadrao) || null;
  // ⚠️ Categoria é a do PRÓPRIO título, ou nenhuma. Medido em 21/10/2026:
  // 160 de 161 títulos abertos não têm categoria no Bling — e categoria de
  // receita ≠ de despesa, então um "padrão" único erraria metade. Sem ela o
  // campo não vai; se o Bling exigir, a recusa dele aparece na linha.
  const categoria = Number(d?.categoria?.id) || null;
  if (!portador) {
    return { decisao: "sem_portador", mensagem: "O Bling exige a conta (portador) para dar baixa, e o título não tem" +
      " — preencha a conta no título, no Bling, ou o portador padrão na configuração da baixa." };
  }
  const corpo: Record<string, unknown> = {
    data: dia,
    usarDataVencimento: false,
    portador: { id: portador },
    ...(categoria ? { categoria: { id: categoria } } : {}),
    historico: `Baixa pelo CarboHub Finanças${quem ? ` (${quem})` : ""}`,
  };
  // ⚠️ Valor só no parcial: sem valor, o Bling baixa o SALDO, que é o caso
  // comum — e o nome do campo no contas a PAGAR não está medido.
  if (situacao === "3" && Number(d?.saldo) > 0) {
    corpo[tipo === "receber" ? "valorRecebido" : "valorPago"] = Number(d.saldo);
  }
  return { decisao: "enviar", corpo };
}

/** Os ids de borderô do detalhe do título (a lista vem como `[{id}]` ou `[id]`). */
export function idsDeBordero(lista: unknown): number[] {
  return (Array.isArray(lista) ? lista : [])
    .map((x: any) => Number(typeof x === "object" ? x?.id : x))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * A data escolhida na tela para a baixa: AAAA-MM-DD válida, nunca no futuro
 * (dia de Brasília) e nunca antes de 2000. Vazia = hoje. Devolve `null` quando
 * inválida — a função recusa, nunca troca por outra data calada.
 */
export function dataDaBaixa(informada: unknown, hoje: string): string | null {
  if (informada == null || informada === "") return hoje;
  const s = String(informada).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  if (s > hoje || s < "2000-01-01") return null;
  return s;
}

// ── Espelho da filial: o que fazer com uma rodada da listagem de ABERTOS ────

export interface LocalConta { situacao: string | null; valor: number | null; saldo: number | null; vencimento: string | null }
export interface ListadaConta { bling_id: number; situacao: string | null; valor: number | null; saldo: number | null; vencimento: string | null }

export interface PlanoEspelho {
  /** O Bling IGNOROU o filtro "só em aberto": veio título quitado/cancelado. */
  filtroIgnorado: boolean;
  /** Ids listados que não existem aqui: entram por inteiro. */
  novos: number[];
  /** Ids que existem aqui e mudaram de situação, valor, saldo ou vencimento. */
  mudaram: number[];
  /** Abertos AQUI que sumiram da lista de abertos do Bling: pede o detalhe. */
  sumiram: number[];
}

/**
 * Compara o espelho com a listagem COMPLETA de abertos do Bling.
 *
 * ⚠️ Se a listagem traz um título fora de {1,3}, o filtro não foi aplicado e a
 * lista NÃO é "os abertos" — `sumiram` viria inteiro errado (tudo o que não
 * caiu na 1ª página pareceria quitado). Nesse caso o plano sai VAZIO e marca
 * `filtroIgnorado`: melhor não andar do que andar errado.
 */
export function planejarEspelho(locais: Map<number, LocalConta>, listados: ListadaConta[]): PlanoEspelho {
  if (listados.some((l) => !estaAberta(l.situacao))) {
    return { filtroIgnorado: true, novos: [], mudaram: [], sumiram: [] };
  }
  const vistos = new Set<number>();
  const novos: number[] = [];
  const mudaram: number[] = [];
  const mesmoNumero = (a: number | null, b: number | null) =>
    (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.005);
  for (const l of listados) {
    vistos.add(l.bling_id);
    const loc = locais.get(l.bling_id);
    if (!loc) { novos.push(l.bling_id); continue; }
    // ⚠️ Campo que a LISTAGEM não traz (o saldo costuma vir só no detalhe) não
    // conta como mudança: senão todo título "mudaria" em toda rodada e a
    // gravação apagaria o saldo bom com nulo.
    if (loc.situacao !== l.situacao
        || (l.valor != null && !mesmoNumero(loc.valor, l.valor))
        || (l.saldo != null && !mesmoNumero(loc.saldo, l.saldo))
        || (l.vencimento != null && loc.vencimento !== l.vencimento)) {
      mudaram.push(l.bling_id);
    }
  }
  const sumiram: number[] = [];
  for (const [id, loc] of locais) if (estaAberta(loc.situacao) && !vistos.has(id)) sumiram.push(id);
  return { filtroIgnorado: false, novos, mudaram, sumiram };
}

// ── Conta a pagar CRIADA pelo sistema no Bling ──────────────────────────────

export interface ParcelaNova { vencimento: string; valor: number }
export interface ContaPagarNova {
  contatoId: number;
  portadorId: number | null;
  historico: string;
  numeroDocumento: string | null;
  parcelas: ParcelaNova[];
}

export const MAX_PARCELAS = 36;

/**
 * Confere o pedido da tela ANTES de falar com o Bling. Devolve o motivo da
 * recusa, ou null. ⚠️ Nada é corrigido calado: data inválida, valor zerado ou
 * parcela demais RECUSAM — trocar por outro valor seria criar título errado.
 */
export function erroDaContaNova(c: ContaPagarNova, hoje: string): string | null {
  if (!Number.isFinite(c.contatoId) || c.contatoId <= 0) return "Escolha o fornecedor.";
  if (!c.historico || !c.historico.trim()) return "Diga do que é a conta (histórico).";
  if (c.historico.trim().length > 250) return "O histórico passa de 250 caracteres.";
  if (!Array.isArray(c.parcelas) || c.parcelas.length === 0) return "Informe ao menos uma parcela.";
  if (c.parcelas.length > MAX_PARCELAS) return `No máximo ${MAX_PARCELAS} parcelas.`;
  for (const [i, p] of c.parcelas.entries()) {
    const n = c.parcelas.length > 1 ? ` (parcela ${i + 1})` : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento ?? "")) return `Vencimento inválido${n}.`;
    const d = new Date(`${p.vencimento}T12:00:00Z`);
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== p.vencimento) return `Vencimento inválido${n}.`;
    if (p.vencimento < "2000-01-01" || p.vencimento > "2100-12-31") return `Vencimento fora do razoável${n}.`;
    if (!Number.isFinite(p.valor) || p.valor <= 0) return `Valor inválido${n}.`;
    if (Math.round(p.valor * 100) !== Math.round(p.valor * 100 * 1e6) / 1e6) return `Valor com mais de 2 casas${n}.`;
  }
  void hoje;
  return null;
}

/**
 * O corpo do POST /contas/pagar de UMA parcela — a forma de uma conta real que
 * o Bling já aceitou (medida em 22/10/2026). ⚠️ Cada parcela vira uma conta de
 * ocorrência ÚNICA (tipo 1, 1.342 das contas medidas): número, datas e valores
 * ficam sob o nosso controle, e o espelho traz cada uma como sempre trouxe.
 */
export function corpoContaPagar(c: ContaPagarNova, i: number, hoje: string): Record<string, unknown> {
  const p = c.parcelas[i];
  const total = c.parcelas.length;
  const historico = c.historico.trim() + (total > 1 ? ` — parcela ${i + 1}/${total}` : "");
  return {
    vencimento: p.vencimento,
    valor: Math.round(p.valor * 100) / 100,
    contato: { id: c.contatoId },
    ...(c.portadorId ? { portador: { id: c.portadorId } } : {}),
    historico,
    dataEmissao: hoje,
    competencia: hoje,
    ...(c.numeroDocumento?.trim() ? { numeroDocumento: c.numeroDocumento.trim() } : {}),
    ocorrencia: { tipo: 1 },
  };
}

/**
 * Parcelas iguais a partir de um total: centavos da sobra na ÚLTIMA (a mesma
 * regra do contas a receber), vencimentos de mês em mês a partir do primeiro.
 * ⚠️ Dia 31 em mês curto vira o último dia daquele mês, nunca o mês seguinte.
 */
export function dividirEmParcelas(total: number, n: number, primeiroVencimento: string): ParcelaNova[] {
  if (!(n >= 1) || !Number.isFinite(total) || total <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(primeiroVencimento)) return [];
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  const [a, m, d] = primeiroVencimento.split("-").map(Number);
  const out: ParcelaNova[] = [];
  for (let i = 0; i < n; i++) {
    const ultimoDia = new Date(Date.UTC(a, m - 1 + i + 1, 0)).getUTCDate();
    const dt = new Date(Date.UTC(a, m - 1 + i, Math.min(d, ultimoDia)));
    const valor = i === n - 1 ? centavos - base * (n - 1) : base;
    out.push({ vencimento: dt.toISOString().slice(0, 10), valor: valor / 100 });
  }
  return out;
}
