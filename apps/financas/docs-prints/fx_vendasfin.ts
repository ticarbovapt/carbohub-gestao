// Fixtures da área VENDAS da Documentação do Carbo Finanças (ver areas.ts):
// /faturamento (criar no Bling, NFS-e, vincular NFs), /comissionamento e
// /pedidos. Dados FICTÍCIOS.
// ⚠️ Tabelas que o resto do app também lê (carboze_orders, carbo_vendas_metrica,
// bling_nfe) respondem por ROTA: fora das nossas telas devolvem o padrão.
import { PAPEL, U } from "./pessoas";
import { vendas } from "./fx_vendas";
import { pedidosEdit } from "./fx_vender";

const naNossa = () => /^\/(faturamento|comissionamento|pedidos)/.test(location.pathname);
const porRota = (meu: () => unknown, padrao: () => unknown = () => []) => () => (naNossa() ? meu() : padrao());

const hoje = new Date();
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const MES = ym(hoje);
const MES_ANT = ym(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 10));
const dia = (m: string, d: number, h = 14) => `${m}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:10:00.000Z`;

const item = (name: string, code: string, q: number, p: number, extra: Record<string, unknown> = {}) => ({
  name, product_code: code, quantity: q, unit_price: p, total: q * p, discount_type: "none", discount_amount: 0, bonus_quantity: 0, kind: null, ...extra,
});
const servico = (name: string, q: number, p: number, modality: string | null = "M") =>
  item(name, "DESCARB", q, p, { kind: "service", modality });

const base = {
  customer_ie: null, billing_address: null, payment_terms: "Boleto 28 dias", freight_type: "CIF", shipping_cost: 0,
  agreed_delivery_date: null, ppf_date: null, ppe_date: null, po_number: null, po_date: null,
  notes: null, buyer_notes: null, general_notes: null, bling_conta: null, external_ref: null, segmento: "revenda",
  bling_nf_id: null, bling_nf_bonificacao_id: null, bling2_nf_id: null, bling2_nf_bonificacao_id: null,
  invoice_number: null, nf_valida: null, nf_situacao: null, discount: 0, discount_percent: 0, status: "pending",
  shipment_volumes: null, shipment_weight_kg: null, shipment_carrier: null, shipment_quote_value: null,
  ie: null, billing_city: null, billing_state: null, billing_zip: null, billing_contact_name: null, billing_contact_email: null,
  source_file: null, order_type: "spot", has_commission: false, commission_amount: 0, commission_rate: 0, linha: "carboze",
};

