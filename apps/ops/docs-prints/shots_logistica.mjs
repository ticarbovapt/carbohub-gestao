// Prints da área "logistica" (ver shots.mjs): Rastreio de venda, Vendas de
// Recorrência, Logística, Viagens & PC e Alertas Operacionais.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();
const alerta = (p) => p.locator('[role="alertdialog"]').last();

// ── Rastreio ──
const col = (rot) => (p) => p.locator("main div.rounded-2xl").filter({ has: p.locator("span.truncate", { hasText: new RegExp("^" + rot.replace(/[()]/g, "\\$&") + "$") }) }).first();
const pv = (nome) => (p) => p.locator("main div.rounded-xl.bg-card.p-4").filter({ hasText: nome }).first();
const ver = (loc) => async (p) => { await loc(p).scrollIntoViewIfNeeded(); await p.waitForTimeout(300); };
const etapa = (nome, para) => async (p) => {
  await ver(pv(nome))(p);
  await pv(nome)(p).getByRole("combobox").click();
  await p.getByRole("option", { name: para, exact: true }).click();
  await p.waitForTimeout(900);
};
const QUADRO = { width: 1600, height: 900 };
const ALTO = { width: 1440, height: 1300 };

// ── Logística ──
const freteFake = async (p) => {
  await p.route(/viacep\.com\.br/, (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ cep: "55000-000", logradouro: "Avenida Agamenon Magalhães", bairro: "Maurício de Nassau", localidade: "Caruaru", uf: "PE" }) }));
  await p.evaluate(async () => {
    const url = performance.getEntriesByType("resource").map((e) => e.name)
      .filter((n) => n.includes("/docs-prints/mockClient.ts")).pop() ?? "/docs-prints/mockClient.ts";
    const m = await import(url);
    m.supabase.functions.invoke = async () => ({ error: null, data: { env: "production", unavailable: [], carriers: [
      { id: 1, company: "Correios", name: "PAC", price: 238.4, custom_price: 238.4, discount: 0, currency: "BRL", delivery_min: 6, delivery_max: 9, logo: null },
      { id: 2, company: "Jadlog", name: ".Package", price: 196.7, custom_price: 196.7, discount: 0, currency: "BRL", delivery_min: 4, delivery_max: 6, logo: null },
      { id: 3, company: "Correios", name: "SEDEX", price: 412.9, custom_price: 412.9, discount: 0, currency: "BRL", delivery_min: 2, delivery_max: 3, logo: null },
    ] } });
  });
  const card = p.locator("main div.rounded-xl, main div").filter({ has: p.getByText("Calculadora de Frete") }).last();
  await p.locator('input[placeholder="00000-000"]').fill("55000-000");
  await p.locator('input[placeholder="ex: 12.5"]').fill("31");
  await p.locator('input[placeholder="valor da NF"]').fill("3600");
  const dims = p.locator('input[placeholder="—"]');
  await dims.nth(0).fill("30"); await dims.nth(1).fill("40"); await dims.nth(2).fill("45");
  await p.locator('input[type="number"][min="1"][step="1"]').first().fill("5");
  await p.waitForTimeout(800);
  await btn(/Calcular Frete/)(p).click();
  await p.waitForTimeout(900);
  void card;
};
const cardRes = (t) => (p) => p.locator("main div.rounded-xl").filter({ has: p.getByText(t, { exact: true }) }).last();

// ── Viagens ──
const linha = (t) => (p) => p.locator("tbody tr").filter({ hasText: t }).first();

// ── Alertas ──
const area = (t) => (p) => p.locator("main button").filter({ has: p.locator("span", { hasText: new RegExp("^" + t + "$") }) }).first();
const grupo = (t) => (p) => p.locator("main section").filter({ has: p.locator("h2", { hasText: t }) }).first();

