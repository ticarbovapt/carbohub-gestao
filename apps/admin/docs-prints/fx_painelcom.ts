// Fixtures da área "painelcom" (ver areas.ts): Dashboard Comercial, Dados
// Comerciais (fonte), Aprovações (desconto e fabricação) e Tabela de preços.
// Tudo FICTÍCIO — clientes, pedidos e notas são inventados (gerador
// determinístico, datas relativas a hoje).
//
// ⚠️ `carbo_vendas_metrica`, `carboze_orders`, `mrp_products`,
// `ecommerce_orders` e `sku_product_mappings` também são lidas por outras
// áreas: aqui elas só respondem com os dados desta área NAS ROTAS desta área
// (/comercial/...); fora delas, devolvem o que as outras declararam ou a base.
import { PAPEL, U, EU } from "./pessoas";
import { vendas } from "./fx_vendas";
import { pedidosEdit } from "./fx_vender";
import * as comercial from "./fx_comercial";
import * as ecommerce from "./fx_ecommerce";
import * as esteira from "./fx_esteira";
void EU;

const OUTRAS = [comercial, ecommerce, esteira] as { FX?: Record<string, unknown> }[];
const rota = () => { try { return location.pathname; } catch { return ""; } };
const NOSSAS = ["/painel-comercial", "/dados-comerciais", "/aprovacoes", "/tabela-de-precos"];
const naNossa = () => NOSSAS.some((r) => rota().startsWith(r));
const em = (r: string) => rota().startsWith(r);
const resolve = (v: unknown) => (typeof v === "function" ? (v as () => unknown)() : v);
const porRota = (chave: string, meu: () => unknown, padrao: () => unknown = () => []) => () => {
  if (naNossa()) return meu();
  for (const a of [...OUTRAS].reverse()) if (a.FX && chave in a.FX) return resolve(a.FX[chave]);
  return padrao();
};

// ── Utilidades ──────────────────────────────────────────────────────────────
let semente = 7341;
const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const pad = (n: number) => String(n).padStart(2, "0");
const HOJE = new Date();
const diaIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const r2 = (v: number) => Math.round(v * 100) / 100;
const minAtras = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const diasAtras = (d: number) => minAtras(d * 1440);
const diaFuturo = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return diaIso(x); };

// ── Catálogo (Tabela de preços e o "por produto" do Dashboard) ──────────────
const atual = (d: number) => ({ sale_price_updated_at: diasAtras(d), sale_price_updated_by: U.gestor.id });
const PF = { stock_unit: "un", is_active: true, category: "Produto Final", bonificacao_de: null, preco_de: null, faixa_preco: null, aparece_no_vender: true };
export const CATALOGO = [
  { ...PF, ...atual(40), id: "p1", name: "CarboZé 100ml", product_code: "CZ100", sale_price: 15.6 },
  { ...PF, ...atual(26), id: "p1pdv", name: "CarboZé 100ml - PDV", product_code: "CZ100-PDV", sale_price: 13, preco_de: "p1", faixa_preco: "pdv" },
  { ...PF, ...atual(26), id: "p1md", name: "CarboZé 100ml - Microdistribuidor", product_code: "CZ100-MD", sale_price: 11.5, preco_de: "p1", faixa_preco: "micro" },
  { ...PF, ...atual(40), id: "p1bon", name: "CarboZé 100ml - bonificação", product_code: "CZ100-BON", sale_price: 15.6, bonificacao_de: "p1" },
  { ...PF, ...atual(60), id: "p2", name: "CarboZé 1 Litro", product_code: "CZ1L", sale_price: 89.9 },
  { ...PF, sale_price_updated_at: null, sale_price_updated_by: null, id: "p2pdv", name: "CarboZé 1 Litro - PDV", product_code: "CZ1L-PDV", sale_price: null, preco_de: "p2", faixa_preco: "pdv" },
  { ...PF, ...atual(60), id: "p2bon", name: "CarboZé 1 Litro - bonificação", product_code: "CZ1L-BON", sale_price: 89.9, bonificacao_de: "p2", aparece_no_vender: false },
  { ...PF, ...atual(75), id: "p3", name: "CarboZé Sachê 10ml", product_code: "CARB-SACH-10ML", sale_price: 4.9 },
  { ...PF, ...atual(75), id: "p3bon", name: "CarboZé Sachê 10ml - bonificação", product_code: "CARB-SACH-BON", sale_price: 4.9, bonificacao_de: "p3", aparece_no_vender: false },
  { ...PF, ...atual(90), id: "pkit", name: "CarboZé Kit 10 Sachês 10ml", product_code: "KIT-CARB-SACH-10ML", sale_price: 119.6, aparece_no_vender: false },
  { ...PF, ...atual(12), id: "p4", name: "CarboPRO 100ml", product_code: "CPRO100", sale_price: 133.68 },
  { ...PF, ...atual(12), id: "p4bon", name: "CarboPRO 100ml - bonificação", product_code: "CPRO100-BON", sale_price: 133.68, bonificacao_de: "p4" },
];
const MAPAS = [
  { id: "m1", platform_sku: "124", platform: null, product_id: "p1", unidades_por_venda: 5, display_units_per_pack: 5, units_per_kit: 5, is_active: true },
  { id: "m2", platform_sku: "120", platform: null, product_id: "pkit", unidades_por_venda: 1, display_units_per_pack: 10, units_per_kit: 10, is_active: true },
];

