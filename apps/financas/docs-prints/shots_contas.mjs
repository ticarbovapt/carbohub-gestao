// Prints da área CONTAS (ver shots.mjs). O número de cada marcador é o MESMO
// `n` do item em src/docs/secoes/contas.ts.
const sel = (s) => (p) => p.locator(s);
const btn = (t) => (p) => p.getByRole("button", { name: t });
const dlg = (p) => p.locator('[role="dialog"]').last();
const esperar = (p, ms) => p.waitForTimeout(ms);
const ALTO = { width: 1440, height: 1500 };
const linha = (t) => (p) => p.locator("tbody tr").filter({ hasText: t }).first();
const kpis = (p) => p.locator("main").getByText("Em aberto", { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'grid')][1]");
const filtro = (t) => (p) => p.locator("main button").filter({ hasText: t }).first();
// Campo do diálogo pelo rótulo (o <label> e o que vem logo depois).
const campo = (rotulo) => (p) => dlg(p).locator("label").filter({ hasText: new RegExp("^" + rotulo) }).first().locator("..");

// Escolhe a opção de um Select do diálogo (pela ordem dos combobox).
async function escolher(p, idx, opcao) {
  await dlg(p).getByRole("combobox").nth(idx).click();
  await esperar(p, 300);
  await p.getByRole("option", { name: opcao }).first().click();
  await esperar(p, 250);
}
async function diaNoCalendario(p, gatilho, diaTxt) {
  await gatilho.click();
  await esperar(p, 350);
  await p.locator('button[name="day"]').filter({ hasText: new RegExp("^" + diaTxt + "$") }).last().click();
  await esperar(p, 250);
}
// Abre "Nova conta a <tipo>" e preenche como no uso normal.
const preencher = (tipo, { parcelas = 1 } = {}) => async (p) => {
  await p.getByRole("button", { name: `Nova conta a ${tipo}` }).click();
  await esperar(p, 900);
  const d = dlg(p);
  await d.locator("input[placeholder^='Nome do']").fill(tipo === "pagar" ? "gráfica norte" : "horizonte");
  await esperar(p, 1100);
  await d.locator("button").filter({ hasText: tipo === "pagar" ? "Gráfica Norte Ltda" : "Posto Horizonte Ltda" }).first().click();
  await esperar(p, 300);
  await d.locator('input[placeholder="0,00"]').first().fill(tipo === "pagar" ? "2.480,00" : "3.900,00");
  await diaNoCalendario(p, d.getByRole("button", { name: /dd\/mm\/aaaa/ }), "30");
  await d.locator("textarea").fill(tipo === "pagar" ? "Ref. NF 5521 — impressão de rótulos de outubro" : "Ref. ao pedido V2026100088 · boleto 28 dias");
  await escolher(p, 0, "Boleto");
  if (tipo === "receber") { await escolher(p, 2, "Rafael Costa"); await escolher(p, 3, "Venda de produtos"); }
  else await escolher(p, 2, "Insumos de produção");
  await d.locator("label").filter({ hasText: /^Nº documento/ }).locator("..").locator("input").fill(tipo === "pagar" ? "NF 5521" : "000845");
  if (parcelas > 1) await d.locator('input[type="number"]').fill(String(parcelas));
  await d.locator("h2").first().click();
  await esperar(p, 400);
};

