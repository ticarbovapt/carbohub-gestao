// Fixtures da área "logistica" (ver areas.ts): Rastreio de venda, Vendas de
// Recorrência, Logística (remessas e frete), Viagens & PC e Alertas
// Operacionais. Tudo FICTÍCIO — nenhum cliente, pedido ou pessoa é real.
//
// ⚠️ Estas telas leem tabelas que outras áreas também usam (carboze_orders,
// warehouse_stock, production_orders…). Para não atropelar os prints delas,
// cada tabela daqui só responde com os dados desta área NAS ROTAS desta área;
// fora delas, devolve o que as outras áreas declararam (ou o padrão).
import { PAPEL, U, EU } from "./pessoas";
import { vendas } from "./fx_vendas";
import { pedidosEdit, produtos } from "./fx_vender";
import * as campo from "./fx_campo";
import * as comercial from "./fx_comercial";
import * as producao from "./fx_producao";
import * as suprimentos from "./fx_suprimentos";

const OUTRAS = [campo, comercial, producao, suprimentos] as { FX?: Record<string, unknown> }[];
const rota = () => { try { return location.pathname; } catch { return ""; } };
const NOSSAS = ["/logistica", "/rastreio", "/recorrencias", "/viagens", "/alertas"];
const naNossa = () => NOSSAS.some((r) => rota().startsWith(r));
const resolve = (v: unknown) => (typeof v === "function" ? (v as () => unknown)() : v);
/** Nas nossas rotas, `meu()`; fora delas, o da outra área (ou o padrão). */
const porRota = (chave: string, meu: () => unknown, padrao: () => unknown = () => []) => () => {
  if (naNossa()) return meu();
  for (const a of [...OUTRAS].reverse()) if (a.FX && chave in a.FX) return resolve(a.FX[chave]);
  return padrao();
};

// ── Datas ───────────────────────────────────────────────────────────────────
const agora = Date.now();
const atras = (d: number, h = 14) => { const x = new Date(agora - d * 86400000); x.setHours(h, 10, 0, 0); return x.toISOString(); };
const pad = (n: number) => String(n).padStart(2, "0");
const diaLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dia = (off: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return diaLocal(d); };
const mes = (off: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; };

// ── Pedidos (carboze_orders) ────────────────────────────────────────────────
const item = (name: string, code: string, pid: string | null, q: number, p: number, extra: Record<string, unknown> = {}) =>
  ({ name, product_code: code, product_id: pid, quantity: q, unit_price: p, total: q * p, kind: null, ...extra });
const bonif = (name: string, code: string, pid: string, q: number, p: number) =>
  item(name, code, pid, q, p, { is_bonificacao: true, total: 0, discount_type: "percent", discount_value: 100 });

const base = {
  customer_ie: null, customer_email: null, payment_terms: "Boleto 28 dias", freight_type: "CIF",
  shipping_cost: 0, discount: 0, notes: null, agreed_delivery_date: null, ppf_date: null, ppe_date: null,
  external_ref: null, linha: null, status: "pending", production_done: false,
  bling_nf_id: null, invoice_number: null, nf_access_key: null, bling_conta: 1,
  bling_nf_bonificacao_id: null, invoice_bonificacao_number: null, nf_bonificacao_access_key: null,
  bling2_nf_id: null, invoice2_number: null, nf2_access_key: null,
  bling2_nf_bonificacao_id: null, invoice2_bonificacao_number: null, nf2_bonificacao_access_key: null,
  shipment_volumes: null, shipment_weight_kg: null, shipment_carrier: null, shipment_quote_value: null,
  scheduled_month: null, recurrence_index: null, recurrence_total: null, recurrence_period: null,
  recurrence_group_id: null, parent_order_id: null,
  delivery_zip: null, customer_phone: null, cnpj: null,
  vendedor_id: U.vend2.id, vendedor_name: U.vend2.full_name,
};
type Ped = Record<string, unknown>;
const ped = (o: Ped): Ped => {
  const items = (o.items as { total: number }[]) ?? [];
  const sub = items.reduce((s, i) => s + (i.total || 0), 0);
  const created = (o.created_at as string) ?? atras(3);
  return {
    ...base, subtotal: sub, total: sub - Number(o.discount ?? 0) + Number(o.shipping_cost ?? 0),
    updated_at: created, stage_changed_at: created, ...o, created_at: created,
  };
};

