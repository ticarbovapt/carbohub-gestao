// Fixtures da área "compras" (Compras e Suprimentos) — ver areas.ts.
// Dados FICTÍCIOS: nenhum fornecedor, pessoa ou valor é real.
// ⚠️ Tabelas que outras áreas também leem (mrp_products, suppliers,
// payment_methods, warehouses…) respondem por ROTA: fora de /compras e
// /suprimentos devolvem o que a outra área (ou a fixture base) devolveria.
import { U } from "./pessoas";
import { produtos as produtosVender } from "./fx_vender";
import * as contas from "./fx_contas";

const naNossa = () => {
  const p = typeof location !== "undefined" ? location.pathname : "";
  return p.startsWith("/compras") || p.startsWith("/suprimentos");
};
const resolve = (v: unknown) => (typeof v === "function" ? (v as () => unknown)() : v);
const porRota = (chave: string, meu: () => unknown, padrao: () => unknown = () => []) => () => {
  if (naNossa()) return meu();
  const fx = (contas as { FX?: Record<string, unknown> }).FX ?? {};
  if (chave in fx) return resolve(fx[chave]);
  return padrao();
};

// ── Datas ───────────────────────────────────────────────────────────────────
const agora = Date.now();
const atras = (d: number, h = 10) => { const x = new Date(agora - d * 86400000); x.setHours(h, 20, 0, 0); return x.toISOString(); };
const dia = (d: number) => { const x = new Date(agora + d * 86400000); return x.toISOString().slice(0, 10); };

// ── Pessoas de outros setores (o solicitante da RC) ──────────────────────────
const pessoas = [
  { id: U.colab.id, full_name: U.colab.full_name, username: U.colab.username, department: "ops" },
  { id: U.vend2.id, full_name: U.vend2.full_name, username: U.vend2.username, department: "ops" },
  { id: U.gestor.id, full_name: U.gestor.full_name, username: U.gestor.username, department: "financeiro" },
  { id: U.closer.id, full_name: U.closer.full_name, username: U.closer.username, department: "ops" },
];
const departamentos = [
  { key: "financeiro", label: "Financeiro", sigla: "FIN" },
  { key: "ops", label: "Operações", sigla: "OPS" },
  { key: "logistica", label: "Logística", sigla: "LOG" },
];

// ── Fornecedores e formas de pagamento ──────────────────────────────────────
const fornecedores = [
  { id: "sup1", name: "Plásticos Potiguar Ltda", is_active: true, document: "11.222.333/0001-44" },
  { id: "sup2", name: "Embalagens Sol Nascente", is_active: true, document: "22.333.444/0001-55" },
  { id: "sup3", name: "Equipa Nordeste Máquinas", is_active: true, document: "33.444.555/0001-66" },
  { id: "sup4", name: "Gráfica Norte Rótulos", is_active: true, document: "44.555.666/0001-77" },
  { id: "sup5", name: "Papelaria Central", is_active: true, document: "55.666.777/0001-88" },
];
const formas = [
  { id: "pm1", apelido: "Cartão Compras", tipo: "credito", bandeira: "Visa", ultimos4: "4821", titular: "Grupo Carbo", departamento: "financeiro", is_active: true, notes: null, created_at: atras(200), updated_at: atras(200) },
  { id: "pm2", apelido: "Cartão Operações", tipo: "credito", bandeira: "Master", ultimos4: "0937", titular: "Grupo Carbo", departamento: "ops", is_active: true, notes: null, created_at: atras(200), updated_at: atras(200) },
];