export const pedidosFat = [
  { ...base, id: "f1", order_number: "V2026100094", created_at: dia(MES, 24), sale_date: `${MES}-24`, fulfillment_stage: "gerar_nf",
    customer_name: "Posto Horizonte Azul Ltda", cnpj: "41.234.567/0001-08", customer_ie: "20.123.456-7", customer_email: "compras@postohorizonte.com.br", customer_phone: "(84) 99812-7788",
    delivery_address: "Av. Prudente de Morais, 2150 - Lagoa Nova", delivery_city: "Natal", delivery_state: "RN", delivery_zip: "59064-630",
    items: [item("CarboZé 100ml - PDV", "CZ100-PDV", 120, 13)], subtotal: 1560, total: 1560, payment_terms: "Boleto 28 dias",
    shipment_volumes: 2, shipment_weight_kg: 14.4, shipment_carrier: "Jadlog", shipment_quote_value: 86.5, po_number: "PC-55821",
    vendedor_id: U.colab.id, vendedor_name: U.colab.full_name, buyer_notes: "Entregar das 8h às 12h." },
  { ...base, id: "f2", order_number: "V2026100091", created_at: dia(MES, 23), sale_date: `${MES}-23`, fulfillment_stage: "gerar_nf",
    customer_name: "Rede Litoral Combustíveis", cnpj: "23.456.789/0001-01", customer_email: "financeiro@redelitoral.com.br", customer_phone: "(84) 99654-1020",
    delivery_address: "Rua das Dunas, 55 - Ponta Negra", delivery_city: "Natal", delivery_state: "RN", delivery_zip: "59090-000",
    items: [item("CarboZé 100ml - PDV", "CZ100-PDV", 200, 13), item("CarboZé 100ml - bonificação", "CZ100-BON", 20, 15.6, { is_bonificacao: true, discount_type: "percent", discount_value: 100, discount_amount: 312, total: 0 })],
    subtotal: 2912, discount: 312, total: 2600, payment_terms: "Boleto 30/60 dias",
    vendedor_id: U.vend2.id, vendedor_name: U.vend2.full_name },
  { ...base, id: "f3", order_number: "V2026100088", created_at: dia(MES, 22), sale_date: `${MES}-22`, fulfillment_stage: "separando",
    customer_name: "Posto Caminho do Sol", cnpj: "45.678.901/0001-23", customer_email: "gerencia@caminhodosol.com.br", customer_phone: "(81) 99123-4567",
    delivery_address: "Rod. PE-60, 300", delivery_city: "Ipojuca", delivery_state: "PE", delivery_zip: "55590-000",
    items: [item("CarboZé 1 Litro", "CZ1L", 24, 89.9)], subtotal: 2157.6, total: 2157.6,
    vendedor_id: U.colab.id, vendedor_name: U.colab.full_name },
  { ...base, id: "f4", order_number: "V2026100080", created_at: dia(MES, 18), sale_date: `${MES}-18`, fulfillment_stage: "em_transporte", status: "invoiced",
    customer_name: "Auto Posto Estrela", cnpj: "34.567.890/0001-12", customer_phone: "(83) 98877-6655",
    delivery_address: "BR-230, km 12", delivery_city: "João Pessoa", delivery_state: "PB", delivery_zip: "58000-000",
    items: [item("CarboZé 100ml - PDV", "CZ100-PDV", 60, 13)], subtotal: 780, total: 780,
    bling_nf_id: 9101, invoice_number: "000431", nf_valida: true, nf_situacao: "Autorizada", external_ref: "bling-77120",
    vendedor_id: U.colab.id, vendedor_name: U.colab.full_name },
  { ...base, id: "f5", order_number: "V2026100076", created_at: dia(MES, 16), sale_date: `${MES}-16`, fulfillment_stage: "nova_venda",
    customer_name: "Frota Nordeste Transportes Ltda", cnpj: "52.345.678/0001-44", customer_email: "frota@frotanordeste.com.br", customer_phone: "(84) 3222-1100",
    delivery_address: "Rua Jaguarari, 4400 - Candelária", delivery_city: "Natal", delivery_state: "RN", delivery_zip: "59064-500",
    items: [servico("Descarbonização CarboVAPT - Leves e caminhonetes", 2, 700), servico("Descarbonização CarboVAPT - Pesados", 1, 1400, "G"),
      { ...servico("Laudo de Opacidade", 1, 200, null), is_bonificacao: true, total: 0 }],
    subtotal: 2800, total: 2800, payment_terms: "PIX", po_number: "OC-2026-118",
    vendedor_id: U.vend2.id, vendedor_name: U.vend2.full_name },
  { ...base, id: "f6", order_number: "V2026100070", created_at: dia(MES, 13), sale_date: `${MES}-13`, fulfillment_stage: "nova_venda",
    customer_name: "Transportes Sertão S.A.", cnpj: "61.222.333/0001-55", customer_phone: "(84) 99777-2020",
    delivery_address: "Av. Bernardo Vieira, 900 - Quintas", delivery_city: "Natal", delivery_state: "RN", delivery_zip: "59035-000",
    items: [servico("Descarbonização CarboVAPT - Pesados", 3, 1400, "G")], subtotal: 4200, total: 4200, payment_terms: "Boleto 28 dias",
    vendedor_id: U.colab.id, vendedor_name: U.colab.full_name },
  { ...base, id: "f7", order_number: "V2026100058", created_at: dia(MES, 10), sale_date: `${MES}-10`, fulfillment_stage: "nova_venda",
    customer_name: "Locadora Potiguar Veículos", cnpj: "07.654.321/0001-90", customer_email: "adm@locadorapotiguar.com.br", customer_phone: "(84) 99101-3030",
    delivery_address: "Av. Salgado Filho, 3100 - Lagoa Nova", delivery_city: "Natal", delivery_state: "RN", delivery_zip: "59075-000",
    items: [servico("Descarbonização CarboVAPT - Leves e caminhonetes", 4, 700)], subtotal: 2800, total: 2800,
    vendedor_id: U.colab.id, vendedor_name: U.colab.full_name },
  { ...base, id: "f8", order_number: "V2026100049", created_at: dia(MES, 7), sale_date: `${MES}-07`, fulfillment_stage: "emitir_etiqueta", status: "invoiced",
    customer_name: "Posto Ponta Negra", cnpj: "18.765.432/0001-77", customer_phone: "(84) 98800-1122",
    delivery_address: "Av. Eng. Roberto Freire, 1800", delivery_city: "Natal", delivery_state: "RN", delivery_zip: "59090-000",
    items: [item("CarboZé Sachê 10ml", "CARB-SACH-10ML", 300, 4.9)], subtotal: 1470, total: 1470,
    bling_nf_id: 9088, invoice_number: "000418", nf_valida: false, nf_situacao: "Cancelada", external_ref: "bling-77015",
    vendedor_id: U.vend2.id, vendedor_name: U.vend2.full_name },
  // Aba "Do Bling": criados direto no Bling.
  { ...base, id: "b1", order_number: "BLING-6120", created_at: dia(MES, 21), sale_date: `${MES}-21`, fulfillment_stage: null, external_ref: "bling-6120",
    customer_name: "Distribuidora Agreste Ltda", cnpj: "29.111.222/0001-33", items: [item("CarboZé 1 Litro", "CZ1L", 12, 89.9)], subtotal: 1078.8, total: 1078.8,
    vendedor_id: null, vendedor_name: null, notes: "Pedido de reposição" },
  { ...base, id: "b2", order_number: "BLING2-344", created_at: dia(MES, 15), sale_date: `${MES}-15`, fulfillment_stage: null, external_ref: "bling2-344", bling_conta: 2,
    customer_name: "Auto Center Paulista", cnpj: "33.444.555/0001-66", items: [item("CarboZé 100ml", "CZ100", 30, 15.6)], subtotal: 468, total: 468,
    bling2_nf_id: 5512, invoice_number: "000087", nf_valida: true, nf_situacao: "Autorizada", vendedor_id: null, vendedor_name: null },
  // Aba "NF Online": marketplace.
  { ...base, id: "o1", order_number: "BLING2-512", created_at: dia(MES, 20), sale_date: `${MES}-20`, fulfillment_stage: null, external_ref: "bling2-512", bling_conta: 2, segmento: "online",
    customer_name: "Juliana Ferreira (Mercado Livre)", cnpj: "123.456.789-09", items: [item("CarboZé Kit 5 Frascos 100ml", "124", 1, 149.5)], subtotal: 149.5, total: 149.5,
    bling2_nf_id: 5530, invoice_number: "000091", nf_valida: true, nf_situacao: "Autorizada", vendedor_id: null, vendedor_name: null },
];