// Recorrências: três contratos fictícios.
const parcela = (grupo: string, idx: number, total: number, periodo: string, offMes: number, o: Ped) => ped({
  recurrence_group_id: grupo, recurrence_index: idx, recurrence_total: total, recurrence_period: periodo,
  scheduled_month: mes(offMes), order_number: `V2026${pad(8 + Math.max(0, offMes + 2))}${grupo.slice(-1)}${pad(idx)}`.slice(0, 11),
  ...o,
});
const litoral = { customer_name: "Rede Litoral Combustíveis", cnpj: "23456789000101", customer_phone: "(84) 99654-1020",
  delivery_address: "Rua das Dunas, 55", delivery_city: "Natal", delivery_state: "RN", delivery_zip: "59020-100",
  items: [item("CarboZé 100ml - PDV", "CZ100-PDV", "p1pdv", 200, 13)] };
const atlantico = { customer_name: "Construtora Atlântico", cnpj: "34567890000112", customer_phone: "(84) 3221-4455",
  delivery_address: "Av. Hermes da Fonseca, 700", delivery_city: "Natal", delivery_state: "RN",
  items: [item("CarboZé 1 Litro", "CZ1L", "p2", 24, 89.9)] };
const frigo = { customer_name: "Frigorífico Serra Azul", cnpj: "45678901000123", customer_phone: "(83) 3333-8899",
  delivery_address: "BR-230, km 18", delivery_city: "João Pessoa", delivery_state: "PB",
  items: [item("CarboZé 100ml", "CZ100", "p1", 120, 15.6)] };

const recorrencias: Ped[] = [
  // Rede Litoral — mensal, 6 parcelas: 2 entregues, a de agora em separação, 3 agendadas.
  parcela("rg1", 1, 6, "mensal", -2, { ...litoral, order_number: "V2026080061", fulfillment_stage: "entregue", status: "delivered",
    invoice_number: "000388", bling_nf_id: 388, created_at: atras(80), updated_at: atras(55), ppf_date: dia(-58), ppe_date: dia(-56) }),
  parcela("rg1", 2, 6, "mensal", -1, { ...litoral, order_number: "V2026080062", fulfillment_stage: "entregue", status: "delivered",
    invoice_number: "000431", bling_nf_id: 431, created_at: atras(80), updated_at: atras(40), ppf_date: dia(-28), ppe_date: dia(-26) }),
  parcela("rg1", 3, 6, "mensal", 0, { ...litoral, id: "rc-lit3", order_number: "V2026080063", fulfillment_stage: "separando",
    created_at: atras(80), stage_changed_at: atras(1), ppf_date: dia(2), ppe_date: dia(4), agreed_delivery_date: dia(6) }),
  parcela("rg1", 4, 6, "mensal", 1, { ...litoral, id: "rc-lit4", order_number: "V2026080064", fulfillment_stage: "agendado", status: "agendado",
    created_at: atras(80), stage_changed_at: atras(1), ppf_date: dia(33), ppe_date: dia(35) }),
  parcela("rg1", 5, 6, "mensal", 2, { ...litoral, order_number: "V2026080065", fulfillment_stage: "agendado", status: "agendado",
    created_at: atras(80), stage_changed_at: atras(1), ppf_date: dia(63), ppe_date: dia(65) }),
  parcela("rg1", 6, 6, "mensal", 3, { ...litoral, order_number: "V2026080066", fulfillment_stage: "agendado", status: "agendado",
    created_at: atras(80), stage_changed_at: atras(1), ppf_date: dia(94), ppe_date: dia(96) }),
  // Construtora Atlântico — trimestral, 4 parcelas: a deste mês já tem NF (travada).
  parcela("rg2", 1, 4, "trimestral", -3, { ...atlantico, order_number: "V2026070044", fulfillment_stage: "entregue", status: "delivered",
    invoice_number: "000301", bling_nf_id: 301, created_at: atras(110), updated_at: atras(85), ppf_date: dia(-90), ppe_date: dia(-88) }),
  parcela("rg2", 2, 4, "trimestral", 0, { ...atlantico, id: "rc-atl2", order_number: "V2026070045", fulfillment_stage: "etiqueta_emitida", status: "invoiced",
    invoice_number: "000517", bling_nf_id: 517, created_at: atras(110), stage_changed_at: atras(1), ppf_date: dia(-6), ppe_date: dia(-4) }),
  parcela("rg2", 3, 4, "trimestral", 3, { ...atlantico, order_number: "V2026070046", fulfillment_stage: "agendado", status: "agendado",
    created_at: atras(110), stage_changed_at: atras(1), ppf_date: dia(84), ppe_date: dia(86) }),
  parcela("rg2", 4, 4, "trimestral", 6, { ...atlantico, order_number: "V2026070047", fulfillment_stage: "agendado", status: "agendado",
    created_at: atras(110), stage_changed_at: atras(1), ppf_date: dia(176), ppe_date: dia(178) }),
  // Frigorífico Serra Azul — mensal, 3 parcelas: a deste mês com prazo de produção vencido; a próxima cancelada.
  parcela("rg3", 1, 3, "mensal", 0, { ...frigo, id: "rc-fri1", order_number: "V2026100071", fulfillment_stage: "nova_venda",
    created_at: atras(9), stage_changed_at: atras(9), ppf_date: dia(-2), ppe_date: dia(1), agreed_delivery_date: dia(3) }),
  parcela("rg3", 2, 3, "mensal", 1, { ...frigo, order_number: "V2026100072", fulfillment_stage: "cancelado", status: "cancelled",
    created_at: atras(9), updated_at: atras(40), ppf_date: dia(30), ppe_date: dia(32) }),
  parcela("rg3", 3, 3, "mensal", 2, { ...frigo, order_number: "V2026100073", fulfillment_stage: "agendado", status: "agendado",
    created_at: atras(9), stage_changed_at: atras(1), ppf_date: dia(61), ppe_date: dia(63) }),
];

