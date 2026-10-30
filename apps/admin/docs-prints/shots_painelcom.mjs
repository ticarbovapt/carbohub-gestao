// Prints da área "painelcom" (ver shots.mjs): Dashboard Comercial, Dados
// Comerciais (fonte), Aprovações e Tabela de preços. O número de cada
// marcador é o `n` do item em src/docs/secoes/painelcom.ts.
//
// As quatro telas só abrem para GESTOR (o colaborador vê "Área restrita"), por
// isso quase todos os prints são do papel gestor.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();
const kpi = (t) => (p) => p.locator("main div.kpi-glow").filter({ has: p.locator("p", { hasText: new RegExp("^" + t + "$") }) }).first();
const mom = (t) => (p) => p.locator("main div.rounded-xl.overflow-hidden").filter({ has: p.locator("span", { hasText: new RegExp("^" + t + "$") }) }).first();
const painel = (t) => (p) => p.locator("main div.rounded-2xl").filter({ has: p.locator("h2", { hasText: t }) }).first();
const serie = (t) => (p) => p.locator("main div.rounded-lg.border").filter({ has: p.locator("p", { hasText: new RegExp("^" + t + "$") }) }).first();
const tile = (t) => (p) => p.locator("main div.rounded-xl, main div.rounded-lg").filter({ has: p.getByText(t, { exact: true }) }).last();
const linha = (n) => (p) => p.locator("tbody tr").nth(n);
const celula = (r, c) => (p) => p.locator("tbody tr").nth(r).locator("td").nth(c);
const cab = (p) => p.locator("main").getByText(/^(Dashboard — Comercial|Dados Comerciais — Fonte|Aprovações|Tabela de preços)$/).first();
const largura = (p) => p.locator("main div.grid").first();
const topo = async (p) => { await p.evaluate(() => { document.querySelectorAll("main, html, body").forEach((e) => (e.scrollTop = 0)); }); await p.waitForTimeout(300); };
const cartaoTabela = (p) => p.locator("main table").first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
const ALTO = { width: 1440, height: 5600 };
const MEDIO = { width: 1440, height: 1600 };
const LARGO = { width: 1680, height: 1600 };
const D = "/painel-comercial";
const abrirLinha = (n, c = 1) => async (p) => { await p.locator("tbody tr").nth(n).locator("td").nth(c).click(); await p.waitForTimeout(600); };
const clicar = (...ts) => async (p) => { for (const t of ts) { await p.getByRole("button", { name: t }).first().click(); await p.waitForTimeout(500); } };