// ── Requisições ─────────────────────────────────────────────────────────────
const rc = (o: Record<string, unknown>) => ({
  service_order_id: null, created_by: o.requested_by, escopo: "individual", motivo: null, priority: "normal",
  needed_by: null, reference_url: null, suggested_supplier: null, operational_impact: null, submitted_at: null,
  approved_by: null, approved_at: null, rejection_reason: null, updated_at: o.created_at, ...o,
});
const requisicoes = [
  rc({ id: "rc1", rc_number: "RC-2026-00041", requested_by: U.colab.id, cost_center: "Produção", purchase_type: "estoque",
    escopo: "setor", motivo: "reposicao_safety", priority: "alta", needed_by: dia(12), suggested_supplier: "Plásticos Potiguar Ltda",
    estimated_value: 1000, status: "aguardando_aprovacao", created_at: atras(1),
    justification: "Estoque de frascos de 100ml abaixo do nível de segurança no Hub Natal. Cobre a produção das próximas três semanas.",
    operational_impact: "Sem os frascos, o envase do CarboZé 100ml para em cerca de 10 dias.",
    items: [
      { descricao: "Frasco PET 100ml transparente", quantidade: 2000, unidade: "un", valor_unitario: 0.38 },
      { descricao: "Tampa rosqueável 28mm", quantidade: 2000, unidade: "un", valor_unitario: 0.12 },
    ] }),
  rc({ id: "rc2", rc_number: "RC-2026-00040", requested_by: U.colab.id, cost_center: "Administrativo", purchase_type: "uso_direto",
    estimated_value: 320, status: "rascunho", created_at: atras(2),
    justification: "Reposição de papel para impressão das notas e etiquetas do escritório.",
    items: [{ descricao: "Papel A4 75g (caixa com 10 resmas)", quantidade: 10, unidade: "cx", valor_unitario: 32 }] }),
  rc({ id: "rc3", rc_number: "RC-2026-00039", requested_by: U.vend2.id, cost_center: "Logística", purchase_type: "investimento",
    motivo: "equipamento", estimated_value: 3260, status: "aprovada", created_at: atras(4), approved_by: U.gestor.id, approved_at: atras(3),
    justification: "Paleteira para a doca do Hub Natal e filme para fechar os paletes de expedição.",
    items: [
      { descricao: "Paleteira hidráulica 2.500 kg", quantidade: 1, unidade: "un", valor_unitario: 2890 },
      { descricao: "Filme stretch 500mm", quantidade: 20, unidade: "un", valor_unitario: 18.5 },
    ] }),
  rc({ id: "rc4", rc_number: "RC-2026-00038", requested_by: U.gestor.id, cost_center: "Financeiro", purchase_type: "uso_direto",
    estimated_value: 890, status: "aguardando_aprovacao", created_at: atras(2),
    justification: "Certificado digital A1 da filial (renovação anual).",
    items: [{ descricao: "Certificado digital e-CNPJ A1", quantidade: 1, unidade: "un", valor_unitario: 890 }] }),
  rc({ id: "rc5", rc_number: "RC-2026-00036", requested_by: U.colab.id, cost_center: "Manutenção", purchase_type: "uso_direto",
    estimated_value: 1450, status: "rejeitada", created_at: atras(6),
    rejection_reason: "Já existe contrato de manutenção que cobre a troca. Abra chamado com o fornecedor do contrato.",
    justification: "Troca do motor da esteira de envase.",
    items: [{ descricao: "Motor 1cv para esteira", quantidade: 1, unidade: "un", valor_unitario: 1450 }] }),
  rc({ id: "rc6", rc_number: "RC-2026-00034", requested_by: U.closer.id, cost_center: "Produção", purchase_type: "estoque",
    estimated_value: 450, status: "convertida", created_at: atras(15),
    justification: "Rótulos do CarboZé 100ml para o próximo lote.",
    items: [{ descricao: "Rótulo CarboZé 100ml (milheiro)", quantidade: 5, unidade: "un", valor_unitario: 90 }] }),
];

const cot = (id: string, request_id: string, item_index: number, supplier_name: string, unit_price: number, quantidade: number, selected: boolean, notes: string | null = null) =>
  ({ id, request_id, item_index, supplier_name, supplier_id: null, unit_price, quantidade, selected, notes, link: null, created_at: atras(1) });