// ── Pedidos (carbo_vendas_metrica) — 12 meses ───────────────────────────────
const VENDEDORES = [U.colab, U.vend2, U.closer];
const B2B = [
  ["Transportadora Litoral Ltda", "11.222.333/0001-44"], ["Construtora Horizonte", "22.333.444/0001-55"],
  ["Frota Nordeste Logística", "33.444.555/0001-66"], ["Agro Vale do Açu", "44.555.666/0001-77"],
  ["Cooperativa Rota Sul", "55.666.777/0001-88"],
];
const PDV = [
  ["Posto Boa Viagem Ltda", "12.345.678/0001-90"], ["Rede Litoral Combustíveis", "23.456.789/0001-01"],
  ["Auto Posto Estrela", "34.567.890/0001-12"], ["Posto Caminho do Sol", "45.678.901/0001-23"],
  ["Posto Serra Verde", "56.789.012/0001-34"], ["Posto Rota 101", "67.890.123/0001-45"],
];
const PESSOAS = ["Carla Mendes", "Thiago Rocha", "Juliana Prado", "Felipe Duarte", "Larissa Gomes", "Marcos Vieira", "Beatriz Lins", "Rodrigo Sales"];

type Pedido = Record<string, unknown> & { id: string; total: number; data_efetiva: string; segmento: string | null; conta_metrica: boolean };
let numNf = 380, numPed = 0;
const it = (name: string, product_code: string, product_id: string, quantity: number, unit_price: number, extra: Record<string, unknown> = {}) =>
  ({ name, product_code, product_id, quantity, unit_price, total: r2(quantity * unit_price), bonus_quantity: 0, kind: null, ...extra });

