// Fixtures da área "ecommerce" (ver areas.ts): Vendas Online, Acompanhamento
// de Metas e Anúncios da Meta. Tudo FICTÍCIO — pedidos, clientes, anúncios e
// contas são inventados (gerador determinístico, datas relativas a hoje).
//
// ⚠️ `mrp_products` é da base (fx_vender) e `ecommerce_orders` pode ser lida
// por outra área: cada tabela daqui só responde com os dados desta área NAS
// ROTAS desta área; fora delas, devolve o que as outras declararam (ou o padrão).
import { PAPEL, U, EU } from "./pessoas";
import { produtos } from "./fx_vender";
import * as comercial from "./fx_comercial";
void PAPEL; void U; void EU;

const OUTRAS = [comercial] as { FX?: Record<string, unknown> }[];
const rota = () => { try { return location.pathname; } catch { return ""; } };
const NOSSAS = ["/ecommerce/vendas-online", "/ecommerce/metas", "/ecommerce/anuncios"];
const naNossa = () => NOSSAS.some((r) => rota().startsWith(r));
const resolve = (v: unknown) => (typeof v === "function" ? (v as () => unknown)() : v);
const porRota = (chave: string, meu: () => unknown, padrao: () => unknown = () => []) => () => {
  if (naNossa()) return meu();
  for (const a of [...OUTRAS].reverse()) if (a.FX && chave in a.FX) return resolve(a.FX[chave]);
  return padrao();
};

// ── Utilidades ──────────────────────────────────────────────────────────────
let semente = 20261026;
const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const pad = (n: number) => String(n).padStart(2, "0");
const diaLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const AGORA = new Date();
const hojeMeiaNoite = new Date(AGORA.getFullYear(), AGORA.getMonth(), AGORA.getDate());
const r2 = (v: number) => Math.round(v * 100) / 100;

// ── Catálogo ────────────────────────────────────────────────────────────────
const KIT_SACHE = { id: "pkit", name: "CarboZé Kit 10 Sachês 10ml", product_code: "KIT-CARB-SACH-10ML", stock_unit: "un", sale_price: 119.6, bonificacao_de: null, preco_de: null, faixa_preco: null, aparece_no_vender: false, is_active: true, category: "Produto Final" };
const MAPAS = [
  { id: "m1", platform_sku: "124", platform: null, product_id: "p1", unidades_por_venda: 5, display_units_per_pack: 5, units_per_kit: 5, is_active: true },
  { id: "m2", platform_sku: "120", platform: null, product_id: "pkit", unidades_por_venda: 1, display_units_per_pack: 10, units_per_kit: 10, is_active: true },
];
const DISPLAY: Record<string, number> = { "124": 5, "120": 10 };

type Linha = {
  id: string; platform: string; order_id: string; product_sku: string | null; product_name: string;
  quantity: number; units_real: number; unit_price: number; total: number; status: string;
  ordered_at: string; platform_order_number: string | null;
};

// Pedidos por dia (média) e preço do kit em cada canal.
const CANAIS: Record<string, { taxa: number; p124: number; p120: number; mix120: number }> = {
  nuvemshop:         { taxa: 3.1, p124: 149.5, p120: 119.6, mix120: 0.3 },
  mercadolivre:      { taxa: 2.2, p124: 159.9, p120: 129.9, mix120: 0.25 },
  mercadolivre_full: { taxa: 1.2, p124: 159.9, p120: 129.9, mix120: 0.2 },
  amazon:            { taxa: 0.5, p124: 164.9, p120: 134.9, mix120: 0.2 },
  shopee:            { taxa: 0.7, p124: 154.9, p120: 124.9, mix120: 0.2 },
  payt:              { taxa: 1.1, p124: 149.5, p120: 119.6, mix120: 0.35 },
};
const DIAS = 88;

