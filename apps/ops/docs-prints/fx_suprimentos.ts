// Fixtures da área "suprimentos" (ver areas.ts):
// /suprimentos (estoque por hub, movimentações, envios, recebimento, mapa de
// SKU, ML Full, política), /suprimentos/vendedores e /compras.
// Dados FICTÍCIOS — nenhum cliente, pessoa, pedido ou anúncio real.
import { PAPEL, U, EU } from "./pessoas";
import * as producao from "./fx_producao";

// ⚠️ Saldo e mínimo também são lidos pelas telas de PRODUÇÃO (insumos da OP).
// Nas rotas /producao respondem os da área de produção; no resto, os daqui.
const naProducao = () => { try { return location.pathname.startsWith("/producao"); } catch { return false; } };
const daProducao = (k: string, meu: unknown[]) => () => {
  const v = producao.FX[k];
  return naProducao() ? (typeof v === "function" ? (v as () => unknown)() : v) : meu;
};
void PAPEL;

const agora = Date.now();
const h = (horas: number) => new Date(agora - horas * 3600000).toISOString();
const d = (dias: number, hora = 10) => { const x = new Date(); x.setDate(x.getDate() - dias); x.setHours(hora, 15, 0, 0); return x.toISOString(); };

// Pessoas extras só desta área (vendedores com caixa). Nenhuma é o usuário logado,
// para não mexer no "Meu estoque" de outras telas.
const CARLOS = { id: "u-v3", full_name: "Carlos Mendes" };
const JULIANA = { id: "u-v4", full_name: "Juliana Rocha" };

// ── Galpões e caixas ─────────────────────────────────────────────────────────
const wh = (id: string, code: string, name: string, kind = "hub", owner: { id: string; full_name: string } | null = null, extra: Record<string, unknown> = {}) =>
  ({ id, code, name, kind, owner_id: owner?.id ?? null, dono_nome: owner?.full_name ?? null, is_active: true, licenciado_loja_id: null, ...extra });
const WH = [
  wh("wh-rn", "HUB-RN", "Hub Natal"),
  wh("wh-sp", "HUB-SP", "CD SP LogHouse"),
  wh("wh-spv", "HUB-SP-VENDAS", "CD SP Vendas"),
  wh("wh-esc", "HUB-ESCRITORIO", "Escritório"),
  wh("wh-v2", "VEND-OPS011", "Caixa — Ana Souza", "vendedor", U.vend2),
  wh("wh-v3", "VEND-OPS020", "Caixa — Carlos Mendes", "vendedor", CARLOS),
  wh("wh-v4", "VEND-OPS021", "Caixa — Juliana Rocha", "vendedor", JULIANA),
  wh("wh-cl", "VEND-OPS002", "Caixa — Bruno Lima", "vendedor", U.closer),
  wh("wh-l1", "LIC-0007", "Licenciado — Mossoró Centro", "licenciado", null, { licenciado_loja_id: "loja-7" }),
  wh("wh-l2", "LIC-0012", "Licenciado — Caruaru Norte", "licenciado", null, { licenciado_loja_id: "loja-12" }),
];
const WHC = (code: string) => WH.find((w) => w.code === code)!;

// ── Saldo por galpão (p1 CZ100, p2 CZ1L, p3 sachê — o catálogo do fx_vender) ─
const saldo: [string, string, number][] = [
  ["HUB-RN", "p1", 3420], ["HUB-RN", "p2", 186], ["HUB-RN", "p3", 9600],
  ["HUB-SP", "p1", 275], ["HUB-SP", "p2", 42], ["HUB-SP", "p3", 1253],
  ["HUB-SP-VENDAS", "p1", 480], ["HUB-SP-VENDAS", "p2", 0], ["HUB-SP-VENDAS", "p3", 300],
  ["HUB-ESCRITORIO", "p1", 36], ["HUB-ESCRITORIO", "p2", 4], ["HUB-ESCRITORIO", "p3", 120],
];
const warehouse_stock = saldo.map(([code, pid, q], i) =>
  ({ id: `ws${i}`, warehouse_id: WHC(code).id, product_id: pid, quantity: q, warehouse: { code } }));

