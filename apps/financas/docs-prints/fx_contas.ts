// Fixtures da área CONTAS (pagar, receber, nova conta, baixa, assinaturas,
// fluxo de caixa, painel financeiro, fornecedores, formas de pagamento).
// Dados FICTÍCIOS — nenhum fornecedor, cliente ou valor é real.
import { U } from "./pessoas";

const hoje = new Date();
const dia = (d: number) => {
  const x = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + d, 12);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const inst = (d: number) => `${dia(d)}T15:00:00.000Z`;

// ── Contas a pagar (matriz · Bling 1) ────────────────────────────────────────
const pp = (id: string, supplier_name: string, amount: number, due: number, status: string, extra: Record<string, unknown> = {}) => ({
  id, invoice_id: null, purchase_order_id: null, service_order_id: null, supplier_name, amount, currency: "BRL",
  due_date: dia(due), paid_at: null, paid_by: null, payment_proof_url: null, status, notes: null,
  source: "bling", bling_numero: `${4100 + Number(id.replace(/\D/g, ""))}`, bling_id: 880000 + Number(id.replace(/\D/g, "")),
  created_at: inst(-20), updated_at: inst(-1), bling_baixa_em: null, bling_baixa_bordero: null, bling_baixa_erro: null,
  criado_aqui_por: null, criado_aqui_nome: null, baixa_ajustes: null, ...extra,
});
const PAGAR = [
  pp("pp1", "Gráfica Norte Ltda", 1840.0, -6, "atrasado"),
  pp("pp2", "Transportadora Litoral", 2650.5, -2, "programado"),
  pp("pp3", "Energia Potiguar S.A.", 980.3, 0, "programado"),
  pp("pp4", "Embalagens Delta", 4320.0, 2, "programado", { criado_aqui_por: "u-colab", criado_aqui_nome: "Rafael Costa" }),
  pp("pp5", "Química Nordeste", 7600.0, 5, "programado"),
  pp("pp6", "Contabilidade Alfa", 1500.0, 6, "programado", { source: "interno", bling_numero: null, bling_id: null }),
  pp("pp7", "Aluguel Galpão Natal", 6200.0, 15, "programado"),
  pp("pp8", "Internet Fibra Max", 389.9, -9, "pago", { paid_at: inst(-9), paid_by: "u-colab", bling_baixa_em: inst(-9),
    baixa_ajustes: { valor: 399.9, juros: 10, multa: 0, desconto: 0, tarifa: 0, portador_nome: "Bradesco CC 1234" } }),
  pp("pp9", "Gráfica Norte Ltda", 920.0, -12, "pago", { paid_at: null, paid_by: null }),
];

// ── Contas a receber (matriz · Bling 1) ──────────────────────────────────────
const rc = (id: string, customer_name: string, amount: number, due: number, status: string, extra: Record<string, unknown> = {}) => ({
  id, source: "bling", bling_numero: `${7300 + Number(id.replace(/\D/g, ""))}`, bling_id: 770000 + Number(id.replace(/\D/g, "")),
  customer_name, order_id: null, amount, currency: "BRL", due_date: dia(due), status, received_at: null, notes: null,
  created_at: inst(-20), updated_at: inst(-1), parcela: null, parcelas_total: null, empresa: "matriz", nf_numero: null,
  documento: null, order_number: null, received_by: null, criado_aqui_por: null, criado_aqui_nome: null,
  bling_baixa_em: null, bling_baixa_bordero: null, bling_baixa_erro: null, baixa_ajustes: null, recebido_via: null, ...extra,
});
const RECEBER = [
  rc("rc1", "Posto Horizonte Ltda", 3120.0, -4, "atrasado", { parcela: 2, parcelas_total: 3, order_number: "V2026090041", nf_numero: "000812" }),
  rc("rc2", "Auto Center Ponta Negra", 1560.0, -1, "programado", { nf_numero: "000830" }),
  rc("rc3", "Rede Via Sol (filial 3)", 8400.0, 0, "programado", { parcela: 1, parcelas_total: 2, order_number: "V2026100012" }),
  rc("rc4", "Frota Agreste Transportes", 12600.0, 3, "programado"),
  rc("rc5", "Posto Boa Viagem", 780.0, 7, "programado", { source: "interno", bling_numero: null, bling_id: null, notes: "Acordo de recompra" }),
  rc("rc6", "Mercado Livre (repasse)", 39.9, -8, "recebido", { received_at: inst(-7), received_by: "u-colab", bling_baixa_em: inst(-7),
    baixa_ajustes: { valor: 28.26, juros: 0, multa: 0, desconto: 0, tarifa: 11.64, portador_nome: "Mercado Pago" } }),
];

