// Fixtures da área "rastreio" (ver areas.ts): Rastreio de venda (/rastreio),
// Meu Estoque (/meu-estoque) e Requisição de Compra (/requisicoes).
// Dados FICTÍCIOS — nenhum cliente, pessoa ou pedido real.
import { PAPEL, U } from "./pessoas";
import { vendas } from "./fx_vendas";
import { pedidosEdit } from "./fx_vender";

const agora = Date.now();
const diasAtras = (d: number, h = 14) => { const x = new Date(agora - d * 86400000); x.setUTCHours(h, 10, 0, 0); return x.toISOString(); };
const diaFuturo = (d: number) => new Date(agora + d * 86400000).toISOString().slice(0, 10);
const item = (name: string, code: string, q: number, p: number) => ({ name, product_code: code, quantity: q, unit_price: p, total: q * p });

const base = {
  customer_ie: null, customer_email: null, payment_terms: "Boleto 28 dias", freight_type: "CIF",
  shipping_cost: 0, discount: 0, notes: null, agreed_delivery_date: null, ppf_date: null, ppe_date: null,
  external_ref: null, linha: null, bling_nf_id: null, invoice_number: null, status: "pending",
  shipment_volumes: null, shipment_weight_kg: null, shipment_carrier: null, shipment_quote_value: null,
  updated_at: null, stage_changed_at: null, delivery_zip: null,
  vendedor_id: U.colab.id, vendedor_name: U.colab.full_name,
};

// Pedidos extras do pós-venda (além dos de /vendas), um em cada etapa do começo
// e do fim da jornada, para o quadro sair com as colunas ocupadas.
const posVenda = [
  { ...base, id: "pv1", order_number: "V2026100041", created_at: diasAtras(1), fulfillment_stage: "nova_venda",
    customer_name: "Posto Lagoa Azul", cnpj: "61234567000188", customer_phone: "(84) 99712-4410",
    delivery_address: "Av. Roberto Freire, 2100", delivery_city: "Natal", delivery_state: "RN", delivery_zip: "59090-000",
    items: [item("CarboZé 100ml", "CZ100", 80, 15.6)], subtotal: 1248, total: 1248,
    agreed_delivery_date: diaFuturo(6), ppf_date: diaFuturo(2), ppe_date: diaFuturo(4) },
  { ...base, id: "pv2", order_number: "V2026100038", created_at: diasAtras(3), fulfillment_stage: "separacao_pendente",
    customer_name: "Auto Posto Mirante", cnpj: "62345678000199", customer_phone: "(83) 98810-2234",
    delivery_address: "Rua Pedro II, 450", delivery_city: "Campina Grande", delivery_state: "PB",
    items: [item("CarboZé Sachê 10ml", "CARB-SACH-10ML", 300, 4.9)], subtotal: 1470, total: 1470 },
  { ...base, id: "pv3", order_number: "V2026100033", created_at: diasAtras(5), fulfillment_stage: "gerar_nf",
    customer_name: "Rede Sertão Combustíveis", cnpj: "63456789000100", customer_phone: "(87) 99645-7788",
    customer_email: "compras@redesertao.com.br", customer_ie: "18.123.456-7",
    delivery_address: "BR-232, km 210", delivery_city: "Arcoverde", delivery_state: "PE", delivery_zip: "56500-000",
    items: [item("CarboZé 100ml - PDV", "CZ100-PDV", 150, 13), item("CarboZé 100ml - bonificação", "CZ100-BON", 10, 15.6)],
    subtotal: 2106, discount: 156, total: 1950, payment_terms: "Boleto 28/56 dias",
    agreed_delivery_date: diaFuturo(3), ppf_date: diasAtras(1).slice(0, 10), ppe_date: diaFuturo(1),
    notes: "Receber no posto da matriz, falar com o Sr. Joaquim." },
  { ...base, id: "pv4", order_number: "V2026100029", created_at: diasAtras(7), fulfillment_stage: "emitir_etiqueta",
    customer_name: "Posto Beira Rio", cnpj: "64567890000111", customer_phone: "(82) 99321-5566",
    delivery_address: "Av. Fernandes Lima, 88", delivery_city: "Maceió", delivery_state: "AL",
    items: [item("CarboZé 1 Litro", "CZ1L", 36, 89.9)], subtotal: 3236.4, total: 3236.4,
    invoice_number: "000421", bling_nf_id: 11, status: "invoiced",
    shipment_volumes: 3, shipment_weight_kg: 38.4, shipment_carrier: "Jadlog" },
  { ...base, id: "pv5", order_number: "V2026110002", created_at: diasAtras(20), fulfillment_stage: "agendado",
    customer_name: "Rede Litoral Combustíveis", cnpj: "23456789000101", customer_phone: "(84) 99654-1020",
    delivery_address: "Rua das Dunas, 55", delivery_city: "Natal", delivery_state: "RN",
    items: [item("CarboZé 100ml - PDV", "CZ100-PDV", 200, 13)], subtotal: 2600, total: 2600,
    notes: "Parcela 2 de 6 da recorrência mensal." },
  // Do time — só o gestor vê.
  { ...base, id: "pv6", order_number: "V2026100040", created_at: diasAtras(2), fulfillment_stage: "separacao_pendente",
    customer_name: "Posto Três Irmãos", cnpj: "65678901000122", customer_phone: "(85) 99876-1122",
    delivery_address: "Av. Bezerra de Menezes, 900", delivery_city: "Fortaleza", delivery_state: "CE",
    items: [item("CarboZé 100ml", "CZ100", 60, 15.6)], subtotal: 936, total: 936,
    vendedor_id: U.vend2.id, vendedor_name: U.vend2.full_name },
  { ...base, id: "pv7", order_number: "V2026100036", created_at: diasAtras(4), fulfillment_stage: "nova_venda",
    customer_name: "Posto Encontro das Águas", cnpj: "66789012000133", customer_phone: "(86) 99555-3311",
    delivery_address: "Av. Frei Serafim, 1500", delivery_city: "Teresina", delivery_state: "PI",
    items: [item("CarboZé Sachê 10ml", "CARB-SACH-10ML", 200, 4.9)], subtotal: 980, total: 980,
    vendedor_id: U.closer.id, vendedor_name: U.closer.full_name },
];

