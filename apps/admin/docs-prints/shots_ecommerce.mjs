// Prints da área "ecommerce" (ver shots.mjs): Vendas Online, Acompanhamento
// de Metas e Anúncios da Meta. O número de cada marcador é o `n` do item em
// src/docs/secoes/ecommerce.ts.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const txt = (t) => (p) => p.getByText(t, { exact: false });
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();
// Cartão (shadcn Card / CarboCard) que contém um título.
const cartao = (t) => (p) => p.locator("main div.rounded-2xl, main div.rounded-xl, main div.rounded-lg").filter({ has: p.getByText(t, { exact: true }) }).last();
const metrica = (t) => (p) => p.locator("main div.rounded-xl.border").filter({ has: p.locator("p", { hasText: new RegExp("^" + t + "$", "i") }) }).first();
const card = (t) => (p) => p.locator("main div.rounded-xl, main div.rounded-2xl").filter({ has: p.locator("[class*=CardTitle], h3, div", { hasText: new RegExp("^" + t + "$") }) }).last();
const ALTO = { width: 1440, height: 2400 };
const VO = "/ecommerce/vendas-online";

// Troca o `functions.invoke` do Supabase falso pelo que a função da Meta
// responderia (lista de contas), só neste print.
const contasNaFuncao = async (p) => {
  await p.evaluate(async () => {
    // A MESMA instância do módulo que o app carregou (o Vite pode pôr `?t=`).
    const url = (re, padrao) => performance.getEntriesByType("resource").map((e) => e.name).find((n) => re.test(n)) ?? padrao;
    const m = await import(url(/\/docs-prints\/mockClient\.ts/, "/docs-prints/mockClient.ts"));
    const fx = await import(url(/\/docs-prints\/fx_ecommerce\.ts/, "/docs-prints/fx_ecommerce.ts"));
    m.supabase.functions.invoke = async (_n, o) => ({ data: o?.body?.acao === "descobrir" ? { contas: fx.CONTAS_VISIVEIS } : { linhas: 0, contas: 0 }, error: null });
  });
};

