// Prints da área "painel" (ver shots.mjs): a tela /painel (Painel do
// atendimento) e a aba Assuntos. Fixtures: fx_painel.ts e fx_assuntos.ts.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const tab = (t) => (p) => p.getByRole("tab", { name: t });
const main = (p) => p.locator("main");
const txt = (t, exact = false) => (p) => main(p).getByText(t, { exact }).first();
/** A seção (cartão com cabeçalho) cujo título começa com `t`. */
const secao = (t) => (p) => p.locator("section").filter({ has: p.locator("h2", { hasText: t }) }).first();
/** Um cartão do topo/indicadores pelo título. */
const cartao = (t) => (p) => main(p).locator("button, a, div.rounded-xl").filter({ has: p.getByText(t, { exact: true }) }).last();
const grade = (t) => (p) => cartao(t)(p).locator("..");
const sheet = (p) => p.locator('[role="dialog"]').last();

const ALTA = { width: 1440, height: 2400 };
const TOPO = { width: 1440, height: 900 };
const RAFAEL = "11111111-1111-1111-1111-111111111111";

export const SHOTS = [
  // ── O topo da tela ──
  { chave: "painel", papel: "gestor", url: "/painel", viewport: TOPO, pad: 8,
    clip: (p) => [p.getByRole("heading", { name: "Painel do atendimento" }), btn(/Horário e metas/)(p), p.getByRole("tablist").first()], marcas: [
    [1, (p) => main(p).getByRole("combobox").first()],
    [2, (p) => main(p).getByRole("combobox").nth(1)],
    [3, (p) => main(p).locator('div[role="group"]').first()],
    [4, btn(/Horário e metas/)],
    [5, txt(/Atualizado às/)],
    [6, grade("Esperando resposta")],
    [7, grade("Taxa de resposta")],
    [8, (p) => p.getByRole("tablist").first()],
  ] },
  // ── O agora ──
  { chave: "painel-agora", papel: "gestor", url: "/painel", viewport: TOPO, pad: 6,
    clip: (p) => grade("Esperando resposta")(p), marcas: [
    [1, cartao("Esperando resposta")],
    [2, cartao("A mais antiga")],
    [3, cartao("Com risco")],
    [4, cartao("Perdidas em 7 dias")],
    [5, cartao("Aguardando o cliente")],
    [6, cartao("Em atendimento")],
  ] },
  // ── Os indicadores do período ──
  { chave: "painel-indicadores", papel: "gestor", url: "/painel", viewport: TOPO, pad: 6,
    clip: (p) => grade("Taxa de resposta")(p), marcas: [
    [1, cartao("Taxa de resposta")],
    [2, cartao("1ª resposta (TMPR)")],
    [3, cartao("Tempo de resposta (TMR)")],
    [4, cartao(/^Dentro da meta/)],
    [5, cartao("Duração do atendimento (TMA)")],
    [6, cartao("Resolvidos no 1º contato (FCR)")],
    [7, cartao("Fechadas sem resposta")],
    [8, cartao("Perdidas (janela fechou)")],
    [9, cartao("Reabertas")],
    [10, cartao("Pediam resposta")],
  ] },
  // ── Visão geral ──
  { chave: "painel-geral", papel: "gestor", url: "/painel", viewport: ALTA,
    clip: (p) => [secao("Por dia")(p), secao("Por número")(p)], marcas: [
    [1, secao("Por dia")],
    [2, txt(/Mediana de resposta/)],
    [3, secao("Tempo até a resposta")],
    [4, (p) => secao("Tempo até a resposta")(p).getByText("Fechada sem resposta", { exact: true })],
    [5, secao("Por número")],
  ] },
  // ── Fila agora ──
  { chave: "painel-fila", papel: "gestor", url: "/painel?aba=fila", viewport: ALTA,
    clip: (p) => [main(p).getByRole("combobox").nth(2), secao("Esperando resposta")(p).locator("li").nth(3)], marcas: [
    [1, (p) => main(p).getByRole("combobox").nth(2)],
    [2, btn("Só com risco")],
    [3, (p) => secao("Esperando resposta")(p).locator("li").first()],
    [4, (p) => secao("Esperando resposta")(p).locator("li").first().locator("span.text-sm.font-semibold.tabular-nums")],
    [5, (p) => secao("Esperando resposta")(p).locator("li").first().getByText(/fecha em|janela fechada/)],
    [6, (p) => secao("Esperando resposta")(p).locator("li").first().getByRole("link", { name: /Abrir conversa/ })],
  ] },
  { chave: "painel-perdidas", papel: "gestor", url: "/painel?aba=fila", viewport: ALTA,
    clip: (p) => secao("Janela fechou")(p), marcas: [
    [1, (p) => secao("Janela fechou")(p).locator("li").first().getByText(/janela fechou/)],
  ] },
  // ── Assuntos ──
  { chave: "painel-assuntos", papel: "gestor", url: "/painel?aba=assuntos", viewport: ALTA, espera: 1500,
    clip: (p) => [grade("Reclamações")(p), secao("Assuntos")(p).locator("tr").filter({ hasText: "Onde está o pedido, prazo" }).first()], marcas: [
    [1, cartao("Reclamações")],
    [2, secao("Clientes por")],
    [3, secao("Risco")],
    [4, (p) => secao("Risco")(p).getByText("Sem resposta", { exact: true }).first()],
    [5, (p) => secao("Assuntos")(p).locator("tr").filter({ hasText: "Atraso, ainda não chegou" }).first()],
    [6, (p) => secao("Assuntos")(p).locator("th").filter({ hasText: "vs. anterior" })],
    [7, (p) => secao("Assuntos")(p).locator("th").filter({ hasText: "Sem resposta" })],
    [8, (p) => secao("Assuntos")(p).locator("th").filter({ hasText: "1ª resposta" })],
    [9, (p) => secao("Assuntos")(p).locator("tr").filter({ hasText: "Atraso, ainda não chegou" }).first().locator("td").nth(5)],
    [10, (p) => secao("Assuntos")(p).locator("tr").filter({ hasText: "Reclamações" }).first()],
  ] },
  { chave: "painel-assuntos-elogios", papel: "gestor", url: "/painel?aba=assuntos", viewport: { width: 1440, height: 3200 }, espera: 1500,
    clip: (p) => secao("Elogios")(p), marcas: [
    [1, (p) => secao("Elogios")(p).getByRole("button", { name: "Ver todos" })],
    [2, (p) => secao("Elogios")(p).locator("li").first().getByRole("link", { name: /Abrir/ })],
  ] },
  { chave: "painel-assuntos-quem", papel: "gestor", url: "/painel?aba=assuntos&topico=atraso", viewport: { width: 1440, height: 1000 }, espera: 1500,
    clip: sheet, pad: 0, marcas: [
    [1, (p) => sheet(p).locator("h2").first()],
    [2, (p) => sheet(p).getByText(/clientes ·/).first()],
    [3, (p) => sheet(p).locator("li").first().getByText("Sem resposta", { exact: true })],
    [4, (p) => sheet(p).locator("li").first().locator("ul")],
    [5, (p) => sheet(p).locator("li").first().getByRole("link", { name: /Abrir/ })],
    [6, (p) => sheet(p).getByRole("button", { name: /Mostrar mais/ })],
  ] },
  // ── Atendentes ──
  { chave: "painel-atendentes", papel: "gestor", url: "/painel?aba=atendentes", viewport: { width: 1920, height: 1400 },
    clip: (p) => secao("Quem atendeu")(p), marcas: [
    [1, (p) => secao("Quem atendeu")(p).locator("tbody tr").first().locator("td").first()],
    [2, (p) => secao("Quem atendeu")(p).getByRole("button", { name: /^Respondidas/ })],
    [3, (p) => secao("Quem atendeu")(p).getByRole("button", { name: /^Mediana/ })],
    [4, (p) => secao("Quem atendeu")(p).getByRole("button", { name: /^Na meta/ })],
    [5, (p) => secao("Quem atendeu")(p).getByRole("button", { name: /^Fechou sem responder/ })],
    [6, (p) => secao("Quem atendeu")(p).getByRole("button", { name: /^Reabertas/ })],
    [7, (p) => secao("Quem atendeu")(p).getByRole("button", { name: /^Última/ })],
  ] },
  { chave: "painel-pessoa", papel: "gestor", url: `/painel?aba=atendentes&pessoa=${RAFAEL}`, viewport: { width: 1440, height: 1500 },
    clip: (p) => [sheet(p).locator("h2").first(), sheet(p).getByRole("tablist"), sheet(p).getByRole("tabpanel").locator("li").nth(1)], pad: 16, marcas: [
    [1, (p) => sheet(p).locator("h2").first()],
    [2, (p) => sheet(p).getByText("Fechadas sem resposta", { exact: true }).first().locator("..")],
    [3, (p) => sheet(p).getByText("Mensagens por dia", { exact: true }).locator("..")],
    [4, (p) => sheet(p).getByText("Mensagens por hora", { exact: true }).locator("../..")],
    [5, (p) => sheet(p).getByRole("tablist")],
  ] },
  // ── Exceções ──
  { chave: "painel-excecoes", papel: "gestor", url: "/painel?aba=excecoes", viewport: ALTA,
    clip: (p) => [btn(/^Todos ·/)(p), secao("Fechadas sem resposta")(p).locator("li").nth(2)], marcas: [
    [1, btn(/^Todos ·/)],
    [2, (p) => main(p).getByRole("button", { name: "Só com risco" })],
    [3, (p) => secao("Fechadas sem resposta")(p).locator("li").first().getByText(/Marcou (resolvido|aguardando)/)],
    [4, (p) => secao("Fechadas sem resposta")(p).locator("li").first().getByText(/depois$/)],
  ] },
  // ── Horários ──
  { chave: "painel-horarios", papel: "gestor", url: "/painel?aba=horarios", viewport: ALTA,
    clip: (p) => secao("Dia da semana")(p), marcas: [
    [1, (p) => secao("Dia da semana")(p).locator("header div").first()],
    [2, (p) => secao("Dia da semana")(p).locator("span.border-2").first()],
    [3, (p) => secao("Dia da semana")(p).getByText("total", { exact: true })],
  ] },
  // ── Horário e metas ──
  { chave: "painel-config", papel: "gestor", url: "/painel", viewport: TOPO,
    antes: async (p) => { await btn(/Horário e metas/)(p).click(); await p.waitForTimeout(400); await p.locator('[role="dialog"] h2').click(); },
    clip: (p) => p.locator('[role="dialog"]').last(), pad: 0, marcas: [
    [1, (p) => p.locator("#cfg-ini").locator("../..")],
    [2, (p) => p.locator('[role="dialog"] button[aria-pressed]').first().locator("..")],
    [3, (p) => p.locator("#cfg-meta-min").locator("../..")],
    [4, (p) => p.locator("#cfg-meta-sla").locator("../..")],
    [5, (p) => p.locator("#cfg-meta-taxa").locator("../..")],
  ] },
];