const minimos: [string, string, number][] = [
  ["HUB-RN", "p1", 1500], ["HUB-RN", "p2", 200], ["HUB-RN", "p3", 4000],
  ["HUB-SP", "p1", 400], ["HUB-SP", "p2", 30], ["HUB-SP", "p3", 600],
];
const ops_stock_min = [
  ...minimos.map(([code, pid, m]) => ({ warehouse_id: WHC(code).id, product_id: pid, min_qty: m, warehouse: { code } })),
  { warehouse_id: "wh-v2", product_id: "p1", min_qty: 20, warehouse: { code: "VEND-OPS011" } },
  { warehouse_id: "wh-v2", product_id: "p3", min_qty: 30, warehouse: { code: "VEND-OPS011" } },
];

// ── Movimentações ───────────────────────────────────────────────────────────
type Mov = [string, string, "entrada" | "saida", number, string, string | null, number, string | null, Record<string, unknown>?];
const movs: Mov[] = [
  // CD SP LogHouse — o print
  ["HUB-SP", "p1", "saida", 5, "ecommerce", "1 × 5 un · SKU 124", 2, null, { ref_externa: "nuvemshop:1803-552901", executor: "cron:ecommerce" }],
  ["HUB-SP", "p3", "saida", 1, "ecommerce", "1 × 1 un · SKU 120", 5, null, { ref_externa: "mercadolivre:2000015512-01", executor: "cron:ecommerce" }],
  ["HUB-SP", "p1", "entrada", 600, "transferencia", "Recebido de Hub Natal", 20, U.colab.id],
  ["HUB-SP", "p1", "saida", 10, "ecommerce", "2 × 5 un · SKU 124", 26, null, { ref_externa: "nuvemshop:1798-552870", executor: "cron:ecommerce" }],
  ["HUB-SP", "p2", "saida", 3, "ajuste", "Contagem física — 3 frascos avariados", 50, U.gestor.id],
  ["HUB-SP", "p1", "saida", 20, "venda", "Pedido V2026100031", 75, U.vend2.id, { order_id: "v1" }],
  ["HUB-SP", "p3", "entrada", 200, "ajuste", "Contagem física da LogHouse", 98, U.gestor.id],
  // Hub Natal — só para os cartões
  ["HUB-RN", "p1", "entrada", 2400, "producao", "Lote L2610-04", 6, U.colab.id],
  ["HUB-RN", "p1", "saida", 600, "transferencia", "Envio para CD SP LogHouse", 22, U.gestor.id],
  ["HUB-RN", "p3", "entrada", 5000, "producao", "Lote L2610-02", 30, U.colab.id],
  ["HUB-RN", "p2", "saida", 24, "venda", "Pedido V2026090088", 60, U.vend2.id, { order_id: "v4" }],
  ["HUB-RN", "p1", "saida", 24, "transferencia", "Envio para Ana Souza", 70, U.gestor.id],
];
const stock_movements = movs.map(([code, pid, tipo, q, origem, obs, horas, por, extra], i) => ({
  id: `mv${i}`, warehouse_id: WHC(code).id, product_id: pid, tipo, quantidade: q, origem, observacoes: obs,
  created_at: h(horas), created_by: por, order_id: null, op_id: null, ref_externa: null, executor: null, ...(extra ?? {}),
}));

const carbo_movimento_ecommerce_card = [
  { ref_externa: "nuvemshop:1803-552901", platform: "nuvemshop", platform_order_number: "1803", bling_id: 9123401 },
  { ref_externa: "nuvemshop:1798-552870", platform: "nuvemshop", platform_order_number: "1798", bling_id: 9123388 },
  { ref_externa: "mercadolivre:2000015512-01", platform: "mercadolivre", platform_order_number: "2000015512", bling_id: null },
];