// O quadro do Rastreio: um pedido em cada etapa (as parcelas acima também entram).
const avulsos: Ped[] = [
  ped({ id: "pv-lagoa", order_number: "V2026100081", created_at: atras(1), fulfillment_stage: "nova_venda",
    customer_name: "Posto Lagoa Azul", cnpj: "61234567000188", customer_phone: "(84) 99712-4410",
    delivery_address: "Av. Roberto Freire, 2100", delivery_city: "Natal", delivery_state: "RN", delivery_zip: "59090-000",
    items: [item("CarboZé 100ml", "CZ100", "p1", 80, 15.6)],
    agreed_delivery_date: dia(9), ppf_date: dia(5), ppe_date: dia(7), vendedor_id: U.colab.id, vendedor_name: U.colab.full_name }),
  ped({ id: "pv-mirante", order_number: "V2026100078", created_at: atras(2), fulfillment_stage: "separacao_pendente",
    customer_name: "Auto Posto Mirante", cnpj: "62345678000199", customer_phone: "(83) 98810-2234",
    delivery_address: "Rua Pedro II, 450", delivery_city: "Campina Grande", delivery_state: "PB", delivery_zip: "58400-000",
    items: [item("CarboZé 100ml - PDV", "CZ100-PDV", "p1pdv", 150, 13), bonif("CarboZé 100ml - bonificação", "CZ100-BON", "p1bon", 10, 15.6)],
    agreed_delivery_date: dia(5), ppf_date: dia(1), ppe_date: dia(3) }),
  ped({ id: "pv-aguas", order_number: "V2026100066", created_at: atras(6), stage_changed_at: atras(4), fulfillment_stage: "criar_op",
    customer_name: "Posto Encontro das Águas", cnpj: "66789012000133", customer_phone: "(86) 99555-3311",
    delivery_address: "Av. Frei Serafim, 1500", delivery_city: "Teresina", delivery_state: "PI",
    items: [item("CarboZé 1 Litro", "CZ1L", "p2", 60, 89.9), item("CarboZé Sachê 10ml", "CARB-SACH-10ML", "p3", 400, 4.9)],
    agreed_delivery_date: dia(4), ppf_date: dia(2), ppe_date: dia(3) }),
  ped({ id: "pv-tres", order_number: "V2026100060", created_at: atras(8), stage_changed_at: atras(3), fulfillment_stage: "criar_op", production_done: true,
    customer_name: "Posto Três Irmãos", cnpj: "65678901000122", customer_phone: "(85) 99876-1122",
    delivery_address: "Av. Bezerra de Menezes, 900", delivery_city: "Fortaleza", delivery_state: "CE",
    items: [item("CarboZé 1 Litro", "CZ1L", "p2", 48, 89.9)], agreed_delivery_date: dia(2), ppf_date: dia(-1), ppe_date: dia(1),
    vendedor_id: U.colab.id, vendedor_name: U.colab.full_name }),
  ped({ id: "pv-serra", order_number: "V2026100070", created_at: atras(4), stage_changed_at: atras(1), fulfillment_stage: "separando",
    customer_name: "Comercial Serra Verde", cnpj: "67890123000144", customer_phone: "(84) 99231-7788",
    delivery_address: "Rua do Comércio, 310", delivery_city: "Mossoró", delivery_state: "RN", delivery_zip: "59600-000",
    items: [item("CarboZé 100ml", "CZ100", "p1", 100, 15.6), bonif("CarboZé 100ml - bonificação", "CZ100-BON", "p1bon", 10, 15.6)],
    agreed_delivery_date: dia(3), ppf_date: dia(0), ppe_date: dia(2) }),
  ped({ id: "pv-acu", order_number: "V2026100063", created_at: atras(5), stage_changed_at: atras(1), fulfillment_stage: "separado",
    customer_name: "Posto Vale do Açu", cnpj: "68901234000155", customer_phone: "(84) 98877-6655",
    delivery_address: "Av. Senador João Câmara, 45", delivery_city: "Assú", delivery_state: "RN", delivery_zip: "59650-000",
    items: [item("CarboZé Sachê 10ml", "CARB-SACH-10ML", "p3", 600, 4.9)],
    shipment_volumes: 4, shipment_weight_kg: 22.5, agreed_delivery_date: dia(4), ppf_date: dia(-1), ppe_date: dia(2),
    vendedor_id: U.colab.id, vendedor_name: U.colab.full_name }),
  ped({ id: "pv-sertao", order_number: "V2026100055", created_at: atras(9), stage_changed_at: atras(6), fulfillment_stage: "gerar_nf",
    customer_name: "Rede Sertão Combustíveis", cnpj: "63456789000100", customer_phone: "(87) 99645-7788",
    customer_email: "compras@redesertao.com.br", customer_ie: "18.123.456-7",
    delivery_address: "BR-232, km 210", delivery_city: "Arcoverde", delivery_state: "PE", delivery_zip: "56500-000",
    items: [item("CarboZé 100ml - PDV", "CZ100-PDV", "p1pdv", 150, 13)], discount: 97.5,
    payment_terms: "Boleto 28/56 dias", shipment_volumes: 3, shipment_weight_kg: 18.4, shipment_carrier: "Jadlog",
    shipment_quote_value: 186.4, agreed_delivery_date: dia(2), ppf_date: dia(-4), ppe_date: dia(0),
    notes: "Receber no posto da matriz, falar com o Sr. Joaquim." }),
  ped({ id: "pv-ponta", order_number: "V2026100049", created_at: atras(10), stage_changed_at: atras(1), fulfillment_stage: "emitir_etiqueta", status: "invoiced",
    customer_name: "Posto Ponta Negra", cnpj: "69012345000166", customer_phone: "(84) 99100-2030",
    delivery_address: "Av. Engenheiro Roberto Freire, 8790", delivery_city: "Natal", delivery_state: "RN", delivery_zip: "59090-000",
    items: [item("CarboZé 100ml", "CZ100", "p1", 100, 15.6)], invoice_number: "000512", bling_nf_id: 512,
    shipment_volumes: 2, shipment_weight_kg: 12, shipment_carrier: "Transportadora Potiguar", agreed_delivery_date: dia(1) }),
  ped({ id: "pv-beira", order_number: "V2026100041", created_at: atras(12), stage_changed_at: atras(2), fulfillment_stage: "emitir_etiqueta", status: "invoiced",
    customer_name: "Posto Beira Rio", cnpj: "64567890000111", customer_phone: "(82) 99321-5566",
    delivery_address: "Av. Fernandes Lima, 88", delivery_city: "Maceió", delivery_state: "AL", delivery_zip: "57050-000",
    items: [item("CarboZé 1 Litro", "CZ1L", "p2", 36, 89.9), bonif("CarboZé 100ml - bonificação", "CZ100-BON", "p1bon", 12, 15.6)],
    invoice_number: "000421", bling_nf_id: 421, nf_access_key: "27261036060692000100550010000004211000004210",
    invoice_bonificacao_number: "000422", bling_nf_bonificacao_id: 422,
    shipment_volumes: 3, shipment_weight_kg: 38.4, shipment_carrier: "Jadlog", shipment_quote_value: 214.9,
    customer_email: "financeiro@postobeirario.com.br", customer_ie: "24.098.765-1", payment_terms: "Boleto 28 dias",
    notes: "Descarregar pela lateral do posto, antes das 10h.",
    agreed_delivery_date: dia(3), ppf_date: dia(-3), ppe_date: dia(1), vendedor_id: U.colab.id, vendedor_name: U.colab.full_name }),
  ped({ id: "pv-agreste", order_number: "V2026100033", created_at: atras(14), stage_changed_at: atras(2), fulfillment_stage: "em_transporte",
    customer_name: "Distribuidora Agreste", cnpj: "70123456000177", customer_phone: "(81) 98765-4321",
    delivery_address: "Av. Agamenon Magalhães, 2400", delivery_city: "Caruaru", delivery_state: "PE", delivery_zip: "55000-000",
    items: [item("CarboPRO 100ml", "CP100", null, 200, 13), bonif("CarboZé 100ml - bonificação", "CZ100-BON", "p1bon", 20, 15.6)],
    invoice_bonificacao_number: "000940", bling_nf_bonificacao_id: 940,
    shipment_volumes: 5, shipment_weight_kg: 31, shipment_carrier: "Braspress", agreed_delivery_date: dia(1) }),
  ped({ id: "pv-alta", order_number: "V2026090097", created_at: atras(50), updated_at: atras(38), fulfillment_stage: "entregue", status: "delivered",
    customer_name: "Posto Cidade Alta", cnpj: "71234567000188", items: [item("CarboZé 100ml", "CZ100", "p1", 60, 15.6)],
    invoice_number: "000377", bling_nf_id: 377, delivery_city: "Natal", delivery_state: "RN" }),
];

