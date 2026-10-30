// Prints da área "conversas" (ver shots.mjs): a tela /conversas.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const sel = (s) => (p) => p.locator(s);
const TELA = { width: 1440, height: 1000 };
const ALTA = { width: 1440, height: 1350 };
const LUANA = "5584991231007";
const RODRIGO = "558488123456";
const PATRICIA = "5584991231003";
const BEATRIZ = "5584991231009";
const GUSTAVO = "5584991231010";
const DEBORA = "5584998761234";
const CLUBE = "1274076859132981";

/** As três colunas: a lista (1ª), a conversa (2ª) e o painel do contato (3ª). */
const grade = (p) => p.locator("main div.grid.min-h-0.flex-1").first();
const coluna = (i) => (p) => grade(p).locator(":scope > div").nth(i);
const lista = coluna(0);
const conversa = coluna(1);
const painel = coluna(2);
/** Uma linha da lista pelo nome do cliente. */
const linha = (nome) => (p) => lista(p).locator("button").filter({ hasText: nome }).first();
const naConversa = (t) => (p) => conversa(p).getByText(t, { exact: false }).first();
const noPainel = (t) => (p) => painel(p).getByText(t, { exact: false }).first();
/** O balão (a caixa arredondada) que contém o texto. */
const balao = (t) => (p) => conversa(p).locator("div.rounded-lg").filter({ hasText: t }).last();

