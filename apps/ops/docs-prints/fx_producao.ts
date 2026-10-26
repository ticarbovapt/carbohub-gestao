// Fixtures da área "producao" (ver areas.ts): Dashboard de Produção, Ordens de
// Produção e MRP (Produtos, SKUs, Lotes, Fornecedores). Dados FICTÍCIOS.
//
// ⚠️ Duas tabelas que outras telas também leem, e por isso SOMAM ao que já existe:
//   mrp_products   = os produtos do /vender (fx_vender) + insumos e produtos da fábrica
//   carboze_orders = orçamentos e vendas (fixtures base) + parcelas de recorrência agendadas
import { PAPEL, U, EU } from "./pessoas";
import { produtos as produtosVender, pedidosEdit } from "./fx_vender";
import { vendas } from "./fx_vendas";
void EU;

const agora = Date.now();
const dia = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const ts = (horas: number) => new Date(agora - horas * 3600_000).toISOString();

// ── Catálogo da fábrica ──────────────────────────────────────────────────────
const prod = (id: string, name: string, code: string, category: string, stock_unit: string, unit_cost: number, safety = 0, extra: Record<string, unknown> = {}) => ({
  id, name, product_code: code, category, stock_unit, unit_cost, safety_stock_qty: safety, current_stock_qty: 0, notes: null,
  is_active: true, bonificacao_de: null, preco_de: null, faixa_preco: null, aparece_no_vender: false, sale_price: null, ...extra,
});
const fabrica = [
  prod("p4", "CarboPRO 500ml", "CP500", "Produto Final", "un", 0),
  prod("p5", "CarboZé 250ml", "CZ250", "Produto Final", "un", 0, 100),
  prod("p6", "CarboPRO 100ml", "CP100", "Produto Final", "un", 0, 60),
  prod("s1", "CarboZé 100ml Envasado", "CZ100-ENV", "Semi-acabado", "un", 4.62, 400),
  prod("i1", "Concentrado CarboZé", "INS-CONC", "Insumo", "l", 38.5, 50),
  prod("i2", "Frasco PET 100ml", "EMB-FR100", "Embalagem", "un", 0.62, 1000),
  prod("i3", "Tampa rosca 28mm", "EMB-TAMPA", "Embalagem", "un", 0.11, 2000),
  prod("i4", "Lacre de segurança", "EMB-LACRE", "Embalagem", "un", 0.04, 2000),
  prod("i5", "Rótulo CarboZé 100ml", "EMB-ROT100", "Embalagem", "un", 0.09, 1500),
  prod("i6", "Garrafa PET 1 Litro", "EMB-GAR1L", "Embalagem", "un", 1.35, 200),
  prod("i7", "Rótulo CarboZé 1 Litro", "EMB-ROT1L", "Embalagem", "un", 0.14, 200),
  prod("i8", "Filme para sachê", "EMB-FILME", "Embalagem", "un", 0.03, 5000),
  prod("i9", "Frasco PET 250ml", "EMB-FR250", "Embalagem", "un", 0.78, 300),
  prod("i10", "Rótulo CarboPRO 100ml", "EMB-ROTPRO", "Embalagem", "un", 0.1, 500),
  prod("c1", "Cilindro de CO₂ 25kg", "CARB-CO2", "Carbonatação", "un", 210, 2),
  prod("t1", "Display de balcão CarboZé", "TM-DISPLAY", "Trade Marketing", "un", 18, 20),
  prod("r1", "Reagente CarboVAPT", "REA-VAPT", "Insumo", "l", 64, 40),
];
// Os Produtos Finais do /vender ganham custo/segurança para o MRP.
const vender = produtosVender.map((p) => ({ ...p, current_stock_qty: 0, notes: null, unit_cost: 0,
  safety_stock_qty: p.id === "p1" ? 400 : p.id === "p2" ? 100 : p.id === "p3" ? 500 : 0 }));

// Saldo por hub (warehouse_stock com o embed `warehouse`).
const RN = { code: "HUB-RN", name: "Hub Natal", is_active: true };
const SP = { code: "HUB-SP", name: "CD SP LogHouse", is_active: true };
let ws = 0;
const saldo: Record<string, [number, number?]> = {
  p1: [120, 340], p2: [40, 25], p3: [900, 0], p4: [0], p5: [30, 12], p6: [90, 40], s1: [700],
  i1: [150], i2: [4200], i3: [6800], i4: [0], i5: [2000], i6: [320], i7: [410], i8: [26000], i9: [800], i10: [1200],
  c1: [3], t1: [45, 18], r1: [62],
};
const warehouseStock = Object.entries(saldo).flatMap(([pid, [rn, sp]]) => [
  { id: `ws${++ws}`, product_id: pid, quantity: rn, warehouse: RN },
  ...(sp != null ? [{ id: `ws${++ws}`, product_id: pid, quantity: sp, warehouse: SP }] : []),
]);
const minimos: Record<string, number> = { p1: 400, p2: 100, p3: 500, p5: 120, p6: 80, s1: 600 };
const stockMin = Object.entries(minimos).map(([product_id, min_qty]) => ({ product_id, min_qty, warehouse: { code: "HUB-RN" } }));