const nossos = () => [...recorrencias, ...avulsos];
const padraoPedidos = () => [...pedidosEdit, ...vendas(PAPEL)];

// ── Estoque e produção (o portão do Rastreio e os Alertas) ──────────────────
const WH = {
  rn: { id: "wh-rn", code: "HUB-RN", name: "Hub Natal", is_active: true, kind: "hub" },
  sp: { id: "wh-sp", code: "HUB-SP", name: "CD SP LogHouse", is_active: true, kind: "hub" },
};
const saldo = (pid: string, wh: typeof WH.rn, q: number) => ({ product_id: pid, warehouse_id: wh.id, quantity: q, warehouse: { code: wh.code, name: wh.name, is_active: true } });
const estoque = [
  saldo("p1", WH.rn, 140), saldo("p1", WH.sp, 320),
  saldo("p2", WH.rn, 18), saldo("p2", WH.sp, -6),
  saldo("p3", WH.rn, 0), saldo("p3", WH.sp, 900),
];
const minimo = (pid: string, wh: typeof WH.rn, q: number) => ({ product_id: pid, warehouse_id: wh.id, min_qty: q, warehouse: { code: wh.code } });
const minimos = [minimo("p1", WH.rn, 300), minimo("p2", WH.rn, 40), minimo("p3", WH.rn, 500), minimo("p2", WH.sp, 30)];