export const SHOTS = [
  // ══ Rastreio de venda ══════════════════════════════════════════════════════
  { chave: "rastreio", papel: "colaborador", url: "/rastreio", viewport: QUADRO, espera: 1200, marcas: [
    [1, (p) => p.locator("main h1").first()],
    [2, (p) => p.getByRole("combobox").filter({ hasText: "Últimos 30 dias" })],
    [3, btn(/finalizados? ocultos?/)],
    [4, (p) => col("Nova Venda")(p).locator("div.border-b").first()],
    [5, (p) => col("Nova Venda")(p).locator("div.border-b span.tabular-nums").first()],
    [6, pv("Posto Lagoa Azul")],
    [7, (p) => pv("Posto Lagoa Azul")(p).getByRole("combobox")],
    [8, (p) => p.getByText(/o card entre as colunas/).first()],
  ] },
  { chave: "rastreio-card", papel: "colaborador", url: "/rastreio", viewport: QUADRO,
    antes: ver(pv("Posto Beira Rio")), clip: pv("Posto Beira Rio"), pad: 22, marcas: [
      [1, (p) => pv("Posto Beira Rio")(p).locator("span.font-semibold").first()],
      [2, (p) => pv("Posto Beira Rio")(p).locator("span.tabular-nums").first()],
      [3, (p) => pv("Posto Beira Rio")(p).getByText("Caixa separada de bonificação").locator("..")],
      [4, (p) => pv("Posto Beira Rio")(p).locator("p.line-clamp-2")],
      [5, (p) => pv("Posto Beira Rio")(p).locator("p.font-mono")],
      [6, (p) => pv("Posto Beira Rio")(p).getByText(/^\d+d$|^hoje$|atrasado/)],
      [7, (p) => pv("Posto Beira Rio")(p).getByText(/NF venda/)],
      [8, (p) => pv("Posto Beira Rio")(p).getByText(/NF bonif/)],
      [9, (p) => pv("Posto Beira Rio")(p).getByRole("button", { name: /Emitir etiqueta/ })],
      [10, (p) => pv("Posto Beira Rio")(p).getByText("Rafael Costa").locator("../..")],
      [11, (p) => pv("Posto Beira Rio")(p).getByRole("combobox")],
    ] },
  { chave: "rastreio-sem-nf", papel: "colaborador", url: "/rastreio", viewport: QUADRO,
    antes: ver(pv("Distribuidora Agreste")), clip: pv("Distribuidora Agreste"), pad: 22, marcas: [
      [1, (p) => pv("Distribuidora Agreste")(p).getByText("Só a NF de bonificação está vinculada").locator("..")],
      [2, (p) => pv("Distribuidora Agreste")(p).getByText(/NF bonif/)],
    ] },
  { chave: "rastreio-op", papel: "colaborador", url: "/rastreio", viewport: QUADRO,
    antes: ver(col("Criar Ordem de Produção")), clip: col("Criar Ordem de Produção"), pad: 10, marcas: [
      [1, (p) => col("Criar Ordem de Produção")(p).getByText(/pronto/).first()],
      [2, (p) => col("Criar Ordem de Produção")(p).getByText(/produzidas ·/)],
      [3, (p) => col("Criar Ordem de Produção")(p).getByText(/Produzido — mover/)],
    ] },
  { chave: "rastreio-agendado", papel: "colaborador", url: "/rastreio", viewport: QUADRO,
    clip: (p) => p.locator("main div.rounded-xl.bg-card.p-4").filter({ hasText: "V2026080064" }).first(), pad: 22, marcas: [
      [1, (p) => p.locator("main div.rounded-xl.bg-card.p-4").filter({ hasText: "V2026080064" }).first().locator("div").first()],
      [2, (p) => p.locator("main div.rounded-xl.bg-card.p-4").filter({ hasText: "V2026080064" }).first().getByText(/Entra na fila em/)],
    ] },
  { chave: "rastreio-nf", papel: "colaborador", url: "/rastreio", viewport: { width: 1600, height: 800 },
    antes: ver(col("Etiqueta emitida")), clip: (p) => [col("Gerar Nota Fiscal")(p), col("Emitir Etiqueta")(p), col("Etiqueta emitida")(p)], pad: 10, marcas: [
      [1, (p) => col("Gerar Nota Fiscal")(p).getByText(/aguardando NF/)],
      [2, (p) => pv("Posto Ponta Negra")(p).getByText(/NF 000512/)],
      [3, (p) => pv("V2026070045")(p).getByText(/NF 000517/)],
    ] },
  { chave: "rastreio-estoque", papel: "colaborador", url: "/rastreio", viewport: ALTO,
    antes: etapa("Posto Lagoa Azul", "Em Separação"), clip: dlg, pad: 8, marcas: [
      [1, (p) => dlg(p).locator("h2")],
      [2, (p) => dlg(p).getByText("Pedido", { exact: true }).locator("..")],
      [3, (p) => dlg(p).getByText("Estoque", { exact: true }).locator("..")],
      [4, (p) => dlg(p).getByText("Sobra", { exact: true }).locator("..")],
      [5, (p) => dlg(p).getByRole("button", { name: /Confirmar → Em Separação/ })],
    ] },
  { chave: "rastreio-sem-estoque", papel: "colaborador", url: "/rastreio", viewport: ALTO,
    antes: etapa("Auto Posto Mirante", "Em Separação"), clip: dlg, pad: 8, marcas: [
      [1, (p) => dlg(p).locator("h2")],
      [2, (p) => dlg(p).getByText("CarboZé 100ml").first().locator("../..")],
      [3, (p) => dlg(p).getByRole("button", { name: /produzir/ })],
    ] },
  { chave: "rastreio-separado", papel: "colaborador", url: "/rastreio", viewport: ALTO,
    antes: async (p) => {
      await etapa("Comercial Serra Verde", "Separado")(p);
      await dlg(p).getByRole("button", { name: /Confirmar → Separado/ }).click();
      await p.waitForTimeout(900);
    }, clip: dlg, pad: 8, marcas: [
      [1, (p) => dlg(p).getByText(/Conte as caixas/)],
      [2, (p) => dlg(p).locator('input[type="number"]')],
      [3, (p) => dlg(p).locator('input[placeholder="ex.: 12,5"]')],
      [4, (p) => dlg(p).getByRole("button", { name: /Confirmar → Separado/ })],
    ] },
  { chave: "rastreio-frete", papel: "colaborador", url: "/rastreio", viewport: ALTO,
    antes: etapa("Posto Vale do Açu", "Gerar Nota Fiscal"), clip: dlg, pad: 8, marcas: [
      [1, (p) => dlg(p).getByText(/volume\(s\)/).locator("..")],
      [2, (p) => dlg(p).locator('input[placeholder="Nome da transportadora"]')],
      [3, (p) => dlg(p).locator('input[placeholder="ex.: 180,00"]')],
      [4, (p) => dlg(p).getByRole("button", { name: /Confirmar → Gerar Nota Fiscal/ })],
    ] },
  { chave: "rastreio-etiqueta", papel: "colaborador", url: "/rastreio", viewport: ALTO,
    antes: async (p) => {
      await ver(pv("Posto Beira Rio"))(p);
      await pv("Posto Beira Rio")(p).getByRole("button", { name: /Emitir etiqueta/ }).click();
      await p.waitForTimeout(1200);
    }, clip: dlg, pad: 8, marcas: [
      [1, (p) => dlg(p).getByText(/^NF venda:/).first()],
      [2, (p) => dlg(p).getByText(/^NF bonificação:/).first()],
      [3, (p) => dlg(p).getByText(/Código de barras:/)],
      [4, (p) => dlg(p).getByText("Volumes", { exact: true }).locator("../..")],
      [5, btn(/Gerar PDF \(10×15\)/)],
      [6, btn(/Gerar e enviar → Em Transporte/)],
    ] },
  { chave: "rastreio-detalhe", papel: "colaborador", url: "/rastreio", viewport: { width: 1440, height: 1500 },
    antes: async (p) => { await ver(pv("Posto Beira Rio"))(p); await pv("Posto Beira Rio")(p).locator("p.font-mono").click(); await p.waitForTimeout(1000); },
    clip: dlg, pad: 8, marcas: [
      [1, (p) => dlg(p).locator("h2")],
      [2, (p) => dlg(p).locator("span.font-mono").first().locator("..")],
      [3, (p) => dlg(p).getByText(/NF venda/).first().locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]")],
      [4, (p) => dlg(p).locator("svg.lucide-phone").locator("../..")],
      [5, (p) => dlg(p).locator("svg.lucide-map-pin").locator("..")],
      [6, (p) => dlg(p).getByText("CNPJ / CPF").locator("../..")],
      [7, (p) => dlg(p).getByText("Expedição", { exact: true }).locator("../..")],
      [8, (p) => dlg(p).getByRole("button", { name: "Editar" })],
      [9, (p) => dlg(p).getByText("Entrega combinada").locator("../..")],
      [10, (p) => dlg(p).getByText("Itens", { exact: true }).locator("..")],
      [11, (p) => dlg(p).getByText("Total", { exact: true }).locator("../..")],
      [12, (p) => dlg(p).getByText("Observações:").locator("..")],
    ] },

  // ══ Vendas de Recorrência ══════════════════════════════════════════════════
  { chave: "recorrencias", papel: "colaborador", url: "/recorrencias", viewport: { width: 1440, height: 820 }, espera: 900, marcas: [
    [1, (p) => p.locator("main div.rounded-xl.border.bg-card").first()],
    [2, (p) => p.locator("main div.rounded-xl.border.bg-card").first().locator("p").first().locator("..")],
    [3, btn("Hoje")],
    [4, (p) => p.locator("main div.overflow-x-auto.pb-1").first()],
    [5, (p) => p.locator("tbody tr").first().locator("td").first()],
    [6, (p) => p.locator("tbody tr").first().locator("td").nth(1)],
    [7, (p) => p.locator("tbody tr").first().locator("td").nth(2)],
    [8, (p) => p.locator("tbody tr").first().locator("td").nth(3)],
    [9, (p) => p.locator("tbody tr").first().locator("td").nth(4)],
    [10, (p) => p.locator("tbody tr").filter({ hasText: "Rede Litoral" }).locator('a[title="Editar"]')],
    [11, (p) => p.locator("tbody tr").filter({ hasText: "Rede Litoral" }).locator('button[title="Cancelar"]')],
    [12, (p) => p.locator("tbody tr").filter({ hasText: "Rede Litoral" }).locator('button[title="Excluir"]')],
  ] },
  { chave: "recorrencias-cancelar", papel: "colaborador", url: "/recorrencias", viewport: { width: 1440, height: 820 },
    antes: async (p) => { await p.locator("tbody tr").filter({ hasText: "Rede Litoral" }).locator('button[title="Cancelar"]').click(); await p.waitForTimeout(600); },
    clip: alerta, pad: 8, marcas: [
      [1, (p) => alerta(p).getByText(/Sai do faturamento/)],
      [2, (p) => alerta(p).getByRole("button", { name: "Cancelar venda" })],
    ] },

  // ══ Logística ══════════════════════════════════════════════════════════════
  { chave: "logistica-frete", papel: "colaborador", url: "/logistica/frete", viewport: { width: 1440, height: 1000 },
    antes: freteFake, marcas: [
      [1, btn(/Nova Remessa/)],
      [2, (p) => p.getByRole("tablist")],
      [3, (p) => p.getByRole("combobox").first()],
      [4, sel('input[placeholder="00000-000"]')],
      [5, (p) => p.getByText(/Caruaru\/PE/).first()],
      [6, (p) => p.locator('input[placeholder="ex: 12.5"]').locator("../..")],
      [7, (p) => p.getByText("Caixas (cm)").locator("../..")],
      [8, btn(/Outro tamanho/)],
      [9, btn(/Calcular Frete/)],
      [10, (p) => p.getByText("Sugestão", { exact: true }).locator("../..")],
      [11, (p) => p.locator("main button[aria-expanded]").filter({ hasText: "Jamef" }).first()],
      [12, (p) => p.getByText(".Package").locator("../../..")],
    ] },
  { chave: "logistica-jamef", papel: "colaborador", url: "/logistica/frete", viewport: { width: 1440, height: 1100 },
    antes: async (p) => { await freteFake(p); await p.locator("main button[aria-expanded]").filter({ hasText: "Jamef" }).first().click(); await p.waitForTimeout(400); },
    clip: (p) => p.locator("main button[aria-expanded]").filter({ hasText: "Jamef" }).first().locator(".."), pad: 12, marcas: [
      [1, (p) => p.getByText(/Peso real/)],
      [2, (p) => p.locator("main button[aria-expanded]").filter({ hasText: "Jamef" }).first().locator("..").getByText("Total", { exact: true }).locator("..")],
      [3, (p) => p.getByText(/vigência/)],
    ] },
  { chave: "logistica-gestao", papel: "colaborador", url: "/logistica/gestao", viewport: { width: 1600, height: 860 }, espera: 900, marcas: [
    [1, (p) => p.locator("main div.grid").filter({ hasText: "Em Transporte" }).first()],
    [2, (p) => p.locator("main div.rounded-2xl").first().locator("div").first()],
    [3, (p) => p.locator("main button").filter({ hasText: "Distribuidora Agreste" }).first()],
  ] },
  { chave: "logistica-remessa", papel: "colaborador", url: "/logistica/gestao", viewport: { width: 1440, height: 900 },
    antes: async (p) => { await p.locator("main button").filter({ hasText: "Distribuidora Agreste" }).first().click(); await p.waitForTimeout(700); },
    clip: dlg, pad: 8, marcas: [
      [1, (p) => dlg(p).getByText("Cliente:").locator("../..")],
      [2, (p) => dlg(p).getByRole("combobox")],
      [3, (p) => dlg(p).getByText("Transportadora", { exact: true }).locator("..")],
      [4, (p) => dlg(p).getByText("Código de rastreio").locator("..")],
      [5, (p) => dlg(p).getByRole("button", { name: "Salvar" })],
    ] },
  { chave: "logistica-nova", papel: "colaborador", url: "/logistica/gestao", viewport: { width: 1440, height: 900 },
    antes: async (p) => { await btn(/Nova Remessa/)(p).click(); await p.waitForTimeout(600); },
    clip: dlg, pad: 8, marcas: [
      [1, (p) => dlg(p).locator('input[placeholder="Ex.: PED-1023"]')],
      [2, (p) => dlg(p).getByText("Cliente *").locator("..")],
      [3, (p) => dlg(p).locator('input[placeholder="Cidade/UF"]')],
      [4, (p) => dlg(p).getByRole("button", { name: "Criar Remessa" })],
    ] },

  // ══ Viagens & PC ═══════════════════════════════════════════════════════════
  { chave: "viagens", papel: "colaborador", url: "/viagens", viewport: { width: 1440, height: 760 }, espera: 800, marcas: [
    [1, btn(/Nova Solicitação/)],
    [2, (p) => p.getByRole("tablist")],
    [3, (p) => linha("Mossoró")(p).locator("td").first()],
    [4, (p) => linha("Mossoró")(p).locator("td").nth(4)],
    [5, (p) => linha("Campina Grande")(p).locator("td").nth(5)],
    [6, (p) => linha("Mossoró")(p).locator('button[title="Detalhes"]')],
    [7, (p) => linha("Mossoró")(p).locator('button[title="Aprovar"]')],
    [8, (p) => linha("Mossoró")(p).locator('button[title="Reprovar"]')],
    [9, (p) => linha("Campina Grande")(p).locator('button[title="Prestar contas"]')],
  ] },
  { chave: "viagens-nova", papel: "colaborador", url: "/viagens", viewport: { width: 1440, height: 1000 },
    antes: async (p) => { await btn(/Nova Solicitação/)(p).click(); await p.waitForTimeout(700); },
    clip: dlg, pad: 8, marcas: [
      [1, (p) => dlg(p).getByText("Solicitante", { exact: true }).locator("..")],
      [2, (p) => dlg(p).locator('input[placeholder="Cidade/UF"]')],
      [3, (p) => dlg(p).getByText("Data de ida").locator("../..")],
      [4, (p) => dlg(p).getByRole("combobox").last()],
      [5, (p) => dlg(p).locator('input[placeholder="ex: 1500.00"]')],
      [6, (p) => dlg(p).locator("textarea")],
      [7, (p) => dlg(p).getByRole("button", { name: "Enviar Solicitação" })],
    ] },
  { chave: "viagens-pc", papel: "colaborador", url: "/viagens", viewport: { width: 1440, height: 900 },
    antes: async (p) => { await linha("Campina Grande")(p).locator('button[title="Prestar contas"]').click(); await p.waitForTimeout(700); },
    clip: dlg, pad: 8, marcas: [
      [1, (p) => dlg(p).locator('input[type="number"]')],
      [2, (p) => dlg(p).getByRole("combobox")],
      [3, (p) => dlg(p).locator("textarea")],
      [4, (p) => dlg(p).getByRole("button", { name: "Salvar" })],
    ] },

  // ══ Alertas Operacionais ═══════════════════════════════════════════════════
  { chave: "alertas", papel: "colaborador", url: "/alertas", viewport: { width: 1440, height: 1500 }, espera: 1500, marcas: [
    [1, (p) => p.locator("main h1").locator("..")],
    [2, btn(/Atualizar/)],
    [3, area("Estoque")],
    [4, area("Pedidos")],
    [5, sel('input[placeholder="Buscar produto, cliente, pedido ou OP"]')],
    [6, (p) => p.locator("main div.rounded-lg.border.bg-muted\\/40").first()],
    [7, (p) => grupo("Estoque")(p).locator("li").first()],
    [8, (p) => grupo("Estoque")(p).locator("li").first().getByRole("button", { name: /Requisitar/ })],
    [9, (p) => grupo("Estoque")(p).locator("li").first().getByRole("link", { name: /Ver estoque/ })],
    [10, (p) => grupo("Pedidos")(p)],
  ] },
  { chave: "alertas-filtro", papel: "colaborador", url: "/alertas?area=pedidos", viewport: { width: 1440, height: 1100 }, espera: 1500, marcas: [
    [1, area("Pedidos")],
    [2, btn(/Limpar/)],
    [3, (p) => grupo("Pedidos")(p).locator("li").filter({ hasText: "Produzido" }).first()],
    [4, (p) => grupo("Pedidos")(p).locator("li").filter({ hasText: "NF" }).first()],
    [5, (p) => grupo("Pedidos")(p).locator("li").filter({ hasText: "Parado" }).first()],
  ] },
];