// O espelho do Bling 1 (situação e saldo de cada título, a conta e o histórico).
const ESPELHO_PAGAR = PAGAR.filter((p) => p.bling_id).map((p) => ({
  bling_id: p.bling_id, situacao: p.id === "pp5" ? "3" : p.status === "pago" ? "2" : "1", saldo: p.id === "pp5" ? 3600 : null,
  historico: p.id === "pp1" ? "Ref. NF 5521 — impressão de rótulos" : `Ref. nº ${p.bling_numero}`, portador: 9001,
}));
const ESPELHO_RECEBER = RECEBER.filter((r) => r.bling_id).map((r) => ({
  bling_id: r.bling_id, situacao: r.status === "recebido" ? "2" : "1", saldo: null,
  historico: r.id === "rc2" ? "Ref. ao pedido 219 | boleto" : `Ref. nº ${r.bling_numero}`, portador: r.id === "rc2" ? 9002 : 9001,
}));

// ── Filial (Bling 2) ─────────────────────────────────────────────────────────
const b2 = (id: string, nome: string, valor: number, due: number, situacao: string, tipo: "pagar" | "receber", extra: Record<string, unknown> = {}) => ({
  id, bling_id: 990000 + Number(id.replace(/\D/g, "")), numero: `SP-${200 + Number(id.replace(/\D/g, ""))}`,
  [tipo === "receber" ? "cliente" : "fornecedor"]: nome, valor, saldo: null, vencimento: dia(due), data_emissao: dia(-15),
  data_pagamento: situacao === "2" ? dia(-3) : null, situacao, historico: `Ref. ${nome}`, synced_at: inst(0),
  cb_baixa_em: null, cb_baixa_por_nome: null, cb_baixa_bordero: null, cb_baixa_erro: null, cb_criado_nome: null, baixa_ajustes: null, ...extra,
});
const FILIAL_PAGAR = [
  b2("fp1", "Logística SP Express", 1290.0, -3, "1", "pagar"),
  b2("fp2", "Papelaria Paulista", 312.4, 1, "1", "pagar", { cb_criado_nome: "Rafael Costa" }),
  b2("fp3", "Condomínio Galpão Barueri", 4100.0, 4, "3", "pagar", { saldo: 2100 }),
  b2("fp4", "Energia Sudeste", 760.0, -5, "2", "pagar", { cb_baixa_em: inst(-3), cb_baixa_por_nome: "Rafael Costa", cb_baixa_bordero: 55120 }),
];
const FILIAL_RECEBER = [
  b2("fr1", "Distribuidora Campinas", 5400.0, -2, "1", "receber"),
  b2("fr2", "Posto Marginal Tietê", 2280.0, 2, "1", "receber"),
  b2("fr3", "Auto Posto Anhanguera", 960.0, 6, "1", "receber", { cb_baixa_erro: "Conta financeira inativa no Bling" }),
];