const op = (id: string, num: string, pid: string, code: string, q: number, status: string, need: string | null, since: string, src: string | null = null) =>
  ({ id, op_number: num, sku_id: null, product_id: pid, planned_quantity: q, good_quantity: 0, rejected_quantity: 0, priority: 3,
     op_status: status, demand_source: src ? "venda" : "estoque", need_date: need, product_code: code, source_order_id: src,
     production_route: null, created_at: since, updated_at: since, stage_since: since, customer_name: null });
const ordensProducao = [
  op("op1", "OP-2026-0188", "p2", "CZ1L", 60, "concluida", dia(2), atras(1), "pv-aguas"),
  op("op2", "OP-2026-0189", "p3", "CARB-SACH-10ML", 400, "envase", dia(2), atras(1), "pv-aguas"),
  op("op3", "OP-2026-0181", "p2", "CZ1L", 48, "concluida", dia(-1), atras(3), "pv-tres"),
  op("op4", "OP-2026-0175", "p1", "CZ100", 500, "rotulagem", dia(-4), atras(5)),
  op("op5", "OP-2026-0179", "p3", "CARB-SACH-10ML", 1200, "aguardando_qualidade", dia(6), atras(6)),
];

// ── Notas (DANFE/XML do card e da etiqueta) ─────────────────────────────────
const nfe = (id: number, numero: string, chave: string | null = null) =>
  ({ bling_id: id, numero, chave_acesso: chave, pdf_url: `https://exemplo.com.br/danfe/${numero}.pdf`, xml_url: `https://exemplo.com.br/xml/${numero}.xml` });