function statusPelaIdade(d: number): string {
  const x = rnd();
  if (d >= 9) return x < 0.07 ? "cancelled" : x < 0.11 ? "pending" : x < 0.15 ? "shipped" : "delivered";
  if (d >= 3) return x < 0.05 ? "cancelled" : x < 0.10 ? "pending" : x < 0.16 ? "paid" : x < 0.62 ? "shipped" : "delivered";
  return x < 0.05 ? "cancelled" : x < 0.24 ? "pending" : x < 0.78 ? "paid" : "shipped";
}

const PEDIDOS: Linha[] = (() => {
  const out: Linha[] = [];
  let n = 0;
  for (let d = DIAS - 1; d >= 0; d--) {
    for (const [plat, c] of Object.entries(CANAIS)) {
      // Fim de semana vende um pouco menos; o resto é ruído.
      const base = new Date(hojeMeiaNoite.getTime() - d * 864e5);
      const fds = base.getDay() === 0 || base.getDay() === 6 ? 0.75 : 1.05;
      let qtdPedidos = Math.floor(c.taxa * fds * (0.6 + rnd() * 0.8) + rnd());
      if (d === 0) qtdPedidos = Math.max(0, Math.round(qtdPedidos * (AGORA.getHours() / 24)));
      for (let k = 0; k < qtdPedidos; k++) {
        n++;
        const hora = d === 0 ? Math.floor(rnd() * Math.max(1, AGORA.getHours())) : 7 + Math.floor(rnd() * 16);
        const quando = new Date(base.getTime() + hora * 36e5 + Math.floor(rnd() * 60) * 6e4);
        const status = statusPelaIdade(d);
        const itens: string[] = rnd() < c.mix120 ? ["120"] : ["124"];
        if (plat === "nuvemshop" && rnd() < 0.12) itens.push(itens[0] === "124" ? "120" : "124");
        const raiz =
          plat === "nuvemshop" ? String(1700100000 + n)
          : plat === "mercadolivre" || plat === "mercadolivre_full" ? String(2000014700000000 + n)
          : plat === "amazon" ? `702-${String(4100000 + n * 37).slice(0, 7)}-${String(6200000 + n * 53).slice(0, 7)}`
          : plat === "shopee" ? `2510${String(n).padStart(6, "0")}`
          : `TX${String(n * 7919).padStart(7, "0").slice(-7)}`;
        itens.forEach((sku, i) => {
          const q = rnd() < 0.84 ? 1 : rnd() < 0.8 ? 2 : 3;
          const preco = sku === "124" ? c.p124 : c.p120;
          // A Shopee às vezes manda a linha SEM SKU (anúncio sem código no painel).
          const semSku = plat === "shopee" && rnd() < 0.25;
          out.push({
            id: `eo${out.length + 1}`,
            platform: plat,
            order_id: plat === "amazon" ? raiz : `${raiz}-${plat === "payt" ? "CZ" : ""}${i + 1}`,
            product_sku: semSku ? null : sku,
            product_name: sku === "124" ? (semSku ? "CarboZé Kit 5 Frascos 100ml - Original" : "CarboZé Kit 5 Frascos 100ml") : "CarboZé Kit 10 Sachês 10ml",
            quantity: q,
            units_real: plat === "nuvemshop" ? q * DISPLAY[sku] : q,
            unit_price: preco,
            total: r2(q * preco),
            status,
            ordered_at: quando.toISOString(),
            platform_order_number: plat === "payt" ? `C${String(n * 131).padStart(6, "0").slice(-6)}` : plat === "nuvemshop" ? `#${4100 + n}` : null,
          });
        });
      }
    }
  }
  return out.sort((a, b) => a.ordered_at.localeCompare(b.ordered_at));
})();