// ── Bling: pré-visualização do "Criar no Bling" (bling-sync dry_run) ─────────
const previa = (orderId: string, conta: number) => {
  const o = pedidosFat.find((x) => x.id === orderId) ?? pedidosFat[0];
  const obs = [o.order_number, o.vendedor_name ? `Vendedor: ${o.vendedor_name}` : "", o.buyer_notes ?? ""].filter(Boolean).join(" — ");
  if (o.id === "f2") {
    return {
      dry_run: true, order_number: o.order_number, customer_name: o.customer_name,
      contact_found: true, contact_id: 16001234, contact_source: "CNPJ 23.456.789/0001-01",
      items_summary: [
        { name: "CarboZé 100ml - PDV", matched: true, codigo: "CZ100-PDV" },
        { name: "CarboZé 100ml - bonificação (remessa separada)", matched: true, codigo: "CZ100" },
      ],
      payment_summary: { escolhido: "Boleto 30/60 dias", forma_bling: "Boleto Bradesco", parcelas: 2 },
      warnings: ["Este pedido tem bonificação: serão criados DOIS pedidos no Bling — o pago (natureza padrão) e a remessa de brinde, com a natureza de bonificação."],
      payload: { observacoes: obs },
    };
  }
  return {
    dry_run: true, order_number: o.order_number, customer_name: o.customer_name,
    contact_found: false, contact_id: null, contact_source: "",
    contact_to_create: {
      nome: o.customer_name, tipo: "J", numeroDocumento: String(o.cnpj).replace(/\D/g, ""),
      ie: conta === 2 ? "" : "201234567", indicadorIe: 1, email: o.customer_email, telefone: o.customer_phone,
      endereco: { geral: { endereco: "Av. Prudente de Morais", numero: "2150", complemento: "", bairro: "", cep: "59064-630", municipio: "Natal", uf: "RN" } },
    },
    items_summary: [{ name: "CarboZé 100ml - PDV", matched: true, codigo: "CZ100-PDV" }],
    payment_summary: { escolhido: "Boleto 28 dias", forma_bling: "Boleto Bradesco", parcelas: 1 },
    warnings: [`Cliente "${o.customer_name}" não encontrado no Bling — será CADASTRADO com os dados do pedido ao confirmar.`],
    payload: { observacoes: obs, numeroPedidoCompra: o.po_number },
  };
};

