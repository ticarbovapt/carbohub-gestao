// Prints da área "esteira" (ver shots.mjs): Esteira do On-line e Mensagens ao cliente.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const combo = (i) => (p) => p.locator("main button[role=combobox]").nth(i);
/** A coluna do quadro pelo nome (cabeçalho). */
const col = (nome) => (p) => p.locator("main div.rounded-xl").filter({ has: p.locator("span.text-xs.font-semibold", { hasText: new RegExp("^" + nome + "$") }) }).first();
/** Um card pelo nome do cliente. */
const card = (nome) => (p) => p.locator("main div.rounded-lg.border.bg-card").filter({ hasText: nome }).first();
const dlg = (p) => p.locator('[role="dialog"]').last();
const bloco = (t) => (p) => dlg(p).locator("section").filter({ has: p.locator("h4", { hasText: t }) }).first();
const LARGO = { width: 1920, height: 1000 };
const editor = (t) => (p) => p.locator("main h3").filter({ hasText: new RegExp("^" + t) }).first().locator("xpath=ancestor::div[contains(@class,'rounded-')][1]");

export const SHOTS = [
  // ── Esteira: da venda à entrega ──
  { chave: "esteira", papel: "colaborador", url: "/ecommerce/esteira", viewport: LARGO, marcas: [
    [1, combo(0)],
    [2, (p) => p.getByRole("link", { name: /Mensagens ao cliente/ })],
    [3, (p) => p.locator("main").getByText("em andamento", { exact: true }).locator("..").locator("..")],
    [4, sel('input[placeholder^="Cliente, nº CZ"]')],
    [5, combo(1)],
    [6, combo(2)],
    [7, combo(3)],
    [8, btn(/Só os que precisam de atenção/)],
    [9, col("Pago")],
    [10, col("Confirmado")],
    [11, col("Sem etiqueta")],
    [12, col("Etiqueta")],
    [13, col("Em trânsito")],
    [14, col("Entregue")],
    [15, (p) => p.locator("summary").filter({ hasText: /travados/ })],
    [16, (p) => p.locator("summary").filter({ hasText: /cancelados/ })],
    [17, (p) => p.locator("summary").filter({ hasText: /Como ler esta tela/ })],
  ] },
  // Os cards, de perto
  { chave: "esteira-cards", papel: "colaborador", url: "/ecommerce/esteira", viewport: LARGO, pad: 10,
    clip: (p) => [col("Sem etiqueta")(p), col("Em trânsito")(p)], marcas: [
    [1, (p) => card("Patrícia Lopes")(p).locator("span.text-\\[13px\\]").first()],
    [2, (p) => card("Patrícia Lopes")(p).locator("span.text-\\[13px\\]").nth(1)],
    [3, (p) => card("Patrícia Lopes")(p).getByText("Nuvemshop · Mossoró/RN")],
    [4, (p) => card("Patrícia Lopes")(p).getByText(/^há \d+d$/)],
    [5, (p) => card("Patrícia Lopes")(p).getByText(/parado há/)],
    [6, (p) => card("Rodrigo Alves")(p).getByText("falhou")],
    [7, (p) => card("Rodrigo Alves")(p).getByText("etiqueta em preparação")],
    [8, (p) => card("Luana Ribeiro")(p).getByText("avisado")],
    [9, (p) => card("Luana Ribeiro")(p).getByText(/chega/)],
    [10, (p) => card("Luana Ribeiro")(p).getByText("via Melhor Envio")],
    [11, (p) => card("Thiago Martins")(p).getByText(/atrasado/)],
    [12, (p) => card("Thiago Martins")(p).getByText("sem telefone")],
    [13, (p) => card("Luana Ribeiro")(p).getByText(/^NF 000399/)],
    [14, (p) => card("Luana Ribeiro")(p).locator('button[title="Copiar rastreio"]')],
  ] },
  { chave: "esteira-cards2", papel: "colaborador", url: "/ecommerce/esteira", viewport: LARGO, pad: 10,
    clip: (p) => [col("Pago")(p), col("Etiqueta")(p)], marcas: [
    [1, (p) => p.locator("main div.rounded-lg.border").filter({ hasText: "Vanessa Moura" }).first().getByText(/^\d+h$/)],
    [2, (p) => p.locator("main div.rounded-lg.border").filter({ hasText: "Comprador ML" }).first().getByText("sem telefone na plataforma")],
    [3, (p) => card("Fernanda Rocha")(p).getByText(/vence em/)],
    [4, (p) => card("Fernanda Rocha")(p).getByText("na fila")],
    [5, (p) => card("Marcos Teixeira")(p).locator("svg").first()],
    [6, (p) => card("Juliana Prado")(p).getByText(/sem NF/)],
  ] },
  // O card aberto
  { chave: "esteira-detalhe", papel: "colaborador", url: "/ecommerce/esteira?card=9007", viewport: { width: 1440, height: 1500 },
    clip: (p) => dlg(p), pad: 0, marcas: [
    [1, (p) => dlg(p).locator("h2").first()],
    [2, (p) => dlg(p).locator("div.text-right").first()],
    [3, btn(/Copiar mensagem ao cliente/)],
    [4, (p) => dlg(p).getByRole("link", { name: /Rastrear/ })],
    [5, (p) => dlg(p).getByRole("link", { name: /DANFE/ })],
    [6, btn(/Copiar link/)],
    [7, bloco("Trajeto")],
    [8, bloco("Avisos ao cliente")],
    [9, bloco("Pedido")],
    [10, bloco("Nota fiscal")],
    [11, bloco("Cliente")],
    [12, bloco("Entrega")],
    [13, bloco("Itens")],
  ] },
  { chave: "esteira-telefone", papel: "colaborador", url: "/ecommerce/esteira?card=9004", viewport: { width: 1440, height: 1300 },
    clip: (p) => [dlg(p).locator("div.border-red-500\\/40").first(), bloco("Avisos ao cliente")(p)], pad: 12, marcas: [
    [1, (p) => dlg(p).locator("div.border-red-500\\/40").first()],
    [2, (p) => bloco("Avisos ao cliente")(p).getByText(/131026/)],
    [3, (p) => bloco("Avisos ao cliente")(p).getByText("ainda não").first()],
  ] },
  // O alarme de fonte parada
  { chave: "esteira-alarme", papel: "colaborador", url: "/ecommerce/esteira?alarme=1", viewport: LARGO,
    clip: (p) => p.locator("main div.border-red-500\\/40").first(), pad: 10, marcas: [
    [1, (p) => p.locator("main div.border-red-500\\/40").first().locator("span").first()],
    [2, (p) => p.locator("main div.border-red-500\\/40 li").first()],
  ] },
  // ── Régua de recompra ──
  { chave: "esteira-recompra", papel: "colaborador", url: "/ecommerce/esteira?pipeline=recompra", viewport: LARGO, marcas: [
    [1, combo(0)],
    [2, (p) => p.locator("main").getByText(/oferta \d+ dias após a entrega/)],
    [3, col("Entregue")],
    [4, col("Hora de ofertar")],
    [5, col("Ofertado")],
    [6, col("Recomprou")],
    [7, col("Sem retorno")],
    [8, (p) => p.locator('main button[title^="Sem telefone"]')],
    [9, (p) => p.locator('main button[title^="Erro ao enviar"]')],
    [10, (p) => p.locator('main button[title^="Não contatar"]')],
    [11, (p) => p.locator("summary").filter({ hasText: /entregues antes da régua/ })],
  ] },
  { chave: "esteira-recolhidas", papel: "colaborador", url: "/ecommerce/esteira?pipeline=recompra", viewport: { width: 2700, height: 1000 },
    antes: async (p) => {
      await p.locator('main button[title^="Erro ao enviar"]').click();
      await p.locator('main button[title^="Sem telefone"]').click();
      await p.waitForTimeout(400);
    },
    clip: (p) => [col("Sem telefone")(p), col("Erro ao enviar")(p), p.locator('main button[title^="Não contatar"]')], pad: 10, marcas: [
    [1, (p) => col("Sem telefone")(p).locator("button[aria-label^='Recolher']")],
    [2, (p) => card("Carlos Menezes")(p)],
    [3, (p) => card("Gustavo Pereira")(p).locator("p.text-red-500")],
    [4, (p) => p.locator('main button[title^="Não contatar"]')],
  ] },
  // ── Recuperação de carrinho ──
  { chave: "esteira-carrinho", papel: "colaborador", url: "/ecommerce/esteira?pipeline=carrinho", viewport: { width: 2500, height: 1000 }, marcas: [
    [1, (p) => p.locator("main").getByText("em perseguição", { exact: true }).locator("..").locator("..")],
    [2, (p) => p.locator("main").getByText(/1ª \d+ min após o abandono/)],
    [3, col("Abandonado")],
    [4, col("1ª mensagem")],
    [5, col("2ª mensagem")],
    [6, col("3ª mensagem")],
    [7, col("Respondeu")],
    [8, col("Recuperado")],
    [9, col("Perdido")],
    [10, (p) => p.locator('main button[title^="Sem telefone"]')],
  ] },
  { chave: "esteira-carrinho-card", papel: "colaborador", url: "/ecommerce/esteira?pipeline=carrinho", viewport: LARGO, pad: 10,
    clip: (p) => [col("Abandonado")(p), col("Respondeu")(p)], marcas: [
    [1, (p) => card("Paula Guedes")(p).getByText(/CarboZé 100ml/)],
    [2, (p) => card("Paula Guedes")(p).getByText(/Nuvemshop · há/)],
    [3, (p) => card("Paula Guedes")(p).locator("span.tabular-nums").filter({ hasText: /na fila|em / }).first()],
    [4, (p) => card("Paula Guedes")(p).getByText(/\(84\)/)],
    [5, (p) => card("Paula Guedes")(p).getByRole("link", { name: /abrir o carrinho/ })],
    [6, (p) => card("Lívia Carvalho")(p).getByText(/PayT · há/)],
    [7, (p) => card("Camila Rezende")(p).getByText(/respondeu há/)],
    [8, (p) => card("Camila Rezende")(p).getByRole("link", { name: /abrir conversa/ })],
  ] },
  // ── Mensagens ao cliente ──
  { chave: "mensagens", papel: "colaborador", url: "/ecommerce/mensagens", viewport: { width: 1440, height: 1100 }, marcas: [
    [1, (p) => p.getByRole("link", { name: /Voltar à Esteira/ })],
    [2, (p) => p.locator("main").getByText("ligadas", { exact: true }).locator("..")],
    [3, (p) => p.locator("main").getByText("na fila agora", { exact: true }).locator("..")],
    [4, (p) => p.locator("main div.flex.flex-wrap.items-center.gap-2").filter({ has: p.getByRole("button", { name: /Recompra/ }) }).first()],
    [5, (p) => p.locator("main").getByText(/^Sai pelo número/)],
    [6, (p) => p.locator("main h3").filter({ hasText: /^Confirmado/ }).first()],
  ] },
  { chave: "mensagens-editor", papel: "colaborador", url: "/ecommerce/mensagens", viewport: { width: 1440, height: 1100 },
    antes: async (p) => { await editor("Em trânsito")(p).evaluate((e) => e.scrollIntoView({ block: "center" })); },
    clip: (p) => editor("Em trânsito")(p), pad: 8, marcas: [
    [1, (p) => editor("Em trânsito")(p).locator("h3")],
    [2, (p) => editor("Em trânsito")(p).getByText(/^Dispara/)],
    [3, (p) => editor("Em trânsito")(p).getByRole("switch")],
    [4, (p) => editor("Em trânsito")(p).locator("div.border-sky-500\\/30")],
    [5, (p) => editor("Em trânsito")(p).locator("textarea")],
    [6, (p) => editor("Em trânsito")(p).locator("span.font-mono").filter({ hasText: "{{pedido}}" }).first()],
    [7, (p) => editor("Em trânsito")(p).getByText(/Botão/)],
    [8, (p) => editor("Em trânsito")(p).locator("div.bg-carbo-green\\/5")],
    [9, (p) => editor("Em trânsito")(p).getByRole("button", { name: /Salvar/ })],
  ] },
  { chave: "mensagens-envios", papel: "colaborador", url: "/ecommerce/mensagens", viewport: { width: 1440, height: 1100 },
    antes: async (p) => { await p.locator("main h3").filter({ hasText: "Últimos envios" }).evaluate((e) => e.scrollIntoView({ block: "start" })); },
    clip: (p) => p.locator("main h3").filter({ hasText: "Últimos envios" }).locator("xpath=ancestor::div[contains(@class,'rounded-')][1]"), pad: 8, marcas: [
    [1, (p) => p.locator("main h3").filter({ hasText: "Últimos envios" }).locator("xpath=ancestor::div[contains(@class,'rounded-')][1]").locator("div.border-b").first()],
  ] },
];