// ── Transferências entre estoques (view carbo_transferencias) ────────────────
const NOME: Record<string, string> = { p1: "CarboZé 100ml", p2: "CarboZé 1 Litro", p3: "CarboZé Sachê 10ml" };
const COD: Record<string, string> = { p1: "CZ100", p2: "CZ1L", p3: "CARB-SACH-10ML" };
const tr = (id: string, pid: string, qtd: number, de: string, para: string, status: string, dias: number, por: string, extra: Record<string, unknown> = {}) => {
  const o = WHC(de), t = WHC(para);
  return {
    id, product_id: pid, produto: NOME[pid], product_code: COD[pid], qtd, unidade: "un",
    origem_code: de, origem_nome: o.name, destino_code: para, destino_nome: t.name, destino_kind: t.kind, destino_dono_id: t.owner_id,
    enviado_em: d(dias), notes: null, status, registrado_por_nome: por, aceito_por_nome: null, aceito_em: null, ...extra,
  };
};
const carbo_transferencias = [
  tr("t1", "p1", 600, "HUB-RN", "HUB-SP", "approved", 1, U.gestor.full_name, { notes: "NF 001245" }),
  tr("t2", "p3", 1200, "HUB-RN", "HUB-SP", "approved", 2, U.gestor.full_name),
  tr("t3", "p2", 48, "HUB-RN", "HUB-SP", "executed", 6, U.gestor.full_name, { aceito_por_nome: U.colab.full_name, aceito_em: d(4) }),
  tr("t4", "p3", 300, "HUB-RN", "HUB-SP-VENDAS", "approved", 3, U.colab.full_name),
  tr("t5", "p1", 24, "HUB-RN", "VEND-OPS011", "approved", 1, U.gestor.full_name, { notes: "Reposição da semana" }),
  tr("t6", "p1", 60, "HUB-RN", "LIC-0007", "executed", 9, U.gestor.full_name, { aceito_por_nome: "Equipe Mossoró Centro", aceito_em: d(7) }),
  tr("t7", "p1", 12, "HUB-RN", "HUB-ESCRITORIO", "cancelled", 12, U.colab.full_name, { notes: "Não saiu — voltou ao saldo" }),
];

// stock_transfers cru (a tela dos vendedores lê direto).
const stock_transfers = [
  { id: "t5", product_id: "p1", product_code: "CZ100", quantity: 24, status: "approved", notes: "Reposição da semana", created_at: d(1, 9), to_hub: "wh-v2", from_hub: "wh-rn" },
  { id: "st2", product_id: "p3", product_code: "CARB-SACH-10ML", quantity: 50, status: "approved", notes: null, created_at: d(0, 8), to_hub: "wh-v4", from_hub: "wh-rn" },
  { id: "st3", product_id: "p2", product_code: "CZ1L", quantity: 4, status: "approved", notes: "Sobra da rota de Caruaru", created_at: d(2, 16), to_hub: "wh-rn", from_hub: "wh-cl" },
];

// ── Caixas dos vendedores (view vendedor_estoque) ───────────────────────────
const caixa = (w: string, dono: { id: string; full_name: string }, qtds: [number, number, number], ativa = true) => {
  const W = WH.find((x) => x.id === w)!;
  return (["p1", "p2", "p3"] as const).map((pid, i) => ({
    warehouse_id: w, warehouse_code: W.code, warehouse_name: W.name, is_active: ativa,
    vendedor_id: dono.id, vendedor_nome: dono.full_name, vendedor_avatar: null,
    product_id: pid, product_code: COD[pid], product_name: NOME[pid], stock_unit: "un", quantidade: qtds[i], saldo_em: d(1),
  }));
};
const vendedor_estoque = [
  ...caixa("wh-v2", U.vend2, [12, 6, 40]),
  ...caixa("wh-cl", U.closer, [48, 10, 0]),
  ...caixa("wh-v3", CARLOS, [0, 0, 0]),
  ...caixa("wh-v4", JULIANA, [30, 2, 120]),
];

// ── Mapa SKU → produto ──────────────────────────────────────────────────────
const prod = (pid: string) => ({ id: pid, name: NOME[pid], product_code: COD[pid], stock_unit: "un", bonificacao_de: null });
const mapa = (id: string, sku: string, platform: string | null, pid: string, un: number, disp: number | null, ativo = true) =>
  ({ id, platform_sku: sku, platform, product_id: pid, unidades_por_venda: un, is_active: ativo, units_per_kit: un,
     display_units_per_pack: disp, description: null, updated_at: d(20), produto: prod(pid) });
const sku_product_mappings = [
  mapa("m1", "124", null, "p1", 5, 5),
  mapa("m2", "120", null, "p3", 10, 10),
  mapa("m3", "MLB-CZ1L-01", "mercadolivre", "p2", 1, 1),
  mapa("m4", "CZ1L-KIT2", "nuvemshop", "p2", 2, null),
  mapa("m5", "B0CZ100X3", "amazon", "p1", 3, 3, false),
];
const carbo_estoque_ensaio = [
  ...[1, 2, 3].map((i) => ({ platform: "shopee", product_sku: null, product_name: "CarboZé Kit 5 Frascos 100ml", qtd_vendida: 1, veredito: "SEM MAPEAMENTO", ordered_at: d(i), order_id: `sh${i}` })),
  ...[1, 2].map((i) => ({ platform: "amazon", product_sku: "B0CZSACH20", product_name: "CarboZé Sachê 10ml — kit com 20", qtd_vendida: 2, veredito: "SEM MAPEAMENTO", ordered_at: d(i + 1), order_id: `am${i}` })),
  { platform: "nuvemshop", product_sku: "CZ100-KIT10", product_name: "Kit 10 frascos CarboZé 100ml", qtd_vendida: 1, veredito: "SEM MAPEAMENTO", ordered_at: d(5), order_id: "nv1" },
];