function gerarPedidos(): Pedido[] {
  semente = 7341; numNf = 380; numPed = 0;
  const out: Pedido[] = [];
  for (let i = 11; i >= 0; i--) {
    const base = new Date(HOJE.getFullYear(), HOJE.getMonth() - i, 1);
    const diasNoMes = i === 0 ? Math.max(1, HOJE.getDate() - 1) : new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const nInternos = 3 + Math.round((11 - i) / 2.2);
    const nOnline = 2 + Math.round((11 - i) / 3);
    const ym = `${base.getFullYear()}${pad(base.getMonth() + 1)}`;
    const mk = (seg: string | null, extra: Record<string, unknown>) => {
      const d = new Date(base.getFullYear(), base.getMonth(), 1 + Math.floor(rnd() * diasNoMes), 9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60));
      numPed++;
      const id = `cv${numPed}`;
      const p: Pedido = {
        id, order_number: `V${ym}${String(numPed).padStart(4, "0")}`,
        created_at: d.toISOString(), sale_date: diaIso(d), data_efetiva: diaIso(d),
        segmento: seg, status: "delivered", excluir_metricas: false, external_ref: null, origem_override: null,
        conta_metrica: true, motivo_fora: null, nf_valida: true, nf_situacao: "Autorizada", total: 0, ...extra,
      } as Pedido;
      if (p.conta_metrica && !extra.nf_numero) { numNf++; p.nf_numero = `000${numNf}`; p.bling_nf_id = numNf; }
      out.push(p);
      return p;
    };
    for (let k = 0; k < nInternos; k++) {
      const ehB2B = rnd() < 0.45;
      const lista = ehB2B ? B2B : PDV;
      const idx = Math.floor(rnd() * lista.length);
      const [nome, cnpj] = lista[idx];
      // Cada cliente tem um dono (o vendedor da carteira); de vez em quando outro vende.
      const v = VENDEDORES[(idx + (ehB2B ? 1 : 0) + (rnd() < 0.12 ? 1 : 0)) % VENDEDORES.length];
      const itens = ehB2B
        ? [it("CarboZé 1 Litro", "CZ1L", "p2", 12 + Math.floor(rnd() * 60), 89.9)]
        : [it("CarboZé 100ml - PDV", "CZ100-PDV", "p1pdv", 60 + Math.floor(rnd() * 240), 13)];
      if (!ehB2B && rnd() < 0.35) itens.push(it("CarboZé 100ml - bonificação", "CZ100-BON", "p1bon", 10, 15.6, { total: 0, is_bonificacao: true }));
      if (rnd() < 0.3) itens.push(it("CarboZé Sachê 10ml", "CARB-SACH-10ML", "p3", 50 + Math.floor(rnd() * 150), 4.9));
      const total = r2(itens.reduce((s, x) => s + (x.total as number), 0));
      mk(ehB2B ? "consumo" : "revenda", {
        customer_name: nome, cnpj, vendedor_id: v.id, vendedor_name: v.full_name, items: itens, total,
        status: i === 0 && k === 0 ? "invoiced" : "delivered",
        external_ref: rnd() < 0.5 ? `bling-${5000 + numPed}` : null,
      });
    }
    for (let k = 0; k < nOnline; k++) {
      const nome = PESSOAS[Math.floor(rnd() * PESSOAS.length)];
      const total = rnd() < 0.6 ? 149.5 : 269.1;
      mk("online", {
        order_number: `BLING2-${800 + numPed}`, customer_name: nome, cnpj: `${100 + numPed}.456.789-0${numPed % 10}`,
        vendedor_id: null, vendedor_name: null, total, items: [it("CarboZé Kit 5 Frascos 100ml", "CZ100", "p1", 5, total / 5)],
        external_ref: `bling2-${9000 + numPed}`,
      });
    }
  }
  // Casos que NÃO contam (no mês atual, para aparecerem no topo da lista).
  const d = (dd: number) => { const x = new Date(HOJE); x.setDate(Math.max(1, x.getDate() - dd)); return x; };
  const fora = (dd: number, extra: Record<string, unknown>) => {
    numPed++;
    const x = d(dd);
    out.push({
      id: `cv${numPed}`, order_number: `V${x.getFullYear()}${pad(x.getMonth() + 1)}${String(numPed).padStart(4, "0")}`,
      created_at: x.toISOString(), sale_date: diaIso(x), data_efetiva: diaIso(x), segmento: "revenda",
      excluir_metricas: false, external_ref: null, origem_override: null, conta_metrica: false,
      nf_valida: false, nf_situacao: null, nf_numero: null, bling_nf_id: null, ...extra,
    } as Pedido);
  };
  fora(1, { customer_name: "Rede Litoral Combustíveis", cnpj: "23.456.789/0001-01", vendedor_id: U.vend2.id, vendedor_name: U.vend2.full_name, status: "pending", motivo_fora: "aguardando_nf", total: 3090, items: [it("CarboZé 100ml - PDV", "CZ100-PDV", "p1pdv", 200, 13), it("CarboZé Sachê 10ml", "CARB-SACH-10ML", "p3", 100, 4.9)] });
  fora(2, { customer_name: "Auto Posto Estrela", cnpj: "34.567.890/0001-12", vendedor_id: U.colab.id, vendedor_name: U.colab.full_name, status: "quote", motivo_fora: "orcamento", total: 780, items: [] });
  fora(3, { customer_name: "Posto Serra Verde", cnpj: "56.789.012/0001-34", vendedor_id: U.closer.id, vendedor_name: U.closer.full_name, status: "invoiced", motivo_fora: "nf_invalida", nf_numero: "000377", nf_situacao: "Cancelada", total: 1040, items: [] });
  fora(4, { customer_name: "Posto Boa Viagem Ltda", cnpj: "12.345.678/0001-90", vendedor_id: U.colab.id, vendedor_name: U.colab.full_name, status: "delivered", motivo_fora: "bonificacao", nf_numero: "000379", nf_situacao: "Autorizada", nf_valida: true, total: 208.8, items: [] });
  fora(5, { customer_name: "Construtora Horizonte", cnpj: "22.333.444/0001-55", segmento: null, vendedor_id: U.vend2.id, vendedor_name: U.vend2.full_name, status: "cancelled", motivo_fora: "cancelado", total: 2697, items: [] });
  // Uma entrega agendada para o mês que vem (aparece "fora da conta").
  numPed++;
  out.push({ id: `cv${numPed}`, order_number: "V2026110001", created_at: minAtras(600), sale_date: diaFuturo(20), data_efetiva: diaFuturo(20), segmento: "consumo",
    customer_name: "Cooperativa Rota Sul", cnpj: "55.666.777/0001-88", vendedor_id: U.closer.id, vendedor_name: U.closer.full_name,
    status: "pending", motivo_fora: "aguardando_nf", conta_metrica: false, total: 4495, items: [], nf_valida: false, excluir_metricas: false } as Pedido);
  // Um pedido que ainda não teve o canal classificado.
  const semCanal = out.find((p) => p.segmento === "consumo" && p.conta_metrica && String(p.data_efetiva) < diaIso(new Date(HOJE.getFullYear(), HOJE.getMonth() - 1, 1)));
  if (semCanal) semCanal.segmento = null;
  // Dois nomes para o MESMO CNPJ (o aviso "2 nomes diferentes no mesmo doc").
  const alvo = out.find((p) => p.customer_name === "Posto Rota 101" && p.conta_metrica);
  if (alvo) alvo.customer_name = "Posto Rota 101 Combustíveis";
  return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}
