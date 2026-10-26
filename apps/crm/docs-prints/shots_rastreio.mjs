// Prints da área "rastreio" (ver shots.mjs): /pos-venda, /meu-estoque, /compras.
const sel = (s) => (p) => p.locator(s);
const txt = (t) => (p) => p.getByText(t, { exact: false }).first();
const dlg = (p) => p.locator('[role="dialog"]').last();
const col = (rot) => (p) => p.locator("main div.rounded-2xl").filter({ has: p.locator("span", { hasText: new RegExp("^" + rot + "$") }) }).first();
const pv = (nome) => (p) => p.locator("main div.rounded-xl.bg-card").filter({ hasText: nome }).first();
const bloco = (t) => (p) => dlg(p).locator("div.rounded-lg.border").filter({ hasText: t }).first();

export const SHOTS = [
  // ── Rastreio de venda ──
  { chave: "rastreio", papel: "colaborador", url: "/pos-venda", viewport: { width: 1600, height: 900 }, espera: 1200, marcas: [
    [1, (p) => p.locator("main h1").first()],
    [2, txt("Visualização. As etapas")],
    [3, (p) => col("Nova Venda")(p).locator("div.border-b").first()],
    [4, (p) => col("Nova Venda")(p).locator("div.border-b span.tabular-nums").first()],
    [5, pv("Posto Lagoa Azul")],
    [6, (p) => col("Criar Ordem de Produção")(p).getByText("Vazio")],
  ] },
  { chave: "rastreio-card", papel: "gestor", url: "/pos-venda", clip: pv("Posto Três Irmãos"), pad: 22, marcas: [
    [1, (p) => pv("Posto Três Irmãos")(p).locator("span.font-medium").first()],
    [2, (p) => pv("Posto Três Irmãos")(p).locator("span.tabular-nums").first()],
    [3, (p) => pv("Posto Três Irmãos")(p).locator("p.font-mono")],
    [4, (p) => pv("Posto Três Irmãos")(p).locator("p").nth(1)],
    [5, (p) => pv("Posto Três Irmãos")(p).getByText("Ana Souza")],
  ] },
  { chave: "rastreio-gestor", papel: "gestor", url: "/pos-venda", viewport: { width: 1600, height: 900 }, espera: 1200, marcas: [
    [1, (p) => p.locator("main h1").first()],
    [2, (p) => p.getByRole("combobox").filter({ hasText: "Todos os vendedores" })],
    [3, pv("Posto Três Irmãos")],
  ] },
  { chave: "rastreio-detalhe", papel: "colaborador", url: "/pos-venda", viewport: { width: 1440, height: 1250 },
    antes: async (p) => { await pv("Rede Sertão Combustíveis")(p).click(); },
    clip: dlg, pad: 8,
    marcas: [
      [1, (p) => dlg(p).locator("h2 > span").first()],
      [2, (p) => dlg(p).locator("h2 > div, h2 > span").last()],
      [3, (p) => dlg(p).locator("span.font-mono").first()],
      [4, (p) => dlg(p).locator("svg.lucide-phone").locator("..")],
      [5, (p) => dlg(p).locator("svg.lucide-map-pin").locator("..")],
      [6, (p) => dlg(p).getByText("Itens", { exact: true }).locator("..").locator("div.rounded-lg").first()],
      [7, (p) => dlg(p).getByText("Total", { exact: true }).locator("..").locator("..")],
      [8, bloco("CNPJ / CPF")],
      [9, bloco("Entrega combinada")],
      [10, (p) => dlg(p).getByText("Observações:").locator("..")],
    ] },
  { chave: "rastreio-expedicao", papel: "colaborador", url: "/pos-venda", viewport: { width: 1440, height: 1100 },
    antes: async (p) => { await pv("Posto Beira Rio")(p).click(); },
    clip: dlg, pad: 8,
    marcas: [
      [1, (p) => bloco("Nota fiscal")(p).getByText("Nota fiscal").locator("..").locator("..")],
      [2, bloco("Volumes")],
    ] },

  // ── Meu Estoque ──
  { chave: "meu-estoque", papel: "colaborador", url: "/meu-estoque", viewport: { width: 1440, height: 1050 }, espera: 1000, marcas: [
    [1, (p) => p.locator("main div.grid.grid-cols-3").first()],
    [2, (p) => p.locator("main div.rounded-lg").filter({ hasText: "A caminho" }).first()],
    [3, (p) => p.locator("main h2", { hasText: "A caminho" }).locator("../..")],
    [4, (p) => p.getByRole("button", { name: "Recebi" }).first()],
    [5, (p) => p.locator("main h2", { hasText: "Saindo da sua caixa" }).locator("../..")],
    [6, sel('input[placeholder="Buscar produto..."]')],
    [7, (p) => p.getByRole("button", { name: /Só o que tenho|Tudo/ })],
    [8, (p) => p.locator("main div.divide-y").last()],
  ] },
  { chave: "meu-estoque-gestor", papel: "gestor", url: "/meu-estoque", viewport: { width: 1440, height: 900 }, espera: 1000,
    antes: async (p) => {
      await p.getByRole("combobox").first().click();
      await p.getByRole("option", { name: "Ana Souza" }).click();
    },
    marcas: [
      [1, (p) => p.getByRole("combobox").first()],
      [2, (p) => p.locator("main h2", { hasText: "A caminho" }).locator("../..")],
    ] },

  // ── Requisição de Compra ──
  { chave: "compras", papel: "colaborador", url: "/compras", viewport: { width: 1440, height: 1340 }, espera: 900,
    antes: async (p) => {
      await p.getByRole("combobox").first().click();
      await p.getByRole("option", { name: "Equipamento / periférico" }).click();
      await p.locator('input[placeholder="O que comprar"]').fill("Fone de ouvido com microfone");
      await p.locator('input[type="number"]').nth(1).fill("189.9");
    },
    marcas: [
      [1, txt("Compra pessoal")],
      [2, (p) => p.getByText("Categoria *").locator("..")],
      [3, sel('input[placeholder="Cole o link do produto, se tiver"]')],
      [4, (p) => p.getByRole("button", { name: "Adicionar item" })],
      [5, (p) => p.locator('input[placeholder="O que comprar"]').locator("../..")],
      [6, txt("Valor estimado:")],
      [7, (p) => p.getByRole("button", { name: /Cotações/ })],
      [8, (p) => p.getByText("Observação (opcional)").locator("..")],
      [9, (p) => p.getByRole("button", { name: "Limpar" })],
      [10, (p) => p.getByRole("button", { name: "Salvar rascunho" })],
      [11, (p) => p.getByRole("button", { name: "Enviar para aprovação" })],
      [12, (p) => p.locator("main table").first()],
    ] },
];
