// Prints da área "campo" (ver shots.mjs): Ordens de Serviço — a MESMA tela do Sales.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();

// ⚠️ O mockClient não tem `supabase.schema()`, e o useOS lê o schema
// `licenciados` por ele. Enquanto o mock não ganhar `schema: () => supabase`,
// o print acrescenta o método no MESMO módulo que o app importou e espera a
// nova tentativa do React Query (retry automático) trazer as OS.
const comSchema = async (p) => {
  await p.evaluate(async () => {
    // A URL pode vir com ?t=… depois de um HMR: usar a que o app carregou.
    const url = performance.getEntriesByType("resource").map((e) => e.name)
      .filter((n) => n.includes("/docs-prints/mockClient.ts")).pop() ?? "/docs-prints/mockClient.ts";
    const m = await import(url);
    if (!m.supabase.schema) m.supabase.schema = () => m.supabase; // o mock já tem; inofensivo
  });
  await p.getByText("Transportadora Rio Potengi").first().waitFor({ state: "attached", timeout: 15000 });
  await p.waitForTimeout(400);
};

const osCard = (nome) => (p) => p.locator("article").filter({ hasText: nome });

// Foto fictícia de "expositor" desenhada num canvas (nenhuma foto real).
const fotoFalsa = async (p) => {
  const url = await p.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 640; c.height = 480;
    const g = c.getContext("2d");
    g.fillStyle = "#e7e2d8"; g.fillRect(0, 0, 640, 480);
    g.fillStyle = "#8a6a4a"; for (const y of [150, 300, 450]) g.fillRect(40, y, 560, 14);
    const cores = ["#16a34a", "#22c55e", "#15803d"];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {
      g.fillStyle = cores[(i + r) % 3]; g.fillRect(60 + i * 60, 60 + r * 150, 40, 90);
      g.fillStyle = "#fff"; g.fillRect(66 + i * 60, 90 + r * 150, 28, 12);
    }
    return c.toDataURL("image/jpeg", 0.85);
  });
  return Buffer.from(url.split(",")[1], "base64");
};