const PEDIDOS = gerarPedidos();

// ── NFS-e (CarboVAPT) — a partir de janeiro do ano corrente ─────────────────
const TOMADORES = [
  ["Transportadora Litoral Ltda", "11222333000144"], ["Frota Nordeste Logística", "33444555000166"],
  ["Expresso Potiguar", "77888999000100"], ["Viação Sertaneja", "88999000000111"], ["Locadora Sol Nascente", "66777888000199"],
];
function gerarNfse() {
  semente = 991;
  const out: Record<string, unknown>[] = [];
  let nsu = 100, numero = 140;
  const ano = HOJE.getFullYear();
  for (let m = 0; m <= HOJE.getMonth(); m++) {
    const n = 2 + Math.round(m / 2);
    for (let k = 0; k < n; k++) {
      const dia = m === HOJE.getMonth() ? 1 + Math.floor(rnd() * Math.max(1, HOJE.getDate() - 2)) : 1 + Math.floor(rnd() * 27);
      const [nome, doc] = TOMADORES[Math.floor(rnd() * TOMADORES.length)];
      const veiculos = 1 + Math.floor(rnd() * 6);
      out.push({ nsu: nsu++, chave_acesso: `2408102${nsu}000000000000000000000000000`, numero: String(numero++), papel: "emitida",
        toma_nome: nome, toma_doc: doc, cancelada: false, emitida_em: `${ano}-${pad(m + 1)}-${pad(dia)}T14:00:00-03:00`,
        valor_liquido: veiculos * (rnd() < 0.7 ? 700 : 1400), serv_cod_nacional: "14.01.01" });
    }
  }
  const ult = out[out.length - 1] as Record<string, unknown>;
  out.push({ ...ult, nsu: nsu++, numero: String(numero++), cancelada: true, valor_liquido: 2100 });
  out.push({ ...ult, nsu: nsu++, numero: String(numero++), serv_cod_nacional: "17.01.01", toma_nome: "Agro Vale do Açu", toma_doc: "44555666000177", valor_liquido: 450 });
  return out.sort((a, b) => String(b.emitida_em).localeCompare(String(a.emitida_em)));
}
const NFSE = gerarNfse();