// ── Assinaturas, fornecedores, formas de pagamento ───────────────────────────
const PAYMENT_METHODS = [
  { id: "pm1", apelido: "Bradesco PJ", tipo: "credito", bandeira: "Visa", ultimos4: "4821", titular: "Carbo (empresa)", departamento: "Financeiro", is_active: true, notes: "Fatura vence dia 10", created_at: inst(-200), updated_at: inst(-30) },
  { id: "pm2", apelido: "Inter TI", tipo: "credito", bandeira: "Mastercard", ultimos4: "1107", titular: "Carbo (empresa)", departamento: "TI", is_active: true, notes: null, created_at: inst(-200), updated_at: inst(-30) },
  { id: "pm3", apelido: "Pix Bradesco", tipo: "pix", bandeira: null, ultimos4: null, titular: "Carbo (empresa)", departamento: null, is_active: true, notes: null, created_at: inst(-200), updated_at: inst(-30) },
  { id: "pm4", apelido: "Cartão antigo Ops", tipo: "debito", bandeira: "Elo", ultimos4: "0042", titular: null, departamento: "Ops", is_active: false, notes: "Cancelado", created_at: inst(-400), updated_at: inst(-90) },
];
const sub = (id: string, nome: string, departamento: string, valor: number, currency: string, ciclo: string, cobranca: string, prox: number, pm: string | null, status = "ativa") => ({
  id, nome, departamento, valor, currency, ciclo, proximo_vencimento: dia(prox), payment_method_id: pm, cobranca, status,
  responsavel: null, url: null, notes: null, created_at: inst(-100), updated_at: inst(-5),
});
const SUBSCRIPTIONS = [
  sub("s1", "Plataforma de e-mail", "Marketing", 189.0, "BRL", "mensal", "automatica", 9, "pm1"),
  sub("s2", "Banco de dados em nuvem", "TI", 25.0, "USD", "mensal", "automatica", 4, "pm2"),
  sub("s3", "Certificado digital A1", "Financeiro", 240.0, "BRL", "anual", "manual", 5, null),
  sub("s4", "Software de design", "Marketing", 1080.0, "BRL", "anual", "automatica", 48, "pm1"),
  sub("s5", "Rastreador da frota", "Ops", 420.0, "BRL", "mensal", "manual", -2, "pm3"),
  sub("s6", "Gravação de reuniões", "Comercial", 79.0, "BRL", "mensal", "automatica", 20, "pm2", "pausada"),
];
const forn = (id: string, name: string, legal_name: string, doc: string, category: string, city: string, state: string, phone: string, is_active = true) => ({
  id, name, legal_name, document_number: doc, email: `contato@${name.split(" ")[0].toLowerCase()}.com.br`, phone, city, state,
  zip_code: null, address: null, category, notes: null, is_active, created_at: inst(-300), updated_at: inst(-10),
});
const SUPPLIERS = [
  forn("f1", "Gráfica Norte", "Gráfica Norte Ltda", "11.222.333/0001-44", "embalagem", "Natal", "RN", "(84) 3200-1100"),
  forn("f2", "Química Nordeste", "Química Nordeste Indústria S.A.", "22.333.444/0001-55", "insumo", "Recife", "PE", "(81) 3400-2200"),
  forn("f3", "Transportadora Litoral", "Litoral Transportes Ltda", "33.444.555/0001-66", "frete", "Natal", "RN", "(84) 3300-3300"),
  forn("f4", "Embalagens Delta", "Delta Embalagens Ltda", "44.555.666/0001-77", "embalagem", "Fortaleza", "CE", "(85) 3100-4400"),
  forn("f5", "Papelaria Central", "Central Papéis ME", "55.666.777/0001-88", "escritório", "Natal", "RN", "(84) 3211-5500", false),
];

