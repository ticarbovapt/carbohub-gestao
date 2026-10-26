// Prints da área "sistema" (ver shots.mjs): Avisos de status e Carbo Academy — acessos.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
// O card (CarboCard) que contém o título h3 dado.
const bloco = (t) => (p) => p.locator("main h3", { hasText: t }).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
const ALTO = { width: 1440, height: 2400 };
const linhaAc = (nome) => (p) => p.locator("main div.divide-y > div").filter({ hasText: nome });

export const SHOTS = [
  // ── Avisos de status ──
  { chave: "status", papel: "colaborador", url: "/status", pad: 10,
    clip: (p) => [p.getByText("Emissão de nota fiscal em manutenção").first().locator("xpath=ancestor::div[contains(@class,'text-white')][1]"), bloco("No ar agora")(p)], marcas: [
    [1, (p) => p.getByText("Emissão de nota fiscal em manutenção").first().locator("xpath=ancestor::div[contains(@class,'text-white')][1]")],
    [2, bloco("No ar agora")],
    [3, btn("Encerrar")],
  ] },
  { chave: "status-publicar", papel: "colaborador", url: "/status", viewport: ALTO,
    antes: async (p) => {
      await p.getByRole("button", { name: /Manutenção/ }).click();
      await p.locator("#st-titulo").fill("Bling fora do ar");
      await p.locator("#st-msg").fill("Os pedidos continuam sendo registrados e serão faturados quando voltar.");
    },
    clip: bloco("Publicar um aviso"), marcas: [
    [1, (p) => bloco("Publicar um aviso")(p).locator("div.grid").first()],
    [2, sel("#st-titulo")],
    [3, (p) => p.getByText("Previsão de normalização", { exact: true }).locator("..")],
    [4, sel("#st-msg")],
    [5, (p) => p.getByText("Em quais apps").locator("..")],
    [6, (p) => p.getByText("Quando você encerrar").locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")],
    [7, (p) => p.getByText("Como vai aparecer").locator("xpath=ancestor::div[1]").locator("div.overflow-hidden")],
    [8, btn(/Publicar a tarja/)],
  ] },
  { chave: "status-historico", papel: "colaborador", url: "/status", viewport: ALTO,
    clip: bloco("Histórico"), marcas: [
    [1, (p) => bloco("Histórico")(p).locator("div.rounded-xl").first()],
    [2, btn("Reabrir")],
  ] },

  // ── Carbo Academy — acessos ──
  { chave: "academy", papel: "colaborador", url: "/academy/acessos", marcas: [
    [1, (p) => p.locator("main div.bg-muted.p-1").first()],
    [2, sel('input[placeholder="Pessoa, e-mail ou curso"]')],
    [3, (p) => linhaAc("Juliana Pereira")(p).locator("div.flex-1").first()],
    [4, (p) => linhaAc("Juliana Pereira")(p).locator("div.sm\\:w-64")],
    [5, (p) => linhaAc("Juliana Pereira")(p).getByRole("button", { name: "Liberar" })],
    [6, (p) => linhaAc("Juliana Pereira")(p).getByRole("button", { name: "Recusar" })],
    [7, sel('aside a[href="/academy/acessos"] span[title]')],
  ] },
  { chave: "academy-recusar", papel: "colaborador", url: "/academy/acessos",
    antes: async (p) => { await linhaAc("Carlos Menezes")(p).getByRole("button", { name: "Recusar" }).click(); await p.waitForTimeout(500); },
    clip: (p) => p.locator('[role="alertdialog"], [role="dialog"]').last(), marcas: [
    [1, (p) => p.locator('[role="alertdialog"], [role="dialog"]').last().locator("input, textarea").first()],
    [2, (p) => p.locator('[role="alertdialog"], [role="dialog"]').last().getByRole("button", { name: "Recusar" })],
  ] },
  { chave: "academy-todos", papel: "colaborador", url: "/academy/acessos?status=todos", viewport: { width: 1440, height: 1100 },
    clip: (p) => p.locator("main div.divide-y"), marcas: [
    [1, (p) => linhaAc("Diego Martins")(p).getByRole("button", { name: "Tirar acesso" })],
    [2, (p) => linhaAc("Diego Martins")(p).locator("div.sm\\:w-64")],
    [3, (p) => linhaAc("Lucas Teixeira")(p).getByText(/^Motivo:/)],
    [4, (p) => linhaAc("Lucas Teixeira")(p).getByRole("button", { name: "Liberar" })],
  ] },
];