const cotacoes = [
  cot("q1", "rc1", 0, "Plásticos Potiguar Ltda", 0.36, 2000, true, "Entrega em 7 dias"),
  cot("q2", "rc1", 0, "Embalagens Sol Nascente", 0.41, 2000, false, "Entrega em 15 dias"),
  cot("q3", "rc1", 1, "Plásticos Potiguar Ltda", 0.11, 2000, false),
  cot("q4", "rc3", 0, "Equipa Nordeste Máquinas", 2750, 1, true, "Garantia de 12 meses"),
  cot("q5", "rc3", 0, "Papelaria Central", 3020, 1, false),
  cot("q6", "rc3", 1, "Embalagens Sol Nascente", 17.9, 20, true),
];

// ── Ordens de compra ────────────────────────────────────────────────────────
const oc = (o: Record<string, unknown>) => ({
  purchase_request_id: "rc6", service_order_id: null, supplier_document: null, supplier_contact: null,
  payment_condition: null, expected_delivery: null, generated_by: U.gestor.id, payment_method_id: null, payment_type: null,
  purchased_at: null, is_paid: false, paid_at: null, payment_due_date: null, updated_at: o.created_at, ...o,
});
const ordens = [
  oc({ id: "oc1", oc_number: "OC-2026-00031", supplier_name: "Equipa Nordeste Máquinas", supplier_document: "33.444.555/0001-66",
    items: [{ descricao: "Paleteira hidráulica 2.500 kg", quantidade: 1, unidade: "un", valor_unitario: 2750 }],
    total_value: 2750, payment_condition: "30 dias", expected_delivery: dia(7), status: "gerada", created_at: atras(1) }),
  oc({ id: "oc2", oc_number: "OC-2026-00030", supplier_name: "Plásticos Potiguar Ltda", supplier_document: "11.222.333/0001-44",
    items: [
      { descricao: "Frasco PET 100ml transparente", quantidade: 3000, unidade: "un", valor_unitario: 0.36 },
      { descricao: "Tampa rosqueável 28mm", quantidade: 3000, unidade: "un", valor_unitario: 0.11 },
    ],
    total_value: 1410, payment_condition: "28 dias", expected_delivery: dia(2), status: "comprada", created_at: atras(5),
    purchased_at: atras(4), is_paid: false, payment_due_date: dia(24) }),
  oc({ id: "oc3", oc_number: "OC-2026-00029", supplier_name: "Embalagens Sol Nascente", supplier_document: "22.333.444/0001-55",
    items: [{ descricao: "Caixa de papelão 12 frascos", quantidade: 500, unidade: "un", valor_unitario: 2.4 }],
    total_value: 1200, payment_condition: "30/60", expected_delivery: dia(-2), status: "parcialmente_recebida", created_at: atras(9),
    purchased_at: atras(8), is_paid: false, payment_due_date: dia(22) }),
  oc({ id: "oc4", oc_number: "OC-2026-00028", supplier_name: "Gráfica Norte Rótulos", supplier_document: "44.555.666/0001-77",
    items: [{ descricao: "Rótulo CarboZé 100ml (milheiro)", quantidade: 5, unidade: "un", valor_unitario: 90 }],
    total_value: 450, payment_condition: "30/60/90", expected_delivery: dia(-3), status: "recebida", created_at: atras(12),
    purchased_at: atras(11), is_paid: false, payment_due_date: dia(18) }),
  oc({ id: "oc5", oc_number: "OC-2026-00027", supplier_name: "Papelaria Central", items: [{ descricao: "Etiqueta térmica 100×150 (rolo)", quantidade: 30, unidade: "un", valor_unitario: 21 }],
    total_value: 630, payment_condition: "à vista", expected_delivery: dia(-10), status: "recebida", created_at: atras(16),
    purchased_at: atras(15), is_paid: true, paid_at: atras(15), payment_method_id: "pm1" }),
  oc({ id: "oc6", oc_number: "OC-2026-00025", supplier_name: "A definir", items: [{ descricao: "Luva nitrílica (caixa)", quantidade: 10, unidade: "cx", valor_unitario: 38 }],
    total_value: 380, status: "cancelada", created_at: atras(20) }),
];