// ── Vendas on-line (para "Unidades · On-line") ──────────────────────────────
function gerarOnline() {
  semente = 55;
  const out: Record<string, unknown>[] = [];
  for (let k = 0; k < 40; k++) {
    const kit = rnd() < 0.3;
    const q = rnd() < 0.85 ? 1 : 2;
    out.push({ id: `eo${k}`, platform: ["nuvemshop", "mercadolivre", "payt", "amazon"][k % 4], order_id: `${7000 + k}-1`,
      product_sku: kit ? "120" : "124", product_name: kit ? "Kit 10 Sachês CarboZé" : "CarboZé Kit 5 Frascos 100ml",
      quantity: q, units_real: q * (kit ? 10 : 5), total: q * (kit ? 119.6 : 149.5), status: "paid",
      ordered_at: diasAtras(Math.floor(rnd() * 330)) });
  }
  out.push({ id: "eo-x", platform: "shopee", order_id: "9001-1", product_sku: null, product_name: "CarboZé 100ml anúncio novo", quantity: 2, units_real: 2, total: 299, status: "paid", ordered_at: diasAtras(8) });
  return out;
}
const ONLINE = gerarOnline();

// ── Aprovações (carboze_orders na rota /aprovacoes) ─────────────────
const A = { production_approval_status: "auto_approved", agreed_delivery_date: null, ppf_date: null, ppe_date: null, delivery_lead_business_days: null, delivery_below_minimum: false, production_approver_id: null, production_approver_notes: null, production_approved_at: null };
const D = { discount_percent: 2, discount_reason: null, discount_approval_status: "auto_approved", discount_approval_tier: "auto", discount_approver_id: null, discount_approver_notes: null, discount_approved_at: null };
const ped = (o: Record<string, unknown>) => {
  const discount = (o.discount as number | undefined) ?? r2(((o.subtotal as number) * (o.discount_percent as number)) / 100);
  return { status: "pending", ...o, discount, total: r2((o.subtotal as number) - discount) };
};
const APROVACOES = [
  ped({ ...A, id: "ap1", order_number: "V2026100094", customer_name: "Rede Litoral Combustíveis", vendedor_name: U.vend2.full_name, created_at: minAtras(45),
    subtotal: 5200, discount: 624, discount_percent: 12, discount_reason: "Rede com 4 postos — fechando contrato de recompra mensal.", discount_approval_status: "pending", discount_approval_tier: "gestor", discount_approver_id: null, discount_approver_notes: null, discount_approved_at: null }),
  ped({ ...A, id: "ap2", order_number: "V2026100091", customer_name: "Frota Nordeste Logística", vendedor_name: U.colab.full_name, created_at: minAtras(200),
    subtotal: 10788, discount: 1941.84, discount_percent: 18, discount_reason: "Concorrente ofereceu preço menor; cliente compra 120 litros por mês.", discount_approval_status: "pending", discount_approval_tier: "ceo", discount_approver_id: null, discount_approver_notes: null, discount_approved_at: null }),
  ped({ ...A, id: "ap3", order_number: "V2026100082", customer_name: "Posto Caminho do Sol", vendedor_name: U.closer.full_name, created_at: diasAtras(3),
    subtotal: 2400, discount: 192, discount_percent: 8, discount_reason: "Primeira compra.", discount_approval_status: "approved", discount_approval_tier: "gestor", discount_approver_id: U.gestor.id, discount_approver_notes: "Ok para a primeira compra.", discount_approved_at: diasAtras(2) }),
  ped({ ...A, id: "ap4", order_number: "V2026100077", customer_name: "Posto Serra Verde", vendedor_name: U.vend2.full_name, created_at: diasAtras(5),
    subtotal: 1560, discount: 312, discount_percent: 20, discount_reason: "Cliente pediu.", discount_approval_status: "rejected", discount_approval_tier: "ceo", discount_approver_id: U.gestor.id, discount_approver_notes: "Sem justificativa de volume.", discount_approved_at: diasAtras(4) }),
  ped({ ...A, id: "ap5", order_number: "V2026100071", customer_name: "Posto Boa Viagem Ltda", vendedor_name: U.colab.full_name, created_at: diasAtras(6),
    subtotal: 1560, discount: 46.8, discount_percent: 3, discount_reason: null, discount_approval_status: "auto_approved", discount_approval_tier: "auto" }),
  // Fabricação
  ped({ ...D, id: "fb1", order_number: "V2026100096", customer_name: "Construtora Horizonte", vendedor_name: U.closer.full_name, created_at: minAtras(90), subtotal: 4495,
    agreed_delivery_date: diaFuturo(3), ppf_date: diaFuturo(1), ppe_date: diaFuturo(2), delivery_lead_business_days: 1, delivery_below_minimum: true,
    production_approval_status: "pending", production_approver_id: null, production_approver_notes: null, production_approved_at: null }),
  ped({ ...D, id: "fb2", order_number: "V2026100093", customer_name: "Agro Vale do Açu", vendedor_name: U.vend2.full_name, created_at: minAtras(300), subtotal: 2697,
    agreed_delivery_date: diaFuturo(4), ppf_date: diaFuturo(2), ppe_date: diaFuturo(3), delivery_lead_business_days: 2, delivery_below_minimum: true,
    production_approval_status: "pending", production_approver_id: null, production_approver_notes: null, production_approved_at: null }),
  ped({ ...D, id: "fb3", order_number: "V2026100080", customer_name: "Transportadora Litoral Ltda", vendedor_name: U.colab.full_name, created_at: diasAtras(4), subtotal: 5394,
    agreed_delivery_date: diaFuturo(1), ppf_date: diasAtras(1).slice(0, 10), ppe_date: diaIso(HOJE), delivery_lead_business_days: 2, delivery_below_minimum: true,
    production_approval_status: "approved", production_approver_id: U.gestor.id, production_approver_notes: "Produção avisada, cabe na linha de quinta.", production_approved_at: diasAtras(3) }),
];

