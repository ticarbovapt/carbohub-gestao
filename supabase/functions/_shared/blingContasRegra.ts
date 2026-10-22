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

/**
 * O que a pessoa escolheu no diálogo de baixa. Tudo opcional: sem nada, a baixa
 * é a de sempre (o saldo inteiro, pela conta do título).
 * ⚠️ `valor` é o que SAIU/ENTROU de fato (o "Valor pago" do Bling), já com juros
 * e multa somados e o desconto abatido. A parte que abate o título é
 * `valor − juros − multa + desconto`; menor que o saldo = baixa PARCIAL.
 */
export interface AjustesBaixa {
  portadorId?: number | null;
  juros?: number | null;
  multa?: number | null;
  desconto?: number | null;
  tarifa?: number | null;
  valor?: number | null;
  /** O texto que a pessoa escreveu (vai para o histórico da baixa no Bling). */
  historico?: string | null;
}

/** O que o título tem de mostrar no Bling DEPOIS da baixa — é o que se confere. */
export interface EsperadoBaixa {
  saldoAntes: number;
  /** Quanto do título esta baixa abate. */
  principal: number;
  valor: number;
  parcial: boolean;
  saldoDepois: number;
}

export type DecisaoBaixa =
  | { decisao: "enviar"; corpo: Record<string, unknown>; esperado: EsperadoBaixa }
  | { decisao: "ja_pago_no_bling" | "cancelado_no_bling" | "sem_portador" | "ajuste_invalido"; mensagem: string };

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;
const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

/** Limite do campo no Bling ("2.000 caracteres" na tela de baixa). */
export const MAX_HISTORICO = 2000;

/** O histórico da tela, limpo: vazio = null (usa a marca padrão); passa do limite = cortado. */
export function historicoDaBaixa(h: unknown): string | null {
  const t = typeof h === "string" ? h.trim() : "";
  return t ? t.slice(0, MAX_HISTORICO) : null;
}