export const SHOTS = [
  // ══ Ordens de Serviço ══════════════════════════════════════════════════════
  { chave: "os-quadro", papel: "colaborador", url: "/campo/os", antes: comSchema, marcas: [
    [1, btn("Nova descarbonização")],
    [2, sel('button[title="Atualizar"]')],
    [3, (p) => p.locator("main div.grid").filter({ hasText: "Em aberto" }).first()],
    [4, (p) => p.getByText(/vendas? sem ordem de serviço/).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")],
    [5, sel('input[placeholder="Buscar OS, cliente, placa ou pedido"]')],
    [6, (p) => p.getByRole("button", { name: "Quadro" }).locator("..")],
    [7, (p) => p.locator("section").filter({ has: p.locator("h3", { hasText: "Em execução" }) }).first()],
    [8, osCard("Transportadora Rio Potengi")],
  ] },
  { chave: "os-card", papel: "colaborador", url: "/campo/os", antes: comSchema,
    clip: osCard("Transportadora Rio Potengi"), pad: 22, marcas: [
      [1, (p) => osCard("Transportadora Rio Potengi")(p).getByText("Transportadora Rio Potengi")],
      [2, (p) => osCard("Transportadora Rio Potengi")(p).getByText("OS-2026-00412")],
      [3, (p) => osCard("Transportadora Rio Potengi")(p).getByText("Frota", { exact: true })],
      [4, (p) => osCard("Transportadora Rio Potengi")(p).getByText(/de\s+9\s+veículos/)],
      [5, (p) => osCard("Transportadora Rio Potengi")(p).getByText("8 leves · 1 pesado")],
      [6, (p) => osCard("Transportadora Rio Potengi")(p).locator("div.h-1").first()],
      [7, (p) => osCard("Transportadora Rio Potengi")(p).locator("svg.lucide-calendar-days").locator("..")],
      [8, (p) => osCard("Transportadora Rio Potengi")(p).getByText("V2026100031")],
      [9, (p) => osCard("Transportadora Rio Potengi")(p).getByText(/R\$\s*7\.000/)],
    ] },
  { chave: "os-sem-os", papel: "colaborador", url: "/campo/os",
    antes: async (p) => { await comSchema(p); await p.getByRole("button", { name: "Ver vendas" }).click(); },
    clip: (p) => p.getByText(/vendas? sem ordem de serviço/).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"), pad: 12,
    marcas: [
      [1, (p) => p.getByRole("button", { name: "Ocultar" })],
      [2, (p) => p.getByRole("button", { name: "Abrir OS" })],
      [3, (p) => p.locator("tr").filter({ hasText: "V2026100052" })],
    ] },
  { chave: "os-lista", papel: "colaborador", url: "/campo/os?ver=lista", viewport: { width: 1440, height: 1250 }, antes: comSchema, marcas: [
    [1, (p) => p.getByRole("button", { name: "Lista" }).locator("..")],
    [2, (p) => p.locator("th").filter({ hasText: "Cliente" }).getByRole("button")],
    [3, (p) => p.locator("tr").filter({ hasText: "Transportadora Rio Potengi" }).locator("td").nth(3)],
    [4, (p) => p.locator("tr").filter({ hasText: "Logística Seridó" }).locator("td").nth(4)],
    [5, (p) => p.locator("tr").filter({ hasText: "Juliana Freitas" }).locator("td").nth(5)],
    [6, (p) => p.locator("tr").filter({ hasText: "Marcos Tavares" }).locator("td").nth(7)],
  ] },
  { chave: "os-agenda", papel: "colaborador", url: "/campo/os?ver=agenda", viewport: { width: 1440, height: 1100 }, antes: comSchema, marcas: [
    [1, (p) => p.getByRole("button", { name: "Hoje", exact: true })],
    [2, sel('button[aria-label="Próximo mês"]')],
    [3, (p) => p.locator('button[aria-pressed]').filter({ hasText: "Transportadora Rio Potengi" }).first()],
    [4, (p) => p.locator("footer").filter({ hasText: "B2C" }).locator("div").first()],
    [5, (p) => p.locator("footer").getByText(/agendamentos?/).first()],
    [6, (p) => p.getByRole("button", { name: /sem data/ })],
    [7, (p) => p.locator("aside").filter({ hasText: "Próximos agendamentos" })],
  ] },
  { chave: "os-nova", papel: "colaborador", url: "/campo/os", viewport: { width: 1440, height: 1100 },
    antes: async (p) => { await comSchema(p); await p.getByRole("button", { name: "Nova descarbonização" }).first().click(); },
    clip: (p) => dlg(p), pad: 10,
    marcas: [
      [1, (p) => dlg(p).getByRole("button", { name: /B2C — Pessoa física/ }).locator("..")],
      [2, (p) => dlg(p).locator("#phone")],
      [3, (p) => dlg(p).locator("#name")],
      [4, (p) => dlg(p).locator("#email")],
      [5, (p) => dlg(p).locator("#plate").locator("xpath=ancestor::div[contains(@class,'space-y-3')][1]")],
      [6, (p) => dlg(p).locator("#sched")],
      [7, (p) => dlg(p).getByRole("button", { name: "Criar OS" })],
    ] },
  { chave: "os-nova-frota", papel: "colaborador", url: "/campo/os", viewport: { width: 1440, height: 1300 },
    antes: async (p) => {
      await comSchema(p);
      await p.getByRole("button", { name: "Nova descarbonização" }).first().click();
      await dlg(p).getByRole("button", { name: /Frota — Agendado/ }).click();
      await dlg(p).getByRole("button", { name: /Adicionar responsável/ }).click();
    },
    clip: (p) => dlg(p), pad: 10,
    marcas: [
      [1, (p) => dlg(p).locator("#cnpj")],
      [2, (p) => dlg(p).locator("#company")],
      [3, (p) => dlg(p).locator("#sched")],
      [4, (p) => dlg(p).getByText("Responsáveis pela empresa").locator("..")],
    ] },
];