// ── Séries auxiliares ───────────────────────────────────────────────────────
const SERIE_PDV = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(HOJE.getFullYear(), HOJE.getMonth() - (11 - i), 1);
  const base = 38 + i * 3 + (i > 8 ? 2 : 0);
  return { mes: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, base, novos: i === 0 ? 2 : 3 + (i > 8 ? 2 : 0), ativos: 14 + i * 2 };
});
const ANO = HOJE.getFullYear();
const METAS_CANAL = [
  ...Array.from({ length: 12 }, (_, i) => ({ ano: ANO, mes: i + 1, canal: "revenda", valor: 18000 })),
  ...Array.from({ length: 6 }, (_, i) => ({ ano: ANO, mes: i + 7, canal: "online", valor: 4000 })),
];
const METAS_VENDEDOR = Array.from({ length: 12 }, (_, i) =>
  VENDEDORES.map((v, k) => ({ vendedor_id: v.id, mes: i + 1, target_amount: 9000 + k * 2000 + i * 400 }))).flat();

// ── Carboze_orders: por rota ────────────────────────────────────────────────
const carbozeOrders = () => {
  if (em("/aprovacoes")) return APROVACOES;
  if (naNossa()) return PEDIDOS.map((p) => ({ id: p.id, customer_doc: p.cnpj }));
  for (const a of [...OUTRAS].reverse()) if (a.FX && "carboze_orders" in a.FX) return resolve(a.FX.carboze_orders);
  return [...pedidosEdit, ...vendas(PAPEL)];
};

export const FX: Record<string, unknown> = {
  carbo_vendas_metrica: porRota("carbo_vendas_metrica", () => PEDIDOS, () => vendas(PAPEL)),
  carboze_orders: carbozeOrders,
  mrp_products: porRota("mrp_products", () => CATALOGO),
  ecommerce_orders: porRota("ecommerce_orders", () => ONLINE),
  sku_product_mappings: porRota("sku_product_mappings", () => MAPAS),
  carbo_produto_alias: porRota("carbo_produto_alias", () => []),
  carbo_nfse_visao: porRota("carbo_nfse_visao", () => NFSE),
  carbo_pdvs_serie_mensal: porRota("carbo_pdvs_serie_mensal", () => SERIE_PDV),
  canal_metas: porRota("canal_metas", () => METAS_CANAL),
  // Um cliente já tem follow-up aberto (o botão vira "No follow-up").
  crm_sales_leads: porRota("crm_sales_leads", () => [{ id: "lf1", stage: "novo", funnel_type: "f10", cnpj: "11222333000144" }]),
};
export const RPC_FX: Record<string, unknown> = {
  crm_metas_resolvidas_ano: () => METAS_VENDEDOR,
  carbo_decide_discount: null,
  carbo_decide_production: null,
  carbo_preco_faixa_criar: null,
  carbo_produto_no_vender: null,
  carbo_set_product_price: null,
};
