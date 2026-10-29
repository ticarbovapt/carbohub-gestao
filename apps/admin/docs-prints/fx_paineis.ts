// Fixtures da área "paineis" (ver areas.ts): Mapa da Conquista, Portal de
// Vendas, Licenciados, Metas (Placar), Suprimentos e Configurar Metas.
// Tudo FICTÍCIO — lojas, licenciados, pedidos e estoques são inventados; as
// cidades são só nomes de município (nenhum cliente).
//
// ⚠️ `mrp_products`, `carboze_orders`, `ecommerce_orders` e `meta_ecommerce`
// também são lidas por outras áreas: aqui elas respondem com os dados desta
// área SÓ nas rotas desta área; fora delas, devolvem o que as outras
// declararam (ou a base).
import { PAPEL, U, EU } from "./pessoas";
import { produtos, pedidosEdit } from "./fx_vender";
import { vendas } from "./fx_vendas";
import * as comercial from "./fx_comercial";
import * as ecommerce from "./fx_ecommerce";
import * as esteira from "./fx_esteira";
import * as painelcom from "./fx_painelcom";
void EU;

const OUTRAS = [comercial, ecommerce, esteira, painelcom] as { FX?: Record<string, unknown> }[];
const rota = () => { try { return location.pathname; } catch { return ""; } };
const NOSSAS = ["/mapa-da-conquista", "/portal-de-vendas", "/licenciados", "/placar-de-metas", "/suprimentos", "/configurar-metas"];
const naNossa = () => NOSSAS.some((r) => rota().startsWith(r));
const resolve = (v: unknown) => (typeof v === "function" ? (v as () => unknown)() : v);
const porRota = (chave: string, meu: () => unknown, padrao: () => unknown = () => []) => () => {
  if (naNossa()) return meu();
  for (const a of [...OUTRAS].reverse()) if (a.FX && chave in a.FX) return resolve(a.FX[chave]);
  return padrao();
};