// ── Agregações (as MESMAS regras da tela, para a conferência fechar) ────────
const VENDA = new Set(["paid", "shipped", "delivered"]);
const RAIZ_AMAZON = /^\d{3}-\d{7}-\d{7}/;
const chave = (r: Linha) => {
  if (r.platform === "payt" && r.platform_order_number) return `carrinho:${r.platform_order_number}`;
  if (r.platform === "amazon") return r.order_id.match(RAIZ_AMAZON)?.[0] ?? r.order_id;
  const i = r.order_id.indexOf("-");
  return i > 0 ? r.order_id.slice(0, i) : r.order_id;
};
const ESCADA: Record<string, number> = { delivered: 5, shipped: 4, paid: 3, pending: 2, cancelled: 1 };
const unidades = (r: Linha) => (r.product_sku ? r.quantity * DISPLAY[r.product_sku] : r.units_real);
function resumo(rows: Linha[]) {
  const st = new Map<string, string>();
  for (const r of rows) { const k = chave(r); const a = st.get(k); if (!a || ESCADA[r.status] > ESCADA[a]) st.set(k, r.status); }
  const conta = (s: string) => [...st.values()].filter((v) => v === s).length;
  const venda = rows.filter((r) => VENDA.has(r.status));
  return {
    total_orders: st.size,
    sale_orders: new Set(venda.map(chave)).size,
    total_quantity: rows.reduce((s, r) => s + r.quantity, 0),
    total_units_real: rows.reduce((s, r) => s + r.units_real, 0),
    total_units: rows.reduce((s, r) => s + unidades(r), 0),
    sale_units: venda.reduce((s, r) => s + unidades(r), 0),
    total_revenue: r2(venda.reduce((s, r) => s + r.total, 0)),
    sale_revenue: r2(venda.reduce((s, r) => s + r.total, 0)),
    pending_revenue: r2(rows.filter((r) => r.status === "pending").reduce((s, r) => s + r.total, 0)),
    cancelled_revenue: r2(rows.filter((r) => r.status === "cancelled").reduce((s, r) => s + r.total, 0)),
    cancelled_orders: conta("cancelled"),
    pending_orders: conta("pending"),
    shipped_orders: conta("shipped"),
    delivered_orders: conta("delivered"),
  };
}
const agrupar = <K extends string>(rows: Linha[], k: (r: Linha) => K) => {
  const m = new Map<K, Linha[]>();
  for (const r of rows) { const c = k(r); m.set(c, [...(m.get(c) ?? []), r]); }
  return m;
};

const RAW_SUMMARY = (() => {
  const out: Record<string, unknown>[] = [];
  for (const [c, rows] of agrupar(PEDIDOS, (r) => `${r.platform}|${diaLocal(new Date(r.ordered_at))}` as string)) {
    const [platform, day] = c.split("|");
    out.push({ platform, day, ...resumo(rows) });
  }
  return out;
})();

const mesDe = (r: Linha) => diaLocal(new Date(r.ordered_at)).slice(0, 7);
function resumoMensal(args: { p_platforms?: string[]; p_from?: string; p_to?: string }) {
  const de = (args.p_from ?? "0000").slice(0, 7), ate = (args.p_to ?? "9999").slice(0, 7);
  const plats = args.p_platforms ?? Object.keys(CANAIS);
  const out: Record<string, unknown>[] = [];
  for (const [c, rows] of agrupar(PEDIDOS.filter((r) => plats.includes(r.platform)), (r) => `${r.platform}|${mesDe(r)}` as string)) {
    const [platform, month_str] = c.split("|");
    if (month_str < de || month_str > ate) continue;
    out.push({ platform, month_str, ...resumo(rows) });
  }
  return out;
}

// ── Metas: calibradas a partir do realizado, para sair uma mistura de cores ──
const FATOR_META: Record<string, number> = { nuvemshop: 1.08, mercadolivre: 1.22, mercadolivre_full: 0.92, amazon: 1.5, shopee: 1.12, payt: 0.98 };
const METAS = (() => {
  const out: Record<string, unknown>[] = [];
  const mesAtual = diaLocal(AGORA).slice(0, 7);
  const diasNoMes = new Date(AGORA.getFullYear(), AGORA.getMonth() + 1, 0).getDate();
  for (const [c, rows] of agrupar(PEDIDOS.filter((r) => VENDA.has(r.status)), (r) => `${r.platform}|${mesDe(r)}` as string)) {
    const [platform, mes] = c.split("|");
    let real = rows.reduce((s, r) => s + r.total, 0);
    if (mes === mesAtual) real = (real / AGORA.getDate()) * diasNoMes;
    else if (mes < diaLocal(new Date(hojeMeiaNoite.getTime() - (DIAS - 3) * 864e5)).slice(0, 7)) continue; // mês incompleto
    const alvo = Math.max(500, Math.round((real * FATOR_META[platform]) / 500) * 500);
    out.push({ id: `meta-${platform}-${mes}`, month: `${mes}-01`, platform, target_amount: alvo, created_by: U.gestor.id, created_at: `${mes}-01T12:00:00Z`, updated_at: `${mes}-01T12:00:00Z` });
  }
  return out;
})();