export const SHOTS = [
  // ── Vendas Online: a aba de um canal ──
  { chave: "ecom-canal", papel: "colaborador", url: `${VO}?aba=mercadolivre&periodo=este-mes`, viewport: ALTO,
    clip: (p) => p.locator("main > div").first(), espera: 1500, marcas: [
    [1, (p) => p.locator("main button[role=combobox]").first()],
    [2, (p) => p.getByRole("button", { name: /ML LogHouse/ }).locator("..")],
    [3, (p) => p.locator("main").getByText("Conectado", { exact: true }).locator("..")],
    [4, metrica("Vendas")],
    [5, metrica("Faturamento")],
    [6, metrica("A Receber")],
    [7, (p) => p.getByText("Comissão da Plataforma").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")],
    [8, metrica("Unidades Vendidas")],
    [9, metrica("Cancelados")],
    [10, (p) => p.getByText("O que aconteceu com os pedidos").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")],
    [11, (p) => p.getByText("Produto mais vendido").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")],
    [12, (p) => p.getByText("Verificação de Integridade").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")],
    [13, (p) => p.getByText("Evolução de Vendas").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")],
    [14, (p) => p.getByText("Produtos Vendidos").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")],
  ] },
  { chave: "ecom-periodo", papel: "colaborador", url: `${VO}?aba=mercadolivre&periodo=este-mes`,
    antes: async (p) => { await p.waitForTimeout(800); await p.locator("main button[role=combobox]").first().click(); await p.waitForTimeout(500); },
    clip: (p) => [p.locator("[role=listbox]"), p.locator("main button[role=combobox]").first()], pad: 10, marcas: [
    [1, (p) => p.getByRole("option", { name: "Hoje" })],
    [2, (p) => p.getByRole("option", { name: "Este mês (até hoje)" })],
    [3, (p) => p.getByRole("option", { name: "Mês fechado…" })],
    [4, (p) => p.getByRole("option", { name: "Por período…" })],
  ] },
  { chave: "ecom-mes-fechado", papel: "colaborador", url: `${VO}?aba=mercadolivre&periodo=mes&de=2026-09-01`,
    clip: (p) => [p.locator("main h1"), p.locator("main button[role=combobox]").nth(1)], pad: 12, marcas: [
    [1, (p) => p.locator("main button[role=combobox]").first()],
    [2, (p) => p.locator("main button[role=combobox]").nth(1)],
  ] },
  { chave: "ecom-comissao", papel: "colaborador", url: `${VO}?aba=mercadolivre&periodo=este-mes`,
    antes: async (p) => { await p.waitForTimeout(800); await p.getByText("Comissão da Plataforma").click(); await p.waitForTimeout(800); },
    clip: dlg, pad: 4, marcas: [
    [1, (p) => dlg(p).locator("div.grid-cols-3")],
    [2, (p) => dlg(p).getByText("Cadastrar nova taxa").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")],
    [3, (p) => dlg(p).getByRole("button", { name: /Salvar taxa/ })],
    [4, (p) => dlg(p).getByText("Histórico de taxas").locator("..")],
    [5, (p) => dlg(p).getByText("atual", { exact: true })],
  ] },
  { chave: "ecom-shopee", papel: "colaborador", url: `${VO}?aba=shopee&periodo=30d`, viewport: ALTO, espera: 1500,
    clip: (p) => [p.locator("main").getByText("Dados de vendas externos — período selecionado").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]"),
                  p.getByText("Produtos Vendidos").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")],
    marcas: [
    [1, (p) => p.locator("main").getByText(/Sem sincronizar há/)],
    [2, (p) => p.locator("main td").getByText("sem SKU", { exact: true })],
    [3, (p) => p.locator("main td").getByText("×?", { exact: true })],
    [4, (p) => p.locator("main td").getByText("×5", { exact: true })],
  ] },
  // ── Vendas Online: Comparativo e Histórico ──
  { chave: "ecom-comparativo", papel: "colaborador", url: `${VO}?aba=comparativo&periodo=este-mes`, viewport: ALTO, espera: 1500,
    clip: (p) => p.locator("main > div").first(), marcas: [
    [1, (p) => p.locator("main").getByRole("button", { name: /Nuvemshop/ }).nth(1).locator("..")],
    [2, metrica("Vendas")],
    [3, metrica("Unidades")],
    [4, metrica("Líder em faturamento")],
    [5, (p) => p.locator("main div.rounded-xl.border").filter({ hasText: "dos packs" }).first()],
    [6, (p) => p.getByText(/sem mapeamento de SKU/)],
    [7, (p) => p.getByText("Resumo Comparativo").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")],
    [8, (p) => p.locator("main th").filter({ hasText: "packs" }).first()],
    [9, (p) => p.getByText("Mix de Receita").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")],
    [10, (p) => p.locator("main").getByRole("button", { name: "Receita", exact: true }).locator("..")],
  ] },
  { chave: "ecom-historico", papel: "colaborador", url: `${VO}?aba=historico`, viewport: { width: 1440, height: 3200 }, espera: 1500,
    clip: (p) => [p.locator("main h1"), p.getByText("Vendas Mensais por Plataforma").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")], marcas: [
    [1, (p) => p.locator("main").getByText("Plataformas", { exact: true }).locator("..")],
    [2, (p) => p.locator("main").getByText("Período", { exact: true }).locator("..")],
    [3, (p) => p.locator("main").getByText(/^Resumo ·/).locator("..")],
    [4, metrica("Não entrou")],
    [5, (p) => p.locator("main").getByText("Melhor Mês", { exact: true }).locator("..")],
    [6, (p) => p.locator("main div.rounded-2xl").filter({ hasText: /^🛒ML LogHouse/ }).first()],
    [7, (p) => p.getByText("Faturamento Mensal por Plataforma").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")],
  ] },
  { chave: "ecom-historico-tabela", papel: "colaborador", url: `${VO}?aba=historico`, viewport: { width: 1440, height: 3600 }, espera: 1500,
    clip: (p) => p.getByText("Detalhamento por Mês e Plataforma").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]"), marcas: [
    [1, (p) => p.locator("main th").filter({ hasText: /^Cancel\.$/ }).last()],
    [2, (p) => p.locator("main th").filter({ hasText: /^MoM$/ })],
  ] },

  // ── Acompanhamento de Metas ──
  { chave: "metas", papel: "colaborador", url: "/ecommerce/metas", viewport: { width: 1440, height: 2600 }, espera: 1500,
    clip: (p) => p.locator("main div.max-w-7xl").first(), marcas: [
    [1, (p) => p.locator("main").getByText(/ de 20\d\d$/).locator("..")],
    [2, (p) => p.getByText("Faturamento Total do Mês").locator("..")],
    [3, (p) => p.getByText(/Esperado hoje:/).locator("..")],
    [4, (p) => p.locator("main").getByText("Projeção FDM").first().locator("..")],
    [5, (p) => p.locator("main").getByText("Faltam").first().locator("..")],
    [6, (p) => p.locator("main").getByText("Precisa/dia").locator("..").locator("..")],
    [7, (p) => p.locator("main").getByText(/^Esperado hoje \(/).locator("..").locator("..")],
    [8, (p) => p.locator("main").getByText("Por Plataforma", { exact: true }).locator("..")],
    [9, (p) => p.locator("main").getByRole("button", { name: /Total/ }).first().locator("..")],
    [10, (p) => p.locator("main").getByRole("button", { name: /Diário/ }).locator("..")],
    [11, (p) => p.getByText(/Ranking de Performance/).locator("xpath=ancestor::div[contains(@class,'rounded')][1]").locator("..")],
  ] },
  { chave: "metas-card", papel: "colaborador", url: "/ecommerce/metas", espera: 1500,
    clip: (p) => p.locator("main").getByText("Meta:").first().locator("xpath=ancestor::div[contains(@class,'border')][1]"), pad: 8, marcas: [
    [1, (p) => p.locator("main").getByText(/^Meta:/).first()],
    [2, (p) => p.locator("main").getByText("Meta:").first().locator("xpath=ancestor::div[contains(@class,'justify-between')][1]").locator("span").last()],
    [3, (p) => p.locator("main").getByText("Meta:").first().locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]").locator("div.items-end > div").last()],
    [4, (p) => p.locator("main").getByText("Meta:").first().locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]").locator("div.h-3")],
    [5, (p) => p.locator("main").getByText("Meta:").first().locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]").getByText("Projeção FDM").locator("..")],
    [6, (p) => p.locator("main").getByText("Meta:").first().locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]").getByText("Faltam").locator("..")],
  ] },
  { chave: "metas-acumulado", papel: "colaborador", url: "/ecommerce/metas", viewport: { width: 1440, height: 2600 }, espera: 1500,
    antes: async (p) => { await p.waitForTimeout(800); await p.getByRole("button", { name: /Acumulado/ }).click(); await p.waitForTimeout(1000); },
    clip: (p) => p.getByRole("button", { name: /Acumulado/ }).locator("xpath=ancestor::div[contains(@class,'rounded')][last()]"), marcas: [
    [1, (p) => p.locator("main").getByRole("button", { name: /Acumulado/ })],
    [2, (p) => p.locator("main .recharts-line").first()],
    [3, (p) => p.locator("main").getByRole("button", { name: /Histórico/ })],
  ] },

  // ── Anúncios da Meta ──
  { chave: "anuncios", papel: "colaborador", url: "/ecommerce/anuncios", viewport: { width: 1440, height: 4200 }, espera: 1800,
    clip: (p) => p.locator("main main").first(), marcas: [
    [1, (p) => p.locator("main main button[role=combobox]").first()],
    [2, (p) => p.locator("main main button[role=combobox]").nth(1)],
    [3, btn("Contas")],
    [4, btn(/Sincronizar agora/)],
    [5, (p) => p.locator("main main div.grid").first()],
    [6, (p) => p.locator("main main").getByText("ROAS (Meta)", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [7, (p) => p.getByText("O resultado real da loja própria").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [8, (p) => p.locator("main main").getByText("MER", { exact: true }).locator("..")],
    [9, (p) => p.getByText("Investimento × retorno por dia").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [10, (p) => p.getByText("Do anúncio à compra").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [11, (p) => p.getByText("Os anúncios que mais retornam").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [12, (p) => p.getByText("Investindo e sem venda").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [13, (p) => p.getByText("Quem compra, e onde").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [14, (p) => p.locator("main main").getByText("Campanhas", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [15, (p) => p.getByText(/são a atribuição da Meta/).locator("..").locator("..")],
  ] },
  { chave: "anuncios-campanhas", papel: "colaborador", url: "/ecommerce/anuncios", viewport: { width: 1440, height: 4200 }, espera: 1500,
    antes: async (p) => {
      await p.waitForTimeout(800);
      await p.locator("tbody button").filter({ hasText: "[VENDAS] Kit 5 Frascos — Conversão" }).click();
      await p.locator("tbody button").filter({ hasText: "Interesse automotivo 25-54" }).click();
      await p.waitForTimeout(500);
    },
    clip: (p) => p.locator("main main").getByText("Campanhas", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]"), marcas: [
    [1, (p) => p.locator("tbody button").filter({ hasText: "[VENDAS] Kit 5 Frascos — Conversão" })],
    [2, (p) => p.locator("tbody button").filter({ hasText: "Interesse automotivo 25-54" })],
    [3, (p) => p.locator("tbody button").filter({ hasText: "Vídeo depoimento — caminhoneiro" })],
    [4, (p) => p.locator("tbody tr").filter({ hasText: "Vídeo depoimento — caminhoneiro" }).locator("td").last()],
    [5, (p) => p.locator("tfoot tr")],
  ] },
  { chave: "anuncios-segmentos", papel: "colaborador", url: "/ecommerce/anuncios", viewport: { width: 1440, height: 4200 }, espera: 1500,
    clip: (p) => p.getByText("Quem compra, e onde").locator("xpath=ancestor::div[contains(@class,'rounded')][1]"), marcas: [
    [1, (p) => p.getByRole("tablist")],
    [2, (p) => p.getByText("Homens", { exact: true }).locator("..")],
    [3, (p) => p.locator("[role=tabpanel] table").first()],
    [4, (p) => p.locator("[role=tabpanel] th").filter({ hasText: "ROAS mulheres" })],
  ] },
  { chave: "anuncios-posicao", papel: "colaborador", url: "/ecommerce/anuncios", viewport: { width: 1440, height: 4200 }, espera: 1500,
    antes: async (p) => { await p.waitForTimeout(800); await p.getByRole("tab", { name: "Posicionamento" }).click(); await p.waitForTimeout(400); },
    clip: (p) => p.getByText("Quem compra, e onde").locator("xpath=ancestor::div[contains(@class,'rounded')][1]"), marcas: [
    [1, (p) => p.locator("[role=tabpanel]").getByText("investimento irrisório").first().locator("..")],
  ] },
  { chave: "anuncios-contas", papel: "colaborador", url: "/ecommerce/anuncios",
    antes: async (p) => { await p.waitForTimeout(800); await contasNaFuncao(p); await p.getByRole("button", { name: "Contas" }).click(); await p.waitForTimeout(1200); },
    clip: dlg, pad: 4, marcas: [
    [1, (p) => dlg(p).locator("div.divide-y > div").first()],
    [2, (p) => dlg(p).getByRole("button", { name: "Parar de ler" }).first()],
    [3, (p) => dlg(p).getByRole("button", { name: "Usar esta conta" })],
    [4, (p) => dlg(p).getByText(/desativada/)],
  ] },
];
void txt; void sel; void cartao; void card;