const NATUREZAS = [
  { id: 15108700011, descricao: "Venda de mercadoria adquirida ou recebida de terceiros", padrao: true },
  { id: 15108700012, descricao: "Venda de produção do estabelecimento" },
  { id: 15108700019, descricao: "Remessa em bonificação, doação ou brinde" },
  { id: 15108700023, descricao: "Devolução de venda" },
  { id: 15108700031, descricao: "Remessa para conserto" },
];

const blingSync = (b: Record<string, unknown>) => {
  if (b.entity === "create_order" && b.dry_run) return previa(String(b.order_id), Number(b.conta ?? 1));
  if (b.entity === "create_order") return { success: true, data: { numero: "6188" } };
  if (b.entity === "naturezas") return { success: true, naturezas: NATUREZAS };
  if (b.entity === "nfe_links") return { success: true, pdf: null, xml: null };
  return { success: true, data: {} };
};

// ── NFS-e (carbo_nfse_emissao_preparar / carbo_nfse_emissoes) ────────────────
const agoraMenos = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const emissoes: Record<string, unknown[]> = {
  f6: [{ id: "e6", order_id: "f6", ambiente: 1, serie: "2", n_dps: 41, status: "autorizada", chave_acesso: "24081022360606920001000000000021426101234567", n_nfse: "214", erro: null, criado_em: agoraMenos(200), concluido_em: agoraMenos(200), enviado_em: agoraMenos(200) }],
  f7: [{ id: "e7", order_id: "f7", ambiente: 1, serie: "2", n_dps: 47, status: "indeterminado", chave_acesso: null, n_nfse: null,
    erro: "O portal não respondeu em 60 s (tempo esgotado). A nota pode ter sido emitida.", criado_em: agoraMenos(3), concluido_em: null, enviado_em: agoraMenos(3),
    c_ind_op: "050103", d_compet: `${MES}-10`, descricao: "SERVIÇO DE DESCARBONIZAÇÃO. CARBOVAPT. 4 VEÍCULOS.",
    tomador: { cep: "59075000", cMun: "2408102", lgr: "Av. Salgado Filho", nro: "3100", cpl: "", bairro: "Lagoa Nova", fone: "84991013030", email: "adm@locadorapotiguar.com.br" } }],
};
const preparo = (id: string) => {
  const o = pedidosFat.find((x) => x.id === id) ?? pedidosFat[4];
  return {
    pedido: {
      id: o.id, order_number: o.order_number, status: o.status, customer_name: o.customer_name, documento: o.cnpj,
      customer_email: o.customer_email ?? null, customer_phone: o.customer_phone ?? null, delivery_address: o.delivery_address ?? null,
      delivery_city: o.delivery_city ?? null, delivery_state: o.delivery_state ?? null, delivery_zip: o.delivery_zip ?? null,
      po_number: o.po_number, sale_date: o.sale_date, created_at: o.created_at, total: o.total, itens: o.items,
      descarb_os_id: "os1", so_servico: true, vendedor: o.vendedor_name,
    },
    veiculos: o.id === "f5"
      ? [{ posicao: 1, placa: "QGA1B23", modelo: "Fiat Strada", ano: 2022 }, { posicao: 2, placa: "RNX4C56", modelo: "Toyota Hilux", ano: 2021 }, { posicao: 3, placa: "OJK7D89", modelo: "VW Constellation 24.280", ano: 2019 }]
      : [],
    emissoes: emissoes[o.id] ?? [],
  };
};

// ── Notas fiscais (Vincular / Todas) ─────────────────────────────────────────
const nfe = (id: string, bling_id: number, numero: string, contato: string, valor: number, emissao: string, situacao: string, order_id: string | null = null, matched: string | null = null) =>
  ({ id, bling_id, numero, serie: "1", contato_nome: contato, valor_total: valor, data_emissao: emissao, situacao, order_id, matched_order_number: matched, match_status: order_id ? "matched" : "pending", pdf_url: null, xml_url: null });