export const SHOTS = [
  // ── A tela inteira ──
  { chave: "conversas", papel: "colaborador", url: `/conversas?de=${LUANA}`, viewport: TELA, marcas: [
    [1, (p) => p.locator('button[aria-pressed]').filter({ hasText: "CarboZé Clube" }).locator("..")],
    [2, (p) => p.locator("main").getByText(/esperando resposta/).locator("..")],
    [3, btn(/recebem aviso|recebe aviso|Ninguém recebe aviso/)],
    [4, (p) => p.getByRole("link", { name: "Voltar" })],
    [5, lista],
    [6, conversa],
    [7, painel],
  ] },
  // ── A lista, de perto ──
  { chave: "conversas-lista", papel: "colaborador", url: `/conversas?de=${LUANA}`, viewport: ALTA, pad: 4,
    antes: async (p) => { await btn(/^Todas/)(p).click(); },
    clip: (p) => lista(p), marcas: [
    [1, sel('input[placeholder="Buscar por nome ou número…"]')],
    [2, btn(/^Não respondidas/)],
    [3, btn(/^Minhas/)],
    [4, btn(/^Sem responsável/)],
    [5, btn(/^Janela aberta/)],
    [6, btn(/^Todas/)],
    [7, btn(/^Filtros/)],
    [8, (p) => lista(p).getByText("Abertas — ninguém respondeu", { exact: true })],
    [9, (p) => linha("Luana Ribeiro")(p).locator("span.tabular-nums").first()],
    [10, (p) => linha("Patrícia Lopes")(p).locator("span.tabular-nums").first()],
    [11, (p) => linha("Gustavo Pereira")(p).locator('[aria-label="Janela de 24 h fechada"]')],
    [12, (p) => linha("Patrícia Lopes")(p).locator("p svg").first()],
    [13, (p) => linha("Rodrigo Alves")(p).getByText("Em atendimento", { exact: true })],
    [14, (p) => linha("Luana Ribeiro")(p).getByText("Prazo de entrega", { exact: true })],
    [15, (p) => linha("Luana Ribeiro")(p).getByText("sem dono", { exact: true })],
    [16, (p) => linha("Rodrigo Alves")(p).getByText("Rafael", { exact: true })],
    [17, (p) => linha("Luana Ribeiro")(p).locator("span.rounded-full.bg-amber-500")],
  ] },
  // ── Filtros abertos ──
  { chave: "conversas-filtros", papel: "colaborador", url: `/conversas?de=${LUANA}`, viewport: TELA, pad: 6,
    antes: async (p) => { await btn(/^Filtros/)(p).click(); },
    clip: (p) => lista(p).locator("div.shrink-0.border-b").first(), marcas: [
    [1, sel('select[aria-label="Responsável"]')],
    [2, sel('select[aria-label="Etiqueta"]')],
    [3, sel('select[aria-label="Etapa do aviso"]')],
    [4, sel('select[aria-label="Status"]')],
    [5, sel('select[aria-label="Ordenar"]')],
  ] },
  // ── A conversa aberta ──
  { chave: "conversa-aberta", papel: "colaborador", url: `/conversas?de=${LUANA}`, viewport: ALTA, pad: 4,
    clip: (p) => conversa(p), marcas: [
    [1, (p) => conversa(p).locator('button[title="Procurar nesta conversa"]')],
    [2, (p) => conversa(p).locator('button[title="Arquivos da conversa"]')],
    [3, (p) => conversa(p).getByRole("button", { name: /Marcar resolvida/ })],
    [4, (p) => conversa(p).getByText(/de janela/).locator("xpath=ancestor::div[contains(@class,'w-[9.5rem]')][1]")],
    [5, (p) => conversa(p).getByText(/^Ontem$|^Hoje$/).first()],
    [6, balao("a caminho! Previsão")],
    [7, (p) => conversa(p).getByText("Acompanhar pedido").locator("..").locator("..")],
    [8, balao("Recebi o aviso, obrigada")],
    [9, balao("Qualquer dúvida é só chamar")],
    [10, (p) => conversa(p).getByRole("button", { name: /Áudio/ })],
    [11, (p) => conversa(p).getByText("A Jadlog confirmou").locator("xpath=ancestor::div[contains(@class,'border-dashed')][1]")],
    [12, btn("Responder")],
    [13, btn("Recado interno")],
    [14, sel('textarea[placeholder="Responder…"]')],
    [15, btn("Respostas rápidas")],
    [16, sel('button[title="Enviar foto ou documento"]')],
    [17, sel('button[title="Gravar áudio"]')],
    [18, btn(/Agendar/)],
    [19, sel('button[title="Enviar — ⌘/Ctrl + Enter"]')],
  ] },
  // ── O painel do contato ──
  { chave: "conversa-painel", papel: "colaborador", url: `/conversas?de=${RODRIGO}`, viewport: TELA, pad: 4,
    clip: (p) => painel(p), marcas: [
    [1, (p) => painel(p).locator("p.text-\\[15px\\]").first()],
    [2, sel('button[aria-label="Copiar número"]')],
    [3, (p) => painel(p).getByText("Em atendimento", { exact: true })],
    [4, (p) => painel(p).getByRole("button", { name: /^Aguardando$/ })],
    [5, (p) => painel(p).getByRole("button", { name: /^Resolver$/ })],
    [6, noPainel("Você é o responsável")],
    [7, sel('button[aria-label="Passar para outra pessoa"]')],
    [8, (p) => painel(p).getByRole("button", { name: /Parar de enviar ofertas/ })],
    [9, (p) => painel(p).locator('button[title="Tirar esta etiqueta"]').first()],
    [10, (p) => painel(p).getByRole("button", { name: /\+ etiqueta/ })],
    [11, (p) => painel(p).locator("button").filter({ hasText: "#9004" })],
    [12, (p) => painel(p).getByText("Links de checkout").locator("..")],
  ] },
  // ── Agendar e mensagem agendada (Rodrigo, em atendimento) ──
  { chave: "conversa-agendar", papel: "colaborador", url: `/conversas?de=${RODRIGO}`, viewport: ALTA, pad: 4,
    antes: async (p) => {
      await sel('textarea[placeholder="Responder…"]')(p).fill("Rodrigo, consegui a troca! O kit de sachês sai amanhã.");
      await btn(/Agendar/)(p).click();
    },
    clip: (p) => conversa(p), marcas: [
    [1, (p) => conversa(p).getByText("toque para abrir").locator("xpath=ancestor::button[1]")],
    [2, (p) => conversa(p).getByText(/Agendada para/).locator("..")],
    [3, (p) => conversa(p).locator('input[type="datetime-local"]')],
    [4, btn(/Confirmar/)],
  ] },
  // ── Recado interno ──
  { chave: "conversa-recado", papel: "colaborador", url: `/conversas?de=${LUANA}`, viewport: TELA, pad: 6,
    antes: async (p) => {
      await btn("Recado interno")(p).click();
      await sel('textarea[placeholder="Recado para o time…"]')(p).fill("Cliente vai viajar no sábado — priorizar a resposta.");
    },
    clip: (p) => [btn("Responder")(p), conversa(p).locator("div.border-dashed.border-amber-500\\/40").last()], marcas: [
    [1, btn("Recado interno")],
    [2, sel('textarea[placeholder="Recado para o time…"]')],
    [3, (p) => conversa(p).getByText("não vai para o WhatsApp")],
    [4, btn(/^Anotar$/)],
  ] },
  // ── Barra de respostas rápidas (/) ──
  { chave: "conversa-barra", papel: "colaborador", url: `/conversas?de=${LUANA}`, viewport: TELA, pad: 6,
    antes: async (p) => { await sel('textarea[placeholder="Responder…"]')(p).fill("/p"); },
    clip: (p) => conversa(p).locator("div.rounded-lg.border.bg-muted\\/40.p-2").last(), marcas: [
    [1, sel('textarea[placeholder="Responder…"]')],
    [2, (p) => conversa(p).locator("button[data-i='0']")],
  ] },
  { chave: "respostas-rapidas", papel: "colaborador", url: `/conversas?de=${LUANA}`, viewport: { width: 1920, height: 1100 }, pad: 6,
    antes: async (p) => {
      await btn("Respostas rápidas")(p).click(); await btn(/^Nova$/)(p).click();
      await sel('input[placeholder="frete"]')(p).fill("endereco");
      await sel('textarea[placeholder^="Me manda o CEP"]')(p).fill("Consigo mudar o endereço enquanto o pedido não sai. Me manda o novo CEP e o número, por favor.");
    },
    clip: (p) => conversa(p).locator("div.absolute.bottom-10"), marcas: [
    [1, btn(/^Cancelar$/)],
    [2, sel('input[placeholder="frete"]')],
    [3, (p) => conversa(p).locator('textarea[placeholder^="Me manda o CEP"]')],
    [4, btn(/^Salvar$/)],
    [5, (p) => conversa(p).locator("div.absolute.bottom-10 div.group").first()],
  ] },
  // ── Sinais da conversa: agradecimento + janela fechando ──
  { chave: "conversa-sinais", papel: "colaborador", url: `/conversas?de=${PATRICIA}`, viewport: TELA, pad: 4,
    clip: (p) => conversa(p), marcas: [
    [1, (p) => conversa(p).getByText(/de janela/).locator("xpath=ancestor::div[contains(@class,'w-[9.5rem]')][1]")],
    [2, naConversa("parece só um agradecimento")],
    [3, (p) => conversa(p).getByRole("button", { name: /^Resolver$/ })],
  ] },
  // ── Reaberta + vínculo provável ──
  { chave: "conversa-reaberta", papel: "colaborador", url: `/conversas?de=${BEATRIZ}`, viewport: TELA, pad: 4,
    clip: (p) => conversa(p), marcas: [
    [1, (p) => conversa(p).getByText(/Reaberta — o cliente escreveu/)],
    [2, (p) => conversa(p).getByRole("button", { name: /vínculo provável/ })],
  ] },
  // ── Janela fechada ──
  { chave: "conversa-fechada", papel: "colaborador", url: `/conversas?de=${GUSTAVO}`, viewport: TELA, pad: 4,
    clip: (p) => conversa(p), marcas: [
    [1, (p) => conversa(p).getByText("janela fechada", { exact: true })],
    [2, (p) => conversa(p).getByRole("button", { name: /Reabrir/ })],
    [3, (p) => conversa(p).getByText(/Janela de 24 h fechada/).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")],
  ] },
  // ── Não contatar (confirmação) ──
  { chave: "nao-contatar", papel: "colaborador", url: `/conversas?numero=${CLUBE}&de=5582998761212`, viewport: TELA, pad: 6,
    antes: async (p) => { await painel(p).getByRole("button", { name: /Parar de enviar ofertas/ }).click(); },
    clip: (p) => painel(p).locator("div.space-y-2\\.5").first(), marcas: [
    [1, (p) => painel(p).getByText(/deixa de receber oferta/)],
    [2, (p) => painel(p).getByRole("button", { name: /^Parar ofertas$/ })],
  ] },
  // ── A caixa do Clube, com quem já não recebe ofertas ──
  { chave: "conversas-clube", papel: "colaborador", url: `/conversas?numero=${CLUBE}&de=${DEBORA}`, viewport: TELA,
    antes: async (p) => { await btn(/^Todas/)(p).click(); },
    marcas: [
    [1, (p) => p.locator('button[aria-pressed="true"]')],
    [2, linha("Débora Freire")],
    [3, (p) => conversa(p).getByText(/automático · Hora de repor/).first()],
    [4, noPainel("Não recebe ofertas desde")],
    [5, (p) => painel(p).getByRole("button", { name: /Voltar a enviar/ })],
  ] },
  // ── Quem recebe o aviso ──
  { chave: "quem-recebe", papel: "colaborador", url: `/conversas?de=${LUANA}`, viewport: TELA, pad: 6,
    antes: async (p) => { await btn(/recebem aviso/)(p).click(); },
    clip: (p) => p.locator("main").getByText("Quem recebe o aviso").locator("xpath=ancestor::div[contains(@class,'rounded')][last()]"), marcas: [
    [1, (p) => p.locator('input[placeholder="Buscar pessoa…"]')],
    [2, (p) => p.locator("main").getByRole("button", { name: /Marina Alves/ }).first()],
    [3, (p) => p.locator("main").getByRole("button", { name: /Ana Souza/ }).first()],
    [4, btn(/^Fechar$/)],
  ] },
];