// ── Anúncios da Meta ────────────────────────────────────────────────────────
const CONTAS = [
  { act_id: "act_1002003001", apelido: "CarboZé Loja", moeda: "BRL", ativo: true },
  { act_id: "act_1002003002", apelido: "CarboZé Clube", moeda: "BRL", ativo: true },
];
type Ad = { ad: string; nome: string; adset: string; conjunto: string; camp: string; campanha: string; objetivo: string; act: string; gasto: number; roas: number; ctr: number; status: string; cor: string };
const ADS: Ad[] = [
  { ad: "ad_01", nome: "Vídeo depoimento — caminhoneiro", adset: "as_01", conjunto: "Interesse automotivo 25-54", camp: "cp_01", campanha: "[VENDAS] Kit 5 Frascos — Conversão", objetivo: "OUTCOME_SALES", act: CONTAS[0].act_id, gasto: 62, roas: 3.3, ctr: 1.45, status: "ACTIVE", cor: "#2563eb" },
  { ad: "ad_02", nome: "Carrossel antes e depois", adset: "as_01", conjunto: "Interesse automotivo 25-54", camp: "cp_01", campanha: "[VENDAS] Kit 5 Frascos — Conversão", objetivo: "OUTCOME_SALES", act: CONTAS[0].act_id, gasto: 44, roas: 2.1, ctr: 1.12, status: "ACTIVE", cor: "#16a34a" },
  { ad: "ad_03", nome: "Imagem kit 5 frascos", adset: "as_02", conjunto: "Semelhante a compradores 1%", camp: "cp_01", campanha: "[VENDAS] Kit 5 Frascos — Conversão", objetivo: "OUTCOME_SALES", act: CONTAS[0].act_id, gasto: 51, roas: 2.7, ctr: 1.05, status: "ACTIVE", cor: "#ea580c" },
  { ad: "ad_04", nome: "Cupom primeira compra", adset: "as_03", conjunto: "Visitou e não comprou", camp: "cp_02", campanha: "[VENDAS] Remarketing 7 dias", objetivo: "OUTCOME_SALES", act: CONTAS[0].act_id, gasto: 24, roas: 4.6, ctr: 2.3, status: "ACTIVE", cor: "#9333ea" },
  { ad: "ad_05", nome: "Estático frete grátis", adset: "as_03", conjunto: "Visitou e não comprou", camp: "cp_02", campanha: "[VENDAS] Remarketing 7 dias", objetivo: "OUTCOME_SALES", act: CONTAS[0].act_id, gasto: 17, roas: 0, ctr: 0.62, status: "PAUSED", cor: "#64748b" },
  { ad: "ad_06", nome: "Reels — como funciona", adset: "as_04", conjunto: "Brasil amplo 18-65", camp: "cp_03", campanha: "[ALCANCE] Marca CarboZé — Vídeo", objetivo: "OUTCOME_AWARENESS", act: CONTAS[1].act_id, gasto: 29, roas: 0, ctr: 0.48, status: "ACTIVE", cor: "#0891b2" },
  { ad: "ad_07", nome: "Catálogo dinâmico sachês", adset: "as_05", conjunto: "Advantage+ catálogo", camp: "cp_04", campanha: "[VENDAS] Kit Sachês — Catálogo", objetivo: "OUTCOME_SALES", act: CONTAS[1].act_id, gasto: 34, roas: 1.6, ctr: 0.95, status: "ACTIVE", cor: "#db2777" },
];
const TICKET_META = 158;
const SYNC = new Date(AGORA.getTime() - 95 * 6e4).toISOString();
const DIARIO = (() => {
  const out: Record<string, unknown>[] = [];
  for (let d = 59; d >= 0; d--) {
    const dia = diaLocal(new Date(hojeMeiaNoite.getTime() - d * 864e5));
    const tendencia = 0.85 + ((59 - d) / 59) * 0.3; // o investimento cresceu no período
    for (const a of ADS) {
      const spend = r2(a.gasto * tendencia * (0.7 + rnd() * 0.6));
      const impressions = Math.round((spend * 1000) / (18 + rnd() * 10));
      const link_clicks = Math.round((impressions * a.ctr * (0.8 + rnd() * 0.4)) / 100);
      const compras = Math.round((spend * a.roas * (0.6 + rnd() * 0.8)) / TICKET_META);
      out.push({
        dia, act_id: a.act, conta: CONTAS.find((c) => c.act_id === a.act)!.apelido,
        campaign_id: a.camp, campaign_name: a.campanha, adset_id: a.adset, adset_name: a.conjunto,
        ad_id: a.ad, ad_name: a.nome, spend, impressions, clicks: Math.round(link_clicks * 1.4), link_clicks,
        reach: Math.round(impressions * 0.62), meta_compras: compras, meta_valor_compras: r2(compras * TICKET_META * (0.92 + rnd() * 0.16)),
        moeda: "BRL", sincronizado_em: SYNC,
      });
    }
  }
  return out as (Record<string, unknown> & { dia: string; act_id: string; ad_id: string; spend: number; impressions: number; link_clicks: number; meta_compras: number; meta_valor_compras: number })[];
})();
const thumb = (cor: string, txt: string) => "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' fill='${cor}'/><circle cx='88' cy='30' r='18' fill='white' fill-opacity='0.25'/><rect x='18' y='70' width='84' height='10' rx='5' fill='white' fill-opacity='0.85'/><rect x='18' y='88' width='56' height='8' rx='4' fill='white' fill-opacity='0.6'/><text x='18' y='50' font-family='Arial' font-size='22' font-weight='700' fill='white'>${txt}</text></svg>`);
const CRIATIVOS = ADS.map((a, i) => ({ ad_id: a.ad, status: a.status, thumbnail_url: thumb(a.cor, ["CZ", "AD", "5x", "%", "R$", "▶", "10"][i]), image_url: null, tipo: "image", titulo: a.nome, texto: null }));

