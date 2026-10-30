// Prints da área "config" (ver shots.mjs): Funcionários, Integração Bling,
// Integração Bling 2, NFS-e Nacional e o passo a passo de reconexão.
// `?mock=desconectado|expirado|falhou` é parâmetro SÓ do harness (fx_config.ts).
const btn = (t) => (p) => p.getByRole("button", { name: t });
const txt = (t) => (p) => p.getByText(t, { exact: false });
const sel = (s) => (p) => p.locator(s);
const cartao = (t) => (p) => p.locator("main").getByText(t, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
const titulo = (p) => p.locator("main h1").first();
const dlg = (p) => p.locator('[role="dialog"], [role="alertdialog"]').last();

// O callback do Bling volta para a tela de integração 1,8 s depois do sucesso.
// Para fotografar a mensagem, o harness desliga só aquele timer.
const semVoltar = (url) => async (p) => {
  await p.addInitScript(() => {
    const st = window.setTimeout;
    window.setTimeout = (f, ms, ...a) => (ms === 1800 ? 0 : st(f, ms, ...a));
  });
  await p.goto("http://localhost:" + (process.env.DOCS_PORT ?? 8104) + url, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
};
const centro = (p) => p.locator("main div.text-center").first();
const ALTO = { width: 1440, height: 1900 };

export const SHOTS = [
  // ── Reconexão ──
  { chave: "blingcon-menu", papel: "gestor", url: "/integracoes/bling", viewport: { width: 1440, height: 1300 },
    clip: (p) => [p.locator('aside a[href="/funcionarios"]'), p.locator('aside a[href="/integracoes/nfse"]')], pad: 20, marcas: [
    [1, sel('aside a[href="/integracoes/bling"]')],
    [2, sel('aside a[href="/integracoes/bling2"]')],
  ] },
  { chave: "blingcon-desconectado", papel: "gestor", url: "/integracoes/bling?mock=desconectado",
    clip: (p) => [titulo(p), cartao("Bling ERP")(p)], marcas: [
    [1, btn("Conectar ao Bling")],
  ] },
  { chave: "blingcon-conectado", papel: "gestor", url: "/integracoes/bling",
    clip: (p) => cartao("Bling ERP")(p), marcas: [
    [1, txt("Conectado")],
    [2, btn("Desconectar")],
  ] },
  { chave: "blingcon-expirado", papel: "gestor", url: "/integracoes/bling?mock=expirado",
    clip: (p) => cartao("Bling ERP")(p), marcas: [
    [1, txt("Token Expirado")],
    [2, btn("Renovar")],
  ] },
  { chave: "blingcon-sucesso", papel: "gestor", url: "/", antes: semVoltar("/integracoes/bling/callback?code=novo"),
    clip: (p) => centro(p), pad: 40, marcas: [
    [1, txt("conectado com sucesso")],
  ] },
  { chave: "blingcon-erro", papel: "gestor", url: "/integracoes/bling/callback?error=access_denied",
    clip: (p) => centro(p), pad: 40, marcas: [
    [1, txt("Bling retornou um erro")],
    [2, txt("Voltar para integrações")],
  ] },
  { chave: "blingcon-codigo", papel: "gestor", url: "/", antes: semVoltar("/integracoes/bling/callback?code=velho"),
    clip: (p) => centro(p), pad: 40, marcas: [
    [1, txt("invalid_grant")],
    [2, txt("Voltar para integrações")],
  ] },
  { chave: "blingcon-historico", papel: "gestor", url: "/integracoes/bling?mock=falhou", viewport: ALTO,
    clip: (p) => cartao("Histórico de Sincronização")(p), marcas: [
    [1, (p) => p.locator("main div.rounded-lg.bg-muted\\/50").first()],
    [2, txt("invalid_token")],
  ] },
  { chave: "blingcon-desconectar", papel: "gestor", url: "/integracoes/bling",
    antes: async (p) => { await btn("Desconectar")(p).click(); await p.waitForTimeout(700); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText(/de todo o ecossistema/)],
    [2, (p) => dlg(p).getByRole("button", { name: "Cancelar" })],
    [3, (p) => dlg(p).getByRole("button", { name: "Desconectar" })],
  ] },
  { chave: "blingcon-b2", papel: "gestor", url: "/integracoes/bling2?mock=desconectado",
    clip: (p) => cartao("Bling — segunda conta")(p), marcas: [
    [1, btn("Conectar ao Bling 2")],
  ] },

  // ── Bling 1 — a tela inteira ──
  { chave: "bling1-tela", papel: "gestor", url: "/integracoes/bling", viewport: ALTO,
    clip: (p) => [titulo(p), cartao("Histórico de Sincronização")(p)], marcas: [
    [1, cartao("Bling ERP")],
    [2, cartao("Produtos")],
    [3, cartao("Contatos")],
    [4, cartao("Pedidos")],
    [5, btn("Sincronizar Tudo")],
    [6, btn(/Importar Pedidos Bling/)],
    [7, cartao("Histórico de Sincronização")],
  ] },

  // ── Bling 2 — a tela inteira ──
  { chave: "bling2-tela", papel: "gestor", url: "/integracoes/bling2", viewport: { width: 1440, height: 2300 },
    clip: (p) => [titulo(p), cartao("Histórico de sincronização")(p)], marcas: [
    [1, cartao("Carbo Filial SP")],
    [2, cartao("Pedidos de venda")],
    [3, btn("Sincronizar tudo")],
    [4, btn("Buscar itens dos pedidos")],
    [5, cartao("Histórico de sincronização")],
  ] },

  // ── NFS-e Nacional ──
  { chave: "nfse-tela", papel: "colaborador", url: "/integracoes/nfse", viewport: { width: 1920, height: 1400 },
    clip: (p) => p.locator("main div.space-y-5").first(), marcas: [
    [1, txt("Último NSU lido")],
    [2, (p) => p.getByText("Receita (emitidas válidas)").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [3, (p) => p.getByRole("tab", { name: "Emitidas · receita" }).locator("..")],
    [4, (p) => p.getByRole("tab", { name: "Só válidas" }).locator("..")],
    [5, (p) => p.getByRole("tab", { name: "Todos os anos" }).locator("..")],
    [6, sel('input[placeholder="Nº, CNPJ, nome, descrição ou chave…"]')],
    [7, (p) => p.locator("thead th").first()],
    [8, (p) => p.locator("tbody tr").filter({ hasText: "229" }).locator("td").nth(3)],
    [9, txt("Substituída pela 230")],
    [10, (p) => p.locator("tbody tr").first().getByRole("button", { name: /XML/ })],
    [11, (p) => p.locator("tbody tr").first().getByRole("button", { name: /PDF/ })],
    [12, (p) => p.locator("tbody tr").first().locator("button").nth(2)],
    [13, (p) => p.getByText(/Página 1 de/).locator("..")],
  ] },
  { chave: "nfse-todas", papel: "colaborador", url: "/integracoes/nfse?papel=todas", viewport: { width: 1920, height: 1100 },
    clip: (p) => [p.getByText("Notas no filtro").locator("xpath=ancestor::div[contains(@class,'grid')][1]"), txt("Receita e despesa não se somam")(p).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")], marcas: [
    [1, (p) => p.getByText("Saldo (receita − despesa)").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [2, txt("Receita e despesa não se somam")],
  ] },
  { chave: "nfse-ano", papel: "colaborador", url: "/integracoes/nfse?ano=2025", viewport: { width: 1920, height: 1100 },
    clip: (p) => [p.getByRole("tab", { name: "Emitidas · receita" }), txt("passou a emitir NFS-e")(p)], marcas: [
    [1, sel("main select")],
    [2, txt("passou a emitir NFS-e")],
  ] },

  // ── Funcionários ──
  { chave: "func-equipe", papel: "gestor", url: "/funcionarios", viewport: { width: 1440, height: 1100 },
    clip: (p) => [titulo(p), btn(/Novo funcionário/)(p), p.locator("main table")], marcas: [
    [1, btn(/Novo funcionário/)],
    [2, (p) => p.getByRole("tab", { name: /Equipe/ }).locator("..")],
    [3, (p) => p.locator("main button[role=combobox]").first()],
    [4, sel('input[placeholder="Buscar funcionário…"]')],
    [5, (p) => p.locator("tbody tr").first().getByText("Pendente")],
    [6, (p) => p.locator("tbody tr").filter({ hasText: "Rafael Costa" }).getByText("Completo")],
    [7, (p) => p.locator("tbody tr").first().getByRole("button", { name: /Editar/ })],
    [8, (p) => p.locator("tbody tr").filter({ hasText: "Sérgio Mota" }).getByText("Avulso")],
  ] },
  { chave: "func-editar", papel: "gestor", url: "/funcionarios", viewport: { width: 1440, height: 1300 },
    antes: async (p) => { await p.locator("tbody tr").filter({ hasText: "Sérgio Mota" }).getByRole("button", { name: /Editar/ }).click(); await p.waitForTimeout(700); await dlg(p).locator("h2").click(); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).locator('input[placeholder="Nome completo"]')],
    [2, (p) => dlg(p).locator('input[placeholder="000.000.000-00"]')],
    [3, (p) => dlg(p).getByText("Data de aniversário").locator("..")],
    [4, (p) => dlg(p).getByText(/Vincular usuário do sistema/).locator("..")],
    [5, (p) => dlg(p).getByText("Tipo de chave PIX").locator("..")],
    [6, (p) => dlg(p).locator('input[placeholder="Chave PIX"]')],
    [7, (p) => dlg(p).getByText("Banco", { exact: true }).locator("..")],
    [8, (p) => dlg(p).getByText("Contato de emergência (nome)").locator("..")],
    [9, (p) => dlg(p).getByRole("button", { name: "Salvar" })],
  ] },
  { chave: "func-aniversarios", papel: "gestor", url: "/funcionarios?aba=aniversarios", viewport: { width: 1440, height: 1700 },
    clip: (p) => p.locator("main div.space-y-6").first(), marcas: [
    [1, (p) => p.getByText("Com data cadastrada").locator("xpath=ancestor::div[contains(@class,'grid')][1]")],
    [2, txt("Aniversário hoje!")],
    [3, txt("Chegando")],
    [4, txt("Calendário anual")],
    [5, txt("Sem data de aniversário")],
  ] },
  { chave: "func-colab", papel: "colaborador", url: "/funcionarios",
    clip: (p) => [titulo(p), txt("Acesso restrito")(p).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")], marcas: [
    [1, txt("Acesso restrito")],
  ] },
];