const notas = [
  nfe("n1", 9120, "000436", "POSTO HORIZONTE AZUL LTDA", 1560, `${MES}-25`, "Autorizada"),
  nfe("n2", 9117, "000434", "COMERCIAL BRISA DO MAR LTDA", 845, `${MES}-24`, "Autorizada"),
  nfe("n3", 9101, "000431", "AUTO POSTO ESTRELA", 780, `${MES}-18`, "Autorizada", "f4", "V2026100080"),
  nfe("n4", 9088, "000418", "POSTO PONTA NEGRA", 1470, `${MES}-07`, "Cancelada", "f8", "V2026100049"),
  nfe("n5", 9070, "000409", "DISTRIBUIDORA AGRESTE LTDA", 1078.8, `${MES}-02`, "Autorizada", "b1", "BLING-6120"),
  nfe("n6", 8960, "000381", "POSTO SERTANEJO", 2340, `${MES_ANT}-22`, "Autorizada"),
];
const notasFilial = [
  { bling_id: 5541, numero: "000094", serie: "1", data_emissao: `${MES}-23`, contato_nome: "REDE LITORAL COMBUSTIVEIS", contato_cnpj: "23456789000101", valor_total: 312,
    situacao: "Emitida DANFE", natureza_operacao: null, e_bonificacao: false, codigo_no_rodape: "V2026100091",
    informacoes_adicionais: "REMESSA DE MERCADORIA EM BONIFICACAO, CONCEDIDA SEM COBRANCA. V2026100091 - Vendedor: Ana Souza", pdf_url: null, xml_url: null },
  { bling_id: 5537, numero: "000093", serie: "1", data_emissao: `${MES}-21`, contato_nome: "AUTO CENTER PAULISTA", contato_cnpj: "33444555000166", valor_total: 624,
    situacao: "Autorizada", natureza_operacao: "Venda de mercadoria", e_bonificacao: false, codigo_no_rodape: "V2026100066",
    informacoes_adicionais: "V2026100066 - Vendedor: Bruno Lima", pdf_url: null, xml_url: null },
];

// ── Comissionamento ──────────────────────────────────────────────────────────
const pedComissao = [
  { id: "c1", order_number: "V2026100031", customer_name: "Posto Boa Viagem Ltda", bling_nf_id: 9050, total: 1560, sale_date: `${MES}-03` },
  { id: "c2", order_number: "V2026100044", customer_name: "Rede Litoral Combustíveis", bling_nf_id: 9061, total: 3090, sale_date: `${MES}-06` },
  { id: "c3", order_number: "V2026100080", customer_name: "Auto Posto Estrela", bling_nf_id: 9101, total: 780, sale_date: `${MES}-18` },
  { id: "c4", order_number: "V2026100052", customer_name: "Posto Caminho do Sol", bling_nf_id: 9072, total: 2157.6, sale_date: `${MES}-09` },
];
const nfsComissao = [
  { bling_id: 9050, numero: "000401", valor_total: 1560, data_emissao: `${MES}-03`, pdf_url: null, xml_url: null },
  { bling_id: 9061, numero: "000405", valor_total: 3090, data_emissao: `${MES}-06`, pdf_url: null, xml_url: null },
  { bling_id: 9101, numero: "000431", valor_total: 780, data_emissao: `${MES}-18`, pdf_url: null, xml_url: null },
  { bling_id: 9072, numero: "000407", valor_total: 2157.6, data_emissao: `${MES}-09`, pdf_url: null, xml_url: null },
];
const st = (id: string, v: { id: string; full_name: string }, ini: string, fim: string, prod: number, desc: number, pct: number, pctD: number, pago: number) => {
  const ap = Math.round(prod * pct) / 100, ad = Math.round(desc * pctD) / 100, due = ap + ad;
  return { id, vendedor_id: v.id, vendedor_name: v.full_name, period_start: ini, period_end: fim, base_sales: prod + desc, base_produto: prod, base_descarb: desc,
    sales_count: 4, rate_pct: pct, rate_descarb_pct: pctD, amount_produto: ap, amount_descarb: ad, amount_due: due, amount_paid: pago,
    status: pago >= due ? "pago" : pago > 0 ? "parcial" : "aberto", notes: null, created_at: `${fim}T18:00:00.000Z` };
};
const fimMesAnt = (() => { const d = new Date(hoje.getFullYear(), hoje.getMonth(), 0); return `${ym(d)}-${String(d.getDate()).padStart(2, "0")}`; })();
const statements = [
  st("s1", U.colab, `${MES_ANT}-01`, fimMesAnt, 5430, 4200, 3, 5, 0),
  st("s2", U.vend2, `${MES_ANT}-01`, fimMesAnt, 12300, 0, 3, 5, 200),
  st("s3", U.closer, `${MES_ANT}-01`, fimMesAnt, 9800, 1400, 2.5, 5, 315),
];