const notas = [nfe(512, "000512"), nfe(421, "000421", "27261036060692000100550010000004211000004210"), nfe(422, "000422"), nfe(940, "000940"), nfe(517, "000517")];

// ── Remessas (Logística → Gestão) ───────────────────────────────────────────
const remessa = (id: string, order_number: string, customer: string, destination: string, items: number, status: string, carrier: string | null = null, tracking: string | null = null, order_id: string | null = null) =>
  ({ id, order_number, customer, destination, items, status, carrier_name: carrier, tracking_code: tracking, order_id, created_at: atras(2) });
const remessas = [
  remessa("sh1", "V2026100078", "Auto Posto Mirante", "Campina Grande/PB", 160, "separacao_pendente"),
  remessa("sh2", "V2026100070", "Comercial Serra Verde", "Mossoró/RN", 110, "separando", null, null, "pv-serra"),
  remessa("sh3", "V2026100063", "Posto Vale do Açu", "Rua Sen. João Câmara, 45 · Assú/RN · CEP 59650-000", 600, "separado", null, null, "pv-acu"),
  remessa("sh4", "V2026100033", "Distribuidora Agreste", "Caruaru/PE", 220, "em_transporte", "Braspress", "BP7781203", "pv-agreste"),
  remessa("sh5", "V2026100041", "Posto Beira Rio", "Maceió/AL", 48, "separado", "Jadlog", null, "pv-beira"),
  remessa("sh6", "V2026090097", "Posto Cidade Alta", "Natal/RN", 60, "entregue", "Transportadora Potiguar", "TP-55120"),
  remessa("sh7", "AMOSTRA-14", "Feira AgroNordeste (amostras)", "Recife/PE", 30, "entregue", "Correios", "OV123456789BR"),
];