const recebimentos = [
  { id: "rec1", purchase_order_id: "oc3", received_by: U.vend2.id, received_at: atras(1, 15), status: "conferido_divergencia", has_divergence: true,
    divergence_notes: "Chegaram 300 de 500 caixas — o restante vem na próxima semana.", stock_updated: true,
    items_received: [{ descricao: "Caixa de papelão 12 frascos", qtd_esperada: 500, qtd_recebida: 300, status_qualidade: "ok" }], created_at: atras(1, 15), updated_at: atras(1, 15) },
  { id: "rec2", purchase_order_id: "oc4", received_by: U.vend2.id, received_at: atras(3, 11), status: "conferido_ok", has_divergence: false, divergence_notes: null, stock_updated: true,
    items_received: [{ descricao: "Rótulo CarboZé 100ml (milheiro)", qtd_esperada: 5, qtd_recebida: 5, status_qualidade: "ok" }], created_at: atras(3, 11), updated_at: atras(3, 11) },
  { id: "rec3", purchase_order_id: "oc5", received_by: U.closer.id, received_at: atras(10, 9), status: "conferido_ok", has_divergence: false, divergence_notes: null, stock_updated: true,
    items_received: [{ descricao: "Etiqueta térmica 100×150 (rolo)", qtd_esperada: 30, qtd_recebida: 30, status_qualidade: "ok" }], created_at: atras(10, 9), updated_at: atras(10, 9) },
];
const notas = [
  { id: "nf1", purchase_order_id: "oc5", receiving_id: "rec3", invoice_number: "004512", invoice_date: dia(-10), invoice_value: 630,
    file_url: "/docs-mock/nf-004512.pdf", oc_match: true, receiving_match: true, value_match: true, verified_by: U.gestor.id, verified_at: atras(9),
    notes: null, created_at: atras(9), updated_at: atras(9) },
];

// ── Suprimentos ─────────────────────────────────────────────────────────────
const hubs = [
  { id: "wh-rn", code: "HUB-RN", name: "Hub Natal", city: "Natal", state: "RN", is_active: true, kind: "hub" },
  { id: "wh-sp", code: "HUB-SP", name: "CD SP LogHouse", city: "São Paulo", state: "SP", is_active: true, kind: "hub" },
];
const insumo = (id: string, product_code: string, name: string, category: string, stock_unit: string, safety: number) =>
  ({ id, product_code, name, category, stock_unit, current_stock_qty: 0, min_order_qty: 0, safety_stock_qty: safety, is_active: true, stock_updated_at: atras(1) });