const AGORA = new Date();
const diaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diasAtras = (n: number) => { const d = new Date(AGORA); d.setDate(d.getDate() - n); return d; };
const isoAtras = (n: number, h = 14) => { const d = diasAtras(n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const MES = diaLocal(AGORA).slice(0, 7);
const INICIO_MES = `${MES}-01`;
let semente = 7351;
const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const r2 = (v: number) => Math.round(v * 100) / 100;

// ── Mapa da Conquista (view mapa_conquista) ─────────────────────────────────
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['`´]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
// [cidade, UF, pedidos, valor, pdvs, licenciados, dias desde a 1ª venda (null = sem venda)]
const CIDADES: [string, string, number, number, number, number, number | null][] = [
  ["Natal", "RN", 96, 148200, 14, 2, 410], ["Parnamirim", "RN", 31, 42800, 5, 1, 380], ["Mossoró", "RN", 22, 30150, 3, 1, 300],
  ["São Gonçalo do Amarante", "RN", 9, 11900, 2, 0, 210], ["Macaíba", "RN", 6, 7400, 1, 0, 160], ["Caicó", "RN", 2, 2310, 1, 0, 6],
  ["Recife", "PE", 74, 121500, 11, 2, 400], ["Jaboatão dos Guararapes", "PE", 28, 39600, 4, 1, 330], ["Olinda", "PE", 12, 15800, 2, 0, 250],
  ["Caruaru", "PE", 15, 21300, 3, 1, 190], ["Ipojuca", "PE", 8, 13900, 1, 0, 120], ["Petrolina", "PE", 1, 1560, 0, 1, 11],
  ["João Pessoa", "PB", 41, 58900, 6, 1, 350], ["Campina Grande", "PB", 13, 17700, 2, 1, 200], ["Santa Rita", "PB", 1, 780, 1, 0, 4],
  ["Fortaleza", "CE", 37, 61200, 5, 1, 280], ["Caucaia", "CE", 5, 6200, 1, 0, 90], ["Juazeiro do Norte", "CE", 2, 3120, 1, 0, 15],
  ["Salvador", "BA", 19, 33400, 3, 1, 230], ["Feira de Santana", "BA", 4, 5900, 0, 1, 70],
  ["São Paulo", "SP", 58, 98700, 4, 1, 390], ["Campinas", "SP", 9, 14300, 1, 0, 140], ["Barueri", "SP", 6, 9100, 0, 0, 100], ["Santos", "SP", 1, 1690, 0, 0, 9],
  ["Maceió", "AL", 11, 16400, 2, 1, 170], ["Aracaju", "SE", 7, 9800, 1, 0, 130],
  ["Belo Horizonte", "MG", 5, 7600, 0, 0, 85], ["Curitiba", "PR", 3, 4700, 0, 0, 60], ["Goiânia", "GO", 0, 0, 0, 1, null],
  // Nome como o comprador escreveu no marketplace — não casa com o IBGE (vai para o aviso do rodapé).
  ["Jaboatão", "PE", 2, 2980, 0, 0, 45],
];
const mapaConquista = () => CIDADES.map(([c, uf, ped, valor, pdvs, lic, dias]) => ({
  cidade: norm(c), uf, pedidos: ped, valor, pdvs, licenciados: lic,
  tem_venda: ped > 0, tem_pdv: pdvs > 0, tem_licenciado: lic > 0,
  primeira_venda: dias == null ? null : diaLocal(diasAtras(dias)),
  ultima_venda: dias == null ? null : diaLocal(diasAtras(Math.min(dias, 3))),
  conquista_recente: dias != null && dias <= 30,
}));

// ── Portal de Vendas (RPCs produtos.admin_get_global_kpis / get_scoped_sales_timeseries)
const ehPeriodoAnterior = (a: Record<string, unknown>) => String(a.p_from ?? "") < INICIO_MES;
const lojasKpis = (a: Record<string, unknown>) => [ehPeriodoAnterior(a)
  ? { total_postos: 46, active_postos: 29, total_sales: 1118, total_revenue: 79140, total_units: 6210, total_frentistas: 114, low_stock_products: 1 }
  : { total_postos: 48, active_postos: 31, total_sales: 1284, total_revenue: 86420, total_units: 6930, total_frentistas: 120, low_stock_products: 3 }];
const lojasSerie = (a: Record<string, unknown>) => {
  const de = String(a.p_from ?? INICIO_MES), ate = String(a.p_to ?? diaLocal(AGORA));
  const out: Record<string, unknown>[] = [];
  semente = 4411;
  for (let d = new Date(de + "T12:00:00"); diaLocal(d) <= ate; d.setDate(d.getDate() + 1)) {
    const dom = d.getDay() === 0;
    const qtd100 = Math.round((dom ? 90 : 190) + rnd() * 120);
    const qtdSache = Math.round((dom ? 20 : 50) + rnd() * 40);
    out.push({ day: diaLocal(d), variant: "100ml", total_qty: qtd100, total_amount: r2(qtd100 * 15.6) });
    out.push({ day: diaLocal(d), variant: "sache", total_qty: qtdSache, total_amount: r2(qtdSache * 4.9) });
  }
  return out;
};

// ── Licenciados (RPCs do schema licenciados) ────────────────────────────────
const LOJAS_LIC: [string, string, string, boolean, number, number][] = [
  ["CarboVapt Natal Zona Sul", "Natal", "RN", true, 38, 30800],
  ["CarboVapt Recife Imbiribeira", "Recife", "PE", true, 31, 26600],
  ["CarboVapt João Pessoa BR-230", "João Pessoa", "PB", true, 24, 19600],
  ["CarboVapt Fortaleza Maracanaú", "Fortaleza", "CE", true, 19, 16800],
  ["CarboVapt Mossoró Centro", "Mossoró", "RN", true, 14, 11200],
  ["CarboVapt Caruaru Polo", "Caruaru", "PE", true, 11, 9100],
  ["CarboVapt Salvador Porto Seco", "Salvador", "BA", true, 9, 8400],
  ["CarboVapt Maceió Tabuleiro", "Maceió", "AL", true, 7, 5600],
  ["CarboVapt Campina Grande", "Campina Grande", "PB", true, 4, 3500],
  ["CarboVapt São Paulo Vila Maria", "São Paulo", "SP", true, 3, 2800],
  ["CarboVapt Parnamirim", "Parnamirim", "RN", true, 0, 0],
  ["CarboVapt Petrolina", "Petrolina", "PE", true, 0, 0],
  ["CarboVapt Feira de Santana", "Feira de Santana", "BA", false, 0, 0],
];
const rankingLic = () => LOJAS_LIC.map(([name, city, state, active, services, revenue], i) => ({ loja_id: `lj${i + 1}`, name, city, state, active, services, revenue }));
const totServ = LOJAS_LIC.reduce((s, l) => s + l[4], 0);
const totRec = LOJAS_LIC.reduce((s, l) => s + l[5], 0);
const licKpis = (a: Record<string, unknown>) => [ehPeriodoAnterior(a)
  ? { total_lojas: 13, active_lojas: 11, total_services: 141, total_revenue: 115300 }
  : { total_lojas: 13, active_lojas: 12, total_services: totServ, total_revenue: totRec }];
const licSerie = (a: Record<string, unknown>) => {
  const dias: string[] = [];
  for (let d = new Date(String(a.p_from ?? `${INICIO_MES}T03:00:00Z`)); diaLocal(d) <= diaLocal(AGORA); d.setDate(d.getDate() + 1)) dias.push(diaLocal(d));
  semente = 9001;
  const pesos = dias.map(() => 0.5 + rnd());
  const soma = pesos.reduce((s, x) => s + x, 0);
  const serv = pesos.map((x) => Math.floor((x / soma) * totServ));
  let sobra = totServ - serv.reduce((s, x) => s + x, 0);
  for (let i = 0; sobra > 0; i = (i + 3) % serv.length, sobra--) serv[i]++;
  return dias.map((day, i) => ({ day, total_services: serv[i], revenue: Math.round((serv[i] * totRec) / totServ) }));
};
const recentes = () => [
  ["CarboVapt Natal Zona Sul", "G", "diesel", 1400, 0], ["CarboVapt Recife Imbiribeira", "M", "flex", 700, 0],
  ["CarboVapt João Pessoa BR-230", "G", "diesel", 1400, 1], ["CarboVapt Fortaleza Maracanaú", "M", "flex", 700, 1],
  ["CarboVapt Natal Zona Sul", "M", "diesel", 700, 1], ["CarboVapt Caruaru Polo", "G", "diesel", 1400, 2],
  ["CarboVapt Mossoró Centro", "P", "flex", 700, 2], ["CarboVapt Salvador Porto Seco", "G", "diesel", 1400, 3],
].map(([loja_name, porte, fuel_type, total_value, d], i) => ({ service_id: `sv${i}`, loja_name, city: null, state: null, porte, fuel_type, total_value, performed_at: isoAtras(d as number, 10 + i) }));

// ── Suprimentos (Hub Natal) ─────────────────────────────────────────────────
const WH = { id: "wh-rn", code: "HUB-RN", name: "Hub Natal", is_active: true };
// [id, nome, código, categoria, custo, preço, mínimo, unidade, estoque, saída média/dia (0 = parado)]
const SUP: [string, string, string, string, number, number | null, number, string, number, number][] = [
  ["p1", "CarboZé 100ml", "CZ100", "Produto Final", 4.2, 15.6, 2000, "un", 1450, 95],
  ["p2", "CarboZé 1 Litro", "CZ1L", "Produto Final", 31.5, 89.9, 150, "un", 310, 4],
  ["p3", "CarboZé Sachê 10ml", "CARB-SACH-10ML", "Produto Final", 0.95, 4.9, 3000, "un", 2380, 70],
  ["ppro", "CarboPRO 100ml", "CPRO100", "Produto Final", 5.8, 18.9, 400, "un", 820, 12],
  ["semi1", "Concentrado CarboZé (granel)", "SEMI-CZ", "Semi-acabado", 0.028, null, 50000, "mL", 186000, 9800],
  ["ins1", "Aditivo base A", "INS-ADA", "Insumo", 42, null, 40, "L", 96, 1.6],
  ["ins2", "Solvente parafínico", "INS-SOLV", "Insumo", 11.5, null, 120, "L", 410, 3.1],
  ["ins3", "Fragrância cítrica", "INS-FRAG", "Insumo", 0, null, 0, "L", 18, 0.2],
  ["emb1", "Frasco PET 100ml", "EMB-FR100", "Embalagem", 0.62, null, 3000, "un", 5400, 105],
  ["emb2", "Tampa 28mm", "EMB-TP28", "Embalagem", 0.11, null, 3000, "un", 0, 100],
  ["emb3", "Rótulo 100ml", "EMB-RT100", "Embalagem", 0.09, null, 3000, "un", 7800, 100],
  ["emb4", "Frasco 1 Litro", "EMB-FR1L", "Embalagem", 2.4, null, 100, "un", 260, 4],
  ["emb5", "Filme de sachê 10ml", "EMB-SACH", "Embalagem", 0.07, null, 4000, "un", 9100, 70],
  ["emb6", "Caixa master 50 un", "EMB-CX50", "Embalagem", 3.1, null, 60, "un", 1450, 2.5],
  ["car1", "Cilindro de CO₂ 25kg", "CARB-CO2", "Carbonatação", 310, null, 2, "un", 3, 0.03],
  ["tm1", "Display de balcão acrílico", "TM-DISP", "Trade Marketing", 38, null, 0, "un", 140, 0],
  ["tm2", "Banner 80×120", "TM-BANNER", "Trade Marketing", 0, null, 0, "un", 60, 0],
  ["tm3", "Régua de gôndola", "TM-REGUA", "Trade Marketing", 6.5, null, 0, "un", 900, 0],
];
const supProdutos = () => SUP.map(([id, name, product_code, category, unit_cost, sale_price, safety_stock_qty, stock_unit]) =>
  ({ id, name, product_code, category, unit_cost, sale_price, safety_stock_qty, stock_unit, is_active: true }));
const supEstoque = () => SUP.map(([id, , , , , , , , qtd], i) => ({ id: `ws${i}`, product_id: id, quantity: qtd, warehouse_id: WH.id, warehouse: WH }));
const supMinimos = () => [
  { product_id: "p1", warehouse_id: WH.id, min_qty: 2000, warehouse: { code: "HUB-RN" } },
  { product_id: "emb2", warehouse_id: WH.id, min_qty: 3000, warehouse: { code: "HUB-RN" } },
];
const supMov = () => {
  semente = 3131;
  const out: Record<string, unknown>[] = [];
  // ⚠️ Menos de 1.000 linhas: o mock ignora `.range()`, e o `lerSemTeto` relê
  // para sempre uma resposta com 1.000 ou mais (a tela fica no esqueleto).
  for (let d = 89; d >= 0; d--) {
    for (const [id, , , cat, , , , , , saida] of SUP) {
      if (!saida) continue;
      if (d % 3 !== 0 && saida >= 1) continue;
      const q = saida >= 1 ? Math.max(0, Math.round(3 * saida * (0.6 + rnd() * 0.8))) : (rnd() < saida * 3 ? 1 : 0);
      if (q > 0) out.push({ id: `mv-${id}-${d}`, product_id: id, warehouse_id: WH.id, tipo: "saida", quantidade: q, created_at: isoAtras(d, 16), warehouse: { code: "HUB-RN" } });
      // Produção/compra entra em lotes.
      if (d % (cat === "Produto Final" ? 6 : 15) === 3) {
        const lote = Math.round((saida >= 1 ? saida : 1) * (cat === "Produto Final" ? 6 : 15) * (d < 20 ? 1.25 : 0.95));
        out.push({ id: `me-${id}-${d}`, product_id: id, warehouse_id: WH.id, tipo: "entrada", quantidade: lote, created_at: isoAtras(d, 9), warehouse: { code: "HUB-RN" } });
      }
    }
  }
  return out;
};
const supTransf = () => [
  { id: "tr1", status: "em_transito", created_at: isoAtras(4), product_id: "p1", quantity: 600 },
  { id: "tr2", status: "confirmado", created_at: isoAtras(20), product_id: "p3", quantity: 1200 },
];
const supBom = () => [
  { product_id: "p1", insumo_id: "semi1", quantity_per_unit: 100 },
  { product_id: "p1", insumo_id: "emb1", quantity_per_unit: 1 },
  { product_id: "p1", insumo_id: "emb2", quantity_per_unit: 1 },
  { product_id: "p1", insumo_id: "emb3", quantity_per_unit: 1 },
  { product_id: "p2", insumo_id: "semi1", quantity_per_unit: 1000 },
  { product_id: "p2", insumo_id: "emb4", quantity_per_unit: 1 },
  { product_id: "p2", insumo_id: "emb2", quantity_per_unit: 1 },
  { product_id: "p3", insumo_id: "semi1", quantity_per_unit: 10 },
  { product_id: "p3", insumo_id: "emb5", quantity_per_unit: 1 },
  { product_id: "ppro", insumo_id: "ins1", quantity_per_unit: 0.012 },
  { product_id: "ppro", insumo_id: "ins2", quantity_per_unit: 0.085 },
  { product_id: "ppro", insumo_id: "ins3", quantity_per_unit: 0.003 },
  { product_id: "ppro", insumo_id: "emb1", quantity_per_unit: 1 },
  { product_id: "ppro", insumo_id: "emb2", quantity_per_unit: 1 },
  { product_id: "semi1", insumo_id: "ins1", quantity_per_unit: 0.0004 },
  { product_id: "semi1", insumo_id: "ins2", quantity_per_unit: 0.0008 },
];
const supSnap = () => [
  { snapshot_date: diaLocal(diasAtras(14)), valor_total: 52800, risco_valor: 2100, produtos_ativos: 18, produtos_com_custo: 15 },
  { snapshot_date: diaLocal(diasAtras(8)), valor_total: 55100, risco_valor: 2900, produtos_ativos: 18, produtos_com_custo: 15 },
  { snapshot_date: diaLocal(diasAtras(1)), valor_total: 57000, risco_valor: 3300, produtos_ativos: 18, produtos_com_custo: 16 },
];

// ── Configurar Metas ────────────────────────────────────────────────────────
const vendasMes = () => {
  const ped = (id: string, vendedor: { id: string }, dia: number, total: number) => ({
    id, vendedor_id: vendedor.id, total, items: [{ quantity: Math.round(total / 13) }], status: "invoiced",
    created_at: `${MES}-${String(dia).padStart(2, "0")}T13:00:00.000Z`, sale_date: `${MES}-${String(dia).padStart(2, "0")}`,
  });
  const out = [];
  const plano: [{ id: string }, number[]][] = [
    [U.colab, [4200, 6100, 3900, 8800, 5600, 2600]],
    [U.vend2, [9100, 7400, 6900, 8300, 4700]],
    [U.closer, [3100, 5200, 2900]],
    [U.gestor, [6200]],
  ];
  for (const [v, totais] of plano) totais.forEach((t, i) => out.push(ped(`cm-${v.id}-${i}`, v, Math.min(2 + i * 4, AGORA.getDate()), t)));
  return out;
};
const metasDefault = () => [
  { id: "sd1", vendedor_id: U.colab.id, target_amount: 40000, target_qty: 0, linha: null },
  { id: "sd2", vendedor_id: U.vend2.id, target_amount: 35000, target_qty: 0, linha: null },
  { id: "sd3", vendedor_id: U.closer.id, target_amount: 30000, target_qty: 0, linha: null },
];
const metasMes = () => [
  { id: "st1", vendedor_id: U.vend2.id, month: INICIO_MES, target_amount: 45000, target_qty: 0, linha: null, created_at: isoAtras(20), updated_at: isoAtras(20),
    vendedor: { id: U.vend2.id, full_name: U.vend2.full_name, avatar_url: U.vend2.avatar_url, department: "command", secondary_department: null } },
];
const canalMetas = () => [
  { ano: AGORA.getFullYear(), mes: AGORA.getMonth() + 1, canal: "revenda", valor: 150000 },
  { ano: AGORA.getFullYear(), mes: AGORA.getMonth() + 1, canal: "online", valor: 120000 },
];
const PLATS: [string, number, number][] = [
  ["mercadolivre", 35000, 27400], ["mercadolivre_full", 15000, 9800], ["nuvemshop", 40000, 31900],
  ["amazon", 8000, 6100], ["shopee", 0, 2300], ["payt", 20000, 17600],
];
const metaEcom = () => PLATS.filter(([, m]) => m > 0).map(([platform, target_amount], i) => ({
  id: `me${i}`, month: INICIO_MES, platform, target_amount, created_by: U.gestor.id, created_at: isoAtras(25), updated_at: isoAtras(25),
}));
const pedidosEcom = () => PLATS.map(([platform, , real], i) => ({
  id: `eo${i}`, platform, order_id: `CFG-${i}`, total: real, status: "paid", ordered_at: isoAtras(3),
}));

export const FX: Record<string, unknown> = {
  mapa_conquista: mapaConquista,
  warehouse_stock: porRota("warehouse_stock", supEstoque),
  ops_stock_min: porRota("ops_stock_min", supMinimos),
  stock_movements: porRota("stock_movements", supMov),
  stock_transfers: porRota("stock_transfers", supTransf),
  mrp_bom: porRota("mrp_bom", supBom),
  suprimentos_snapshots: supSnap,
  mrp_products: porRota("mrp_products", () => (rota().startsWith("/suprimentos") ? supProdutos() : produtos), () => produtos),
  sales_targets: porRota("sales_targets", metasMes),
  sales_target_defaults: porRota("sales_target_defaults", metasDefault),
  canal_metas: porRota("canal_metas", canalMetas),
  carboze_orders: porRota("carboze_orders", vendasMes, () => [...pedidosEdit, ...vendas(PAPEL)]),
  meta_ecommerce: porRota("meta_ecommerce", metaEcom),
  ecommerce_orders: porRota("ecommerce_orders", pedidosEcom),
};

export const RPC_FX: Record<string, unknown> = {
  admin_get_global_kpis: lojasKpis,
  get_scoped_sales_timeseries: lojasSerie,
  get_global_kpis: licKpis,
  get_global_licensee_ranking: rankingLic,
  admin_get_porte_breakdown: () => [{ porte: "P", total: 9 }, { porte: "M", total: 71 }, { porte: "G", total: 64 }],
  admin_get_licensees_kpis: () => [{ avg_ticket: r2(totRec / totServ) }],
  admin_get_licensees_timeseries: licSerie,
  get_global_recent_services: recentes,
};