// ── Viagens ─────────────────────────────────────────────────────────────────
const viagem = (id: string, o: Ped) => ({
  id, solicitante: EU.full_name, destino: "—", objetivo: "", centro_custo: null, data_ida: null, data_volta: null,
  valor_estimado: 0, adiantamento: 0, status: "pendente", motivo_reprovacao: null, pc_status: null, pc_total: 0, pc_notas: null,
  created_by: EU.id, created_at: atras(2), ...o,
});
const viagens = () => [
  viagem("vg1", { destino: "Mossoró/RN", objetivo: "Treinamento da equipe do Comercial Serra Verde", centro_custo: "Treinamento PDV",
    data_ida: dia(6), data_volta: dia(7), valor_estimado: 780, status: "pendente", created_at: atras(1) }),
  viagem("vg2", { solicitante: U.vend2.full_name, created_by: U.vend2.id, destino: "Recife/PE", objetivo: "Visita a três redes de postos na região metropolitana",
    centro_custo: "Comercial — Prospecção", data_ida: dia(3), data_volta: dia(5), valor_estimado: 1650, status: "pendente" }),
  viagem("vg3", { destino: "Campina Grande/PB", objetivo: "Entrega técnica e conferência de estoque no cliente", centro_custo: "Operações — Logística",
    data_ida: dia(-4), data_volta: dia(-3), valor_estimado: 540, status: "aprovado", pc_status: "aberta", pc_total: 312.4,
    pc_notas: "Combustível e almoço. Falta anexar o recibo do pedágio.", created_at: atras(9) }),
  viagem("vg4", { solicitante: U.closer.full_name, created_by: U.closer.id, destino: "Fortaleza/CE", objetivo: "Manutenção da envasadora do parceiro",
    centro_custo: "Operações — Manutenção", data_ida: dia(-15), data_volta: dia(-12), valor_estimado: 2300, status: "concluido",
    pc_status: "aprovada", pc_total: 2187.9, created_at: atras(20) }),
  viagem("vg5", { solicitante: U.gestor.full_name, created_by: U.gestor.id, destino: "São Paulo/SP", objetivo: "Reunião com o CD LogHouse",
    centro_custo: "Diretoria", data_ida: dia(-30), data_volta: dia(-28), valor_estimado: 3400, status: "reprovado",
    motivo_reprovacao: "Resolver por videochamada neste mês.", created_at: atras(35) }),
];

export const FX: Record<string, unknown> = {
  carboze_orders: porRota("carboze_orders", nossos, padraoPedidos),
  warehouses: porRota("warehouses", () => Object.values(WH)),
  warehouse_stock: porRota("warehouse_stock", () => estoque),
  ops_stock_min: porRota("ops_stock_min", () => minimos),
  mrp_product_hubs: porRota("mrp_product_hubs", () => []),
  mrp_bom: porRota("mrp_bom", () => []),
  production_orders: porRota("production_orders", () => ordensProducao),
  production_order_moves: porRota("production_order_moves", () => []),
  sku: porRota("sku", () => []),
  bling_nfe: porRota("bling_nfe", () => notas),
  bling2_nfe: porRota("bling2_nfe", () => []),
  ops_shipments: porRota("ops_shipments", () => remessas),
  ops_viagens: porRota("ops_viagens", viagens),
};

// Produto do item → produto FÍSICO (a mesma regra de `carbo_itens_para_estoque`).
const fisico = (pid: string) => {
  const p = produtos.find((x) => x.id === pid);
  return (p?.preco_de as string | null) ?? (p?.bonificacao_de as string | null) ?? pid;
};
export const RPC_FX: Record<string, unknown> = {
  carbo_itens_para_estoque: (a: { p_items?: { product_id?: string | null; quantity?: number; kind?: string | null }[] }) => {
    const soma = new Map<string, number>();
    for (const it of a.p_items ?? []) {
      if (!it?.product_id || it.kind === "service") continue;
      const f = fisico(it.product_id);
      soma.set(f, (soma.get(f) ?? 0) + (Number(it.quantity) || 0));
    }
    return [...soma].map(([product_id, qty]) => ({ product_id, qty }));
  },
  jamef_cotar: () => ({
    ok: true, transportadora: "Jamef", servico: "Rodoviário", tabela: "1500 Especial e Exclusiva", vigencia: "2026-03-01",
    origem: "Natal/RN", destino: { municipio: "Caruaru", uf: "PE", ibge: null, sigla: "CRU", tarifario: "Interior", tipo: null, atendimento: "S" },
    peso: { real: 31, cubado: 27.6, taxavel: 31, faixa: "de_30_50kg" },
    componentes: { frete_peso: 148.2, ad_valorem: 9.36, gris: 4.79, pedagio: 16.14, tas: 4.5, taxa_ctrc: 12, icms: 25.4 },
    subtotal: 194.99, icms_aliquota: 0.12, total: 220.39, prazo_dias: null, avisos: [],
  }),
};
void EU;