// Ficha técnica (BOM). p1 e p6 levam o envasado (semi-acabado) → têm duas rotas.
let bk = 0;
const linha = (product_id: string, insumo_id: string, q: number, unit = "un", is_critical = false) =>
  ({ id: `bom${++bk}`, product_id, insumo_id, quantity_per_unit: q, unit, is_critical, created_at: ts(500 - bk) });
const bom = [
  linha("s1", "i2", 1), linha("s1", "i1", 100, "ml", true), linha("s1", "i3", 1), linha("s1", "i4", 1),
  linha("p1", "s1", 1, "un", true), linha("p1", "i5", 1),
  linha("p6", "s1", 1, "un", true), linha("p6", "i10", 1),
  linha("p2", "i6", 1), linha("p2", "i1", 1000, "ml", true), linha("p2", "i3", 1), linha("p2", "i4", 1), linha("p2", "i7", 1),
  linha("p3", "i8", 1), linha("p3", "i1", 10, "ml", true),
  linha("p5", "i9", 1), linha("p5", "i1", 250, "ml", true), linha("p5", "i3", 1),
];

// ── Ordens de Produção ───────────────────────────────────────────────────────
const op = (id: string, op_number: string, product_id: string, product_code: string, planned_quantity: number, op_status: string,
  o: Record<string, unknown> = {}) => ({
  id, op_number, sku_id: null, product_id, product_code, planned_quantity, good_quantity: null, rejected_quantity: null,
  priority: 3, op_status, demand_source: "pcp_manual", need_date: null, source_order_id: null, production_route: null,
  created_at: ts(72), updated_at: ts(20), stage_since: ts(20), customer_name: null, ...o,
});
const ordens = [
  op("op1", "OP-2026-0142", "p1", "CarboZé 100ml", 600, "rascunho", { demand_source: "venda", customer_name: "Posto Boa Viagem Ltda", source_order_id: "v1", priority: 2, need_date: dia(3), created_at: ts(6), stage_since: ts(6) }),
  op("op4", "OP-2026-0145", "p4", "CarboPRO 500ml", 50, "rascunho", { created_at: ts(30), stage_since: ts(30) }),
  op("op2", "OP-2026-0143", "p2", "CarboZé 1 Litro", 80, "planejada", { demand_source: "safety_stock", need_date: dia(6), created_at: ts(28), stage_since: ts(26) }),
  op("op3", "OP-2026-0144", "p3", "CarboZé Sachê 10ml", 2000, "planejada", { priority: 4, need_date: dia(10), created_at: ts(50), stage_since: ts(49) }),
  op("op5", "OP-2026-0139", "p1", "CarboZé 100ml", 400, "separada", { demand_source: "venda", customer_name: "Auto Posto Cidade Verde", priority: 1, need_date: dia(-1), production_route: "rotular", created_at: ts(120), stage_since: ts(50) }),
  op("op6", "OP-2026-0137", "s1", "CarboZé 100ml Envasado", 500, "envase", { demand_source: "recorrencia", customer_name: "Posto Rota do Sol", need_date: dia(2), production_route: "zero", created_at: ts(140), stage_since: ts(5) }),
  op("op7", "OP-2026-0135", "p2", "CarboZé 1 Litro", 120, "rotulagem", { demand_source: "venda", customer_name: "Posto Santa Rita", priority: 2, need_date: dia(1), created_at: ts(160), stage_since: ts(9) }),
  op("op8", "OP-2026-0132", "p1", "CarboZé 100ml", 300, "aguardando_confirmacao", { demand_source: "venda", customer_name: "Posto Serra do Mel", need_date: dia(2), production_route: "rotular", created_at: ts(190), stage_since: ts(3) }),
  op("op9", "OP-2026-0128", "p3", "CarboZé Sachê 10ml", 1500, "concluida", { good_quantity: 1480, rejected_quantity: 20, need_date: dia(-4), created_at: ts(260), updated_at: ts(30) }),
  op("op10", "OP-2026-0125", "p1", "CarboZé 100ml", 200, "concluida", { demand_source: "venda", customer_name: "Posto Bela Vista", good_quantity: 196, rejected_quantity: 4, production_route: "rotular", need_date: dia(-6), created_at: ts(300), updated_at: ts(70) }),
  op("op11", "OP-2026-0130", "p5", "CarboZé 250ml", 60, "bloqueada", { need_date: dia(5), created_at: ts(200), updated_at: ts(48), stage_since: ts(48) }),
];
const movedBy: Record<string, string> = { op1: U.gestor.id, op2: U.gestor.id, op3: U.colab.id, op5: U.colab.id, op6: U.vend2.id, op7: U.colab.id, op8: U.vend2.id, op11: U.gestor.id };

