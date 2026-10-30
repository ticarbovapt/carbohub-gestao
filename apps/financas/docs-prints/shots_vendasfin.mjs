// Prints da área "vendas" (ver shots.mjs): Faturamento (criar no Bling, NFS-e,
// vincular NFs), Comissionamento e Pedidos de Venda. O número de cada
// marcador é o `n` do item em src/docs/secoes/vendas.ts.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();
const tab = (t) => (p) => p.getByRole("tab", { name: t });
const linha = (txt) => (p) => p.locator("tbody tr").filter({ hasText: txt }).first();
const naLinha = (txt, t) => (p) => linha(txt)(p).getByRole("button", { name: t });
const cel = (txt, c) => (p) => linha(txt)(p).locator("td").nth(c);
// Campo de diálogo: o rótulo e o que vem com ele.
const campo = (r) => (p) => dlg(p).locator("label").filter({ hasText: new RegExp("^" + r) }).first().locator("..");
const secTit = (t) => (p) => dlg(p).getByText(t, { exact: true }).first();
const kpi = (t) => (p) => p.locator("main").getByText(t, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
const cab = (p) => p.locator("main h1").first().locator("xpath=ancestor::div[contains(@class,'flex')][2]");
const cartao = (p) => p.locator("main table").first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
const ALTO = { width: 1440, height: 2000 };
const MEDIO = { width: 1440, height: 1200 };
const espere = (ms) => (p) => p.waitForTimeout(ms);
const clicar = (loc, ms = 900) => async (p) => { await loc(p).first().click(); await p.waitForTimeout(ms); };
const F = "/faturamento";

export const SHOTS = [
  // ── Faturamento: a fila ──
  { chave: "fat-lista", papel: "colaborador", url: F, viewport: MEDIO, espera: 1200,
    clip: (p) => [p.locator("main h1").first(), cartao(p)], marcas: [
    [1, btn(/Natureza da bonificação/)],
    [2, (p) => kpi("Vendas do sistema")(p).locator("xpath=..")],
    [3, sel('button[aria-label="Mês anterior"]')],
    [4, sel('main input[placeholder="Buscar cliente, CNPJ/CPF, pedido ou NF…"]')],
    [5, (p) => p.getByText("Mostrar já faturados").first()],
    [6, (p) => p.getByRole("tablist").first()],
    [7, naLinha("V2026100094", /Criar no Bling/)],
    [8, naLinha("V2026100091", /2 notas/)],
    [9, cel("V2026100088", 6)],
    [10, naLinha("V2026100076", /Emitir NFS-e/)],
    [11, cel("V2026100058", 5)],
    [12, cel("V2026100070", 5)],
  ] },
  { chave: "fat-detalhe", papel: "colaborador", url: F, viewport: ALTO, espera: 1200,
    antes: clicar(cel("V2026100094", 1)),
    clip: (p) => [linha("V2026100094")(p), p.locator("tbody tr").nth(1)], marcas: [
    [1, (p) => p.locator("tbody tr").nth(1).getByText("Cliente", { exact: true }).locator("..")],
    [2, (p) => p.locator("tbody tr").nth(1).getByText("Endereço de Faturamento (NF)").locator("..")],
    [3, (p) => p.locator("tbody tr").nth(1).getByText("Produtos", { exact: true }).locator("../..")],
    [4, (p) => p.locator("tbody tr").nth(1).getByText("Subtotal").locator("../..")],
    [5, (p) => p.locator("tbody tr").nth(1).getByText("Pagamento", { exact: true }).locator("..")],
    [6, (p) => p.locator("tbody tr").nth(1).getByText("Expedição", { exact: true }).locator("..")],
    [7, (p) => p.locator("tbody tr").nth(1).getByText(/Nº pedido de compra/).locator("..")],
    [8, (p) => p.locator("tbody tr").nth(1).getByText("Observações", { exact: true }).locator("..")],
  ] },
  { chave: "fat-bling", papel: "colaborador", url: F + "?aba=bling", viewport: MEDIO, espera: 1200,
    clip: (p) => [p.getByRole("tablist").first(), cartao(p), p.getByText(/Pedidos criados/).first()], marcas: [
    [1, tab(/Do Bling/)],
    [2, cel("V2026100080", 5)],
    [3, cel("V2026100049", 5)],
    [4, cel("BLING-6120", 5)],
    [5, tab(/NF Online/)],
  ] },
  { chave: "fat-vincular", papel: "colaborador", url: F + "?aba=vincular", viewport: ALTO, espera: 1500,
    antes: clicar(btn(/Sugestões de vínculo/)),
    clip: (p) => [p.getByRole("tablist").first(), cartao(p)], marcas: [
    [1, btn(/Sugestões de vínculo/)],
    [2, (p) => p.getByText(/confiança/).first()],
    [3, btn(/Confirmar vínculo/)],
    [4, (p) => p.getByRole("button", { name: "Ignorar esta sugestão" })],
    [5, sel('main input[placeholder="Buscar NF por nº ou cliente…"]')],
    [6, naLinha("000434", "Baixar")],
    [7, naLinha("000434", /Vincular/)],
  ] },
  { chave: "fat-vincular-dialogo", papel: "colaborador", url: F + "?aba=vincular", viewport: ALTO, espera: 1500,
    antes: clicar(naLinha("000434", /Vincular/)),
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).locator("h2")],
    [2, (p) => dlg(p).locator("input")],
    [3, (p) => dlg(p).getByText(/valor (bate|difere)/).first()],
    [4, (p) => dlg(p).getByRole("button", { name: /Vincular/ }).first()],
  ] },
  { chave: "fat-filial", papel: "colaborador", url: F + "?aba=vincular-filial", viewport: ALTO, espera: 1500,
    clip: (p) => [p.getByRole("tablist").first(), cartao(p), p.getByText(/casa sozinha por dois caminhos/).first()], marcas: [
    [1, (p) => p.getByText(/já trazem o número do pedido no rodapé/).first().locator("..")],
    [2, (p) => p.getByText(/ainda\s+estão sem a natureza/).first().locator("..")],
    [3, cel("000094", 3)],
    [4, (p) => linha("000094")(p).getByRole("button", { name: /Vincular/ })],
  ] },
  { chave: "fat-filial-dialogo", papel: "colaborador", url: F + "?aba=vincular-filial", viewport: ALTO, espera: 1500,
    antes: async (p) => { await linha("000094")(p).getByRole("button", { name: /Vincular/ }).click(); await p.waitForTimeout(900); await dlg(p).getByText("Remessa de bonificação", { exact: true }).click(); await p.waitForTimeout(400); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).locator("p.font-mono").first()],
    [2, (p) => dlg(p).getByText("Nota da venda", { exact: true }).locator("..")],
    [3, (p) => dlg(p).getByText("Remessa de bonificação", { exact: true }).locator("..")],
    [4, (p) => dlg(p).locator("input").first()],
    [5, (p) => dlg(p).locator("button.font-mono, button:has(span.font-mono)").first()],
  ] },
  { chave: "fat-todas", papel: "colaborador", url: F + "?aba=todas", viewport: MEDIO, espera: 1500,
    clip: (p) => [cartao(p), p.getByText("Todas as notas fiscais")], marcas: [
    [1, sel('main input[placeholder="Buscar NF, cliente ou pedido…"]')],
    [2, cel("000418", 2)],
    [3, cel("000431", 5)],
    [4, cel("000436", 5)],
    [5, naLinha("000436", "Baixar")],
  ] },

  // ── Criar no Bling ──
  { chave: "blingcriar-novo", papel: "colaborador", url: F, viewport: { width: 1440, height: 1700 }, espera: 1200,
    antes: async (p) => { await naLinha("V2026100094", /Criar no Bling/)(p).click(); await p.waitForTimeout(1200); await dlg(p).evaluate((e) => { e.style.maxHeight = "none"; }); await p.waitForTimeout(400); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("Emitir por").locator("..")],
    [2, (p) => dlg(p).getByText("V2026100094").first().locator("../..")],
    [3, campo("Nome / Razão social")],
    [4, campo("CNPJ")],
    [5, campo("Inscrição Estadual")],
    [6, campo("Contribuinte")],
    [7, campo("E-mail")],
    [8, campo("Telefone")],
    [9, campo("Endereço")],
    [10, campo("Número")],
    [11, campo("Bairro")],
    [12, campo("Cidade")],
    [13, (p) => campo("UF")(p).locator("..")],
    [14, (p) => dlg(p).getByText(/Preencha para o Bling aceitar/)],
    [15, (p) => secTit("Itens")(p).locator("..")],
    [16, (p) => secTit("Pagamento")(p).locator("..")],
    [17, (p) => secTit("Observação da NF")(p).locator("..")],
    [18, (p) => dlg(p).getByText(/não encontrado no Bling/).first()],
    [19, (p) => dlg(p).getByRole("button", { name: /Confirmar e criar/ })],
  ] },
  { chave: "blingcriar-filial", papel: "colaborador", url: F, viewport: MEDIO, espera: 1200,
    antes: async (p) => { await naLinha("V2026100094", /Criar no Bling/)(p).click(); await p.waitForTimeout(1200); await dlg(p).getByRole("button", { name: "Filial SP" }).click(); await p.waitForTimeout(1000); },
    clip: (p) => [dlg(p).locator("h2"), dlg(p).getByText("Emitir por").locator("..")], marcas: [
    [1, (p) => dlg(p).getByRole("button", { name: "Matriz" })],
    [2, (p) => dlg(p).getByRole("button", { name: "Filial SP" })],
    [3, (p) => dlg(p).getByText(/A nota sairá no CNPJ/)],
  ] },
  { chave: "blingcriar-bonif", papel: "colaborador", url: F, viewport: ALTO, espera: 1200,
    antes: async (p) => { await naLinha("V2026100091", /2 notas/)(p).click(); await p.waitForTimeout(1400); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("Cliente já cadastrado no Bling").locator("../..")],
    [2, (p) => dlg(p).getByText(/remessa separada/).first().locator("..")],
    [3, (p) => secTit("Pagamento")(p).locator("..")],
    [4, (p) => dlg(p).getByText(/serão criados DOIS pedidos/)],
  ] },
  { chave: "blingcriar-natureza", papel: "colaborador", url: F, viewport: MEDIO, espera: 1200,
    antes: async (p) => { await btn(/Natureza da bonificação/)(p).click(); await p.waitForTimeout(1200); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByRole("button", { name: "Matriz" }).locator("..")],
    [2, (p) => dlg(p).getByText("Remessa em bonificação, doação ou brinde").locator("../..")],
    [3, (p) => dlg(p).getByText(/Configurada: ID|Ainda não configurada/)],
  ] },

  // ── NFS-e ──
  { chave: "nfse-emitir-form", papel: "colaborador", url: F, viewport: { width: 1440, height: 2000 }, espera: 1200,
    antes: async (p) => {
      await naLinha("V2026100076", /Emitir NFS-e/)(p).click(); await p.waitForTimeout(1500);
      await campo("Código IBGE")(p).locator("input").fill("2408102");
      await campo("Indicador da operação")(p).getByRole("combobox").click(); await p.waitForTimeout(500);
      await p.getByRole("option", { name: /050103/ }).click(); await p.waitForTimeout(400);
      await dlg(p).evaluate((e) => { e.style.maxHeight = "none"; }); await p.waitForTimeout(400);
    },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => campo("Nome / Razão social")(p).locator("..")],
    [2, campo("CEP")],
    [3, campo("Código IBGE")],
    [4, campo("Logradouro")],
    [5, (p) => campo("Número")(p)],
    [6, campo("Bairro")],
    [7, campo("Telefone")],
    [8, campo("Indicador da operação")],
    [9, campo("Competência")],
    [10, campo("Descrição do serviço")],
    [11, campo("Informações complementares")],
    [12, (p) => secTit("Valores")(p).locator("..")],
    [13, (p) => dlg(p).getByRole("button", { name: /Emitir NFS-e/ })],
  ] },
  { chave: "nfse-emitir-reenviar", papel: "colaborador", url: F, viewport: ALTO, espera: 1200,
    antes: async (p) => { await naLinha("V2026100058", /Emitir NFS-e/)(p).click(); await p.waitForTimeout(1500); },
    clip: (p) => [dlg(p).locator("h2"), dlg(p).getByText(/Não sabemos se a nota/).locator("../..")], marcas: [
    [1, (p) => dlg(p).getByText(/Não sabemos se a nota/)],
    [2, (p) => dlg(p).getByText(/mesmo número/).first()],
    [3, (p) => dlg(p).getByRole("button", { name: /Reenviar com o mesmo número/ })],
  ] },
  { chave: "nfse-emitir-tentativas", papel: "colaborador", url: F, viewport: ALTO, espera: 1200,
    antes: async (p) => { await naLinha("V2026100058", /Emitir NFS-e/)(p).click(); await p.waitForTimeout(1500); await dlg(p).evaluate((e) => { e.style.maxHeight = "none"; }); },
    clip: (p) => [secTit("Tentativas")(p).locator(".."), dlg(p).locator("button").filter({ hasText: /Emitir NFS-e/ })], marcas: [
    [1, (p) => secTit("Tentativas")(p).locator("..")],
    [2, (p) => dlg(p).getByRole("button", { name: /Emitir NFS-e/ })],
  ] },

  // ── Comissionamento ──
  { chave: "comissao-calcular", papel: "gestor", url: "/comissionamento", viewport: MEDIO, espera: 1500,
    clip: (p) => [p.locator("main h1").first(), cartao(p)], marcas: [
    [1, (p) => p.getByRole("tablist").first()],
    [2, (p) => p.locator("main").getByText("De", { exact: true }).first().locator("..")],
    [3, (p) => p.locator("main").getByText("Até", { exact: true }).first().locator("..")],
    [4, (p) => p.locator("main").getByText("Vendedor", { exact: true }).first().locator("..")],
    [5, (p) => p.getByText(/Base total/).first()],
    [6, btn("Regras de %")],
    [7, (p) => linha("Rafael Costa")(p).getByRole("button", { name: /NF\(s\)/ })],
    [8, (p) => cel("Rafael Costa", 2)(p)],
    [9, (p) => cel("Rafael Costa", 3)(p)],
    [10, (p) => cel("Rafael Costa", 4)(p)],
    [11, (p) => cel("Rafael Costa", 5)(p)],
    [12, naLinha("Rafael Costa", "Gerar comissão")],
  ] },
  { chave: "comissao-regras", papel: "gestor", url: "/comissionamento", viewport: MEDIO, espera: 1500,
    antes: clicar(btn("Regras de %"), 900),
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("% padrão", { exact: true }).locator("..")],
    [2, (p) => dlg(p).getByRole("button").filter({ hasText: /Salvar/ }).first()],
  ] },
  { chave: "comissao-nfs", papel: "gestor", url: "/comissionamento", viewport: MEDIO, espera: 1800,
    antes: clicar((p) => linha("Rafael Costa")(p).getByRole("button", { name: /NF\(s\)/ }), 1200),
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByRole("button", { name: /PDF|DANFE/ }).first()],
    [2, (p) => dlg(p).getByRole("button", { name: /XML/ }).first()],
  ] },
  { chave: "comissao-pagamentos", papel: "gestor", url: "/comissionamento?aba=pagamentos", viewport: MEDIO, espera: 1500,
    clip: (p) => [p.getByRole("tablist").first(), cartao(p)], marcas: [
    [1, (p) => kpi("Total devido")(p).locator("xpath=..")],
    [2, (p) => p.locator("main").getByText("Vendedor", { exact: true }).first().locator("..")],
    [3, (p) => p.locator("main").getByText("Status", { exact: true }).first().locator("..")],
    [4, (p) => p.locator("main").getByText("Ordenar por", { exact: true }).first().locator("..")],
    [5, cel("Ana Souza", 7)],
    [6, naLinha("Rafael Costa", "Memória")],
    [7, naLinha("Rafael Costa", "Registrar pagamento")],
  ] },
  { chave: "comissao-pagar", papel: "gestor", url: "/comissionamento?aba=pagamentos", viewport: MEDIO, espera: 1500,
    antes: clicar(naLinha("Rafael Costa", "Registrar pagamento")),
    clip: (p) => dlg(p), marcas: [
    [1, campo("Valor pago agora")],
    [2, campo("Data do pagamento")],
    [3, campo("Forma de pagamento")],
    [4, campo("Observação")],
    [5, (p) => dlg(p).getByRole("button", { name: "Registrar pagamento" })],
  ] },
  { chave: "comissao-memoria", papel: "gestor", url: "/comissionamento?aba=pagamentos&memoria=s1", viewport: MEDIO, espera: 2000,
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText(/Faturado \(com NF\)/).locator("../..")],
    [2, (p) => dlg(p).locator("p.font-mono").first().locator("../..")],
    [3, (p) => dlg(p).getByText(/NF\(s\)$/).last().locator("..")],
  ] },
  { chave: "comissao-colab", papel: "colaborador", url: "/comissionamento", viewport: { width: 1440, height: 700 }, espera: 1000,
    clip: (p) => [p.locator("main h1").first(), p.getByText("Acesso restrito")], pad: 40, marcas: [
    [1, (p) => p.getByText("Acesso restrito")],
  ] },

  // ── Pedidos de Venda ──
  { chave: "pedidos-lista", papel: "colaborador", url: "/pedidos", viewport: ALTO, espera: 1500,
    clip: (p) => [p.locator("main h1").first(), p.locator("main table").first()], marcas: [
    [1, btn(/Atualizar/)],
    [2, btn(/Exportar/)],
    [3, tab(/Relatórios/)],
    [4, (p) => p.locator("main").getByText("Total Pedidos").first().locator("xpath=ancestor::div[contains(@class,'grid')][1]")],
    [5, sel('main input[placeholder="Buscar número, cliente ou licenciado…"]')],
    [6, (p) => p.locator("main button[role=combobox]").first()],
    [7, (p) => p.locator("main thead").first()],
  ] },
  { chave: "pedidos-gestor", papel: "gestor", url: "/pedidos", viewport: ALTO, espera: 1500,
    clip: (p) => [p.locator("main h1").first(), p.locator("main table").first()], marcas: [
    [1, (p) => p.getByRole("link", { name: /Novo Pedido/ })],
    [2, (p) => p.locator("main tbody tr").first().locator("button").first()],
  ] },
  { chave: "pedidos-editar", papel: "gestor", url: "/pedidos", viewport: { width: 1440, height: 1800 }, espera: 1500,
    antes: async (p) => { await p.locator("main tbody tr").first().locator("button").first().click(); await p.waitForTimeout(1200); await dlg(p).evaluate((e) => { e.style.maxHeight = "none"; }); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("Status", { exact: true }).first().locator("..")],
    [2, (p) => dlg(p).getByText("Código de Rastreio").locator("..")],
    [3, (p) => dlg(p).getByText("Tipo do Pedido").locator("..")],
    [4, (p) => dlg(p).getByRole("button", { name: /Salvar/ })],
  ] },
  { chave: "pedidos-relatorios", papel: "colaborador", url: "/pedidos", viewport: { width: 1440, height: 1600 }, espera: 1500,
    antes: clicar(tab(/Relatórios/), 1500),
    clip: (p) => p.locator("main"), marcas: [] },
];