// ── O que a função do Bling devolve (fin-contas-pagar) ──────────────────────
const PORTADORES = [
  { id: 9001, nome: "Bradesco CC 1234", usos: 412 },
  { id: 9002, nome: "Banco do Brasil CC 5678", usos: 133 },
  { id: 9003, nome: "Mercado Pago", usos: 88 },
  { id: 9004, nome: "Caixa interno", usos: 12 },
];
const FORMAS = [
  { id: 31, nome: "Boleto", usos: 510, juros: 1, multa: 2, padrao: true },
  { id: 32, nome: "Pix", usos: 220, juros: 0, multa: 0, padrao: false },
  { id: 33, nome: "Transferência", usos: 96, juros: 0, multa: 0, padrao: false },
  { id: 34, nome: "Cartão de crédito", usos: 40, juros: 0, multa: 0, padrao: false },
];
const CATEGORIAS = {
  pagar: [
    { id: 51, nome: "Insumos de produção", usos: 180, tipo: 2 },
    { id: 52, nome: "Fretes e transportes", usos: 95, tipo: 2 },
    { id: 53, nome: "Embalagens", usos: 70, tipo: 2 },
    { id: 54, nome: "Despesas administrativas", usos: 44, tipo: 2 },
  ],
  receber: [
    { id: 61, nome: "Venda de produtos", usos: 610, tipo: 1 },
    { id: 62, nome: "Serviços de descarbonização", usos: 140, tipo: 1 },
    { id: 63, nome: "Outras receitas", usos: 8, tipo: 1 },
  ],
};
const VENDEDORES = [
  { id: 71, nome: U.colab.full_name, usos: 210 },
  { id: 72, nome: U.vend2.full_name, usos: 160 },
  { id: 73, nome: U.closer.full_name, usos: 40 },
];
const CONTATOS = {
  pagar: [
    { bling_id: 3001, nome: "Gráfica Norte Ltda", fantasia: "Gráfica Norte", cpf_cnpj: "11.222.333/0001-44" },
    { bling_id: 3002, nome: "Gráfica Norte Filial Mossoró", fantasia: "Gráfica Norte", cpf_cnpj: "11.222.333/0002-25" },
  ],
  receber: [
    { bling_id: 4001, nome: "Posto Horizonte Ltda", fantasia: "Posto Horizonte", cpf_cnpj: "66.777.888/0001-99" },
    { bling_id: 4002, nome: "Posto Horizonte II Comércio", fantasia: "Horizonte II", cpf_cnpj: "66.777.888/0002-70" },
  ],
};
function finContasPagar(b: Record<string, unknown>) {
  const tipo = (b.tipo === "receber" ? "receber" : "pagar") as "pagar" | "receber";
  switch (b.acao) {
    case "opcoes": return { ok: true, portadores: PORTADORES, erro_portadores: null };
    case "cadastros": return { ok: true, formas: FORMAS, categorias: CATEGORIAS[tipo], vendedores: VENDEDORES, erros: {} };
    case "fornecedores": return { ok: true, fornecedores: CONTATOS[tipo] };
    default: return { ok: true, ids: [1], locais: [], mensagem: "Conta lançada no Bling." };
  }
}