const historico = [
  { id: "mv3", op_id: "op1", from_status: null, to_status: "rascunho", moved_by: U.gestor.id, moved_at: ts(6) },
  { id: "mv1", op_id: "op5", from_status: "planejada", to_status: "separada", moved_by: U.colab.id, moved_at: ts(50) },
  { id: "mv2", op_id: "op5", from_status: "rascunho", to_status: "planejada", moved_by: U.gestor.id, moved_at: ts(96) },
];

const perdas = [
  { id: "l1", insumo_id: "i1", loss_qty: 2.4, actual_qty: 152.4, theoretical_qty: 150, unit: "l", produto: { name: "Concentrado CarboZé", product_code: "INS-CONC" } },
  { id: "l2", insumo_id: "i5", loss_qty: 18, actual_qty: 214, theoretical_qty: 196, unit: "un", produto: { name: "Rótulo CarboZé 100ml", product_code: "EMB-ROT100" } },
  { id: "l3", insumo_id: "i8", loss_qty: 40, actual_qty: 1520, theoretical_qty: 1480, unit: "un", produto: { name: "Filme para sachê", product_code: "EMB-FILME" } },
];

// Parcelas de recorrência ainda não devidas (carboze_orders, status agendado).
const mesQueVem = (n: number) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() + n); return x.toISOString().slice(0, 10); };
const parcelas = [
  { id: "rc1", order_number: "V2026090012-2", customer_name: "Posto Rota do Sol", scheduled_month: mesQueVem(1), total: 7800, recurrence_index: 2, recurrence_total: 6, items: [{ produto: "CarboZé 100ml", quantidade: 500 }], status: "agendado", agreed_delivery_date: null },
  { id: "rc2", order_number: "V2026080044-3", customer_name: "Transportes Litoral Norte", scheduled_month: mesQueVem(1), total: 4495, recurrence_index: 3, recurrence_total: 12, items: [{ produto: "CarboZé 1 Litro", quantidade: 50 }], status: "agendado", agreed_delivery_date: null },
  { id: "rc3", order_number: "V2026090012-3", customer_name: "Posto Rota do Sol", scheduled_month: mesQueVem(2), total: 7800, recurrence_index: 3, recurrence_total: 6, items: [{ produto: "CarboZé 100ml", quantidade: 500 }, { produto: "CarboZé Sachê 10ml", quantidade: 200 }], status: "agendado", agreed_delivery_date: null },
];

// ── SKUs, lotes e fornecedores ──────────────────────────────────────────────
const skus = [
  { id: "sk1", code: "SKU-CZ100", name: "CarboZé 100ml", description: "Frasco 100ml para o consumidor final", category: "produto_final", packaging_ml: 100, safety_stock_qty: 400, is_active: true },
  { id: "sk2", code: "SKU-CZ1L", name: "CarboZé 1 Litro", description: "Garrafa de 1 litro", category: "produto_final", packaging_ml: 1000, safety_stock_qty: 100, is_active: true },
  { id: "sk3", code: "SKU-SACH10", name: "CarboZé Sachê 10ml", description: "Sachê dose única", category: "produto_final", packaging_ml: 10, safety_stock_qty: 500, is_active: true },
  { id: "sk4", code: "SKU-VAPT1L", name: "Reagente CarboVAPT 1L", description: "Reagente da descarbonização", category: "reagente", packaging_ml: 1000, safety_stock_qty: 40, is_active: true },
  { id: "sk5", code: "SKU-CZ500", name: "CarboZé 500ml", description: "Linha descontinuada", category: "produto_final", packaging_ml: 500, safety_stock_qty: 0, is_active: false },
];
const skuBom = [{ sku_id: "sk1", version: 3, is_active: true }, { sku_id: "sk2", version: 2, is_active: true }, { sku_id: "sk3", version: 1, is_active: true }, { sku_id: "sk4", version: 1, is_active: true }];

