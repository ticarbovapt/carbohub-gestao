// Prints da área "producao" (ver shots.mjs): Dashboard de Produção, Ordens de
// Produção e MRP. O número de cada marcador é o `n` do item em src/docs/secoes/producao.ts.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const txt = (t) => (p) => p.getByText(t, { exact: false });
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();
// Cartão de OP no quadro (o dnd-kit marca o elemento arrastável).
const opCard = (num) => (p) => p.locator('[aria-roledescription="draggable"]').filter({ hasText: num });
const coluna = (nome) => (p) => p.locator("main div.rounded-2xl").filter({ has: p.locator("span", { hasText: nome }) }).first();
const kpi = (rot) => (p) => p.locator("main div.rounded-xl.border").filter({ has: p.locator("span", { hasText: new RegExp("^" + rot + "$") }) }).first();
const LARGO = { width: 1440, height: 1400 };

// ⚠️ PROVISÓRIO: o fx_suprimentos declara warehouse_stock e ops_stock_min SEM
// olhar a rota e, por vir depois em areas.ts, vence o fx_producao também nas
// telas de Produção (os insumos ficariam sem saldo e tudo viraria "falta").
// Enquanto ele não responder por rota (como o fx_logistica já faz), o print
// troca as duas tabelas no MESMO módulo que o app carregou — só em /producao —
// e remonta a tela para o React Query reler.
// O saldo da produção responde por rota no próprio fx_suprimentos (daProducao).
const comEstoqueDaProducao = async () => {};
const antes = (...passos) => async (p) => { await comEstoqueDaProducao(p); for (const f of passos) await f(p); };

// Abre a Reposição sugerida (começa fechada e lembra a escolha).
const abrirRepo = async (p) => { await p.getByRole("button", { name: /Reposição sugerida/ }).click(); await p.waitForTimeout(400); };
const verLista = async (p) => { await p.getByRole("button", { name: "Lista" }).click(); await p.waitForTimeout(500); };
// Abre o diálogo de mudança de etapa pelo seletor do cartão.
const moverPara = (num, coluna) => async (p) => {
  await opCard(num)(p).getByRole("combobox").click(); await p.waitForTimeout(400);
  await p.getByRole("option", { name: new RegExp(coluna) }).click(); await p.waitForTimeout(900);
};

