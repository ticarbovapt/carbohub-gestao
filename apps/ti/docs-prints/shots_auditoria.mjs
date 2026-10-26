// Prints da área "auditoria" (ver shots.mjs): Central de Auditoria,
// Acompanhamento Comercial, Último acesso e Adoção do Carbo Chat.
// As quatro telas só respondem a gestor no banco — por isso todos os prints
// são do gestor.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const main = (p) => p.locator("main");
// Cartão que contém um título (h2/h3/rótulo) — sobe até o primeiro bloco arredondado.
const caixa = (t) => (p) => main(p).getByText(t, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
const tab = (t) => (p) => p.getByRole("tab", { name: t });
const ALTO = { width: 1440, height: 2600 };
// O avatar da auditoria cai no DiceBear (bloqueado no harness): troca por iniciais.
const avatares = async (p) => {
  await p.evaluate(() => {
    const cores = ["#3BC770", "#0EA5E9", "#F59E0B", "#8B5CF6"];
    document.querySelectorAll("main img").forEach((img, i) => {
      if (!img.src.includes("dicebear")) return;
      const nome = img.alt && img.alt !== "avatar" ? img.alt : "Sistema";
      const ini = nome === "Sistema" ? "⚙" : nome.split(" ").map((x) => x[0]).slice(0, 2).join("");
      const cor = nome === "Sistema" ? "#64748B" : cores[nome.length % 4];
      img.src = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='${cor}'/><text x='48' y='60' font-family='Arial' font-size='38' font-weight='700' fill='white' text-anchor='middle'>${ini}</text></svg>`);
    });
  });
};

export const SHOTS = [
  // ── Central de Auditoria ──
  { chave: "auditoria", papel: "gestor", url: "/auditoria", viewport: { width: 1440, height: 1250 }, antes: avatares, marcas: [
    [1, (p) => main(p).getByRole("heading", { name: /Central de Auditoria/ })],
    [2, btn("Atualizar")],
    [3, sel('input[placeholder^="Buscar por descrição"]')],
    [4, (p) => main(p).getByRole("button", { name: "Todas", exact: true })],
    [5, (p) => main(p).locator("div.flex.flex-wrap.gap-1\\.5 button").filter({ hasText: /^Vendas$/ })],
    [6, (p) => main(p).locator("div.space-y-2 > div.rounded-lg.border").first()],
    [7, (p) => main(p).getByText(/evento\(s\)/)],
  ] },
  { chave: "auditoria-detalhe", papel: "gestor", url: "/auditoria",
    antes: async (p) => { await avatares(p); await main(p).locator("div.space-y-2 > div.rounded-lg.border button").first().click(); },
    clip: (p) => main(p).locator("div.space-y-2 > div.rounded-lg.border").first(), pad: 10, marcas: [
    [1, (p) => main(p).locator("div.space-y-2 > div.rounded-lg.border").first().locator("span.rounded-full").first()],
    [2, (p) => main(p).locator("div.space-y-2 > div.rounded-lg.border").first().locator("p.text-muted-foreground").first()],
    [3, (p) => main(p).locator("div.space-y-2 > div.rounded-lg.border").first().locator("p.text-\\[11px\\]")],
    [4, (p) => main(p).locator("div.space-y-2 > div.rounded-lg.border").first().locator("dl")],
  ] },

  // ── Acompanhamento Comercial ──
  { chave: "acompanhamento", papel: "gestor", url: "/acompanhamento", viewport: ALTO,
    clip: (p) => [main(p).getByRole("heading", { name: "Acompanhamento" }), caixa("Movimento diário")(p)], marcas: [
    [1, (p) => main(p).getByRole("button", { name: "30 dias" })],
    [2, (p) => main(p).locator("select")],
    [3, btn(/Prazos/)],
    [4, (p) => main(p).getByText("Criados hoje", { exact: true }).locator("xpath=ancestor::div[contains(@class,'grid')][1]")],
    [5, caixa("Esquecidos")],
    [6, caixa("Em orçamento")],
    [7, caixa("Pipeline com preço montado")],
    [8, (p) => main(p).getByText(/Pipeline aberto por estimativa/)],
    [9, caixa("Movimento diário")],
  ] },
  { chave: "acompanhamento-listas", papel: "gestor", url: "/acompanhamento", viewport: { width: 1760, height: 2600 },
    clip: (p) => [caixa("Por pessoa")(p), caixa("Esperas vencidas")(p)], marcas: [
    [1, caixa("Por pessoa")],
    [2, caixa("Funil agora")],
    [3, caixa("Repasses ao closer")],
    [4, caixa("Por que perdemos, no período")],
    [5, (p) => main(p).getByRole("button", { name: /Transportadora Rota Norte/ })],
    [6, caixa("Esperas vencidas")],
  ] },
  { chave: "acompanhamento-prazos", papel: "gestor", url: "/acompanhamento",
    antes: async (p) => { await btn(/Prazos/)(p).click(); await p.waitForTimeout(500); await p.evaluate(() => document.activeElement?.blur()); },
    clip: (p) => p.locator('[role="dialog"]'), pad: 4, marcas: [
    [1, (p) => p.locator('[role="dialog"]').getByText("Inbound", { exact: true })],
    [2, (p) => p.locator('[role="dialog"] input').first()],
    [3, (p) => p.locator('[role="dialog"]').getByRole("button", { name: "Salvar" }).first()],
  ] },
  { chave: "acompanhamento-card", papel: "gestor", url: "/acompanhamento", viewport: { width: 1440, height: 1300 },
    antes: async (p) => { await main(p).getByRole("button", { name: /Transportadora Rota Norte/ }).click(); await p.waitForTimeout(700); },
    clip: (p) => [p.locator("div.max-w-xl div.sticky"), p.locator("div.max-w-xl").getByText("Ligação de diagnóstico").locator("xpath=ancestor::div[contains(@class,'border-b')][1]")], pad: 0, marcas: [
    [1, sel('a[title="Abrir no CRM"]')],
    [2, (p) => p.locator("div.max-w-xl").getByText("Valor estimado").locator("xpath=ancestor::div[contains(@class,'grid')][1]")],
    [3, (p) => p.locator("div.max-w-xl").getByText("Qualificação", { exact: true }).locator("..")],
    [4, (p) => p.locator("div.max-w-xl").getByText("Orçamentos", { exact: true }).locator("..")],
    [5, sel('textarea[placeholder^="Comentar neste card"]')],
    [6, (p) => p.locator("div.max-w-xl").getByText(/^Histórico/).locator("..")],
  ] },

  // ── Último acesso ──
  { chave: "ultimo-acesso", papel: "gestor", url: "/ultimo-acesso", marcas: [
    [1, (p) => main(p).locator("div.grid.grid-cols-3")],
    [2, (p) => p.getByRole("tablist")],
    [3, sel('input[placeholder="Buscar por nome..."]')],
    [4, (p) => main(p).getByRole("combobox").nth(0)],
    [5, (p) => main(p).getByRole("combobox").nth(1)],
    [6, (p) => main(p).getByRole("combobox").nth(2)],
    [7, (p) => main(p).locator("tbody tr").first().locator("td").nth(3)],
    [8, (p) => main(p).locator("tbody tr").first().locator("td").nth(5)],
    [9, (p) => main(p).getByText(/usuário\(s\) exibido/)],
  ] },
  { chave: "ultimo-acesso-licenciados", papel: "gestor", url: "/ultimo-acesso",
    antes: async (p) => { await tab(/Licenciados/)(p).click(); await p.waitForTimeout(400); },
    clip: (p) => main(p).locator('[role="tabpanel"][data-state="active"]'), pad: 10, marcas: [
    [1, (p) => main(p).getByRole("combobox").first()],
    [2, (p) => main(p).locator("tbody tr").first().locator("td").nth(3)],
    [3, (p) => main(p).locator("tbody tr").first().locator("td").nth(4)],
  ] },
  { chave: "ultimo-acesso-lojas", papel: "gestor", url: "/ultimo-acesso",
    antes: async (p) => { await tab(/Lojas/)(p).click(); await p.waitForTimeout(400); },
    clip: (p) => main(p).locator('[role="tabpanel"][data-state="active"]'), pad: 10, marcas: [
    [1, (p) => main(p).getByRole("combobox").first()],
    [2, (p) => main(p).locator("tbody tr").first().locator("td").nth(3)],
    [3, (p) => main(p).locator("tbody tr").first().locator("td").nth(4)],
  ] },

  // ── Adoção do Carbo Chat ──
  { chave: "chat-adocao", papel: "gestor", url: "/chat/adocao", viewport: ALTO,
    clip: (p) => [main(p).getByRole("heading", { name: /Adoção do Carbo Chat/ }), caixa("Canais e conversas")(p)], marcas: [
    [1, (p) => main(p).getByText("Ativos 30 dias", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [2, (p) => main(p).getByText("Mensagens 30 dias", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [3, (p) => main(p).getByText("Com push", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [4, (p) => main(p).getByText("Sem push", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [5, caixa("Tendência (30 dias)")],
    [6, caixa("Mensagens por setor (30 dias)")],
    [7, caixa("Canais e conversas")],
  ] },
  { chave: "chat-adocao-pendencias", papel: "gestor", url: "/chat/adocao", viewport: ALTO,
    clip: (p) => caixa("Pendências de onboarding")(p), pad: 6, marcas: [
    [1, tab("Instalação & push")],
    [2, (p) => main(p).locator('[role="tabpanel"][data-state="active"] tbody tr').first().locator("td").nth(2)],
    [3, (p) => main(p).locator('[role="tabpanel"][data-state="active"] tbody tr').first().locator("td").nth(3)],
    [4, tab("Inativos")],
  ] },
  { chave: "chat-adocao-inativos", papel: "gestor", url: "/chat/adocao", viewport: ALTO,
    antes: async (p) => { await tab("Inativos")(p).click(); await p.waitForTimeout(400); },
    clip: (p) => caixa("Pendências de onboarding")(p), pad: 6, marcas: [
    [1, (p) => main(p).locator('[role="tabpanel"][data-state="active"]').getByRole("combobox")],
    [2, (p) => main(p).locator('[role="tabpanel"][data-state="active"] tbody tr').first().locator("td").nth(3)],
    [3, (p) => main(p).locator('[role="tabpanel"][data-state="active"] tbody tr').nth(1).locator("td").nth(3)],
  ] },
];