const fornecedoresLegado = [
  // ⚠️ Mesmos ids/nomes do fx_suprimentos (a tabela é a mesma e ele vence em areas.ts).
  { id: "s1", name: "Embalagens Nordeste Ltda", is_active: true },
  { id: "s2", name: "Química Potiguar", is_active: true },
];
const lote = (id: string, code: string, ini: number, disp: number, status: string, col: number, esp: number, rec: number | null, sup: string | null) => ({
  id, lot_code: code, product_id: "r1", supplier_id: sup, initial_volume_ml: ini, available_volume_ml: disp, status,
  collected_samples: col, expected_samples: esp, received_at: rec == null ? null : dia(rec), expired_at: rec == null ? null : dia(rec + 365), notes: null,
  created_at: ts(100 - (rec ?? 0)),
});
const lotes = [
  lote("lt1", "LOT-2026-0031", 200000, 200000, "em_quarentena", 1, 3, -2, "s2"),
  lote("lt2", "LOT-2026-0030", 200000, 152000, "aprovado", 3, 3, -12, "s2"),
  lote("lt3", "LOT-2026-0029", 100000, 21000, "aprovado", 3, 3, -40, "s2"),
  lote("lt4", "LOT-2026-0028", 100000, 100000, "bloqueado", 2, 3, -45, "s1"),
  lote("lt5", "LOT-2026-0027", 50000, 0, "encerrado", 3, 3, -90, "s2"),
  lote("lt6", "LOT-2026-0032", 150000, 150000, "criado", 0, 3, null, null),
];

const mrpSuppliers = [
  { id: "ms1", cnpj: "11222333000144", legal_name: "Química Potiguar Ltda", trade_name: "QuímPot", category: "Insumos químicos", status: "active", emails: ["vendas@quimpot.com.br"], phones: ["(84) 3201-5500"], raw: { contact: "Fernanda Rocha", notes: null } },
  { id: "ms2", cnpj: "22333444000155", legal_name: "Embalagens Nordeste S.A.", trade_name: "EmbaNor", category: "Embalagens", status: "active", emails: ["comercial@embanor.com.br"], phones: ["(81) 3344-2100"], raw: { contact: "Marcos Paiva", notes: null } },
  { id: "ms3", cnpj: "33444555000166", legal_name: "Gráfica Rótulo Certo Ltda", trade_name: "Rótulo Certo", category: "Rótulos", status: "active", emails: [], phones: ["(84) 3088-7711"], raw: {} },
  { id: "ms4", cnpj: "44555666000177", legal_name: "Gases Industriais do RN Ltda", trade_name: "GásRN", category: "Carbonatação", status: "active", emails: ["pedidos@gasrn.com.br"], phones: [], raw: {} },
  { id: "ms5", cnpj: "55666777000188", legal_name: "Plásticos Sertão Ltda", trade_name: "", category: "Embalagens", status: "inactive", emails: [], phones: [], raw: {} },
];

export const FX: Record<string, unknown> = {
  mrp_products: () => [...vender, ...fabrica],
  warehouse_stock: warehouseStock,
  ops_stock_min: stockMin,
  mrp_bom: bom,
  production_orders: ordens,
  production_order_moves: historico,
  op_material_loss: perdas,
  carboze_orders: () => [...pedidosEdit, ...vendas(PAPEL), ...parcelas],
  sku: skus,
  sku_bom: skuBom,
  inventory_lot: lotes,
  suppliers: fornecedoresLegado,
  mrp_suppliers: mrpSuppliers,
};

const tendencia = [-6, -5, -4, -3, -2, -1, 0].map((d, i) => ({ d: dia(d), criadas: [2, 1, 3, 0, 2, 1, 2][i], concluidas: [1, 2, 1, 1, 0, 2, 1][i] }));
export const RPC_FX: Record<string, unknown> = {
  op_last_moves: (a: { p_ids?: string[] }) => (a.p_ids ?? []).filter((id) => movedBy[id]).map((id) => ({
    op_id: id, moved_by: movedBy[id], moved_at: (ordens.find((o) => o.id === id)?.stage_since as string) ?? ts(10),
  })),
  ops_production_dashboard: {
    opTotal: 11, opAtivas: 9, opConcluidas: 2,
    statusCounts: { rascunho: 2, planejada: 2, separada: 1, envase: 1, rotulagem: 1, aguardando_confirmacao: 1, concluida: 2, bloqueada: 1 },
    trend: tendencia,
    checklistsTotal: 14, checklistsCompletos: 9, etapasPendentes: 11,
    recentChecklists: [
      { id: "ck1", nome: "Abertura da linha de envase", departamento: "preparacao", done: 8, total: 8 },
      { id: "ck2", nome: "Limpeza da envasadora (CIP)", departamento: "operacao", done: 5, total: 7 },
      { id: "ck3", nome: "Conferência de rótulos e lote", departamento: "operacao", done: 6, total: 6 },
      { id: "ck4", nome: "Separação de carga — Hub Natal", departamento: "expedicao", done: 3, total: 5 },
      { id: "ck5", nome: "Retorno de cliente (devolução)", departamento: "pos_venda", done: 1, total: 4 },
    ],
  },
};