export const SHOTS = [
  // ══ Dashboard de Produção ═══════════════════════════════════════════════════
  { chave: "prod-dashboard", papel: "colaborador", url: "/producao/painel", viewport: { width: 1440, height: 1220 }, marcas: [
    [1, (p) => p.locator("main").getByText("OP Ativas", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [2, (p) => p.locator("main").getByText("OPs Concluídas", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [3, (p) => p.locator("main").getByText("Taxa de Conclusão", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [4, (p) => p.locator("main").getByText("Etapas Pendentes", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [5, (p) => p.getByText("Ordens de Produção — Últimos 7 dias").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [6, (p) => p.getByText("OPs por Status").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [7, (p) => p.getByText("Checklists Recentes").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")],
  ] },

  // ══ Ordens de Produção ══════════════════════════════════════════════════════
  { chave: "op-topo", papel: "colaborador", url: "/producao/ordens", viewport: LARGO, antes: antes(abrirRepo),
    clip: (p) => [p.locator("main h1").first(), p.locator("main div.rounded-xl.border.bg-card").filter({ hasText: "Reposição sugerida" }).first()], marcas: [
    [1, (p) => p.getByRole("button", { name: "Kanban" }).locator("..")],
    [2, btn("Nova OP")],
    [3, kpi("OPs Abertas")],
    [4, kpi("Prontas p/ Separar")],
    [5, kpi("Atrasadas")],
    [6, kpi("A Produzir")],
    [7, kpi("Rendimento Médio")],
    [8, kpi("Perdas Totais")],
    [9, sel('input[placeholder="Buscar por OP ou SKU..."]')],
    [10, (p) => p.locator("main button[role=combobox]").filter({ hasText: "Todos os status" }).first()],
    [11, (p) => p.locator("main button[role=combobox]").filter({ hasText: "Todas as prioridades" }).first()],
    [12, (p) => p.getByText("Insumo em falta travando produção").locator("..").locator("..")],
    [13, (p) => p.getByRole("button", { name: /Reposição sugerida/ })],
    [14, btn("só críticos")],
    [15, (p) => p.locator("main div.rounded-xl.border.p-3").filter({ hasText: "CarboZé 250ml" }).getByRole("button", { name: "Criar OP" })],
    [16, txt("dá pra só rotular")],
    [17, (p) => p.getByText("OP em andamento").first()],
  ] },
  { chave: "op-quadro", papel: "colaborador", url: "/producao/ordens", viewport: { width: 1920, height: 1150 }, antes: antes(),
    clip: (p) => [p.getByText("Pedidos de Recorrência").locator("xpath=ancestor::div[contains(@class,'snap-start')][1]"), coluna("Envase")(p)], pad: 10, marcas: [
    [1, (p) => p.getByText("Pedidos de Recorrência").locator("..")],
    [2, (p) => p.getByText("Vira OP sozinho quando o mês chega.")],
    [3, (p) => coluna("Pedidos")(p).locator("div.border-b").first()],
    [4, sel('button[title="Nova OP"]')],
    [5, opCard("OP-2026-0142")],
    [6, (p) => coluna("Separação")(p).locator("div.border-b").first()],
    [7, (p) => coluna("Envase")(p).locator("div.border-b").first()],
  ] },
  { chave: "op-quadro-fim", papel: "colaborador", url: "/producao/ordens", viewport: { width: 1920, height: 1150 },
    antes: antes(async (p) => { await p.evaluate(() => { const c = [...document.querySelectorAll("main div.overflow-x-auto")].find((d) => d.textContent.includes("Pedidos de Recorrência")); if (c) c.scrollLeft = c.scrollWidth; }); await p.waitForTimeout(400); }),
    clip: (p) => [coluna("Rotulagem")(p), coluna("Bloqueada")(p)], pad: 10, marcas: [
    [1, (p) => coluna("Rotulagem")(p).locator("div.border-b").first()],
    [2, (p) => coluna("Qualidade")(p).locator("div.border-b").first()],
    [3, (p) => coluna("Concluída")(p).locator("div.border-b").first()],
    [4, (p) => coluna("Bloqueada")(p).locator("div.border-b").first()],
  ] },
  { chave: "op-card", papel: "colaborador", url: "/producao/ordens", antes: antes(), clip: opCard("OP-2026-0142"), pad: 22, marcas: [
    [1, (p) => opCard("OP-2026-0142")(p).getByText("OP-2026-0142")],
    [2, (p) => opCard("OP-2026-0142")(p).getByText("Alta", { exact: true })],
    [3, (p) => opCard("OP-2026-0142")(p).getByText("CarboZé 100ml", { exact: true })],
    [4, (p) => opCard("OP-2026-0142")(p).getByText("Posto Boa Viagem Ltda")],
    [5, (p) => opCard("OP-2026-0142")(p).getByText(/600 un/)],
    [6, (p) => opCard("OP-2026-0142")(p).getByText(/Prazo:/)],
    [7, (p) => opCard("OP-2026-0142")(p).getByText(/parado há/)],
    [8, (p) => opCard("OP-2026-0142")(p).getByText("pronto", { exact: true })],
    [9, (p) => opCard("OP-2026-0142")(p).getByRole("combobox")],
  ] },
  { chave: "op-nova", papel: "colaborador", url: "/producao/ordens", viewport: LARGO,
    antes: antes(async (p) => {
      await p.getByRole("button", { name: "Nova OP" }).first().click(); await p.waitForTimeout(500);
      await dlg(p).getByRole("combobox").first().click(); await p.waitForTimeout(300);
      await p.getByRole("option", { name: /CarboZé 1 Litro/ }).click(); await p.waitForTimeout(300);
      await dlg(p).locator('input[type="number"]').fill("80"); await p.waitForTimeout(600);
    }), clip: (p) => dlg(p), pad: 4, marcas: [
    [1, (p) => dlg(p).getByRole("combobox").first()],
    [2, (p) => dlg(p).locator('input[type="number"]')],
    [3, (p) => dlg(p).getByText(/Faltam 1 insumo/).locator("..").locator("..")],
    [4, (p) => dlg(p).getByRole("combobox").nth(1)],
    [5, (p) => dlg(p).getByRole("combobox").nth(2)],
    [6, (p) => dlg(p).locator('input[placeholder^="Opcional"]')],
    [7, (p) => dlg(p).getByText("Data de Necessidade").locator("..")],
    [8, (p) => dlg(p).locator("textarea")],
    [9, (p) => dlg(p).getByRole("button", { name: "Criar OP" })],
  ] },
  { chave: "op-detalhe", papel: "colaborador", url: "/producao/ordens", viewport: LARGO,
    antes: antes(async (p) => { await opCard("OP-2026-0142")(p).locator('button[title="Ver detalhes da OP"]').click(); await p.waitForTimeout(900); }),
    clip: (p) => dlg(p), pad: 4, marcas: [
    [1, (p) => dlg(p).getByText(/vem do pedido de venda/)],
    [2, (p) => dlg(p).getByText("Histórico de movimentações").locator("..")],
    [3, (p) => dlg(p).getByRole("button", { name: "Salvar" })],
  ] },
  { chave: "op-separar", papel: "colaborador", url: "/producao/ordens", viewport: LARGO,
    antes: antes(moverPara("OP-2026-0142", "Separação"), async (p) => { await dlg(p).getByRole("button", { name: /Só rotular/ }).click(); await p.waitForTimeout(500); }),
    clip: (p) => dlg(p), pad: 4, marcas: [
    [1, (p) => dlg(p).locator("div.flex.items-center.gap-2.text-xs").first()],
    [2, (p) => dlg(p).getByRole("button", { name: /Só rotular/ })],
    [3, (p) => dlg(p).getByRole("button", { name: /Produzir do zero/ })],
    [4, (p) => dlg(p).getByText(/Baixa no HUB Natal ao separar|Faltam/).locator("..").locator("..")],
    [5, (p) => dlg(p).getByRole("button", { name: /^Separar/ })],
  ] },
  { chave: "op-concluir", papel: "colaborador", url: "/producao/ordens", viewport: LARGO,
    antes: antes(moverPara("OP-2026-0132", "Concluída"), async (p) => {
      await dlg(p).locator('input[type="number"]').nth(0).fill("292"); await dlg(p).locator('input[type="number"]').nth(1).fill("8");
      await dlg(p).locator('input[type="number"]').nth(3).fill("300"); await p.waitForTimeout(500);
    }), clip: (p) => dlg(p), pad: 4, marcas: [
    [1, (p) => dlg(p).getByText("Boas (aprovadas)").locator("..")],
    [2, (p) => dlg(p).getByText("Refugo (perdas)").locator("..")],
    [3, (p) => dlg(p).getByText(/^Credita/).locator("..")],
    [4, (p) => dlg(p).getByText("Insumos usados").locator("..").locator("..")],
    [5, (p) => dlg(p).getByRole("button", { name: "Concluir" })],
  ] },
  { chave: "op-lista", papel: "colaborador", url: "/producao/ordens", viewport: { width: 1440, height: 1700 }, antes: antes(verLista),
    clip: (p) => p.locator("main table").first(), pad: 10, marcas: [
    [1, (p) => p.locator("main thead").first()],
    [2, sel('main button[title="Confirmar Produção"]')],
    [3, (p) => p.locator("main tbody tr").filter({ hasText: "OP-2026-0132" }).getByRole("button").nth(1)],
    [4, (p) => p.locator("main tbody tr").filter({ hasText: "OP-2026-0132" }).getByRole("button").nth(2)],
  ] },
  { chave: "op-perdas", papel: "colaborador", url: "/producao/ordens", antes: antes(async (p) => { await kpi("Perdas Totais")(p).click(); await p.waitForTimeout(600); }),
    clip: (p) => dlg(p), pad: 4, marcas: [
    [1, (p) => dlg(p).getByText(/Refugo de produto/)],
    [2, (p) => dlg(p).locator("div.divide-y > div").first()],
  ] },

  // ══ MRP ═════════════════════════════════════════════════════════════════════
  { chave: "mrp-produtos", papel: "colaborador", url: "/producao/mrp/produtos", viewport: { width: 1440, height: 1300 }, antes: antes(), marcas: [
    [1, sel('nav[aria-label="Seções do MRP"]')],
    [2, btn("Novo Produto")],
    [3, (p) => p.getByRole("button", { name: "Insumos / SKUs" }).locator("..")],
    [4, sel('main input[placeholder="Buscar por código ou nome..."]')],
    [5, (p) => p.getByRole("button", { name: "Trade Marketing" }).locator("..")],
    [6, (p) => p.locator("main tbody tr").filter({ hasText: "CZ100" }).first().getByRole("button").first()],
    [7, (p) => p.locator("main").getByText("sem BOM").first()],
    [8, (p) => p.locator("main th").filter({ hasText: "Estoque Total" })],
    [9, (p) => p.locator("main th").filter({ hasText: "Status" })],
    [10, (p) => p.locator("main th").filter({ hasText: "Hubs" })],
    [11, (p) => p.locator("main tbody tr").first().locator('button[title="Editar"]').locator("..")],
  ] },
  { chave: "mrp-bom", papel: "colaborador", url: "/producao/mrp/produtos", viewport: { width: 1440, height: 1300 },
    antes: antes(async (p) => { await p.locator("main tbody tr").filter({ hasText: "CZ100" }).first().getByRole("button").first().click(); await p.waitForTimeout(900); }),
    clip: (p) => dlg(p), pad: 4, marcas: [
    [1, (p) => dlg(p).locator("div.border-dashed").first()],
    [2, (p) => dlg(p).getByRole("switch")],
    [3, (p) => dlg(p).getByRole("button", { name: "Adicionar insumo" })],
    [4, (p) => dlg(p).locator("table").first()],
    [5, (p) => dlg(p).getByText(/Custo total \(Rotular\)/).locator("..")],
    [6, (p) => dlg(p).locator("table").nth(1)],
    [7, (p) => dlg(p).locator('button[title="Editar linha"]').first().locator("..")],
  ] },
  { chave: "mrp-skus", papel: "colaborador", url: "/producao/mrp/skus", antes: antes(), marcas: [
    [1, btn("Atualizar")],
    [2, btn("Novo SKU")],
    [3, (p) => p.locator("main div.grid").filter({ hasText: "Total SKUs" }).first()],
    [4, sel('main input[placeholder="Buscar por código ou nome..."]')],
    [5, (p) => p.locator("main button[role=combobox]").first()],
    [6, (p) => p.locator("main tbody tr").first().locator("td").nth(6)],
    [7, (p) => p.locator("main").getByText("Inativo", { exact: true }).first()],
    [8, (p) => p.locator("main tbody tr").first().locator("td").last()],
  ] },
  { chave: "mrp-lotes", papel: "colaborador", url: "/producao/mrp/lotes", antes: antes(), marcas: [
    [1, btn("Novo Lote")],
    [2, (p) => p.locator("main div.grid").filter({ hasText: "Em Quarentena" }).first()],
    [3, (p) => p.locator("main button[role=combobox]").first()],
    [4, (p) => p.locator("main tbody tr").filter({ hasText: "LOT-2026-0029" }).locator("td").nth(2)],
    [5, (p) => p.locator("main tbody tr").filter({ hasText: "LOT-2026-0031" }).locator("td").nth(3)],
    [6, (p) => p.locator("main tbody tr").filter({ hasText: "LOT-2026-0031" }).locator("td").nth(4)],
    [7, (p) => p.locator("main tbody tr").first().locator("td").last()],
  ] },
  { chave: "mrp-fornecedores", papel: "colaborador", url: "/producao/mrp/fornecedores", antes: antes(), marcas: [
    [1, btn("Novo Fornecedor")],
    [2, sel('main input[placeholder^="Buscar por CNPJ"]')],
    [3, (p) => p.locator("main tbody tr").filter({ hasText: "Plásticos Sertão" }).locator("td").nth(4)],
    [4, (p) => p.locator("main tbody tr").first().locator("td").last()],
  ] },
];