const brutos = (rows: typeof DIARIO) => ({
  spend: r2(rows.reduce((s, r) => s + r.spend, 0)),
  impressions: rows.reduce((s, r) => s + r.impressions, 0),
  link_clicks: rows.reduce((s, r) => s + r.link_clicks, 0),
  compras: rows.reduce((s, r) => s + r.meta_compras, 0),
  valor: r2(rows.reduce((s, r) => s + r.meta_valor_compras, 0)),
});
const somaDias = (de: string, n: number) => { const d = new Date(`${de}T12:00:00`); d.setDate(d.getDate() + n); return diaLocal(d); };
const entre = (de: string, ate: string, act?: string | null) => DIARIO.filter((r) => r.dia >= de && r.dia <= ate && (!act || r.act_id === act));
const lojaEntre = (de: string, ate: string) => PEDIDOS.filter((r) => (r.platform === "nuvemshop" || r.platform === "payt") && VENDA.has(r.status)
  && diaLocal(new Date(r.ordered_at)) >= de && diaLocal(new Date(r.ordered_at)) <= ate);

function painel(args: { p_de: string; p_ate: string; p_act?: string | null }) {
  const n = Math.round((new Date(`${args.p_ate}T12:00:00`).getTime() - new Date(`${args.p_de}T12:00:00`).getTime()) / 864e5) + 1;
  const antAte = somaDias(args.p_de, -1), antDe = somaDias(args.p_de, -n);
  const atual = entre(args.p_de, args.p_ate, args.p_act), ant = entre(antDe, antAte, args.p_act);
  const b = brutos(atual);
  const loja = lojaEntre(args.p_de, args.p_ate);
  const serie = [...agrupar(loja, (r) => diaLocal(new Date(r.ordered_at)))].map(([dia, rs]) => ({ dia, faturamento: r2(rs.reduce((s, r) => s + r.total, 0)) }));
  const anuncios = ADS.filter((a) => !args.p_act || a.act === args.p_act).map((a) => {
    const rs = atual.filter((r) => r.ad_id === a.ad);
    const x = brutos(rs);
    return { ad_id: a.ad, nome: a.nome, campanha: a.campanha, conjunto: a.conjunto, objetivo: a.objetivo, ...x,
      carrinho: Math.round(x.link_clicks * (a.roas > 0 ? 0.09 : 0.03)), dias: rs.length, ultimo_dia: args.p_ate };
  });
  return {
    periodo: { de: args.p_de, ate: args.p_ate, ant_de: antDe, ant_ate: antAte },
    atual: b,
    anterior: { ...brutos(ant), linhas: ant.length },
    funil: {
      impressoes: b.impressions, cliques: b.link_clicks, pagina: Math.round(b.link_clicks * 0.71),
      produto: Math.round(b.link_clicks * 0.33), carrinho: Math.round(b.link_clicks * 0.08),
      checkout: Math.round(b.link_clicks * 0.27), pagamento: Math.round(b.link_clicks * 0.12), compras: b.compras,
    },
    loja: {
      faturamento: r2(loja.reduce((s, r) => s + r.total, 0)),
      pedidos: new Set(loja.map(chave)).size,
      faturamento_anterior: r2(lojaEntre(antDe, antAte).reduce((s, r) => s + r.total, 0)),
      serie,
    },
    anuncios,
  };
}

