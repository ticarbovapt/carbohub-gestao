// Prints da área "comercial" (ver shots.mjs): Metas, PDVs, Minha Equipe e Carbo Chat.
// O número de cada marcador é o MESMO `n` do item em src/docs/secoes/comercial.ts.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();
const card = (t) => (p) => p.locator("main div.rounded-xl, main div.rounded-2xl").filter({ hasText: t }).last();
const linhaMeta = (nome) => (p) => p.locator("main div.border-l-2").filter({ hasText: nome }).first();
const linhaPdv = (nome) => (p) => p.locator("tbody tr").filter({ hasText: nome }).first();
const ALTO = { width: 1440, height: 1500 };
const LARGO = { width: 1920, height: 1000 };

export const SHOTS = [
  // ── Metas ──
  { chave: "metas", papel: "colaborador", url: "/metas", viewport: ALTO, marcas: [
    [1, (p) => p.getByRole("button", { name: "Mensal" }).locator("..")],
    [2, (p) => p.locator("main span.capitalize").locator("..")],
    [3, (p) => p.getByRole("button", { name: "Todos", exact: true }).locator("..")],
    [4, (p) => p.getByText("Esperado hoje:").locator("..")],
    [5, (p) => p.getByText("Sua meta do mês").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [6, (p) => p.getByText("Top 3 do Mês").locator("..")],
    [7, linhaMeta("Rafael Costa")],
    [8, (p) => linhaMeta("Rafael Costa")(p).getByText(/^proj\./)],
  ] },
  { chave: "metas-gestor", papel: "gestor", url: "/metas", viewport: ALTO, marcas: [
    [1, (p) => p.getByText("Total do Time").locator("..")],
    [2, (p) => p.getByText("precisa/dia").locator("..")],
    [3, (p) => p.getByText("na meta", { exact: true }).locator("..")],
    [4, (p) => p.getByText(/Projeção do time/).locator("..")],
    [5, (p) => linhaMeta("Rafael Costa")(p).getByText(/^Faltam/).locator("..")],
  ] },
  { chave: "metas-semanal", papel: "colaborador", url: "/metas",
    antes: async (p) => { await p.getByRole("button", { name: "Semanal" }).click(); },
    marcas: [
      [1, (p) => p.locator("main span.w-40").locator("..")],
      [2, (p) => p.getByText("Top 3 da Semana").locator("..")],
      [3, (p) => p.getByText("Desempenho da Semana").locator("..")],
    ] },
  // ── Pontos de Venda ──
  { chave: "pdvs", papel: "colaborador", url: "/pdvs", viewport: LARGO, marcas: [
    [1, btn("Novo PDV")],
    [2, (p) => p.getByRole("button", { name: /Ativos/ }).locator("..")],
    [3, sel('input[placeholder^="Nome, razão social"]')],
    [4, (p) => p.getByRole("combobox").filter({ hasText: /UF/ })],
    [5, (p) => p.getByRole("combobox").filter({ hasText: "Todos os donos" })],
    [6, (p) => p.getByText(/já compraram/)],
    [7, (p) => p.locator("thead button").filter({ hasText: "Comprado" })],
    [8, (p) => linhaPdv("Serra Verde")(p).getByText("sem documento")],
    [9, (p) => linhaPdv("Auto Posto Planalto")(p).locator("td").nth(5)],
    [10, (p) => linhaPdv("Caminho do Sol")(p).getByText("Microdistribuidor")],
    [11, linhaPdv("Posto Ponta Negra")],
  ] },
  { chave: "pdvs-gestor", papel: "gestor", url: "/pdvs", viewport: LARGO,
    clip: (p) => [p.locator("thead"), p.locator("tbody")], pad: 10, marcas: [
    [1, (p) => linhaPdv("Posto Ponta Negra")(p).locator('button[title="Editar"]')],
    [2, (p) => linhaPdv("Posto Ponta Negra")(p).locator('button[title="Pausar"]')],
    [3, (p) => linhaPdv("Posto Boa Viagem")(p).locator('button[title="Reativar"]')],
    [4, (p) => linhaPdv("Posto Ponta Negra")(p).locator('button[title="Desativar"]')],
  ] },
  { chave: "pdv-detalhe", papel: "colaborador", url: "/pdvs", viewport: { width: 1440, height: 1300 },
    antes: async (p) => { await linhaPdv("Posto Ponta Negra")(p).click(); },
    clip: (p) => dlg(p), pad: 6, marcas: [
    [1, (p) => dlg(p).locator("h2")],
    [2, (p) => dlg(p).getByText("Vendedor dono").locator("xpath=ancestor::div[contains(@class,'grid')][1]")],
    [3, (p) => dlg(p).getByText("Abrir no mapa")],
    [4, (p) => dlg(p).getByText("Mix de produto").locator("..").locator("div.grid")],
    [5, (p) => dlg(p).locator("table")],
    [6, (p) => dlg(p).getByText("Não conta").first()],
  ] },
  { chave: "pdv-novo", papel: "colaborador", url: "/pdvs", viewport: { width: 1440, height: 1700 },
    antes: async (p) => { await p.getByRole("button", { name: "Novo PDV" }).click(); },
    clip: (p) => dlg(p), pad: 6, marcas: [
    [1, sel('input[placeholder="Como o time chama o PDV"]')],
    [2, sel('input[placeholder="Como sai na nota fiscal"]')],
    [3, sel('input[placeholder="só números"]')],
    [4, (p) => dlg(p).getByRole("combobox").filter({ hasText: "Ativo" })],
    [5, (p) => dlg(p).getByRole("combobox").filter({ hasText: "Sem dono" })],
    [6, (p) => dlg(p).getByText("Também é microdistribuidor").locator("..").locator("..")],
    [7, sel('input[placeholder="Rua, número, bairro"]')],
    [8, (p) => dlg(p).getByText("Mix de produto").locator("..").locator("..")],
    [9, (p) => dlg(p).getByRole("button", { name: "Cadastrar" })],
  ] },
  // ── Minha Equipe ──
  { chave: "equipe", papel: "colaborador", url: "/equipe",
    antes: async (p) => { await p.locator("header button").filter({ hasText: "Rafael Costa" }).click(); },
    marcas: [
      [1, (p) => p.getByRole("menuitem", { name: /Minha equipe/ })],
      [2, sel('input[placeholder="Buscar por nome, usuário ou e-mail..."]')],
      [3, (p) => p.locator("main section div.flex").filter({ hasText: "Ana Souza" }).first()],
      [4, (p) => p.locator("main a[href^='mailto:']").first()],
      [5, (p) => p.getByText("sem e-mail")],
    ] },
  // ── Carbo Chat ──
  { chave: "chat", papel: "colaborador", url: "/chat?c=ch-dm", marcas: [
    [1, sel('aside a[href="/chat"]')],
    [2, sel('button[title="Definir meu status"]')],
    [3, sel('button[aria-label="Início"]')],
    [4, sel('button[aria-label="Explorar canais públicos"]')],
    [5, sel('button[aria-label="Mensagens agendadas"]')],
    [6, sel('button[aria-label="Nova conversa ou grupo"]')],
    [7, sel('input[aria-label="Buscar conversas e mensagens"]')],
    [8, (p) => p.getByRole("button", { name: "Tudo", exact: true }).locator("..")],
    [9, (p) => p.getByText("Comercial NE").first().locator("xpath=ancestor::*[self::button or self::div[@role='button'] or self::a][1]")],
    [10, sel('button[aria-label="Ligar (voz)"]')],
    [11, sel('button[aria-label="Buscar na conversa"]')],
    [12, (p) => p.getByText("👍").first()],
    [13, sel('button[aria-label="Adicionar anexo ou enquete"]')],
    [14, sel('[aria-label="Escrever mensagem"]')],
  ] },
];
