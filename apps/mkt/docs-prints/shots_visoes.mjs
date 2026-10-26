// Prints da área "visoes" (ver shots.mjs): as visões de um quadro, as visões
// entre quadros e Campanhas. O número de cada marcador é o `n` do item em
// src/docs/secoes/visoes.ts.
const btn = (t) => (p) => p.getByRole("button", { name: t, exact: true });
const lnk = (t) => (p) => p.locator("main a, a").filter({ hasText: new RegExp("^" + t + "$") }).first();
const seg = (t) => (p) => p.locator(".mkt-segmented").filter({ hasText: t }).first();
const Q = "/quadros/b-visoes";

export const SHOTS = [
  { chave: "visao-calendario", papel: "colaborador", url: `${Q}/calendario`, marcas: [
    [1, (p) => p.locator(".mkt-segmented").filter({ has: p.locator('a[aria-current="page"]') }).first()],
    [2, (p) => p.getByRole("button", { name: "Hoje" }).locator("..")],
    [3, seg("Semana")],
    [4, seg("Cor: lista")],
    [5, (p) => p.locator(".rounded-\\[var\\(--radius\\)\\].cursor-pointer").filter({ hasText: "Artigo blog" }).first()],
    [6, (p) => p.getByText(/^Sem data \(/).locator("..")],
  ] },
  { chave: "visao-timeline", papel: "colaborador", url: `${Q}/timeline`, viewport: { width: 1440, height: 760 },
    antes: async (p) => { await p.getByRole("button", { name: "dia", exact: true }).click(); },
    marcas: [
    [1, seg("Por membro")],
    [2, (p) => p.locator(".mkt-segmented").filter({ hasText: "Semana" }).filter({ hasText: "Dia" }).first()],
    [3, (p) => p.locator("div.sticky.left-0").filter({ hasText: "Em produção" }).first()],
    [4, (p) => p.locator("div.cursor-grab").filter({ hasText: "Vídeo depoimento frotista" }).first().locator("..")],
    [5, (p) => p.locator("div.bg-destructive\\/70").first()],
  ] },
  { chave: "visao-tabela", papel: "colaborador", url: `${Q}/tabela`, marcas: [
    [1, (p) => p.locator('input[placeholder="Buscar título…"]')],
    [2, (p) => p.locator("select").filter({ hasText: "Etiqueta: todas" })],
    [3, (p) => p.locator("select").filter({ hasText: "Membro: todos" })],
    [4, (p) => p.locator("thead th").filter({ hasText: "Título" })],
    [5, (p) => p.locator('button[title="Abrir cartão"]').first()],
    [6, (p) => p.locator("tbody tr").first().locator('input[type="date"]').nth(1)],
    [7, (p) => p.locator("thead th").filter({ hasText: "Formato" })],
  ] },
  { chave: "visao-dashboard", papel: "colaborador", url: `${Q}/dashboard`, viewport: { width: 1440, height: 1000 }, marcas: [
    [1, (p) => p.getByText("Cartões", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'border-l-[3px]')][1]")],
    [2, (p) => p.getByText("Taxa de conclusão", { exact: true }).locator("xpath=ancestor::div[contains(@class,'border-l-[3px]')][1]")],
    [3, (p) => p.getByText("Atrasados", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'border-l-[3px]')][1]")],
    [4, (p) => p.getByText("Cartões por lista").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [5, (p) => p.getByText("Carga por membro").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [6, (p) => p.locator("div.border-destructive\\/30").first()],
  ] },
  { chave: "visao-mapa", papel: "colaborador", url: `${Q}/mapa`,
    antes: async (p) => { await p.waitForTimeout(400); await p.locator(".leaflet-marker-icon").nth(1).click(); await p.waitForTimeout(500); },
    marcas: [
    [1, (p) => p.getByText(/com localização/)],
    [2, (p) => p.locator(".leaflet-marker-icon").first()],
    [3, (p) => p.locator(".leaflet-popup-content")],
  ] },
  { chave: "todos-calendario", papel: "colaborador", url: "/todos/calendario", marcas: [
    [1, (p) => p.locator(".mkt-segmented").filter({ hasText: "Tabela" }).first()],
    [2, seg("Cor: quadro")],
    [3, (p) => p.locator("svg.lucide-layout-grid").first().locator("..")],
    [4, (p) => p.locator(".cursor-pointer").filter({ hasText: "Feira de transportes" }).first()],
  ] },
  { chave: "todos-tabela", papel: "colaborador", url: "/todos/tabela", marcas: [
    [1, (p) => p.locator(".mkt-segmented").filter({ hasText: "Calendário" }).first()],
    [2, (p) => p.locator("select").filter({ hasText: "Quadro: todos" })],
    [3, (p) => p.locator("tbody tr").first().locator("td").nth(2)],
    [4, (p) => p.locator("thead th").filter({ hasText: "Entrega" })],
  ] },
  { chave: "campanhas", papel: "colaborador", url: "/campanhas", marcas: [
    [1, (p) => p.getByText("Em construção").locator("..")],
  ] },
];
void btn; void lnk;