function segmentos(args: { p_de: string; p_ate: string; p_act?: string | null }) {
  const b = brutos(entre(args.p_de, args.p_ate, args.p_act));
  const fat = (pSpend: number, pRoas: number, ctr = 1) => ({
    spend: r2(b.spend * pSpend), impressions: Math.round(b.impressions * pSpend),
    link_clicks: Math.round(b.link_clicks * pSpend * ctr),
    compras: Math.round(b.compras * pSpend * pRoas * 0.9), valor: r2(b.valor * pSpend * pRoas * 0.9),
  });
  const idades: [string, number, number][] = [["18-24", 0.08, 0.5], ["25-34", 0.22, 0.9], ["35-44", 0.3, 1.25], ["45-54", 0.24, 1.15], ["55-64", 0.12, 0.8], ["65+", 0.04, 0.6]];
  const idade_genero = idades.flatMap(([f, p, r]) => [
    { chave1: f, chave2: "male", ...fat(p * 0.68, r * 1.08) },
    { chave1: f, chave2: "female", ...fat(p * 0.3, r * 0.8) },
    { chave1: f, chave2: "unknown", ...fat(p * 0.02, r * 0.5) },
  ]);
  const posicionamento = [
    { chave1: "instagram", chave2: "instagram_reels", ...fat(0.31, 1.15, 1.2) },
    { chave1: "facebook", chave2: "feed", ...fat(0.27, 1.1) },
    { chave1: "instagram", chave2: "feed", ...fat(0.18, 0.95) },
    { chave1: "instagram", chave2: "instagram_stories", ...fat(0.14, 0.75, 0.8) },
    { chave1: "facebook", chave2: "facebook_reels", ...fat(0.07, 0.7) },
    { chave1: "audience_network", chave2: "an_classic", ...fat(0.003, 2.5, 0.5) },
  ];
  const ufs: [string, number, number][] = [["São Paulo", 0.24, 1.0], ["Rio Grande do Norte", 0.13, 1.4], ["Minas Gerais", 0.1, 0.9], ["Pernambuco", 0.08, 1.2], ["Bahia", 0.07, 0.85], ["Paraná", 0.07, 1.05], ["Rio de Janeiro", 0.06, 0.8], ["Ceará", 0.05, 1.1], ["Paraíba", 0.04, 1.3], ["Goiás", 0.04, 0.9], ["Santa Catarina", 0.03, 1.0], ["Pará", 0.03, 0.7], ["Maranhão", 0.02, 0.6], ["Alagoas", 0.02, 0.9], ["Piauí", 0.02, 0.8]];
  const regiao = ufs.map(([uf, p, r]) => ({ chave1: `${uf} (state)`, chave2: "", ...fat(p, r) }));
  return { idade_genero, posicionamento, regiao };
}