// ── ML Full (espelho) ────────────────────────────────────────────────────────
const ml_estoque_full_tela = [
  { item_id: "MLB4012345601", variation_id: null, seller_sku: "124", titulo_anuncio: "CarboZé Kit 5 Frascos 100ml Descarbonizante", status: "active", disponivel: 0, nao_disponivel: 0, product_id: "p1", product_code: "CZ100", produto: "CarboZé 100ml", saldo_loghouse: 275, em_transito: 150, sincronizado_em: h(0.15) },
  { item_id: "MLB4012345602", variation_id: null, seller_sku: "CZ100-3", titulo_anuncio: "CarboZé 100ml — Kit 3 frascos", status: "active", disponivel: 38, nao_disponivel: 2, product_id: "p1", product_code: "CZ100", produto: "CarboZé 100ml", saldo_loghouse: 275, em_transito: 0, sincronizado_em: h(0.15) },
  { item_id: "MLB4012345610", variation_id: "18833", seller_sku: "MLB-CZ1L-01", titulo_anuncio: "CarboZé 1 Litro Aditivo", status: "active", disponivel: 64, nao_disponivel: 0, product_id: "p2", product_code: "CZ1L", produto: "CarboZé 1 Litro", saldo_loghouse: 42, em_transito: 0, sincronizado_em: h(0.15) },
  { item_id: "MLB4012345633", variation_id: null, seller_sku: null, titulo_anuncio: "CarboZé Sachê 10ml — 20 unidades", status: "active", disponivel: 120, nao_disponivel: 0, product_id: null, product_code: null, produto: null, saldo_loghouse: null, em_transito: 0, sincronizado_em: h(0.15) },
];
const ml_full_remessas = [
  { id: "rm1", product_id: "p1", quantidade: 150, status: "em_transito", enviado_em: d(2), recebido_em: null, observacao: "Coleta agendada pelo ML", produto: { product_code: "CZ100", name: "CarboZé 100ml" }, origem: { code: "HUB-RN" } },
];

// ── Requisição de Compra ────────────────────────────────────────────────────
const rc = (id: string, rc_number: string, escopo: string, estimated_value: number, status: string, dias: number, requested_by = EU.id) =>
  ({ id, rc_number, escopo, cost_center: escopo === "setor" ? "Produção" : "Pessoal", purchase_type: escopo === "setor" ? "estoque" : "uso_direto",
     suggested_supplier: null, estimated_value, justification: null, items: [], status, created_at: d(dias), requested_by, created_by: EU.id });

export const FX: Record<string, unknown> = {
  warehouses: WH,
  carbo_estoques: WH,
  warehouse_stock: daProducao("warehouse_stock", warehouse_stock),
  ops_stock_min: daProducao("ops_stock_min", ops_stock_min),
  mrp_product_hubs: [],
  stock_movements,
  carbo_movimento_ecommerce_card,
  carbo_transferencias,
  stock_transfers,
  vendedor_estoque,
  sku_product_mappings,
  carbo_estoque_ensaio,
  ml_estoque_full_tela,
  ml_full_remessas,
  purchase_requests: () => [
    rc("r1", "TEMP", "setor", 1840, "rascunho", 0),
    rc("r2", "RC-2026-0151", "setor", 6420, "aguardando_aprovacao", 1),
    rc("r3", "RC-2026-0149", "setor", 389.9, "aguardando_aprovacao", 2, U.vend2.id),
    rc("r4", "RC-2026-0133", "setor", 12800, "aprovada", 9),
    rc("r5", "RC-2026-0120", "individual", 249, "convertida", 16),
    rc("r6", "RC-2026-0102", "setor", 3150, "rejeitada", 30),
  ],
  suppliers: [
    { id: "s1", name: "Embalagens Nordeste Ltda", is_active: true },
    { id: "s2", name: "Química Potiguar", is_active: true },
  ],
  purchase_quotes: [],
};

export const RPC_FX: Record<string, unknown> = {
  carbo_time_interno_lista: () => Object.values(U).map((x) => ({ id: x.id, full_name: x.full_name, username: x.username })),
};