export const SHOTS = [
  // ── Dashboard Comercial ──
  { chave: "pc-dash-topo", papel: "gestor", url: D, viewport: ALTO, espera: 1500,
    clip: (p) => [cab(p), mom("CarboVAPT")(p), largura(p)], marcas: [
    [1, (p) => p.locator('main a[href="/dados-comerciais"]').locator("..")],
    [2, (p) => p.locator("main button[role=combobox]").nth(0)],
    [3, (p) => p.locator("main button[role=combobox]").nth(1)],
    [4, (p) => p.locator("main button[role=combobox]").nth(2)],
    [5, kpi("CarboZé on-line")],
    [6, kpi("Comercial Expansão")],
    [7, kpi("CarboVAPT")],
    [8, kpi("Faturamento total")],
    [9, (p) => p.getByText(/NFS-e disponível a partir de/)],
    [10, kpi("Total de Vendas")],
    [11, kpi("Maior Venda")],
    [12, kpi("Top Recorrência")],
    [13, kpi("Ticket Médio")],
    [14, mom("Total")],
    [15, mom("CarboVAPT")],
  ] },
  { chave: "pc-dash-evolucao", papel: "gestor", url: D, viewport: ALTO, espera: 1500,
    clip: (p) => painel("Evolução Mensal de Vendas")(p), marcas: [
    [1, (p) => painel("Evolução Mensal de Vendas")(p).getByText("Ver pedidos →")],
    [2, serie("Faturado · TOTAL")],
    [3, serie("Faturado · on-line")],
    [4, serie("Faturado · CarboVAPT")],
    [5, serie("Vendas · TOTAL")],
  ] },
  { chave: "pc-dash-anual", papel: "gestor", url: D, viewport: ALTO, espera: 1500,
    clip: (p) => [painel("Crescimento Anual")(p), painel("Evolução do Ticket Médio")(p)], marcas: [
    [1, (p) => painel("Crescimento Anual")(p).locator("h2").locator("..")],
    [2, (p) => painel("Crescimento Anual")(p).getByText("Meta", { exact: true }).locator("..").locator("..")],
    [3, serie("Ticket · TOTAL")],
  ] },
  { chave: "pc-dash-canais", papel: "gestor", url: D, viewport: ALTO, espera: 1500,
    clip: (p) => [painel("Vendas por Canal")(p), painel(/Metas por Canal/)(p)], marcas: [
    [1, (p) => painel("Vendas por Canal")(p).locator("div.border-l-4").filter({ hasText: "Revenda (PDV)" })],
    [2, (p) => painel("Vendas por Canal")(p).locator("div.border-l-4").filter({ hasText: "CarboVAPT" })],
    [3, (p) => painel("Vendas por Canal")(p).locator("div.border-l-4").filter({ hasText: "Não classificado" })],
    [4, (p) => p.getByRole("button", { name: "Acumulado" }).locator("..")],
    [5, (p) => p.getByText(/^PDV .* vs /).locator("..")],
    [6, btn(/Editar metas/)],
    [7, (p) => painel(/Metas por Canal/)(p).locator("div.rounded-xl").filter({ hasText: "Revenda (PDV)" }).first()],
  ] },
  { chave: "pc-dash-metas", papel: "gestor", url: D, viewport: ALTO, espera: 1500,
    antes: clicar(/Editar metas/), clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByRole("combobox").first()],
    [2, (p) => dlg(p).locator("input").nth(0)],
    [3, (p) => dlg(p).locator("input").nth(1)],
    [4, (p) => dlg(p).getByRole("button", { name: /Salvar metas/ })],
  ] },
  { chave: "pc-dash-unidades", papel: "gestor", url: D, viewport: ALTO, espera: 1500,
    clip: (p) => [p.locator("main p", { hasText: /^Período: / }).first(), painel("Unidades · Comercial Expansão")(p), painel("Unidades · On-line")(p), p.getByText("Ver pedidos detalhados →")], marcas: [
    [1, (p) => p.locator("main p", { hasText: /^Período: / }).first()],
    [2, (p) => p.locator("main p", { hasText: /^Cobertura:/ }).first()],
    [3, (p) => painel("Unidades · On-line")(p).locator("div.border-b").first()],
    [4, (p) => painel("Unidades · On-line")(p).locator("div[title]").filter({ hasText: "sem mapa" }).first()],
    [5, (p) => painel("Unidades · Comercial Expansão")(p).locator("div.border-b").first()],
    [6, (p) => painel("Unidades · Comercial Expansão")(p).locator("div[title]").filter({ hasText: "bonif." }).first()],
  ] },

  // ── Dados Comerciais (fonte) ──
  { chave: "pc-dados-pedidos", papel: "gestor", url: "/dados-comerciais/pedidos", viewport: LARGO, espera: 1200,
    clip: (p) => [cab(p), linha(6)(p), largura(p)], marcas: [
    [1, (p) => p.locator('main a[href="/painel-comercial"]').locator("..")],
    [2, tile("Pedidos internos (contam)")],
    [3, tile("Excluídos das métricas")],
    [4, (p) => p.getByRole("button", { name: "Pedidos internos" }).locator("..")],
    [5, sel('main input[placeholder="Buscar cliente ou nº do pedido…"]')],
    [6, (p) => p.locator("main button[role=combobox]").nth(2)],
    [7, btn(/Só os que contam métrica/)],
    [8, btn(/Exportar CSV/)],
    [9, (p) => p.getByText(/\d+ de \d+ linhas/)],
    [10, sel('input[aria-label="Selecionar todos os pedidos visíveis"]')],
    [11, (p) => p.locator("tbody span", { hasText: /^NF \d+/ }).first()],
    [12, (p) => p.locator("tbody span", { hasText: "Aguardando emissão da NF" }).first()],
    [13, (p) => p.locator("tbody td").filter({ hasText: /^Não conta$/ }).first()],
    [14, (p) => p.locator("tbody td").filter({ hasText: /^(Bling|Manual)$/ }).first()],
    [15, sel('button[title="Editar canal e origem"]')],
  ] },
  { chave: "pc-dados-massa", papel: "gestor", url: "/dados-comerciais/pedidos", viewport: LARGO, espera: 1200,
    antes: async (p) => { for (const i of [0, 1, 2]) await p.locator("tbody input[type=checkbox]").nth(i).check(); await topo(p); },
    clip: (p) => [sel('main input[placeholder="Buscar cliente ou nº do pedido…"]')(p), linha(3)(p), largura(p)], marcas: [
    [1, (p) => p.getByText(/pedidos selecionados/)],
    [2, (p) => p.getByRole("combobox").filter({ hasText: "Classificar canal…" })],
    [3, (p) => p.getByRole("combobox").filter({ hasText: "Atribuir vendedor…" })],
    [4, btn("Limpar seleção")],
    [5, (p) => p.locator("tbody input[type=checkbox]").nth(0)],
  ] },
  { chave: "pc-dados-editar", papel: "gestor", url: "/dados-comerciais/pedidos", viewport: LARGO, espera: 1200,
    antes: async (p) => { await p.locator('button[title="Editar canal e origem"]').nth(5).click(); await p.waitForTimeout(500); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByRole("combobox").nth(0)],
    [2, (p) => dlg(p).getByRole("combobox").nth(1)],
    [3, (p) => dlg(p).getByRole("button", { name: "Salvar" })],
  ] },
  { chave: "pc-dados-descarb", papel: "gestor", url: "/dados-comerciais/descarbonizacao", viewport: LARGO, espera: 1200,
    clip: (p) => [cab(p), linha(7)(p), largura(p)], marcas: [
    [1, (p) => p.getByRole("button", { name: "Descarbonização" })],
    [2, tile("Notas de serviço (válidas)")],
    [3, tile("Canceladas")],
    [4, (p) => p.locator("tbody td").filter({ hasText: /^\d+\.\d+\.\d+$/ }).first()],
    [5, (p) => p.locator("tbody").getByText("Outro serviço", { exact: true }).first()],
    [6, (p) => p.locator("tbody").getByText("Cancelada", { exact: true }).first()],
    [7, (p) => p.locator("tbody").getByText("Não conta", { exact: true }).first()],
  ] },
  { chave: "pc-dados-clientes", papel: "gestor", url: "/dados-comerciais/clientes", viewport: LARGO, espera: 1500,
    clip: (p) => [cab(p), p.locator("tbody tr").last(), largura(p)], marcas: [
    [1, (p) => p.getByRole("button", { name: "Clientes internos" })],
    [2, btn(/Agrupar nomes iguais/)],
    [3, (p) => p.getByText(/CNPJs · .* nomes distintos/)],
    [4, (p) => p.getByText(/nomes diferentes no mesmo doc/).first()],
    [5, (p) => p.locator("tbody").getByRole("button", { name: /No follow-up/ }).first()],
    [6, (p) => p.locator("tbody").getByRole("button", { name: /Criar follow-up/ }).first()],
    [7, celula(0, 1)],
  ] },
  { chave: "pc-dados-cliente", papel: "gestor", url: "/dados-comerciais/clientes", viewport: LARGO, espera: 1500,
    antes: abrirLinha(0), clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByRole("heading").first()],
    [2, (p) => dlg(p).locator("div.grid").first()],
    [3, (p) => dlg(p).getByText(/^Vendedor\(es\):/)],
    [4, (p) => dlg(p).locator("table")],
  ] },

  // ── Aprovações ──
  { chave: "pc-desc-fila", papel: "gestor", url: "/aprovacoes", viewport: { width: 1440, height: 900 },
    clip: (p) => [cab(p), cartaoTabela(p), p.getByRole("button", { name: "Fabricação" })], marcas: [
    [1, (p) => p.getByRole("button", { name: "Desconto" }).locator("..")],
    [2, (p) => p.getByRole("button", { name: "Fila" }).locator("..")],
    [3, (p) => p.getByRole("button", { name: "Pendentes" })],
    [4, celula(0, 4)],
    [5, celula(0, 6)],
    [6, (p) => linha(0)(p).locator("button").nth(0)],
    [7, celula(0, 1)],
  ] },
  { chave: "pc-desc-todos", papel: "gestor", url: "/aprovacoes", viewport: { width: 1440, height: 900 },
    antes: clicar("Todos"), clip: (p) => [p.getByRole("button", { name: "Pendentes" }), p.locator("tbody tr").last()], marcas: [
    [1, (p) => p.locator("tbody td").filter({ hasText: "por Marina" }).first()],
    [2, (p) => p.locator("tbody td").filter({ hasText: "Auto-aprovado" }).first()],
  ] },
  { chave: "pc-desc-detalhe", papel: "gestor", url: "/aprovacoes", viewport: { width: 1440, height: 900 },
    antes: abrirLinha(0), clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("Alçada exigida")],
    [2, (p) => dlg(p).getByText(/^Motivo:/).locator("..")],
    [3, (p) => dlg(p).locator("textarea")],
    [4, (p) => dlg(p).getByRole("button", { name: /Recusar/ })],
    [5, (p) => dlg(p).getByRole("button", { name: /Aprovar/ })],
  ] },
  { chave: "pc-desc-config", papel: "gestor", url: "/aprovacoes", viewport: { width: 1440, height: 900 },
    antes: clicar("Configuração da alçada"), pad: 40, clip: (p) => [cab(p), btn(/Salvar configuração/)(p), p.getByRole("button", { name: "Fabricação" })], marcas: [
    [1, (p) => p.locator("main button[role=switch]").first()],
    [2, (p) => p.locator("main div.rounded-lg.border").filter({ hasText: "De (%)" }).first()],
    [3, (p) => p.locator("main div.rounded-lg.border").filter({ hasText: "De (%)" }).first().getByRole("combobox")],
    [4, btn(/Faixa/)],
    [5, (p) => p.locator("main div.rounded-lg.border").filter({ hasText: "De (%)" }).first().locator("button").last()],
    [6, btn(/Salvar configuração/)],
  ] },
  { chave: "pc-fab-fila", papel: "gestor", url: "/aprovacoes", viewport: { width: 1440, height: 900 },
    antes: clicar("Fabricação"), clip: (p) => [cab(p), cartaoTabela(p), p.getByRole("button", { name: "Fabricação" })], marcas: [
    [1, (p) => p.getByRole("button", { name: "Fabricação" }).locator("..")],
    [2, (p) => p.getByRole("button", { name: "Abaixo do mínimo" })],
    [3, celula(0, 3)],
    [4, celula(0, 4)],
    [5, celula(0, 6)],
    [6, (p) => linha(0)(p).locator("button").nth(0)],
  ] },
  { chave: "pc-fab-config", papel: "gestor", url: "/aprovacoes", viewport: { width: 1440, height: 900 },
    antes: clicar("Fabricação", "Regras de prazo"), pad: 40, clip: (p) => [cab(p), btn(/Salvar configuração/)(p), p.getByRole("button", { name: "Fabricação" })], marcas: [
    [1, (p) => p.locator("main button[role=switch]").first()],
    [2, (p) => p.locator("main input[type=number]").nth(0)],
    [3, (p) => p.locator("main input[type=number]").nth(1)],
    [4, btn(/Salvar configuração/)],
  ] },

  // ── Tabela de preços ──
  { chave: "pc-precos", papel: "gestor", url: "/tabela-de-precos", viewport: MEDIO,
    clip: (p) => [cab(p), cartaoTabela(p), p.locator("main p").filter({ hasText: /no \/vender/ }).first()], marcas: [
    [1, sel('main input[placeholder="Buscar produto ou código…"]')],
    [2, (p) => p.locator("main p").filter({ hasText: /no \/vender/ }).first()],
    [3, celula(0, 0)],
    [4, (p) => p.locator("tbody span", { hasText: /^PDV$/ }).first()],
    [5, (p) => p.getByText("sem preço — não aparece para venda").first()],
    [6, (p) => p.locator("tbody span", { hasText: /bonificação/ }).first()],
    [7, (p) => p.getByText(/espelha o pai/).first()],
    [8, (p) => p.locator("tbody input[type=number]").first()],
    [9, (p) => p.locator("tbody button[role=switch]").first()],
    [10, (p) => p.locator("tbody td").filter({ hasText: /^por / }).first()],
    [11, (p) => p.locator("tbody").getByRole("button", { name: /Salvar/ }).first()],
    [12, (p) => p.locator("tbody").getByRole("button", { name: /Microdistribuidor/ }).first()],
    [13, (p) => p.locator("tbody tr.opacity-50").first()],
  ] },

  // ── O que o colaborador vê ──
  { chave: "pc-restrito", papel: "colaborador", url: D, viewport: { width: 1440, height: 600 },
    clip: (p) => p.getByText("Área restrita a gestores.").locator(".."), pad: 40, marcas: [] },
];