// ── Pedidos de Venda (carboze_orders_secure) ─────────────────────────────────
const ordersSecure = pedidosFat.filter((o) => o.id.startsWith("f")).map((o, i) => ({
  ...o, licensee_id: null, confirmed_at: null, invoiced_at: null, shipped_at: null, tracking_code: null, tracking_url: null,
  delivered_at: null, cancelled_at: null, cancellation_reason: null, commission_paid_at: null, internal_notes: null,
  created_by: o.vendedor_id, updated_at: o.created_at, is_recurring: i === 1, recurrence_interval_days: i === 1 ? 30 : null,
  next_delivery_date: null, parent_order_id: null, last_recurrence_order_id: null, rv_flow_type: "standard",
  order_type: i === 1 ? "recorrente" : "spot",
  status: o.id === "f4" ? "shipped" : o.id === "f8" ? "invoiced" : o.id === "f3" ? "confirmed" : o.status,
  linha: o.items.some((x: { kind?: string | null }) => x.kind === "service") ? "carbovapt" : "carboze",
}));

export const FX: Record<string, unknown> = {
  carbo_vendas_metrica: porRota(() => pedidosFat, () => vendas(PAPEL)),
  carboze_orders: porRota(
    () => (location.pathname.startsWith("/comissionamento") ? pedComissao : pedidosFat.filter((o) => o.id.startsWith("f"))),
    () => [...pedidosEdit, ...vendas(PAPEL)],
  ),
  carboze_orders_secure: porRota(() => ordersSecure),
  bling_nfe: porRota(() => (location.pathname.startsWith("/comissionamento") ? nfsComissao : notas)),
  carbo_nf_filial_sem_pedido: porRota(() => notasFilial),
  carbo_nfse_emissoes: porRota(() => Object.values(emissoes).flat()),
  carbo_config_fiscal: porRota(() => [{ chave: "bling1_natureza_bonificacao_id", valor: "15108700019" }, { chave: "bling2_natureza_bonificacao_id", valor: null }]),
  commission_statements: porRota(() => statements),
  commission_rules: porRota(() => [
    { id: "r0", vendedor_id: null, rate_pct: 3, rate_descarb_pct: 5, active: true },
    { id: "r1", vendedor_id: U.closer.id, rate_pct: 2.5, rate_descarb_pct: 5, active: true },
  ]),
  commission_statement_items: porRota(() => pedComissao.slice(0, 3).map((p, i) => ({
    id: `i${i}`, statement_id: "s1", order_id: p.id, order_number: p.order_number, customer_name: p.customer_name, sale_date: p.sale_date, total: p.total,
  }))),
  commission_payments: porRota(() => []),
  licensees: porRota(() => []),
  "fn:bling-sync": blingSync,
};

export const RPC_FX: Record<string, unknown> = {
  carbo_nfse_emissao_preparar: (a: { p_order?: string }) => preparo(String(a.p_order)),
  carbo_faturamento_busca: () => pedidosFat,
  crm_comissao_agregado: () => [
    { vendedor_id: U.colab.id, vendedor_name: U.colab.full_name, total: 5397.6, qtd: 3 },
    { vendedor_id: U.vend2.id, vendedor_name: U.vend2.full_name, total: 3090, qtd: 1 },
  ],
  crm_comissao_descarb: () => [
    { vendedor_id: U.colab.id, vendedor_name: U.colab.full_name, total: 4200, qtd: 1 },
    { vendedor_id: U.closer.id, vendedor_name: U.closer.full_name, total: 2800, qtd: 1 },
  ],
  crm_comissao_detalhe: (a: { p_vendedor?: string }) =>
    (a.p_vendedor === U.colab.id ? ["c1", "c3", "c4"] : a.p_vendedor === U.vend2.id ? ["c2"] : []).map((order_id) => ({ order_id })),
};