const pedidos = () => {
  const meus = PAPEL === "gestor" ? posVenda : posVenda.filter((o) => o.vendedor_id === U.colab.id);
  return [...pedidosEdit, ...vendas(PAPEL), ...meus];
};

// ── Meu Estoque ──────────────────────────────────────────────────────────────
const prod = (vendedor_id: string, product_id: string, product_code: string, product_name: string, quantidade: number) =>
  ({ vendedor_id, product_id, product_code, product_name, stock_unit: "un", quantidade });
const caixa = (v: string, q: [number, number, number, number, number]) => [
  prod(v, "p-cz100", "CZ100", "CarboZé 100ml", q[0]),
  prod(v, "p-cz1l", "CZ1L", "CarboZé 1 Litro", q[1]),
  prod(v, "p-sache", "KIT-CARB-SACH-10ML", "CarboZé Kit 10 Sachês 10ml", q[2]),
  prod(v, "p-pro100", "CP100", "CarboPRO 100ml", q[3]),
  prod(v, "p-pro1l", "CP1L", "CarboPRO 1 Litro", q[4]),
];

const warehouses = [
  { id: "wh-colab", code: "VEND-COM010", name: "Caixa Rafael Costa", kind: "vendedor", owner_id: U.colab.id },
  { id: "wh-vend2", code: "VEND-COM011", name: "Caixa Ana Souza", kind: "vendedor", owner_id: U.vend2.id },
];

const stock_transfers = [
  { id: "t1", product_code: "CZ100", quantity: 48, created_at: diasAtras(2, 11), notes: "Reposição semanal", status: "approved", to_hub: "wh-colab", from_hub: "hub-rn" },
  { id: "t2", product_code: "CP100", quantity: 12, created_at: diasAtras(1, 16), notes: null, status: "approved", to_hub: "wh-colab", from_hub: "hub-rn" },
  { id: "t3", product_code: "CZ1L", quantity: 6, created_at: diasAtras(1, 9), notes: "Devolução — embalagem amassada", status: "approved", to_hub: "hub-rn", from_hub: "wh-colab" },
  { id: "t4", product_code: "CZ100", quantity: 24, created_at: diasAtras(3, 10), notes: null, status: "approved", to_hub: "wh-vend2", from_hub: "hub-rn" },
];

// ── Requisição de Compra ─────────────────────────────────────────────────────
const rc = (id: string, rc_number: string, estimated_value: number, status: string, d: number) =>
  ({ id, rc_number, cost_center: "Pessoal", purchase_type: "uso_direto", suggested_supplier: null, estimated_value,
     justification: null, operational_impact: null, items: [], status, created_at: diasAtras(d), requested_by: U.colab.id });

export const FX: Record<string, unknown> = {
  carboze_orders: pedidos,
  vendedor_estoque: [...caixa(U.colab.id, [64, 8, 15, 0, 3]), ...caixa(U.vend2.id, [30, 0, 10, 6, 0])],
  warehouses,
  stock_transfers,
  purchase_requests: () => [
    rc("r1", "TEMP", 189.9, "rascunho", 0),
    rc("r2", "RC-2026-0142", 349, "aguardando_aprovacao", 2),
    rc("r3", "RC-2026-0118", 1290, "aprovada", 12),
    rc("r4", "RC-2026-0097", 89.9, "convertida", 25),
    rc("r5", "RC-2026-0071", 2450, "rejeitada", 40),
  ].map((r) => ({ ...r, requested_by: PAPEL === "gestor" ? U.gestor.id : U.colab.id })),
  suppliers: [
    { id: "s1", name: "Kalunga", is_active: true },
    { id: "s2", name: "Magazine Exemplo", is_active: true },
  ],
  purchase_quotes: [],
};
export const RPC_FX: Record<string, unknown> = {};
