// Prints da área "compras" (Compras e Suprimentos) — ver shots.mjs.
// O número de cada marcador é o MESMO `n` do item em src/docs/secoes/compras.ts.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();
const linha = (t) => (p) => p.locator("tbody tr").filter({ hasText: t }).first();
const ALTO = { width: 1440, height: 1600 };
const abrirLinha = (t) => async (p) => { await p.locator("tbody tr").filter({ hasText: t }).first().click(); await p.waitForTimeout(900); };
const escolher = async (p, trigger, opcao) => { await trigger.click(); await p.waitForTimeout(300); await p.getByRole("option", { name: opcao }).first().click(); await p.waitForTimeout(200); };

export const SHOTS = [
  // ── Requisições ──
  { chave: "compras-rc-lista", papel: "colaborador", url: "/compras/requisicoes", viewport: { width: 1440, height: 1000 },
    clip: (p) => [p.locator("main h1").first(), p.locator("main table")], marcas: [
    [1, sel('nav[aria-label="Etapas da compra"]')],
    [2, btn(/Nova requisição/)],
    [3, (p) => p.getByRole("button", { name: "Precisa de ação" }).locator("..")],
    [4, sel('input[placeholder^="Nº, solicitante"]')],
    [5, (p) => p.locator("main button[role=combobox]").first().locator("..")],
    [6, linha("RC-2026-00041")],
    [7, (p) => linha("RC-2026-00041")(p).getByText("Aguardando Aprovação")],
  ] },
  { chave: "rc-form", papel: "colaborador", url: "/compras/requisicoes", viewport: { width: 1440, height: 1500 },
    antes: async (p) => {
      await btn(/Nova requisição/)(p).click(); await p.waitForTimeout(700);
      const card = p.locator("main").getByText("Nova Requisição de Compra").locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
      const combos = card.locator("button[role=combobox]");
      await escolher(p, combos.nth(1), "Produção");
      await escolher(p, combos.nth(2), "Estoque");
      await escolher(p, combos.nth(3), "Plásticos Potiguar Ltda");
      await card.locator("textarea").nth(0).fill("Estoque de frascos de 100ml abaixo do nível de segurança no Hub Natal.");
      await card.locator("textarea").nth(1).fill("Sem os frascos, o envase do CarboZé 100ml para em cerca de 10 dias.");
      await card.locator('input[placeholder="Descrição do item"]').first().fill("Frasco PET 100ml transparente");
      const nums = card.locator('input[type="number"]');
      await nums.nth(0).fill("2000"); await nums.nth(1).fill("0.38");
      await card.getByRole("button", { name: /Adicionar Item/ }).click(); await p.waitForTimeout(300);
      await card.locator('input[placeholder="Descrição do item"]').nth(1).fill("Tampa rosqueável 28mm");
      await nums.nth(2).fill("2000"); await nums.nth(3).fill("0.12");
      await p.mouse.click(5, 5);
    },
    clip: (p) => p.locator("main").getByText("Nova Requisição de Compra").locator("xpath=ancestor::div[contains(@class,'rounded')][1]"), marcas: [
    [1, (p) => p.locator("main").getByText("Solicitante", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")],
    [2, (p) => p.locator("main").getByText("Centro de Custo *").locator("..")],
    [3, (p) => p.locator("main").getByText("Tipo de Compra").locator("..")],
    [4, (p) => p.locator("main").getByText("Fornecedor Sugerido").locator("..")],
    [5, (p) => p.locator("main").getByText("Justificativa *").locator("..")],
    [6, (p) => p.locator("main").getByText("Impacto Operacional").locator("..")],
    [7, (p) => p.locator("main").getByText("Itens da Requisição").locator("../..")],
    [8, (p) => p.locator("main").getByText("Valor Estimado:").locator("..")],
    [9, btn("Salvar Rascunho")],
    [10, btn("Enviar para Aprovação")],
  ] },
  { chave: "rc-detalhe", papel: "colaborador", url: "/compras/requisicoes", viewport: ALTO,
    antes: abrirLinha("RC-2026-00040"), clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText("Solicitante:").locator("../..")],
    [2, (p) => dlg(p).getByText("Itens", { exact: true }).locator("..")],
    [3, (p) => dlg(p).getByRole("button", { name: /Cotação/ }).first()],
    [4, (p) => dlg(p).getByRole("button", { name: /Cancelar requisição/ })],
    [5, (p) => dlg(p).getByRole("button", { name: /Enviar para aprovação/ })],
  ] },
  { chave: "rc-cotacao", papel: "colaborador", url: "/compras/requisicoes", viewport: ALTO,
    antes: async (p) => {
      await abrirLinha("RC-2026-00040")(p);
      await dlg(p).getByRole("button", { name: /Cotação/ }).first().click(); await p.waitForTimeout(600);
      await dlg(p).locator('input[placeholder="Nome do fornecedor"]').fill("Papelaria Central");
      await dlg(p).locator('input[type="number"]').fill("29.90");
      await dlg(p).locator('input[placeholder^="Prazo"]').fill("Entrega em 2 dias úteis");
    },
    clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText("Fornecedor *").locator("..")],
    [2, (p) => dlg(p).getByText("Preço unitário (R$)").locator("..")],
    [3, (p) => dlg(p).getByText("Link (opcional)").locator("..")],
    [4, (p) => dlg(p).getByText("Observação (opcional)").locator("..")],
    [5, (p) => dlg(p).getByRole("button", { name: "Adicionar" })],
  ] },
  { chave: "rc-aprovar", papel: "gestor", url: "/compras/requisicoes", viewport: ALTO,
    antes: abrirLinha("RC-2026-00041"), clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText("Justificativa", { exact: true }).locator("..")],
    [2, (p) => dlg(p).getByText("menor preço").first()],
    [3, (p) => dlg(p).getByRole("button", { name: /Escolher/ }).first()],
    [4, (p) => dlg(p).getByText(/Estimado/).first()],
    [5, (p) => dlg(p).getByRole("button", { name: /Rejeitar/ })],
    [6, (p) => dlg(p).getByRole("button", { name: /^Aprovar/ })],
  ] },
  { chave: "rc-propria", papel: "gestor", url: "/compras/requisicoes", viewport: ALTO,
    antes: abrirLinha("RC-2026-00038"),
    clip: (p) => [dlg(p).getByText(/Estimado/).first(), dlg(p).getByRole("button", { name: /^Aprovar/ })], pad: 20, marcas: [
    [1, (p) => dlg(p).getByText(/quem aprova é outro gestor/)],
    [2, (p) => dlg(p).getByRole("button", { name: /^Aprovar/ })],
  ] },
  { chave: "rc-gerar-oc", papel: "colaborador", url: "/compras/requisicoes?ver=todas", viewport: ALTO,
    antes: async (p) => { await linha("RC-2026-00039")(p).getByRole("button", { name: /Gerar OC/ }).click(); await p.waitForTimeout(900); },
    clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText(/uma OC por fornecedor/)],
    [2, (p) => dlg(p).getByText("Equipa Nordeste Máquinas").locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")],
    [3, (p) => dlg(p).getByText("Embalagens Sol Nascente").locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")],
    [4, (p) => dlg(p).getByRole("button", { name: /Gerar 2 OCs/ })],
  ] },

  // ── Ordens de compra ──
  { chave: "oc-lista", papel: "colaborador", url: "/compras/ordens", viewport: { width: 1440, height: 1000 },
    clip: (p) => [p.locator('nav[aria-label="Etapas da compra"]'), p.locator("main table")], marcas: [
    [1, (p) => p.locator("main button[role=combobox]").first()],
    [2, sel('input[placeholder="Nº da OC ou fornecedor…"]')],
    [3, (p) => linha("OC-2026-00030")(p).getByText("A pagar")],
    [4, (p) => linha("OC-2026-00031")(p).getByRole("button", { name: /Registrar compra/ })],
    [5, (p) => linha("OC-2026-00029")(p).getByText("Parcialmente Recebida")],
  ] },
  { chave: "oc-registrar", papel: "colaborador", url: "/compras/ordens", viewport: ALTO,
    antes: async (p) => {
      await linha("OC-2026-00031")(p).getByRole("button", { name: /Registrar compra/ }).click(); await p.waitForTimeout(700);
      await escolher(p, dlg(p).locator("button[role=combobox]").first(), /Cartão Compras/);
    },
    clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText("Já foi paga").locator("xpath=ancestor::button[1]")],
    [2, (p) => dlg(p).getByText("Vou pagar depois").locator("xpath=ancestor::button[1]")],
    [3, (p) => dlg(p).getByText("Como foi pago? *").locator("..").locator("button[role=combobox]")],
    [4, (p) => dlg(p).locator('input[type="date"]')],
    [5, (p) => dlg(p).getByRole("button", { name: /Confirmar compra/ })],
  ] },
  { chave: "oc-registrar-depois", papel: "colaborador", url: "/compras/ordens", viewport: ALTO,
    antes: async (p) => {
      await linha("OC-2026-00031")(p).getByRole("button", { name: /Registrar compra/ }).click(); await p.waitForTimeout(700);
      await dlg(p).getByText("Vou pagar depois").click(); await p.waitForTimeout(300);
    },
    clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText("Previsão de vencimento *").locator("..")],
  ] },
  { chave: "oc-detalhe-gestor", papel: "gestor", url: "/compras/ordens", viewport: ALTO,
    antes: abrirLinha("OC-2026-00030"), clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText("Pagamento:").locator("..")],
    [2, (p) => dlg(p).getByRole("button", { name: /Cancelar OC/ })],
  ] },

  // ── Recebimento ──
  { chave: "receb-lista", papel: "colaborador", url: "/compras/recebimento", viewport: { width: 1440, height: 1100 },
    clip: (p) => [p.locator('nav[aria-label="Etapas da compra"]'), p.locator("main table").last()], marcas: [
    [1, (p) => p.locator("main").getByText("Aguardando recebimento")],
    [2, (p) => linha("OC-2026-00029")(p).getByText(/faltam/)],
    [3, (p) => linha("OC-2026-00030")(p).getByRole("button", { name: /Conferir/ })],
    [4, (p) => linha("OC-2026-00029")(p).getByRole("button", { name: /Receber saldo/ })],
    [5, (p) => p.locator("main").getByText("Histórico de recebimentos")],
    [6, (p) => p.locator("main table").last().getByText(/Chegaram 300/)],
  ] },
  { chave: "receb-dialogo", papel: "colaborador", url: "/compras/recebimento", viewport: ALTO,
    antes: async (p) => {
      await linha("OC-2026-00029")(p).getByRole("button", { name: /Receber saldo/ }).click(); await p.waitForTimeout(1000);
      await dlg(p).locator('input[aria-label="Quantidade recebida"]').fill("150"); await p.waitForTimeout(300);
      await dlg(p).locator('input[placeholder="O que veio diferente?"]').fill("Vieram 150 das 200 que faltavam.");
    },
    clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText(/já chegou 300/)],
    [2, (p) => dlg(p).getByText(/200 un/).first()],
    [3, (p) => dlg(p).locator('input[aria-label="Quantidade recebida"]')],
    [4, (p) => dlg(p).locator('button[aria-label="Qualidade"]')],
    [5, (p) => dlg(p).getByText("Observação da divergência *").locator("..")],
    [6, (p) => dlg(p).getByRole("button", { name: /Registrar recebimento/ })],
  ] },

  // ── NF de compra ──
  { chave: "nfcompra-lista", papel: "colaborador", url: "/compras/notas", viewport: { width: 1440, height: 1000 },
    clip: (p) => [p.locator('nav[aria-label="Etapas da compra"]'), p.locator("main table").last()], marcas: [
    [1, (p) => p.locator("main").getByText("Aguardando lançamento de NF")],
    [2, (p) => linha("OC-2026-00029")(p).getByText("parcial")],
    [3, (p) => linha("OC-2026-00028")(p).getByRole("button", { name: /Lançar NF/ })],
    [4, (p) => p.locator("main table").last().locator("thead th").nth(5)],
    [5, (p) => p.locator("main table").last().locator("tbody tr").first().locator("td").last()],
  ] },
  { chave: "nfcompra-dialogo", papel: "colaborador", url: "/compras/notas", viewport: { width: 1440, height: 1800 },
    antes: async (p) => {
      await linha("OC-2026-00028")(p).getByRole("button", { name: /Lançar NF/ }).click(); await p.waitForTimeout(900);
      await dlg(p).locator('input[placeholder="000123"]').fill("008731");
      const pz = dlg(p).locator('input[placeholder^="ex.: 30/60/90"]'); await pz.fill(""); await pz.pressSequentially("30/60/90", { delay: 30 }); await p.waitForTimeout(400);
    },
    clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText("Nº da NF *").locator("..")],
    [2, (p) => dlg(p).getByText("Data", { exact: true }).locator("..")],
    [3, (p) => dlg(p).getByText("Valor da NF (R$)").locator("..")],
    [4, (p) => dlg(p).getByText("3-way OK").locator("..")],
    [5, (p) => dlg(p).getByText("Anexo da NF (PDF ou XML)").locator("..")],
    [6, (p) => dlg(p).locator("label").filter({ hasText: "Gerar conta a pagar" })],
    [7, (p) => dlg(p).getByText("Prazo", { exact: true }).locator("..")],
    [8, (p) => dlg(p).getByText("2/3", { exact: true }).locator("..")],
    [9, (p) => dlg(p).getByText(/fecha com a NF/)],
    [10, (p) => dlg(p).getByRole("button", { name: /Lançar NF/ })],
  ] },

  // ── Suprimentos ──
  { chave: "suprim-estoque", papel: "colaborador", url: "/suprimentos", viewport: { width: 1440, height: 1100 },
    clip: (p) => [p.locator("main h1").first().locator("xpath=ancestor::div[contains(@class,'justify-between')][1]"), p.locator("main div.grid").filter({ hasText: "Caixa de papelão 12 frascos" }).last()], marcas: [
    [1, (p) => p.locator("main").getByText("Total Produtos").locator("xpath=ancestor::div[contains(@class,'grid')][1]")],
    [2, (p) => p.locator("main").getByText("Modo Planejamento").locator("..")],
    [3, sel('main [role="tablist"]')],
    [4, sel('input[placeholder="Buscar produto..."]')],
    [5, (p) => p.locator("main button[role=combobox]").first()],
    [6, btn(/Exportar Excel/)],
    [7, (p) => p.locator("main").getByText("Atenção", { exact: true }).first()],
    [8, (p) => p.locator("main").getByText("un/dia").first().locator("../..")],
    [9, (p) => p.locator("main").getByText("CD SP LogHouse").first().locator("../..")],
    [10, (p) => p.locator("main").getByText("Saídas 30 dias").first().locator("../..")],
  ] },
  { chave: "suprim-ajuste", papel: "gestor", url: "/suprimentos", viewport: ALTO,
    antes: async (p) => {
      await p.locator("main").getByText("Frasco PET 100ml").first().locator("xpath=ancestor::div[contains(@class,'justify-between')][1]").locator("button").first().click();
      await p.waitForTimeout(700);
      await dlg(p).locator("#new-qty").fill("1830");
      await dlg(p).locator("#reason").fill("Contagem física do Hub Natal.");
    },
    clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText("HUB", { exact: true }).locator("..")],
    [2, (p) => dlg(p).locator("#new-qty")],
    [3, (p) => dlg(p).locator("#new-safety")],
    [4, (p) => dlg(p).locator("#reason")],
    [5, (p) => dlg(p).getByRole("button", { name: /Salvar/ })],
  ] },
  { chave: "suprim-mov", papel: "gestor", url: "/suprimentos?aba=movimentacoes", viewport: { width: 1440, height: 1000 },
    clip: (p) => [sel('main [role="tablist"]')(p), p.locator('main [role="tabpanel"] div.space-y-2 > div').nth(4)], marcas: [
    [1, (p) => p.locator('main [role="tabpanel"] button[role=combobox]').first()],
    [2, btn(/Movimento Manual/)],
    [3, (p) => p.locator("main").getByText("Contagem física do mês").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
  ] },
  { chave: "suprim-mov-dialogo", papel: "gestor", url: "/suprimentos?aba=movimentacoes", viewport: ALTO,
    antes: async (p) => { await btn(/Movimento Manual/)(p).click(); await p.waitForTimeout(700); },
    clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText("Produto", { exact: true }).locator("..")],
    [2, (p) => dlg(p).getByText("Tipo", { exact: true }).locator("..")],
    [3, (p) => dlg(p).getByText("Quantidade", { exact: true }).locator("..")],
    [4, (p) => dlg(p).getByText("Origem", { exact: true }).locator("..")],
    [5, (p) => dlg(p).getByText("Observações", { exact: true }).locator("..")],
  ] },
  { chave: "suprim-planejamento", papel: "gestor", url: "/suprimentos", viewport: ALTO,
    antes: async (p) => { await p.locator("#planning-mode").click(); await p.waitForTimeout(800); },
    clip: (p) => p.locator("main").getByText("Sugestões pendentes").locator("xpath=ancestor::div[contains(@class,'space-y')][1]"), marcas: [
    [1, (p) => p.locator("main").getByRole("tab", { name: /Transferências/ }).locator("..")],
    [2, (p) => p.locator("main").getByText("Selecionar tudo").first().locator("..")],
    [3, (p) => p.locator("main").getByText("Tampa rosqueável 28mm").first().locator("xpath=ancestor::div[contains(@class,'items-start')][1]").locator("div.shrink-0").last()],
    [4, btn(/Executar/)],
  ] },
  { chave: "suprim-politica", papel: "colaborador", url: "/suprimentos?aba=politica", viewport: { width: 1440, height: 1100 },
    clip: (p) => [sel('main [role="tablist"]')(p), p.locator("main").getByText("CarboZé 100ml", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][last()]")], marcas: [
    [1, (p) => p.locator("main").getByText(/abaixo do necessário/).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")],
    [2, sel('input[placeholder="Buscar SKU por nome ou código..."]')],
    [3, (p) => p.locator("main").getByText("CarboZé 100ml", { exact: true }).locator("xpath=ancestor::div[contains(@class,'p-4')][1]").locator("div.grid").first()],
  ] },
  { chave: "suprim-politica-dialogo", papel: "colaborador", url: "/suprimentos?aba=politica", viewport: ALTO,
    antes: async (p) => { await p.locator("main").getByText("CarboZé 100ml", { exact: true }).locator("xpath=ancestor::div[contains(@class,'p-4')][1]").getByText("CD SP LogHouse").click(); await p.waitForTimeout(700); },
    clip: dlg, marcas: [
    [1, (p) => dlg(p).getByText("Estoque mínimo de segurança (unidades)").locator("..")],
    [2, (p) => dlg(p).getByText("Cobertura mínima (dias)").locator("..")],
    [3, (p) => dlg(p).getByRole("button", { name: /Salvar/ })],
  ] },
];