const insumos = [
  insumo("7c1e4a90-2b3f-4d1a-9e55-1f0a6c2d8b31", "INS-FR100", "Frasco PET 100ml", "Embalagem", "un", 4000),
  insumo("a4d9e2c7-61b0-4f8e-8c3a-5e7b9d0f1a22", "INS-TP28", "Tampa rosqueável 28mm", "Embalagem", "un", 4000),
  insumo("3b8f0d14-9a6e-4c27-b1d5-8e2c4a7f6d03", "INS-CX12", "Caixa de papelão 12 frascos", "Embalagem", "un", 300),
  insumo("e2a7c5b9-0d4f-4e18-a93c-6b1d8f2e7c44", "INS-RT100", "Rótulo CarboZé 100ml", "Rotulagem", "un", 3000),
  insumo("5f0b3e81-c7d2-4a69-8e14-2d9a6c0b3f55", "INS-RG01", "Reagente concentrado", "Insumo químico", "L", 120),
];
const saldo = (pid: string, wid: string, quantity: number) => ({ id: `ws-${pid}-${wid}`, product_id: pid, warehouse_id: wid, quantity });
const estoque = [
  saldo("7c1e4a90-2b3f-4d1a-9e55-1f0a6c2d8b31", "wh-rn", 1850), saldo("7c1e4a90-2b3f-4d1a-9e55-1f0a6c2d8b31", "wh-sp", 400),
  saldo("a4d9e2c7-61b0-4f8e-8c3a-5e7b9d0f1a22", "wh-rn", 5200), saldo("a4d9e2c7-61b0-4f8e-8c3a-5e7b9d0f1a22", "wh-sp", 600),
  saldo("3b8f0d14-9a6e-4c27-b1d5-8e2c4a7f6d03", "wh-rn", 420), saldo("3b8f0d14-9a6e-4c27-b1d5-8e2c4a7f6d03", "wh-sp", 80),
  saldo("e2a7c5b9-0d4f-4e18-a93c-6b1d8f2e7c44", "wh-rn", 9100), saldo("e2a7c5b9-0d4f-4e18-a93c-6b1d8f2e7c44", "wh-sp", 0),
  saldo("5f0b3e81-c7d2-4a69-8e14-2d9a6c0b3f55", "wh-rn", 86), saldo("5f0b3e81-c7d2-4a69-8e14-2d9a6c0b3f55", "wh-sp", 0),
];
// Saídas dos últimos 30 dias (giro e tendência dos cartões).
const movimentos: Record<string, unknown>[] = [];
const giro: Record<string, number> = { "7c1e4a90-2b3f-4d1a-9e55-1f0a6c2d8b31": 180, "a4d9e2c7-61b0-4f8e-8c3a-5e7b9d0f1a22": 170, "3b8f0d14-9a6e-4c27-b1d5-8e2c4a7f6d03": 14, "e2a7c5b9-0d4f-4e18-a93c-6b1d8f2e7c44": 160, "5f0b3e81-c7d2-4a69-8e14-2d9a6c0b3f55": 4 };
let k = 0;
for (const [pid, porDia] of Object.entries(giro)) {
  for (let d = 1; d <= 30; d += 2) {
    const q = Math.round(porDia * 2 * (0.75 + ((d * 7 + pid.length) % 6) / 10));
    movimentos.push({ id: `mv${k++}`, product_id: pid, tipo: "saida", quantidade: q, origem: "OP", origem_id: null, custo_unitario: 0,
      custo_medio_anterior: 0, custo_medio_novo: 0, observacoes: null, created_by: null, created_at: atras(d, 14), warehouse_id: "wh-rn" });
  }
}
movimentos.push(
  { id: "mv-e1", product_id: "3b8f0d14-9a6e-4c27-b1d5-8e2c4a7f6d03", tipo: "entrada", quantidade: 300, origem: "PC", origem_id: "oc3", custo_unitario: 2.4, custo_medio_anterior: 0, custo_medio_novo: 0,
    observacoes: "Recebimento OC-2026-00029 (parcial)", created_by: U.vend2.id, created_at: atras(1, 15), warehouse_id: "wh-rn" },
  { id: "mv-e2", product_id: "e2a7c5b9-0d4f-4e18-a93c-6b1d8f2e7c44", tipo: "entrada", quantidade: 5000, origem: "PC", origem_id: "oc4", custo_unitario: 0.09, custo_medio_anterior: 0, custo_medio_novo: 0,
    observacoes: "Recebimento OC-2026-00028", created_by: U.vend2.id, created_at: atras(3, 11), warehouse_id: "wh-rn" },
  { id: "mv-a1", product_id: "5f0b3e81-c7d2-4a69-8e14-2d9a6c0b3f55", tipo: "saida", quantidade: 6, origem: "ajuste", origem_id: null, custo_unitario: 0, custo_medio_anterior: 0, custo_medio_novo: 0,
    observacoes: "Contagem física do mês", created_by: U.gestor.id, created_at: atras(0, 9), warehouse_id: "wh-rn" },
);
movimentos.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