// ── Painéis (RPCs) ──────────────────────────────────────────────────────────
const AGING_PAGAR = [
  { bucket: "vencido_30_mais", qtd: 2, total: 3100 }, { bucket: "vencido_1_30", qtd: 3, total: 5470.8 },
  { bucket: "vence_hoje", qtd: 1, total: 980.3 }, { bucket: "a_vencer_7", qtd: 4, total: 13420 },
  { bucket: "a_vencer_30", qtd: 6, total: 18900 }, { bucket: "a_vencer_mais", qtd: 5, total: 22400 },
];
const AGING_RECEBER = [
  { bucket: "vencido_30_mais", qtd: 1, total: 2200 }, { bucket: "vencido_1_30", qtd: 4, total: 6240 },
  { bucket: "vence_hoje", qtd: 1, total: 8400 }, { bucket: "a_vencer_7", qtd: 5, total: 16200 },
  { bucket: "a_vencer_30", qtd: 9, total: 31800 }, { bucket: "a_vencer_mais", qtd: 7, total: 27500 },
];
const segunda = (k: number) => {
  const x = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - ((hoje.getDay() + 6) % 7) + 7 * k, 12);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const CASHFLOW = [
  [22840, 15900], [18200, 12400], [14600, 17300], [21900, 9800], [12100, 14200], [16800, 8900], [19400, 11300], [15200, 13800],
  [17100, 10200], [13300, 12900], [18800, 9400], [14400, 11700],
].map(([e, s], k) => ({ semana: segunda(k), entrada: e, saida: s }));
const mesTxt = (k: number) => {
  const x = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-01`;
};

export const FX: Record<string, unknown> = {
  fin_contas_pagar_config: [{ conta: 1, ativo: true }, { conta: 2, ativo: true }],
  fin_bling_baixa_config: [{ ativo: true, teste_ids: [] }],
  fin_bling2_baixa_config: [{ ativo: true, teste_ids: [] }],
  purchase_payables: PAGAR,
  receivables: RECEBER,
  bling_contas_pagar: ESPELHO_PAGAR,
  bling_contas_receber: ESPELHO_RECEBER,
  bling2_contas_pagar: FILIAL_PAGAR,
  bling2_contas_receber: FILIAL_RECEBER,
  subscriptions: SUBSCRIPTIONS,
  suppliers: SUPPLIERS,
  payment_methods: PAYMENT_METHODS,
  "fn:fin-contas-pagar": finContasPagar,
};

export const RPC_FX: Record<string, unknown> = {
  fin_payables_aging: AGING_PAGAR,
  fin_receivables_aging: AGING_RECEBER,
  fin_cashflow_weekly: (a: { p_weeks?: number }) => CASHFLOW.slice(0, a.p_weeks ?? 8),
  fin_receivables_on_time: [{ recebidos: 64, no_prazo: 51, atrasados: 13, pct_no_prazo: 80 }],
  fin_receivables_top_customers: [],
  fin_payables_forecast: CASHFLOW.slice(0, 8).map((c) => ({ semana: c.semana, total: c.saida, qtd: 4 })),
  fin_payables_status_summary: [
    { status_efetivo: "pago", qtd: 48, total: 96400 }, { status_efetivo: "programado", qtd: 15, total: 54720 },
    { status_efetivo: "atrasado", qtd: 5, total: 8570.8 }, { status_efetivo: "cancelado", qtd: 2, total: 1200 },
  ],
  fin_payables_monthly: [5, 4, 3, 2, 1, 0].map((k, i) => ({ mes: mesTxt(k), pago: [31200, 28700, 33900, 30100, 35400, 18600][i], aberto: [0, 0, 0, 1200, 4300, 22800][i] })),
  fin_payables_top_suppliers: [
    { supplier_name: "Química Nordeste", total: 38200, qtd: 6 }, { supplier_name: "Aluguel Galpão Natal", total: 24800, qtd: 4 },
    { supplier_name: "Embalagens Delta", total: 17300, qtd: 5 }, { supplier_name: "Transportadora Litoral", total: 12900, qtd: 7 },
    { supplier_name: "Gráfica Norte Ltda", total: 9400, qtd: 8 }, { supplier_name: "Energia Potiguar S.A.", total: 5900, qtd: 6 },
    { supplier_name: "Contabilidade Alfa", total: 4500, qtd: 3 }, { supplier_name: "Internet Fibra Max", total: 1560, qtd: 4 },
  ],
  fin_payables_on_time: [{ pagos: 48, no_prazo: 41, atrasados: 7, pct_no_prazo: 85 }],
  fin_purchase_cycle_times: [
    { etapa: "RC → aprovação", ordem: 1, media_dias: 1.4, p50_dias: 1, n: 22 },
    { etapa: "Aprovação → OC", ordem: 2, media_dias: 2.1, p50_dias: 2, n: 20 },
    { etapa: "OC → recebimento", ordem: 3, media_dias: 6.8, p50_dias: 6, n: 18 },
    { etapa: "Recebimento → NF", ordem: 4, media_dias: 1.2, p50_dias: 1, n: 17 },
  ],
  fin_3way_summary: [{ total: 17, ok: 15, divergentes: 2, pct_ok: 88 }],
  fin_quote_savings: [{ total_estimado: 52000, total_escolhido: 47300, economia: 4700, n: 9 }],
};
