const btn = (t) => (p) => p.getByRole("button", { name: t });
const txt = (t) => (p) => p.getByText(t, { exact: false });
const sel = (s) => (p) => p.locator(s);
const card = (nome) => (p) => p.locator('[aria-roledescription="draggable"]').filter({ hasText: nome });
const dlg = (p) => p.locator('[role="dialog"]').last();
const sec = (p, t) => dlg(p).locator("div.rounded-lg.border").filter({ has: p.locator("p", { hasText: new RegExp("^" + t + "$", "i") }) }).last();

const blocoHome = (t) => (p) => p.locator("main").getByText(t, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
export const SHOTS = [
  // ── Navegação e Visão geral ──
  { chave: "inicio", papel: "colaborador", url: "/", marcas: [
    [1, sel('aside a[title="Carbo Marketing"]')],
    [2, sel('aside nav')],
    [3, sel('aside a[href="/documentacao"]')],
    [4, sel('button[aria-label="Recolher menu"]')],
    [5, sel('button[aria-label="Trocar de sistema"]')],
    [6, sel('button[title="Adicionar"]')],
    [7, sel('button[title="Notificações"]')],
    [8, sel('button[title="Reportar bug ou sugestão"]')],
    [9, sel('button[title="Modo escuro"]')],
    [10, (p) => p.locator("header button").filter({ hasText: "Rafael Costa" })],
    [11, sel('aside a[href="/documentacao"]')],
  ] },
  // ── Pipeline ──
];

// ── Vender, Vendas, Bugs, Notificações e Perfil ──
const vc = (t) => (p) => p.locator("main div.rounded-xl.border").filter({ has: p.locator("h3", { hasText: t }) }).last();
const ALTO = { width: 1440, height: 4200 };
const row = (num) => (p) => p.locator("tbody tr").filter({ hasText: num });
SHOTS.push(
  // Vender
  { chave: "vender-topo", papel: "colaborador", url: "/vender?edit=orc1", viewport: ALTO, pad: 30,
    clip: (p) => [p.getByText(/Editando o orçamento/), vc("Informações do Cliente")(p)], marcas: [
    [1, (p) => p.getByText(/Editando o orçamento/).locator("..")],
    [2, (p) => vc("Tipo de Operação")(p).locator("div.grid")],
    [3, sel('input[placeholder="CNPJ ou CPF"]')],
    [4, btn("Buscar dados")],
    [5, sel('input[placeholder="Nome do cliente"]')],
    [6, (p) => vc("Informações do Cliente")(p).getByText("É Licenciado?").locator("..").locator("..")],
    [7, (p) => vc("Informações do Cliente")(p).getByText("Inscrição Estadual").first().locator("..").locator("..")],
  ] },
  { chave: "vender-gestor", papel: "gestor", url: "/vender", viewport: ALTO,
    clip: (p) => [p.getByText("Responsável pela venda").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"), vc("Tipo de Operação")(p)], marcas: [
    [1, (p) => p.getByText("Responsável pela venda").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")],
  ] },
  { chave: "vender-endereco", papel: "colaborador", url: "/vender?edit=orc1", viewport: ALTO,
    clip: (p) => vc("Endereço de Entrega")(p), marcas: [
    [1, sel('input[placeholder="00000-000"]')],
    [2, btn("Localizar no mapa")],
    [3, btn("S/N")],
    [4, (p) => p.getByText(/Mesmo endereço da entrega/).locator("..")],
  ] },
  { chave: "vender-itens", papel: "colaborador", url: "/vender?edit=orc1", viewport: ALTO,
    clip: (p) => vc("Itens do Pedido")(p), marcas: [
    [1, btn(/Adicionar Item/)],
    [2, (p) => vc("Itens do Pedido")(p).getByRole("combobox").first()],
    [3, (p) => vc("Itens do Pedido")(p).locator('input[type="number"]').first()],
    [4, (p) => vc("Itens do Pedido")(p).getByText(/Preço de/).first()],
    [5, (p) => vc("Itens do Pedido")(p).getByText("Desconto").first().locator("..")],
    [6, (p) => vc("Itens do Pedido")(p).getByText(/Bonificação — 100%/)],
    [7, sel('input[placeholder="Ex.: fidelização, volume…"]')],
    [8, (p) => vc("Itens do Pedido")(p).getByText(/aprovação|Aprovação automática/).first()],
    [9, (p) => vc("Itens do Pedido")(p).getByText("Subtotal").locator("..").locator("..")],
  ] },
  { chave: "vender-produto", papel: "colaborador", url: "/vender", viewport: { width: 1440, height: 1100 },
    antes: async (p) => { await p.waitForTimeout(1500); await vc("Itens do Pedido")(p).getByRole("combobox").first().click(); await p.waitForTimeout(800); },
    clip: (p) => [p.locator("[role=listbox]"), vc("Itens do Pedido")(p).locator("button[role=combobox]").first()], marcas: [
    [1, (p) => p.locator('[role="listbox"]').getByText("CarboZé 100ml", { exact: true })],
    [2, (p) => p.getByRole("option", { name: /Padrão/ }).nth(1)],
    [3, (p) => p.getByRole("option", { name: /PDV/ }).first()],
    [4, (p) => p.getByRole("option", { name: /Microdistribuidor/ }).first()],
    [5, (p) => p.getByRole("option", { name: /Bonificação/ }).first()],
  ] },
  { chave: "vender-prazo", papel: "colaborador", url: "/vender?edit=orc1", viewport: ALTO,
    clip: (p) => [vc("Como o produto sai")(p), vc("Recorrência")(p)], marcas: [
    [1, (p) => vc("Como o produto sai")(p).getByText("Precisa produzir").locator("xpath=ancestor::button[1]")],
    [2, (p) => vc("Como o produto sai")(p).getByText("Pronta entrega").locator("xpath=ancestor::button[1]")],
    [3, (p) => vc("Prazo de Entrega")(p).getByRole("button").first()],
    [4, (p) => vc("Prazo de Entrega")(p).getByText(/Fabricar até/).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [5, (p) => p.getByRole("switch", { name: "Ativar recorrência" })],
  ] },
  { chave: "vender-pagamento", papel: "colaborador", url: "/vender?edit=orc1", viewport: ALTO,
    clip: (p) => [vc("Forma de Pagamento")(p), vc("Observações")(p)], marcas: [
    [1, (p) => vc("Forma de Pagamento")(p).getByRole("combobox").first()],
    [2, sel('input[placeholder="ex.: 30/60/90"]')],
    [3, (p) => vc("Dados Estratégicos")(p)],
    [4, (p) => vc("Observações")(p)],
  ] },
  { chave: "vender-rodape", papel: "colaborador", url: "/vender?edit=orc1",
    clip: (p) => p.locator("main div.sticky.bottom-0"), pad: 6, marcas: [
    [1, (p) => p.locator("main div.sticky.bottom-0").getByText("Total").locator("..")],
    [2, btn("Cancelar")],
    [3, btn(/Salvar e\s+Gerar PDF/)],
    [4, btn(/Enviar por\s+E-mail/)],
    [5, btn(/Salvar e Vender/)],
  ] },
  { chave: "vender-vapt", papel: "colaborador", url: "/vender?edit=orc2", viewport: ALTO,
    clip: (p) => [vc("Itens de Serviço")(p), vc("Previsão de Execução")(p)], marcas: [
    [1, (p) => vc("Itens de Serviço")(p).getByRole("combobox").first()],
    [2, (p) => vc("Itens de Serviço")(p).getByText("Tem bonificação").first().locator("..")],
    [3, (p) => vc("Itens de Serviço")(p).getByText(/Vai gerar/)],
    [4, (p) => vc("Itens de Serviço")(p).getByText(/Serviços que acompanham/).locator("..")],
    [5, (p) => vc("Previsão de Execução")(p).getByRole("button").first()],
  ] },
  // Vendas
  // Bugs e sugestões
  { chave: "bug-dialogo", papel: "colaborador", url: "/", viewport: { width: 1440, height: 1500 },
    antes: async (p) => { await p.locator('button[title="Reportar bug ou sugestão"]').click(); await p.getByRole("button", { name: "Reportar", exact: true }).last().click(); },
    clip: (p) => p.locator('[role="dialog"]').last(), marcas: [
    [1, (p) => dlg(p).getByRole("button", { name: /Sugestão/ }).locator("..")],
    [2, sel("#bug-title")],
    [3, sel("#bug-desc")],
    [4, (p) => dlg(p).getByText(/Isso te impede de trabalhar/).locator("..")],
    [5, (p) => dlg(p).getByText(/Anexar print/).first()],
    [6, (p) => dlg(p).getByRole("button", { name: "Enviar" })],
  ] },
  { chave: "bugs", papel: "colaborador", url: "/chamados",
    antes: async (p) => { await p.getByRole("button", { name: /^Todos/ }).click(); },
    marcas: [
    [1, (p) => p.getByRole("button", { name: /^Bugs/ }).locator("..")],
    [2, (p) => p.getByRole("button", { name: /Em andamento/ }).locator("..")],
    [3, (p) => p.getByText("Filtro do quadro não aplicava a etiqueta").locator("xpath=ancestor::*[contains(@class,'rounded')][1]")],
  ] },
  { chave: "bugs-gestor", papel: "gestor", url: "/chamados",
    antes: async (p) => { await p.getByRole("button", { name: /Sugestões/ }).click(); await p.getByText("Mostrar a capa do cartão na Tabela").click(); },
    clip: (p) => p.locator('[role="dialog"]').last(), marcas: [
    [1, (p) => dlg(p).locator("textarea")],
    [2, (p) => dlg(p).getByRole("button", { name: "Recusar" })],
    [3, (p) => dlg(p).getByRole("button", { name: /Marcar como/ })],
  ] },
  // Notificações e Perfil
  { chave: "notificacoes", papel: "colaborador", url: "/",
    antes: async (p) => { await p.locator('button[title="Notificações"]').click(); },
    clip: (p) => [p.locator('[role="dialog"], [data-radix-popper-content-wrapper]').last(), p.locator('button[title="Notificações"]')], marcas: [
    [1, (p) => p.getByRole("tab", { name: /Não lidas/ }).locator("..")],
    [2, (p) => p.getByRole("button", { name: "Marcar lidas" })],
    [3, (p) => p.getByText("Marina Alves mencionou você").locator("xpath=ancestor::div[contains(@class,'group')][1]")],
  ] },
  { chave: "perfil", papel: "colaborador", url: "/perfil", marcas: [
    [1, btn(/Alterar foto/)],
    [2, (p) => p.getByText("Nome completo").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [3, (p) => p.getByText(/Para alterar outras informações/)],
  ] },
);