const transferencias = [
  { id: "tr1", product_id: "a4d9e2c7-61b0-4f8e-8c3a-5e7b9d0f1a22", product_code: "INS-TP28", from_hub: "wh-rn", to_hub: "wh-sp", quantity: 1500, status: "suggested",
    notes: null, suggested_reason: "CD SP abaixo do mínimo; Hub Natal com sobra.", created_at: atras(1) },
  { id: "tr2", product_id: "e2a7c5b9-0d4f-4e18-a93c-6b1d8f2e7c44", product_code: "INS-RT100", from_hub: "wh-rn", to_hub: "wh-sp", quantity: 2000, status: "approved",
    notes: null, suggested_reason: "CD SP sem rótulo para a reposição.", created_at: atras(2) },
];
const sugestoesOP = [
  { id: "op1", product_code: "INS-RG01", product_id: "5f0b3e81-c7d2-4a69-8e14-2d9a6c0b3f55", hub_origin_id: "wh-rn", target_hub_id: null, suggested_qty: 80, status: "suggested",
    reason: "Cobertura abaixo de 30 dias.", created_at: atras(1) },
];
const skus = [
  { id: "sku1", code: "CZ100", name: "CarboZé 100ml", packaging_ml: 100, is_active: true },
  { id: "sku2", code: "CZ1L", name: "CarboZé 1 Litro", packaging_ml: 1000, is_active: true },
];
const politicas = [
  { id: "pol1", sku_id: "sku1", warehouse_id: "wh-rn", safety_stock_qty: 1200, min_coverage_days: 30, is_active: true, created_at: atras(30) },
  { id: "pol2", sku_id: "sku1", warehouse_id: "wh-sp", safety_stock_qty: 600, min_coverage_days: 15, is_active: true, created_at: atras(30) },
  { id: "pol3", sku_id: "sku2", warehouse_id: "wh-rn", safety_stock_qty: 300, min_coverage_days: 30, is_active: true, created_at: atras(30) },
];
const deficits = [
  { id: "d1", sku_id: "sku1", warehouse_id: "wh-rn", product_id: "7c1e4a90-2b3f-4d1a-9e55-1f0a6c2d8b31", current_stock_qty: 1850, required_qty: 2400, deficit: 550,
    product: { product_code: "INS-FR100", name: "Frasco PET 100ml" }, warehouse: { code: "HUB-RN", name: "Hub Natal" }, sku: { code: "CZ100", name: "CarboZé 100ml" } },
];

export const FX: Record<string, unknown> = {
  purchase_requests: requisicoes,
  purchase_quotes: cotacoes,
  purchase_orders: ordens,
  purchase_receivings: recebimentos,
  purchase_invoices: notas,
  carbo_departments: porRota("carbo_departments", () => departamentos, () => [{ key: "financeiro", label: "Financeiro", sigla: "FIN" }]),
  suppliers: porRota("suppliers", () => fornecedores, () => fornecedores),
  payment_methods: porRota("payment_methods", () => formas, () => formas),
  warehouses: porRota("warehouses", () => hubs, () => hubs),
  mrp_products: porRota("mrp_products", () => (location.pathname.startsWith("/suprimentos") ? insumos : produtosVender), () => produtosVender),
  warehouse_stock: porRota("warehouse_stock", () => estoque),
  stock_movements: porRota("stock_movements", () => movimentos),
  stock_transfers: porRota("stock_transfers", () => transferencias),
  op_suggestions: porRota("op_suggestions", () => sugestoesOP),
  sku: porRota("sku", () => skus),
  sku_warehouse_policy: porRota("sku_warehouse_policy", () => politicas),
  insumo_requirement: porRota("insumo_requirement", () => deficits),
};
export const RPC_FX: Record<string, unknown> = {
  carbo_time_interno_lista: () => pessoas,
};
