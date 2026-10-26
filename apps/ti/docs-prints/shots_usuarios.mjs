// Prints da área "usuarios" (ver shots.mjs): Usuários, Departamentos e
// funções e Quem recebe a venda. O número de cada marcador é o `n` do item em
// src/docs/secoes/usuarios.ts.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const sec = (p) => p.locator("main section").first();
const linha = (nome) => (p) => p.locator("tbody tr").filter({ hasText: nome });
// O cartão/edição do usuário é uma div fixa própria (não é role=dialog).
const modal = (p) => p.locator("div.fixed.inset-0 > div.rounded-2xl").last();
const abrir = (nome) => async (p) => { await linha(nome)(p).first().click(); await p.waitForTimeout(500); };
const editar = (nome) => async (p) => { await abrir(nome)(p); await modal(p).getByRole("button", { name: "Editar" }).click(); await p.waitForTimeout(500); };
const ALTO = { width: 1440, height: 1900 };

export const SHOTS = [
  // ── Usuários ──
  { chave: "usuarios", papel: "gestor", url: "/usuarios", marcas: [
    [1, btn("Criar usuário")],
    [2, (p) => p.getByRole("button", { name: /^Ativos/ }).locator("..")],
    [3, (p) => p.getByRole("button", { name: /Todos os níveis/ }).locator("..")],
    [4, sel('input[placeholder="Buscar por nome ou usuário..."]')],
    [5, (p) => sec(p).locator("select").first()],
    [6, (p) => p.getByText("Sistema", { exact: true }).locator("..")],
    [7, (p) => linha("Carla Mendes")(p).locator("td").first()],
    [8, (p) => linha("Carla Mendes")(p).getByText("Gestor", { exact: false })],
    [9, (p) => linha("Carla Mendes")(p).locator("td").nth(4)],
  ] },
  { chave: "usuarios-bloqueados", papel: "gestor", url: "/usuarios?situacao=bloqueados",
    clip: (p) => sec(p), marcas: [
    [1, (p) => p.getByRole("button", { name: /Bloqueados/ })],
    [2, (p) => linha("Thiago Freitas")(p).getByText("Bloqueado", { exact: true })],
  ] },
  { chave: "usuarios-criar", papel: "gestor", url: "/usuarios", viewport: { width: 1440, height: 1300 },
    antes: async (p) => {
      await btn("Criar usuário")(p).click(); await p.waitForTimeout(500);
      const d = p.locator('[role="dialog"]');
      await d.locator("input").first().fill("Lucas Andrade");
      await d.locator("select").nth(0).selectOption("comercial"); await p.waitForTimeout(300);
      await d.locator("select").nth(1).selectOption("vendedor");
      await d.locator("select").nth(4).selectOption({ label: "Bruno Lima" });
      await d.getByText("Carbo Sales", { exact: true }).click();
    },
    clip: (p) => p.locator('[role="dialog"]'), pad: 0, marcas: [
    [1, (p) => p.locator('[role="dialog"] input').first()],
    [2, (p) => p.locator('[role="dialog"] div.grid.grid-cols-2').first()],
    [3, (p) => p.locator('[role="dialog"]').getByText("vê só o próprio.").locator("..")],
    [4, (p) => p.locator('[role="dialog"] div.grid.grid-cols-2').nth(1)],
    [5, sel('[role="dialog"] input[placeholder="Principais atividades"]')],
    [6, (p) => p.locator('[role="dialog"] select').nth(4)],
    [7, (p) => p.locator('[role="dialog"]').getByText("Sistemas liberados *").locator("..").locator("div.grid")],
    [8, (p) => p.locator('[role="dialog"]').getByRole("button", { name: "Criar usuário" })],
    [9, (p) => p.locator('[role="dialog"]').getByText(/Username gerado automaticamente/)],
  ] },
  { chave: "usuarios-cartao", papel: "gestor", url: "/usuarios", viewport: { width: 1440, height: 1100 },
    antes: abrir("Carla Mendes"), clip: (p) => modal(p), pad: 0, marcas: [
    [1, (p) => modal(p).locator("div.border-b").first()],
    [2, (p) => modal(p).getByText("E-mail", { exact: true }).locator("..").locator("..")],
    [3, (p) => modal(p).getByText("Superior direto", { exact: true }).locator("..").locator("..")],
    [4, (p) => modal(p).getByText("Sistemas liberados", { exact: true }).locator("..")],
    [5, (p) => modal(p).getByText("Resetar senha de acesso").locator("..")],
    [6, (p) => modal(p).getByRole("button", { name: "Editar" })],
  ] },
  { chave: "usuarios-reset", papel: "gestor", url: "/usuarios", viewport: { width: 1440, height: 1100 },
    antes: async (p) => { await abrir("Carla Mendes")(p); await modal(p).getByRole("button", { name: "Resetar" }).click(); await p.waitForTimeout(300); },
    clip: (p) => modal(p).getByText(/A senha vai voltar para/).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"), marcas: [
    [1, (p) => modal(p).getByText(/A senha vai voltar para/)],
    [2, (p) => modal(p).getByRole("button", { name: "Resetar" })],
  ] },
  { chave: "usuarios-editar", papel: "gestor", url: "/usuarios", viewport: ALTO,
    antes: editar("Carla Mendes"), clip: (p) => modal(p), pad: 0, marcas: [
    [1, (p) => modal(p).getByText(/o username não muda/)],
    [2, (p) => modal(p).locator("input").first()],
    [3, (p) => modal(p).locator("div.grid.grid-cols-2").first()],
    [4, (p) => modal(p).locator("div.grid.grid-cols-2").nth(1)],
    [5, sel('input[placeholder="Principais atividades"]')],
    [6, (p) => modal(p).getByText("Superior direto", { exact: true }).locator("..").locator("select")],
    [7, (p) => modal(p).getByText("Sistemas liberados *").locator("..").locator("div.grid")],
    [8, (p) => modal(p).getByText("É vendedor?").locator("xpath=ancestor::label[1]")],
    [9, (p) => modal(p).getByRole("button", { name: "Salvar" })],
    [10, (p) => modal(p).getByText(/Bloquear acesso \(mantém os dados\)/)],
    [11, (p) => modal(p).getByText(/Apagar usuário e liberar a vaga/)],
  ] },
  { chave: "usuarios-bloquear", papel: "gestor", url: "/usuarios", viewport: ALTO,
    antes: async (p) => {
      await editar("Carla Mendes")(p);
      await modal(p).getByText(/Bloquear acesso \(mantém os dados\)/).click(); await p.waitForTimeout(300);
      await modal(p).locator('input[placeholder^="Motivo"]').fill("desligamento");
    },
    clip: (p) => modal(p).locator("div.border-amber-500\\/30"), marcas: [
    [1, (p) => modal(p).getByText(/deixa\s+de entrar em/).locator("..")],
    [2, (p) => modal(p).getByText(/continua até 1 h/)],
    [3, sel('input[placeholder^="Motivo"]')],
    [4, (p) => modal(p).locator("div.border-amber-500\\/30").getByRole("button", { name: "Bloquear acesso" })],
  ] },
  { chave: "usuarios-desbloquear", papel: "gestor", url: "/usuarios?situacao=bloqueados", viewport: ALTO,
    antes: editar("Thiago Freitas"),
    clip: (p) => modal(p).locator("div.border-amber-500\\/30"), marcas: [
    [1, (p) => modal(p).getByText("Acesso bloqueado.").locator("..")],
    [2, (p) => modal(p).getByRole("button", { name: /Desbloquear acesso/ })],
  ] },

  // ── Departamentos e funções ──
  { chave: "estrutura", papel: "gestor", url: "/estrutura", viewport: { width: 1440, height: 1050 },
    clip: (p) => [p.locator("main section").first(), p.locator("main section").nth(1)],
    antes: async (p) => { await p.locator("main").getByText("Comercial", { exact: true }).click(); await p.waitForTimeout(500); },
    marcas: [
    [1, (p) => p.locator("main section").first().locator("div.divide-y > div").filter({ hasText: "Comercial" })],
    [2, (p) => p.locator("main section").first().locator("div.divide-y > div").filter({ hasText: "Comercial" }).locator("button").first()],
    [3, (p) => p.locator("main section").first().locator("div.divide-y > div").filter({ hasText: "Comercial" }).locator("button").nth(1)],
    [4, (p) => p.locator("main section").first().locator("div.border-t")],
    [5, (p) => p.locator("main section").nth(1).locator("div.divide-y > div").filter({ hasText: "Head Comercial" }).locator("span").nth(1)],
    [6, (p) => p.locator("main section").nth(1).locator("div.divide-y > div").filter({ hasText: "Head Comercial" }).locator("div").last()],
    [7, (p) => p.locator("main section").nth(1).locator("div.border-t")],
  ] },

  // ── Quem recebe a venda on-line ──
  { chave: "avisos-venda", papel: "gestor", url: "/ecommerce/avisos-de-venda?ver=todos", viewport: { width: 1440, height: 1050 },
    clip: (p) => p.locator("main main"),
    marcas: [
    [1, (p) => p.getByRole("button", { name: /^Recebem/ }).locator("..")],
    [2, sel('input[placeholder="Buscar por nome..."]')],
    [3, (p) => p.locator("main label").filter({ hasText: "Helena Duarte" }).getByText("Head", { exact: true })],
    [4, (p) => p.locator("main label").filter({ hasText: "Helena Duarte" }).getByText(/Ligado por/)],
    [5, (p) => p.locator("main label").filter({ hasText: "Helena Duarte" }).getByRole("switch")],
    [6, (p) => p.locator("main label").filter({ hasText: "Carla Mendes" }).getByText(/Desligado por/)],
  ] },
];