const LOG = [
  { id: 3, rodou_em: SYNC, origem: "cron:extras", act_id: CONTAS[0].act_id, linhas: 42, ok: true, erro: null, duracao_ms: 5200 },
  { id: 2, rodou_em: SYNC, origem: "cron", act_id: CONTAS[0].act_id, linhas: 210, ok: true, erro: null, duracao_ms: 8100 },
  { id: 1, rodou_em: SYNC, origem: "cron", act_id: CONTAS[1].act_id, linhas: 60, ok: true, erro: null, duracao_ms: 4300 },
];

// ── Exporta ─────────────────────────────────────────────────────────────────
const CONEXAO = Object.keys(CANAIS).map((platform) => ({ platform, is_connected: true, minutos_sem_sincronizar: platform === "shopee" ? 190 : 4 }));
const TAXAS = [
  { id: "t1", platform: "mercadolivre", rate: 0.16, valid_from: "2026-01-01", created_at: "2026-01-02T12:00:00Z" },
  { id: "t0", platform: "mercadolivre", rate: 0.14, valid_from: "2025-06-01", created_at: "2025-06-01T12:00:00Z" },
  { id: "t2", platform: "amazon", rate: 0.15, valid_from: "2026-01-01", created_at: "2026-01-02T12:00:00Z" },
  { id: "t3", platform: "nuvemshop", rate: 0, valid_from: "2026-01-01", created_at: "2026-01-02T12:00:00Z" },
  { id: "t4", platform: "shopee", rate: 0.2, valid_from: "2026-03-01", created_at: "2026-03-01T12:00:00Z" },
];

export const FX: Record<string, unknown> = {
  ecommerce_orders: porRota("ecommerce_orders", () => PEDIDOS),
  ecommerce_raw_summary: porRota("ecommerce_raw_summary", () => RAW_SUMMARY),
  platform_connection_status: porRota("platform_connection_status", () => CONEXAO),
  platform_commission_rates: porRota("platform_commission_rates", () => TAXAS),
  sku_product_mappings: porRota("sku_product_mappings", () => MAPAS),
  mrp_products: porRota("mrp_products", () => [...produtos, KIT_SACHE], () => produtos),
  meta_ecommerce: porRota("meta_ecommerce", () => METAS),
  meta_ads_accounts: porRota("meta_ads_accounts", () => CONTAS),
  meta_ads_diario: porRota("meta_ads_diario", () => DIARIO),
  meta_ads_criativos: porRota("meta_ads_criativos", () => CRIATIVOS),
  meta_ads_sync_log: porRota("meta_ads_sync_log", () => LOG),
};
export const RPC_FX: Record<string, unknown> = {
  ecommerce_monthly_summary: (a: Record<string, unknown>) => resumoMensal(a as never),
  carbo_meta_ads_painel: (a: Record<string, unknown>) => painel(a as never),
  carbo_meta_ads_segmentos: (a: Record<string, unknown>) => segmentos(a as never),
  notify_ecommerce_disconnected: null,
};

// Para o print das Contas: o que a função da Meta responderia (o mock de
// `functions.invoke` devolve nulo; o shot o troca por isto no navegador).
export const CONTAS_VISIVEIS = [
  { act_id: "act_1002003001", nome: "CarboZé Loja", moeda: "BRL", status: 1 },
  { act_id: "act_1002003002", nome: "CarboZé Clube", moeda: "BRL", status: 1 },
  { act_id: "act_1002003099", nome: "CarboZé — antiga (agência)", moeda: "BRL", status: 2 },
];
