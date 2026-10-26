// Prints da área "demandas" (ver shots.mjs): Visão geral e o quadro de Demandas.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();
// Bloco da Visão geral pelo título (h3) → o cartão inteiro.
const bloco = (t) => (p) => p.locator("main h3").filter({ hasText: t }).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
const kpi = (t) => (p) => p.locator("main").getByText(t, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
const coluna = (t) => (p) => p.locator(".ti-column").filter({ has: p.locator(".ti-column-title", { hasText: new RegExp("^" + t + "$") }) }).first();
const cartao = (t) => (p) => p.locator(".ti-card").filter({ hasText: t }).first();
const blocoModal = (t) => (p) => dlg(p).locator("div.rounded-lg.border").filter({ has: p.locator("p", { hasText: new RegExp("^" + t + "$", "i") }) }).first();
const abrirCartao = (t) => async (p) => { await p.locator(".ti-card").filter({ hasText: t }).first().click(); await p.waitForTimeout(900); };
const ALTO = { width: 1440, height: 2300 };

export const SHOTS = [
  // ── Visão geral ──
  { chave: "visao-geral", papel: "colaborador", url: "/", viewport: { width: 1440, height: 1000 },
    clip: (p) => [p.locator("main h1").first(), kpi("Na fila (não resolvidas)")(p), bloco("Minhas demandas")(p), bloco("Paradas há mais de 7 dias")(p)], marcas: [
    [1, btn(/Abrir quadro/)],
    [2, kpi("Na fila (não resolvidas)")],
    [3, kpi("Em andamento")],
    [4, kpi("Sem responsável")],
    [5, kpi("Críticas abertas")],
    [6, (p) => p.locator("main").getByText(/Últimos 7 dias/).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [7, bloco("Minhas demandas")],
    [8, bloco("Sem responsável")],
    [9, bloco("Paradas há mais de 7 dias")],
  ] },
  { chave: "visao-indicadores", papel: "colaborador", url: "/", viewport: ALTO,
    clip: (p) => [bloco("Por etapa")(p), bloco("Chegaram por último")(p)], marcas: [
    [1, bloco("Por etapa")],
    [2, bloco("Fila por prioridade")],
    [3, bloco("Por sistema")],
    [4, bloco("Chegaram por último")],
  ] },
  { chave: "ranking-ti", papel: "colaborador", url: "/", viewport: ALTO,
    antes: async (p) => { await p.locator('button[title="Como é calculado"]').click(); },
    clip: (p) => bloco("Time de TI")(p), marcas: [
    [1, (p) => bloco("Time de TI")(p).getByRole("button", { name: "30 dias" }).locator("..")],
    [2, sel('button[title="Como é calculado"]')],
    [3, (p) => bloco("Time de TI")(p).getByText(/entregues/).first().locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")],
    [4, (p) => bloco("Time de TI")(p).locator("thead")],
    [5, (p) => bloco("Time de TI")(p).locator("tbody tr").first()],
    [6, (p) => bloco("Time de TI")(p).getByText(/Amostra em formação/)],
  ] },

  // ── Demandas: o quadro ──
  { chave: "demandas-quadro", papel: "colaborador", url: "/demandas", viewport: { width: 1960, height: 900 },
    antes: async (p) => { await p.locator('button[aria-label="Recolher menu"]').click(); await p.waitForTimeout(500); }, marcas: [
    [1, btn(/^Nova$/)],
    [2, sel('input[placeholder="Buscar demanda…"]')],
    [3, btn(/Minhas/)],
    [4, (p) => p.getByRole("combobox").filter({ hasText: "Qualquer pessoa" })],
    [5, (p) => p.getByRole("combobox").filter({ hasText: "Todos os tipos" })],
    [6, (p) => p.getByRole("combobox").filter({ hasText: "Todos os apps" })],
    [7, (p) => p.getByRole("combobox").filter({ hasText: "Toda prioridade" })],
    [8, (p) => coluna("Entrada")(p).locator(".ti-column-header")],
    [9, (p) => coluna("Na fila")(p).getByRole("button", { name: /sem dono/ })],
    [10, (p) => coluna("Em andamento")(p).getByText(/parada\(s\)/)],
    [11, (p) => p.locator(".ti-column-collapsed").first()],
  ] },
  { chave: "demandas-pessoa", papel: "colaborador", url: "/demandas", viewport: { width: 1440, height: 900 },
    antes: async (p) => { await p.getByRole("combobox").filter({ hasText: "Qualquer pessoa" }).click(); await p.waitForTimeout(500); },
    clip: (p) => [p.locator("[role=listbox]"), p.locator("button[role=combobox]").filter({ hasText: "Qualquer pessoa" })], marcas: [
    [1, (p) => p.getByRole("option", { name: "Sem responsável" })],
    [2, (p) => p.locator("[role=listbox]").getByText("Responsável (quem resolve)")],
    [3, (p) => p.locator("[role=listbox]").getByText("Solicitante (quem pediu)")],
  ] },
  { chave: "demandas-filtro-ativo", papel: "colaborador", url: "/demandas", viewport: { width: 1700, height: 700 },
    antes: async (p) => { await btn(/Minhas/)(p).click(); await p.waitForTimeout(500); },
    clip: (p) => [p.locator("h1").filter({ hasText: "Demandas" }), p.getByText(/Mostrando só as demandas/).locator("..")], pad: 10, marcas: [
    [1, (p) => p.getByText(/Mostrando só as demandas/)],
    [2, (p) => p.getByText(/Mostrando só as demandas/).locator("..").getByRole("button", { name: /Remover/ })],
    [3, btn(/Limpar/)],
  ] },
  { chave: "demandas-cartao", papel: "colaborador", url: "/demandas", viewport: { width: 1600, height: 900 },
    clip: (p) => [cartao("Vender não salva")(p), cartao("Desconto não aparece")(p)], pad: 12, marcas: [
    [1, (p) => cartao("Vender não salva")(p).locator(".ti-card-title")],
    [2, (p) => cartao("Vender não salva")(p).locator("span[title]").first()],
    [3, (p) => cartao("Vender não salva")(p).getByText("por Joana Mendes")],
    [4, (p) => cartao("Vender não salva")(p).getByText("Crítica", { exact: true })],
    [5, (p) => cartao("Desconto não aparece")(p).getByText("a triar", { exact: true })],
    [6, (p) => cartao("Vender não salva")(p).getByRole("button", { name: /Assumir/ })],
    [7, (p) => cartao("Vender não salva")(p).getByText(/^há \d+d$/)],
  ] },
  { chave: "demandas-cartao-dono", papel: "colaborador", url: "/demandas", viewport: { width: 1600, height: 900 },
    clip: (p) => [cartao("Exportar o quadro")(p), cartao("Baixa de título")(p)], pad: 12, marcas: [
    [1, (p) => cartao("Exportar o quadro")(p).locator(".ti-meta-row > span").first()],
    [2, (p) => cartao("Exportar o quadro")(p).locator('[title$="comentário(s)"]')],
    [3, (p) => cartao("Exportar o quadro")(p).locator('[title$="pendente(s)"]')],
    [4, (p) => cartao("Exportar o quadro")(p).getByText(/^há \d+d$/)],
  ] },

  // ── Demandas: o card aberto ──
  { chave: "demanda-aberta", papel: "colaborador", url: "/demandas", viewport: { width: 1440, height: 1000 },
    antes: abrirCartao("Exportar o quadro"), marcas: [
    [1, (p) => dlg(p).locator("h2").first()],
    [2, (p) => dlg(p).locator("h2").first().locator("xpath=following-sibling::div[1]")],
    [3, (p) => dlg(p).locator('button[title="Arquivar demanda"]')],
    [4, (p) => dlg(p).locator("button[title]").filter({ hasText: "Entrada" }).locator("..")],
    [5, btn(/Assumir esta demanda/)],
    [6, (p) => blocoModal("Responsável")(p)],
    [7, (p) => blocoModal("Prioridade")(p)],
    [8, (p) => blocoModal("Descrição")(p)],
    [9, (p) => blocoModal("Origem")(p)],
    [10, (p) => dlg(p).locator("textarea").first().locator("..")],
    [11, (p) => dlg(p).getByText("Fixados").locator("..").locator("..")],
    [12, btn(/Avançar para/)],
    [13, (p) => dlg(p).getByRole("button", { name: "Recusar" })],
    [14, (p) => dlg(p).locator("div.border-t").getByRole("button", { name: "Concluir" })],
  ] },
  { chave: "demanda-timeline", papel: "colaborador", url: "/demandas", viewport: { width: 1440, height: 1300 },
    antes: abrirCartao("Exportar o quadro"),
    clip: (p) => [dlg(p).getByRole("button", { name: /Comentário/ }).first(), dlg(p).getByText("Etapa alterada").first().locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")], pad: 16, marcas: [
    [1, (p) => dlg(p).getByRole("button", { name: /Comentário/ }).first()],
    [2, (p) => dlg(p).getByRole("button", { name: /Tarefa/ }).first()],
    [3, (p) => dlg(p).getByRole("button", { name: "Registrar" })],
    [4, (p) => dlg(p).getByRole("button", { name: /Desafixar/ }).first()],
    [5, (p) => dlg(p).getByRole("button", { name: "Concluir" }).first()],
    [6, (p) => dlg(p).getByText("Etapa alterada").first().locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")],
  ] },
  { chave: "demanda-concluir", papel: "colaborador", url: "/demandas", viewport: { width: 1440, height: 1000 },
    antes: async (p) => { await abrirCartao("Exportar o quadro")(p); await dlg(p).getByRole("button", { name: "Concluir" }).last().click(); await p.waitForTimeout(600); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).locator("textarea")],
    [2, (p) => dlg(p).getByRole("button", { name: "Concluir" })],
  ] },
  { chave: "demanda-nova", papel: "colaborador", url: "/demandas", viewport: { width: 1440, height: 1100 },
    antes: async (p) => { await btn(/^Nova$/)(p).click(); await p.waitForTimeout(600); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("Assunto *").locator("..")],
    [2, (p) => dlg(p).getByText("Descrição *").locator("..")],
    [3, (p) => dlg(p).getByText("Tipo", { exact: true }).locator("..")],
    [4, (p) => dlg(p).getByText("Sistema", { exact: true }).locator("..")],
    [5, (p) => dlg(p).getByText("Quem pediu").locator("..")],
    [6, (p) => dlg(p).getByText("Impede de trabalhar?").locator("..").locator("..")],
    [7, (p) => dlg(p).getByRole("button", { name: /Criar/ })],
  ] },
];