export const SHOTS = [
  // ── Contas a pagar · matriz ──
  { chave: "pagar-lista", papel: "colaborador", url: "/pagar", viewport: { width: 1440, height: 1000 },
    clip: (p) => p.locator("main > div").first(), pad: 4, marcas: [
    [1, btn("Nova conta a pagar")],
    [2, sel('main [aria-label="Empresa"]')],
    [3, (p) => p.locator("main").getByText(/Bling 1 ·/).first()],
    [4, kpis],
    [5, sel('main input[placeholder="Buscar fornecedor ou nº"]')],
    [6, filtro("Status:")],
    [7, filtro("Origem:")],
    [8, filtro("Vencimento:")],
    [9, filtro("Ordenar:")],
    [10, (p) => p.locator("thead").getByText("Valor").first()],
    [11, (p) => linha("Química Nordeste")(p).getByText("Parcial")],
    [12, (p) => linha("Embalagens Delta")(p).getByText(/criada por/)],
    [13, (p) => linha("Gráfica Norte")(p).getByRole("button", { name: "Pagar" })],
    [14, (p) => linha("Gráfica Norte")(p).locator("button").last()],
    [15, (p) => p.locator("main").getByText(/^1–\d+ de \d+$/).first().locator("..")],
  ] },
  { chave: "pagar-pagos", papel: "colaborador", url: "/pagar?status=pago",
    clip: (p) => p.locator("main table").first(), marcas: [
    [1, (p) => linha("Internet Fibra")(p).getByText(/juros/)],
    [2, (p) => linha("Internet Fibra")(p).getByText("no Bling").first()],
    [3, (p) => linha("Gráfica Norte")(p).locator("td").nth(4)],
    [4, (p) => linha("Internet Fibra")(p).locator("button").last()],
  ] },
  // ── Filial ──
  { chave: "pagar-filial", papel: "colaborador", url: "/pagar?empresa=filial&situacao=todos",
    clip: (p) => [p.locator("main h1").first(), p.locator("main table").first()], marcas: [
    [1, sel('main [aria-label="Empresa"]')],
    [2, (p) => p.locator("main").getByText(/Bling 2/).first()],
    [3, (p) => linha("Condomínio")(p).getByText("Parcial")],
    [4, (p) => linha("Energia Sudeste")(p).getByText("Rafael")],
    [5, (p) => linha("Logística SP")(p).getByRole("button", { name: "Pagar" })],
  ] },

  // ── Nova conta no Bling ──
  { chave: "conta-busca", papel: "colaborador", url: "/pagar", viewport: ALTO,
    antes: async (p) => {
      await p.getByRole("button", { name: "Nova conta a pagar" }).click(); await esperar(p, 900);
      await dlg(p).locator("input[placeholder^='Nome do']").fill("gráfica norte"); await esperar(p, 1200);
    },
    clip: (p) => [dlg(p).locator("h2").first(), dlg(p).getByText("Histórico").first()], marcas: [
    [1, (p) => dlg(p).locator("h2").first()],
    [2, (p) => dlg(p).locator("input[placeholder^='Nome do']")],
    [3, (p) => dlg(p).locator("button").filter({ hasText: "Gráfica Norte Ltda" }).first()],
    [4, (p) => dlg(p).getByText("11.222.333/0001-44").first()],
  ] },
  { chave: "conta-pagar", papel: "colaborador", url: "/pagar", viewport: ALTO, antes: preencher("pagar"),
    clip: (p) => dlg(p), pad: 4, marcas: [
    [1, campo("Fornecedor")],
    [2, campo("Valor")],
    [3, campo("Emissão")],
    [4, campo("Competência")],
    [5, campo("Vencimento")],
    [6, campo("Histórico")],
    [7, campo("Forma de pagamento")],
    [8, campo("Conta financeira")],
    [9, campo("Categoria")],
    [10, campo("Nº documento")],
    [11, (p) => campo("Juros mensal")(p).locator("..")],
    [12, (p) => dlg(p).locator("dl").first()],
    [13, campo("Parcelas")],
    [14, (p) => dlg(p).getByRole("button", { name: "Salvar e dar baixa" })],
    [15, (p) => dlg(p).getByRole("button", { name: /^Salvar$/ })],
  ] },
  { chave: "conta-parcelas", papel: "colaborador", url: "/pagar", viewport: ALTO, antes: preencher("pagar", { parcelas: 3 }),
    clip: (p) => [dlg(p).getByText("Ocorrência").first(), dlg(p).getByRole("button", { name: /Salvar 3 parcelas/ })], marcas: [
    [1, campo("Parcelas")],
    [2, (p) => dlg(p).getByText("3 parcelas mensais", { exact: true })],
    [3, (p) => dlg(p).getByText("1/3").locator("..")],
    [4, (p) => dlg(p).getByText(/Soma das parcelas/)],
    [5, (p) => dlg(p).getByRole("button", { name: "Salvar e dar baixa" })],
    [6, (p) => dlg(p).getByRole("button", { name: /Salvar 3 parcelas/ })],
  ] },
  { chave: "conta-receber", papel: "colaborador", url: "/receber", viewport: ALTO, antes: preencher("receber"),
    clip: (p) => [dlg(p).locator("h2").first(), campo("Juros mensal")(p).locator("..")], marcas: [
    [1, campo("Cliente")],
    [2, campo("Forma de pagamento")],
    [3, campo("Conta financeira")],
    [4, campo("Vendedor")],
    [5, campo("Categoria")],
  ] },

  // ── A baixa ──
  { chave: "baixa-pagar", papel: "colaborador", url: "/pagar", viewport: { width: 1440, height: 1200 },
    antes: async (p) => {
      await linha("Gráfica Norte")(p).getByRole("button", { name: "Pagar" }).click(); await esperar(p, 900);
      await dlg(p).getByText("Juros", { exact: true }).locator("..").locator("input").fill("18,40");
      await esperar(p, 400);
    },
    clip: (p) => dlg(p), pad: 4, marcas: [
    [1, (p) => dlg(p).locator("dl").first()],
    [2, (p) => dlg(p).getByText("Conta (banco)").locator("..")],
    [3, (p) => dlg(p).getByText(/^Data do pagamento/).locator("..")],
    [4, (p) => dlg(p).getByText("Juros", { exact: true }).locator("..")],
    [5, (p) => dlg(p).getByText("Multa", { exact: true }).locator("..")],
    [6, (p) => dlg(p).getByText("Desconto", { exact: true }).locator("..")],
    [7, (p) => dlg(p).getByText("Valor pago").locator("..").locator("..")],
    [8, (p) => dlg(p).locator("textarea").locator("..")],
    [9, (p) => dlg(p).getByText(/Quita o título|Baixa parcial/)],
    [10, (p) => dlg(p).getByRole("button", { name: /Confirmar pagamento/ })],
  ] },
  { chave: "baixa-receber", papel: "colaborador", url: "/receber", viewport: { width: 1440, height: 1200 },
    antes: async (p) => {
      await linha("Auto Center")(p).getByRole("button", { name: "Receber" }).click(); await esperar(p, 900);
      await dlg(p).getByText("Tarifa", { exact: true }).locator("..").locator("input").fill("12,50");
      await esperar(p, 300);
      const v = dlg(p).getByText("Valor recebido").locator("..").locator("..").locator("input");
      await v.fill("1.000,00"); await esperar(p, 400);
    },
    clip: (p) => [dlg(p).getByText("Juros", { exact: true }), dlg(p).getByText(/Baixa parcial|Quita/)], marcas: [
    [1, (p) => dlg(p).getByText("Tarifa", { exact: true }).locator("..")],
    [2, (p) => dlg(p).getByText("Valor recebido").locator("..").locator("..")],
    [3, (p) => dlg(p).getByText(/^usar R\$/)],
    [4, (p) => dlg(p).getByText(/Baixa parcial/)],
  ] },

  // ── Contas a receber ──
  { chave: "receber-lista", papel: "colaborador", url: "/receber", viewport: { width: 1440, height: 1000 },
    clip: (p) => p.locator("main > div").first(), pad: 4, marcas: [
    [1, btn("Nova conta a receber")],
    [2, sel('main [aria-label="Empresa"]')],
    [3, kpis],
    [4, sel('main input[placeholder="Buscar cliente, pedido, NF ou CNPJ"]')],
    [5, filtro("Status:")],
    [6, filtro("Origem:")],
    [7, (p) => linha("Posto Horizonte")(p).getByText(/Parcela 2\/3/)],
    [8, (p) => linha("Auto Center")(p).getByRole("button", { name: "Receber" })],
  ] },
  { chave: "receber-recebidos", papel: "colaborador", url: "/receber?status=recebido",
    clip: (p) => p.locator("main table").first(), marcas: [
    [1, (p) => linha("Mercado Livre")(p).getByText(/tarifa/)],
    [2, (p) => linha("Mercado Livre")(p).getByText("no Bling").first()],
  ] },

  // ── Assinaturas ──
  { chave: "assin-lista", papel: "gestor", url: "/pagar/assinaturas",
    clip: (p) => [p.locator("main h1").first(), p.locator("main table").first()], marcas: [
    [1, (p) => p.locator("main").getByText("Assinaturas ativas").first().locator("xpath=ancestor::div[contains(@class,'grid')][1]")],
    [2, (p) => p.locator("main").getByRole("button", { name: "Ativas" }).locator("..")],
    [3, (p) => p.locator("main").getByRole("combobox").first()],
    [4, btn("Nova assinatura")],
    [5, (p) => linha("Rastreador")(p).locator("td").nth(4)],
    [6, (p) => linha("Certificado")(p).getByText("Manual")],
    [7, (p) => linha("Plataforma de e-mail")(p).locator("td").last()],
  ] },
  { chave: "assin-form", papel: "gestor", url: "/pagar/assinaturas", viewport: { width: 1440, height: 1100 },
    antes: async (p) => { await p.getByRole("button", { name: "Nova assinatura" }).click(); await esperar(p, 700); },
    clip: (p) => dlg(p), pad: 4, marcas: [
    [1, campo("Nome")],
    [2, campo("Setor")],
    [3, campo("Valor")],
    [4, campo("Moeda")],
    [5, campo("Ciclo")],
    [6, campo("Cobrança")],
    [7, campo("Próximo vencimento")],
    [8, campo("Cartão")],
  ] },

  // ── Fluxo de caixa ──
  { chave: "fluxo", papel: "colaborador", url: "/fluxo-caixa", viewport: { width: 1440, height: 1400 },
    clip: (p) => p.locator("main > div").first(), pad: 4, marcas: [
    [1, sel('main [aria-label="Origem"]')],
    [2, sel('main [aria-label="Horizonte"]')],
    [3, (p) => p.locator("main div.grid").filter({ hasText: "Inadimplência" }).last()],
    [4, (p) => p.locator("main").getByText(/A 1ª semana inclui/)],
    [5, (p) => p.locator("main .recharts-wrapper").first()],
    [6, (p) => p.locator("main").getByText("Aging de clientes (a receber)").first()],
    [7, (p) => p.locator("main").getByText("Aging de fornecedores (a pagar)").first()],
  ] },

  // ── Painel financeiro (gestor) ──
  { chave: "painelfin", papel: "gestor", url: "/painel-financeiro", viewport: { width: 1440, height: 2800 }, espera: 1500,
    clip: (p) => p.locator("main > div").first(), pad: 4, marcas: [
    [1, sel('main [aria-label="Origem"]')],
    [2, sel('main [aria-label="Período"]')],
    [3, (p) => p.locator("main").getByText("Vencido (em aberto)").first().locator("xpath=ancestor::div[contains(@class,'grid')][1]")],
    [4, (p) => p.locator("main").getByText("Aging — contas a pagar em aberto").first()],
    [5, (p) => p.locator("main").getByText(/Previsão de desembolso/).first()],
    [6, (p) => p.locator("main").getByText("Contas a pagar por status").first()],
    [7, (p) => p.locator("main").getByText("Evolução mensal do desembolso").first()],
    [8, (p) => p.locator("main").getByText(/curva ABC/).first()],
    [9, (p) => p.locator("main").getByText(/Tempo de ciclo/).first()],
    [10, (p) => p.locator("main").getByText("RCs paradas em aprovação").first()],
    [11, (p) => p.locator("main").getByText(/custo mensal por setor/).first()],
    [12, (p) => p.locator("main").getByText("Próximas renovações (60 dias)").first()],
  ] },
  { chave: "painelfin-colab", papel: "colaborador", url: "/painel-financeiro",
    clip: (p) => [p.locator("main h1").first(), p.locator("main").getByText(/só para gestores/)], marcas: [
    [1, (p) => p.locator("main").getByText(/só para gestores/)],
  ] },

  // ── Cadastros ──
  { chave: "fornec-lista", papel: "gestor", url: "/fornecedores",
    clip: (p) => [p.locator("main h1").first(), p.locator("main table").first()], marcas: [
    [1, sel('main input[placeholder="Buscar nome, CNPJ ou cidade…"]')],
    [2, btn("Novo fornecedor")],
    [3, (p) => linha("Papelaria Central")(p).getByText("Inativo")],
    [4, (p) => linha("Gráfica Norte")(p).locator("td").last()],
  ] },
  { chave: "fornec-form", papel: "gestor", url: "/fornecedores", viewport: { width: 1440, height: 1100 },
    antes: async (p) => { await p.getByRole("button", { name: "Novo fornecedor" }).click(); await esperar(p, 700); },
    clip: (p) => dlg(p), pad: 4, marcas: [
    [1, campo("Nome")],
    [2, campo("Razão social")],
    [3, campo("CNPJ/CPF")],
    [4, campo("Categoria")],
    [5, campo("Observações")],
  ] },
  { chave: "formas-lista", papel: "gestor", url: "/formas-pagamento",
    clip: (p) => [p.locator("main h1").first(), p.locator("main table").first()], marcas: [
    [1, (p) => p.locator("main td").filter({ hasText: /••\d{4}/ }).first()],
    [2, btn("Nova forma de pagamento")],
    [3, (p) => linha("Cartão antigo")(p).getByText("Inativo")],
    [4, (p) => linha("Bradesco PJ")(p).locator("td").last()],
  ] },
  { chave: "formas-form", papel: "gestor", url: "/formas-pagamento", viewport: { width: 1440, height: 1100 },
    antes: async (p) => { await p.getByRole("button", { name: "Nova forma de pagamento" }).click(); await esperar(p, 700); },
    clip: (p) => dlg(p), pad: 4, marcas: [
    [1, campo("Apelido")],
    [2, campo("Tipo")],
    [3, campo("Bandeira")],
    [4, campo("4 últimos")],
    [5, campo("Titular")],
  ] },
];