/** Lê um ajuste: vazio = 0; negativo, não numérico ou com mais de 2 casas = inválido (null). */
function ajuste(v: unknown): number | null {
  if (v == null || v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return null;
  return n;
}

/**
 * O que a baixa FARIA com este título do Bling (o detalhe `d`, lido AGORA) —
 * a MESMA regra no envio de verdade e no ensaio (teste por outro caminho
 * provaria o caminho errado).
 */
export function decidirBaixa(
  tipo: TipoConta, d: any, portadorPadrao: unknown, dia: string, quem: string | null, aj: AjustesBaixa = {},
): DecisaoBaixa {
  const situacao = d?.situacao != null ? String(d.situacao) : null;
  if (situacao === "2") return { decisao: "ja_pago_no_bling", mensagem: "Já estava baixado no Bling — nada enviado." };
  if (situacao === "4" || situacao === "5") {
    return { decisao: "cancelado_no_bling", mensagem: "O título está cancelado no Bling — a baixa não foi enviada." };
  }
  // A conta escolhida na tela vence a do título, que vence a padrão.
  const portador = Number(aj.portadorId) || Number(d?.portador?.id) || Number(portadorPadrao) || null;
  // ⚠️ Categoria é a do PRÓPRIO título, ou nenhuma. Medido em 21/10/2026:
  // 160 de 161 títulos abertos não têm categoria no Bling — e categoria de
  // receita ≠ de despesa, então um "padrão" único erraria metade. Sem ela o
  // campo não vai; se o Bling exigir, a recusa dele aparece na linha.
  const categoria = Number(d?.categoria?.id) || null;
  if (!portador) {
    return { decisao: "sem_portador", mensagem: "O Bling exige a conta (portador) para dar baixa, e o título não tem" +
      " — escolha a conta no diálogo, preencha no título no Bling, ou o portador padrão na configuração da baixa." };
  }

  const corpo: Record<string, unknown> = {
    data: dia,
    usarDataVencimento: false,
    portador: { id: portador },
    ...(categoria ? { categoria: { id: categoria } } : {}),
    // O texto da pessoa vai como ela escreveu (é por ele que ela acha a baixa
    // no Bling depois); vazio, a marca de sempre.
    historico: historicoDaBaixa(aj.historico) ?? `Baixa pelo CarboHub Finanças${quem ? ` (${quem})` : ""}`,
  };
  const juros = ajuste(aj.juros), multa = ajuste(aj.multa), desconto = ajuste(aj.desconto), tarifa = ajuste(aj.tarifa);
  if (juros == null || multa == null || desconto == null || tarifa == null) {
    return { decisao: "ajuste_invalido", mensagem: "Juros, multa, desconto e tarifa têm de ser valores em reais, sem sinal de menos." };
  }
  // ⚠️ Tarifa só no RECEBIMENTO. Medido nos borderôs reais da matriz (22/10/2026,
  // 24 de 30 a receber, todas do ML): a tarifa é o que a plataforma/banco RETEVE,
  // e o Bling a soma ao valor recebido para quitar — 28,26 recebidos + 11,64 de
  // tarifa quitam 39,90. No pagamento nenhum dos 30 borderôs usou tarifa, e o
  // sentido dela ali não está medido: recusar é melhor que adivinhar.
  if (tipo === "pagar" && tarifa > 0) {
    return { decisao: "ajuste_invalido", mensagem: "Tarifa só existe no recebimento — no pagamento, some o custo ao valor pago como juros ou multa." };
  }
  const saldoAntes = Number(d?.saldo) > 0 ? Number(d.saldo) : Number(d?.valor) || 0;
  const cSaldo = centavos(saldoAntes);
  // O que o valor de fato tem A MAIS que o principal: juros e multa somam,
  // desconto e tarifa (retida) abatem.
  const cAcres = centavos(juros) + centavos(multa) - centavos(desconto) - centavos(tarifa);
  const informado = aj.valor == null || (aj.valor as unknown) === "" ? null : Number(aj.valor);
  if (informado != null && (!Number.isFinite(informado) || informado <= 0 || Math.abs(informado * 100 - Math.round(informado * 100)) > 1e-6)) {
    return { decisao: "ajuste_invalido", mensagem: "O valor pago tem de ser maior que zero, com até 2 casas." };
  }
  // Saldo que o Bling não informou: só a baixa de sempre (sem valor) é segura —
  // parcial ou ajuste exigiriam saber de quanto é o título.
  if (cSaldo <= 0) {
    if (informado != null || cAcres !== 0 || centavos(tarifa) > 0) {
      return { decisao: "ajuste_invalido", mensagem: "O Bling não informou o saldo do título — dê a baixa sem ajustes, ou faça-a no Bling." };
    }
    return { decisao: "enviar", corpo, esperado: { saldoAntes: 0, principal: 0, valor: 0, parcial: false, saldoDepois: 0 } };
  }
  const cValor = informado != null ? centavos(informado) : cSaldo + cAcres;
  const cPrincipal = cValor - cAcres;
  if (cPrincipal <= 0) {
    return { decisao: "ajuste_invalido", mensagem: "O valor pago não cobre os juros e a multa — nada abateria do título." };
  }
  if (cPrincipal > cSaldo) {
    return { decisao: "ajuste_invalido", mensagem: `O valor pago passa do saldo em aberto (${brl(saldoAntes)}) — a diferença entra como juros ou multa.` };
  }
  const parcial = cPrincipal < cSaldo;
  const temAjuste = cAcres !== 0 || centavos(tarifa) > 0;

  // Os nomes `juros`, `desconto`, `acrescimo` (a MULTA da tela do Bling) e
  // `tarifa` são os que o Bling devolve nos borderôs reais (raio-x de
  // 22/10/2026: `pagamentos[].juros/tarifa/desconto/acrescimo/valorPago`).
  // ⚠️ O Bling IGNORA CALADO campo que não conhece, então quem prova que o
  // POST os leu continua sendo a CONFERÊNCIA (`conferirBaixa`), nunca o 200.
  if (juros > 0) corpo.juros = juros;
  if (multa > 0) corpo.acrescimo = multa;
  if (desconto > 0) corpo.desconto = desconto;
  if (tarifa > 0) corpo.tarifa = tarifa;
  // ⚠️ Valor só quando é preciso: sem ele o Bling baixa o SALDO, que é o caso
  // comum (o corpo do ensaio de 22/10). Parcial, título já parcial ou com
  // ajuste mandam o valor de fato.
  // ⚠️ No recebimento vão os DOIS nomes, com o mesmo valor: a doc fala em
  // `valorRecebido`, e o borderô real devolve `valorPago` também nos títulos a
  // receber. O que o Bling não conhecer ele ignora; e se ignorasse o valor,
  // uma baixa com tarifa quitaria pelo valor CHEIO — certo no saldo, errado no
  // banco, e a conferência não veria.
  if (parcial || temAjuste || situacao === "3") {
    corpo.valorPago = reais(cValor);
    if (tipo === "receber") corpo.valorRecebido = reais(cValor);
  }
  return {
    decisao: "enviar", corpo,
    esperado: { saldoAntes, principal: reais(cPrincipal), valor: reais(cValor), parcial, saldoDepois: reais(cSaldo - cPrincipal) },
  };
}

/**
 * Confere o título relido no Bling DEPOIS da baixa contra o esperado. Devolve o
 * motivo da divergência, ou null se bate. ⚠️ Existe porque o Bling ignora campo
 * desconhecido em silêncio: medido por terceiros, um valor parcial mal nomeado
 * QUITOU o título inteiro com 200. Divergiu ⇒ quem chama desfaz o borderô.
 */
export function conferirBaixa(esp: EsperadoBaixa, depois: { situacao?: unknown; saldo?: unknown }): string | null {
  const sit = depois?.situacao != null ? String(depois.situacao) : null;
  const saldo = Number(depois?.saldo);
  if (esp.parcial) {
    if (sit === "2") return `O Bling quitou o título inteiro em vez da baixa parcial de ${brl(esp.principal)}.`;
    if (sit !== "3") return `O título não ficou parcial no Bling (situação ${sit ?? "desconhecida"}).`;
    if (Number.isFinite(saldo) && Math.abs(centavos(saldo) - centavos(esp.saldoDepois)) > 1) {
      return `O Bling deixou ${brl(saldo)} em aberto; o esperado era ${brl(esp.saldoDepois)}.`;
    }
    return null;
  }
  if (sit === "3") {
    return `O Bling deixou ${Number.isFinite(saldo) ? brl(saldo) : "um saldo"} em aberto em vez de quitar o título.`;
  }
  if (sit !== "2") return `O título não ficou baixado no Bling (situação ${sit ?? "desconhecida"}).`;
  return null;
}

/** Os ajustes que vieram da tela (JSON solto) — só os campos conhecidos. */
export function lerAjustes(x: unknown): AjustesBaixa {
  const o = (x && typeof x === "object") ? x as Record<string, unknown> : {};
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  return {
    portadorId: Number(o.portador_id ?? o.portadorId) > 0 ? Number(o.portador_id ?? o.portadorId) : null,
    juros: num(o.juros), multa: num(o.multa), desconto: num(o.desconto), tarifa: num(o.tarifa),
    valor: num(o.valor),
    historico: historicoDaBaixa(o.historico),
  };
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

// ── Raio-x dos borderôs (ENSAIO, só lê) ─────────────────────────────────────
// Os nomes de juros/multa/desconto/tarifa e do valor parcial vieram da doc, e o
// Bling IGNORA calado campo desconhecido. A prova mais barata, sem escrever
// nada, é ler os borderôs que o time JÁ fez no próprio Bling: neles, cada campo
// que vem com valor diferente de zero é um nome que o Bling de fato usa.

const AJUSTE = /juro|multa|desc|acresc|tarifa|taxa/i;

/** Conta as chaves dos borderôs (topo e pagamentos) e separa os exemplos que importam. */
export function censoBorderos(lista: { titulo: number; situacao: string | null; bordero: any }[]) {
  const topo: Record<string, number> = {};
  const pag: Record<string, number> = {};
  const naoZero: Record<string, number> = {};
  const historicos: string[] = [];
  let doCarbohub = 0;
  const comAjuste: unknown[] = [];
  const parciais: unknown[] = [];
  for (const { titulo, situacao, bordero } of lista) {
    const bo = bordero ?? {};
    for (const k of Object.keys(bo)) topo[k] = (topo[k] ?? 0) + 1;
    const h = typeof bo.historico === "string" ? bo.historico.trim() : "";
    if (h) { if (historicos.length < 8 && !historicos.includes(h)) historicos.push(h); if (/carbohub/i.test(h)) doCarbohub++; }
    let temAjuste = false;
    for (const p of Array.isArray(bo.pagamentos) ? bo.pagamentos : []) {
      for (const [k, v] of Object.entries(p ?? {})) {
        pag[k] = (pag[k] ?? 0) + 1;
        if (typeof v === "number" && v !== 0) { naoZero[k] = (naoZero[k] ?? 0) + 1; if (AJUSTE.test(k)) temAjuste = true; }
      }
    }
    for (const [k, v] of Object.entries(bo)) {
      if (typeof v === "number" && v !== 0 && AJUSTE.test(k)) { naoZero[`(topo) ${k}`] = (naoZero[`(topo) ${k}`] ?? 0) + 1; temAjuste = true; }
    }
    if (temAjuste && comAjuste.length < 5) comAjuste.push({ titulo, situacao, bordero: bo });
    if (situacao === "3" && parciais.length < 3) parciais.push({ titulo, bordero: bo });
  }
  return {
    lidos: lista.length,
    chaves_do_bordero: topo,
    chaves_dos_pagamentos: pag,
    campos_com_valor: naoZero,
    historicos_exemplo: historicos,
    historicos_do_carbohub: doCarbohub,
    exemplos_com_ajuste: comAjuste,
    exemplos_parcial: parciais,
    exemplo_simples: lista.find((x) => !comAjuste.some((c: any) => c.titulo === x.titulo))?.bordero ?? null,
  };
}

/** O último borderô de cada título (o `detalhe->borderos` do espelho). */
export function ultimoBordero(borderos: unknown): number | null {
  if (!Array.isArray(borderos)) return null;
  const ids = borderos.map((x: any) => Number(typeof x === "object" ? x?.id : x)).filter((n) => n > 0);
  return ids.length ? Math.max(...ids) : null;
}
