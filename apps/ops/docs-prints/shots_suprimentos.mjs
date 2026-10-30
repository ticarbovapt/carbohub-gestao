// Prints da área "suprimentos" (ver shots.mjs): /suprimentos, /suprimentos/vendedores e /compras.
const btn = (t) => (p) => p.getByRole("button", { name: t });
const txt = (t) => (p) => p.getByText(t, { exact: false });
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();
const dtxt = (t) => (p) => dlg(p).getByText(t, { exact: false });
// Card de produto da grade de estoque.
const cardProd = (nome) => (p) => p.locator("main h3", { hasText: nome }).first().locator("xpath=ancestor::div[contains(@class,'rounded')][last()]");
// Card de transferência (Envios / Recebimento).
const cardTr = (t) => (p) => p.locator("main div.py-4").filter({ hasText: t }).first();
// Uma caixa de vendedor.
const caixa = (nome) => (p) => p.locator("main div.p-3").filter({ has: p.locator("p", { hasText: new RegExp("^" + nome + "$") }) }).first();
const ALTO = { width: 1440, height: 1500 };
const SUP = "/suprimentos";

export const SHOTS = [
  // ── Suprimentos: estoque do hub ──
  { chave: "sup-estoque", papel: "colaborador", url: `${SUP}/hub-natal/estoque`, viewport: { width: 1440, height: 1250 },
    clip: (p) => [p.locator("main h1").first(), btn(/Hub Natal/)(p).locator(".."), cardProd("CarboZé 1 Litro")(p)], marcas: [
    [1, (p) => btn(/Hub Natal/)(p).locator("..")],
    [2, btn(/Registrar Envio/)],
    [3, (p) => p.getByText("Período:", { exact: true }).locator("..")],
    [4, (p) => p.getByText("Total Produtos").locator("xpath=ancestor::div[contains(@class,'grid')][1]")],
    [5, sel('[role="tablist"]')],
    [6, sel('input[placeholder="Buscar produto..."]')],
    [7, (p) => p.locator("main button[role=combobox]").nth(1)],
    [8, btn(/Só em baixa/)],
    [9, btn(/Nova Entrada/)],
    [10, (p) => p.getByRole("button", { name: "Expandir tudo" }).locator("..")],
    [11, (p) => p.locator("main button").filter({ hasText: "Produto Final" }).first()],
    [12, cardProd("CarboZé 1 Litro")],
    [13, (p) => cardProd("CarboZé 1 Litro")(p).locator("button").first()],
  ] },
  { chave: "sup-sp-alerta", papel: "colaborador", url: `${SUP}/cd-sp-loghouse/estoque`,
    clip: (p) => p.getByText(/abaixo do nível de segurança/).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]"), marcas: [
    [1, (p) => p.getByText(/abaixo do nível de segurança/).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")],
  ] },
  { chave: "sup-ajuste", papel: "colaborador", url: `${SUP}/hub-natal/estoque`,
    antes: async (p) => { await cardProd("CarboZé 1 Litro")(p).locator("button").first().click(); await p.waitForTimeout(500); await dlg(p).locator('input[type="number"]').fill("192"); await dlg(p).locator("textarea").fill("Contagem física de sexta"); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("Quantidade atual").locator("..")],
    [2, (p) => dlg(p).getByText("Nova quantidade").locator("..")],
    [3, (p) => dlg(p).locator("textarea")],
    [4, (p) => dlg(p).getByRole("button", { name: "Salvar Ajuste" })],
  ] },
  { chave: "sup-entrada", papel: "colaborador", url: `${SUP}/hub-natal/estoque`,
    antes: async (p) => { await btn(/Nova Entrada/)(p).click(); await p.waitForTimeout(500); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("Produto", { exact: true }).locator("..")],
    [2, (p) => dlg(p).getByText("Quantidade", { exact: true }).locator("..")],
    [3, (p) => dlg(p).getByText("Tipo", { exact: true }).locator("..")],
    [4, (p) => dlg(p).locator("textarea")],
    [5, dtxt("Destino:")],
    [6, (p) => dlg(p).getByRole("button", { name: "Registrar Entrada" })],
  ] },

  // ── Movimentações ──
  { chave: "sup-movimentacoes", papel: "colaborador", url: `${SUP}/cd-sp-loghouse/movimentacoes`, viewport: { width: 1440, height: 1100 },
    clip: (p) => [p.locator('[role="tablist"]').first(), p.locator("main table").first()], marcas: [
    [1, sel('input[placeholder="Filtrar por produto ou código…"]')],
    [2, (p) => p.locator("main button[role=combobox]").filter({ hasText: /Entradas e saídas/ })],
    [3, txt("movimentações ·")],
    [4, (p) => p.locator("main tbody tr").first().locator("td").nth(2)],
    [5, (p) => p.locator("main tbody tr").first().locator("td").nth(4)],
    [6, (p) => p.locator("main tbody tr").first().locator("td").nth(5)],
    [7, (p) => p.locator("main tbody a").first()],
    [8, (p) => p.locator("main tbody tr").nth(1).locator("td").nth(6)],
    [9, (p) => p.locator("main tbody tr").filter({ hasText: "V2026100031" }).locator("td").nth(6)],
  ] },

  // ── Envio entre estoques ──
  { chave: "sup-envio", papel: "colaborador", url: `${SUP}/hub-natal/estoque`,
    antes: async (p) => {
      await btn(/Registrar Envio/)(p).click(); await p.waitForTimeout(600);
      const combos = dlg(p).getByRole("combobox");
      await combos.nth(1).click(); await p.getByRole("option", { name: "CD SP LogHouse" }).click();
      await combos.nth(2).click(); await p.getByRole("option", { name: /^CarboZé 100ml \(/ }).click();
      await dlg(p).locator('input[type="number"]').fill("600");
      await dlg(p).locator('input[placeholder="NF, remessa..."]').fill("NF 001245");
    },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("Origem", { exact: true }).locator("..")],
    [2, (p) => dlg(p).getByText("Destino", { exact: true }).locator("..")],
    [3, (p) => dlg(p).getByText("Produto", { exact: true }).locator("..")],
    [4, (p) => dlg(p).getByText("Quantidade", { exact: true }).locator("..")],
    [5, (p) => dlg(p).locator('input[placeholder="NF, remessa..."]')],
    [6, (p) => dlg(p).getByRole("button", { name: /Adicionar outro envio/ })],
    [7, (p) => dlg(p).getByRole("button", { name: /Registrar Envio/ })],
  ] },
  { chave: "sup-envio-destinos", papel: "colaborador", url: `${SUP}/hub-natal/estoque`, viewport: { width: 1440, height: 1100 },
    antes: async (p) => {
      await btn(/Registrar Envio/)(p).click(); await p.waitForTimeout(600);
      await dlg(p).getByRole("combobox").nth(1).click(); await p.waitForTimeout(500);
    },
    clip: (p) => [p.locator('[role="listbox"]'), dlg(p).getByText("Destino", { exact: true })], marcas: [
    [1, (p) => p.locator('[role="listbox"] [role="group"]').nth(0)],
    [2, (p) => p.locator('[role="listbox"] [role="group"]').nth(1)],
    [3, (p) => p.locator('[role="listbox"] [role="group"]').nth(2)],
  ] },
  { chave: "sup-envios", papel: "colaborador", url: `${SUP}/hub-natal/envios`, viewport: ALTO,
    clip: (p) => [p.locator('[role="tablist"]').first(), cardTr("Não saiu")(p)], marcas: [
    [1, txt("estornados")],
    [2, (p) => cardTr("CD SP Vendas")(p).getByText("para", { exact: false }).first()],
    [3, (p) => cardTr("Aceito em")(p).getByText("Aceito", { exact: false }).first()],
    [4, (p) => cardTr("Não saiu")(p).getByText("Estornado", { exact: true })],
  ] },
  { chave: "sup-recebimento", papel: "colaborador", url: `${SUP}/cd-sp-loghouse/recebimento`, viewport: ALTO,
    clip: (p) => [p.locator('[role="tablist"]').first(), cardTr("Aceito em")(p)], marcas: [
    [1, txt("aguardando aceite")],
    [2, (p) => cardTr("NF 001245")(p).getByText("de ", { exact: false }).first()],
    [3, (p) => cardTr("NF 001245")(p).getByRole("button", { name: /Aceitar recebimento/ })],
    [4, (p) => cardTr("NF 001245")(p).getByRole("button", { name: /Estornar/ })],
    [5, (p) => cardTr("Aceito em")(p).getByText("Aceito", { exact: false }).first()],
  ] },
  { chave: "sup-aceite", papel: "colaborador", url: `${SUP}/cd-sp-loghouse/recebimento`,
    antes: async (p) => { await cardTr("NF 001245")(p).getByRole("button", { name: /Aceitar recebimento/ }).click(); await p.waitForTimeout(500); },
    clip: (p) => p.locator('[role="alertdialog"]').last(), marcas: [
    [1, (p) => p.locator('[role="alertdialog"]').last().getByRole("button", { name: "Cancelar" })],
    [2, (p) => p.locator('[role="alertdialog"]').last().getByRole("button", { name: /Confirmar/ })],
  ] },

  // ── Mapeamento SKU ──
  { chave: "sup-mapa", papel: "colaborador", url: `${SUP}/cd-sp-loghouse/mapeamento`, viewport: ALTO,
    clip: (p) => [p.getByRole("tab", { name: /Mapeamentos/ }), btn(/Novo mapeamento/)(p), p.locator("main code", { hasText: "CZ1L-KIT2" }).locator("xpath=ancestor::div[contains(@class,'py-3')][1]")], marcas: [
    [1, (p) => p.getByRole("tab", { name: /Mapeamentos/ })],
    [2, (p) => p.getByRole("tab", { name: /sem mapa/ })],
    [3, btn(/Novo mapeamento/)],
    [4, (p) => p.locator("main code", { hasText: /^124$/ }).locator("..")],
    [5, (p) => p.getByText("Cliente recebe").first().locator("..")],
    [6, (p) => p.getByText("Estoque baixa").first().locator("..")],
    [7, (p) => p.locator('main button[title="Desativar"]').first()],
    [8, (p) => p.locator("main code", { hasText: /^124$/ }).locator("xpath=ancestor::div[contains(@class,'py-3')][1]").locator("button").nth(1)],
    [9, (p) => p.locator("main code", { hasText: /^124$/ }).locator("xpath=ancestor::div[contains(@class,'py-3')][1]").locator("button").nth(2)],
    [10, txt("não informado")],
  ] },
  { chave: "sup-sem-mapa", papel: "colaborador", url: `${SUP}/cd-sp-loghouse/mapeamento`,
    antes: async (p) => { await p.getByRole("tab", { name: /sem mapa/ }).click(); await p.waitForTimeout(500); },
    clip: (p) => [p.getByRole("tab", { name: /sem mapa/ }), p.locator("main div.divide-y").last()], marcas: [
    [1, (p) => p.locator("main div.divide-y").last().locator("> div").filter({ hasText: "B0CZSACH20" }).locator("code")],
    [2, (p) => p.locator("main div.divide-y").last().locator("> div").filter({ hasText: "B0CZSACH20" }).getByText("vendidos", { exact: false })],
    [3, (p) => p.locator("main div.divide-y").last().locator("> div").filter({ hasText: "B0CZSACH20" }).getByRole("button", { name: /Mapear/ })],
    [4, txt("sem SKU na origem")],
  ] },
  { chave: "sup-mapa-form", papel: "colaborador", url: `${SUP}/cd-sp-loghouse/mapeamento`, viewport: { width: 1440, height: 1100 },
    antes: async (p) => {
      await btn(/Novo mapeamento/)(p).click(); await p.waitForTimeout(500);
      await dlg(p).locator("input").first().fill("CZ100-KIT10");
      await dlg(p).getByRole("combobox").nth(1).click(); await p.getByRole("option", { name: /CZ100 · / }).click();
      const n = dlg(p).locator('input[type="number"]');
      await n.nth(0).fill("10"); await n.nth(1).fill("10");
    },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("SKU da plataforma").locator("..")],
    [2, (p) => dlg(p).getByText("Plataforma", { exact: true }).locator("..")],
    [3, (p) => dlg(p).getByText("Produto de onde a unidade sai").locator("..")],
    [4, (p) => dlg(p).getByText("Cliente recebe, por venda").locator("..")],
    [5, (p) => dlg(p).getByText("Estoque baixa, por venda").locator("..")],
    [6, (p) => dlg(p).getByRole("button", { name: "Salvar" })],
  ] },

  // ── Política e ML Full ──
  { chave: "sup-politica", papel: "colaborador", url: `${SUP}/hub-natal/politica`,
    clip: (p) => [p.locator('[role="tablist"]').first(), p.locator("main").getByRole("button", { name: "Configurar" }).nth(1)], marcas: [
    [1, sel('input[placeholder="Buscar produto por nome ou código..."]')],
    [2, (p) => p.getByText("Mínimo", { exact: true }).first().locator("..")],
    [3, (p) => p.locator("main").getByRole("button", { name: "Configurar" }).first()],
  ] },
  { chave: "sup-mlfull", papel: "colaborador", url: `${SUP}/ml-full/estoque`, viewport: { width: 1440, height: 1100 },
    clip: (p) => [btn(/Hub Natal/)(p), p.getByText("Em trânsito para o Full").locator("xpath=ancestor::div[contains(@class,'rounded')][last()]")], marcas: [
    [1, btn(/ML Full/)],
    [2, txt("Espelho do ML ·")],
    [3, btn(/Atualizar/)],
    [4, (p) => p.locator("main thead th").nth(1)],
    [5, (p) => p.locator("main thead th").nth(2)],
    [6, (p) => p.locator("main tbody tr").first().getByRole("button", { name: /Remessa/ })],
    [7, txt("sem mapa de SKU · remessa indisponível")],
    [8, (p) => p.getByText("Em trânsito para o Full").locator("xpath=ancestor::div[contains(@class,'rounded')][last()]")],
    [9, btn(/Chegou/)],
    [10, (p) => p.getByRole("button", { name: /Cancelar/ }).last()],
  ] },

  // ── Estoque dos Vendedores ──
  { chave: "vend-caixas", papel: "colaborador", url: `${SUP}/vendedores`, viewport: ALTO,
    antes: async (p) => { await caixa("Ana Souza")(p).locator("button").first().click(); await p.waitForTimeout(400); },
    clip: (p) => p.locator("main div.max-w-\\[1200px\\]").first(), marcas: [
    [1, btn(/Só o que tem saldo|Mostrando tudo/)],
    [2, (p) => p.locator("main h2", { hasText: "A caminho" }).locator("xpath=ancestor::div[contains(@class,'p-4')][1]")],
    [3, btn(/^Chegou$/)],
    [4, (p) => p.locator("main h2", { hasText: "Voltando" }).locator("xpath=ancestor::div[contains(@class,'p-4')][1]")],
    [5, btn(/^Recebi$/)],
    [6, (p) => p.getByText("Vendedores com caixa").locator("xpath=ancestor::div[contains(@class,'grid')][1]")],
    [7, (p) => caixa("Ana Souza")(p).locator("button").first()],
    [8, (p) => caixa("Ana Souza")(p).getByRole("button", { name: /Devolver/ })],
    [9, (p) => caixa("Ana Souza")(p).getByRole("button", { name: /Enviar/ })],
    [10, (p) => caixa("Ana Souza")(p).locator('button[title^="Mínimo"]').first()],
    [11, (p) => caixa("Ana Souza")(p).locator('button[title="Corrigir saldo"]').first()],
    [12, txt("não vende a pronta entrega")],
  ] },
  { chave: "vend-enviar", papel: "colaborador", url: `${SUP}/vendedores`,
    antes: async (p) => {
      await caixa("Ana Souza")(p).getByRole("button", { name: /Enviar/ }).click(); await p.waitForTimeout(500);
      await dlg(p).getByRole("combobox").first().click(); await p.getByRole("option", { name: /CarboZé 100ml/ }).click();
      await dlg(p).locator('input[type="number"]').fill("24");
      await dlg(p).locator("textarea").fill("Reposição da semana");
    },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("Produto", { exact: true }).locator("..")],
    [2, (p) => dlg(p).getByText("Quantidade", { exact: true }).locator("..")],
    [3, (p) => dlg(p).locator("textarea")],
    [4, (p) => dlg(p).getByRole("button", { name: "Enviar" })],
  ] },
  { chave: "vend-ajuste", papel: "colaborador", url: `${SUP}/vendedores`,
    antes: async (p) => {
      await caixa("Ana Souza")(p).locator("button").first().click(); await p.waitForTimeout(400);
      await caixa("Ana Souza")(p).locator('button[title="Corrigir saldo"]').first().click(); await p.waitForTimeout(500);
      await dlg(p).locator('input[type="number"]').fill("10");
    },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).locator("div.rounded-lg.border").first()],
    [2, (p) => dlg(p).getByText("Quantidade contada").locator("..")],
    [3, (p) => dlg(p).getByText("Motivo", { exact: true }).locator("..")],
    [4, (p) => dlg(p).getByRole("button", { name: "Corrigir" })],
  ] },
  { chave: "vend-devolver", papel: "colaborador", url: `${SUP}/vendedores`,
    antes: async (p) => {
      await caixa("Bruno Lima")(p).getByRole("button", { name: /Devolver/ }).click(); await p.waitForTimeout(500);
      await dlg(p).getByRole("combobox").first().click(); await p.getByRole("option", { name: /CarboZé 1 Litro/ }).click();
      await dlg(p).locator('input[type="number"]').fill("4");
      await dlg(p).locator("textarea").fill("Sobra da rota de Caruaru");
    },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).getByText("Produto", { exact: true }).locator("..")],
    [2, (p) => dlg(p).getByText("Para onde vai").locator("..")],
    [3, (p) => dlg(p).getByText("Quantidade", { exact: true }).locator("..")],
    [4, (p) => dlg(p).locator("textarea")],
    [5, (p) => dlg(p).getByRole("button", { name: "Devolver" })],
  ] },

  // ── Requisição de Compra ──
  { chave: "compras-nova", papel: "colaborador", url: "/requisicoes", viewport: { width: 1440, height: 1500 }, espera: 900,
    antes: async (p) => {
      const card = p.locator("main").getByText("Nova Requisição").locator("xpath=ancestor::div[contains(@class,'rounded')][last()]");
      await card.getByRole("combobox").nth(1).click(); await p.getByRole("option", { name: /Reposição — estoque de segurança/ }).click();
      await card.getByRole("combobox").nth(2).click(); await p.getByRole("option", { name: "Produção", exact: true }).click();
      await p.locator('input[placeholder="O que comprar"]').fill("Frasco PET 100ml com tampa");
      const n = card.locator('input[type="number"]');
      await n.nth(0).fill("5000"); await n.nth(1).fill("0.62");
      await p.locator("main h1").first().click();
      await p.evaluate(() => document.querySelectorAll("main, main *").forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }));
      await p.waitForTimeout(300);
    },
    clip: (p) => [p.locator("main h1").first(), p.getByRole("button", { name: "Enviar para aprovação" })], marcas: [
    [1, (p) => p.getByText("Solicitante", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]")],
    [2, (p) => p.getByRole("button", { name: /Compra do setor/ })],
    [3, (p) => p.getByRole("button", { name: /Compra individual/ })],
    [4, (p) => p.getByText("Motivo da requisição *").locator("..")],
    [5, (p) => p.getByText("Prioridade", { exact: true }).locator("..")],
    [6, (p) => p.getByText("Centro de Custo *").locator("..")],
    [7, (p) => p.getByText("Precisa até (opcional)").locator("..")],
    [8, btn("Adicionar item")],
    [9, (p) => p.locator('input[placeholder="O que comprar"]').locator("../..")],
    [10, txt("Valor estimado:")],
    [11, btn(/Cotações/)],
    [12, (p) => p.getByText("Observações (opcional)").locator("..")],
    [13, btn("Limpar")],
    [14, btn("Salvar rascunho")],
    [15, btn("Enviar para aprovação")],
  ] },
  { chave: "compras-em-nome", papel: "colaborador", url: "/requisicoes", espera: 900,
    antes: async (p) => {
      await p.getByRole("combobox").first().click(); await p.getByRole("option", { name: "Ana Souza" }).click(); await p.waitForTimeout(300);
    },
    clip: (p) => p.getByText("Abrindo RC em nome de").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]"), marcas: [
    [1, (p) => p.getByRole("combobox").first()],
    [2, txt("A RC sai como")],
  ] },
  { chave: "compras-individual", papel: "colaborador", url: "/requisicoes", espera: 900,
    antes: async (p) => { await p.getByRole("button", { name: /Compra individual/ }).click(); await p.waitForTimeout(300); },
    clip: (p) => [p.getByRole("button", { name: /Compra do setor/ }), p.locator('input[placeholder="Link do produto"]')], marcas: [
    [1, (p) => p.getByText("Categoria *").locator("..")],
    [2, sel('input[placeholder="Link do produto"]')],
  ] },
  { chave: "compras-lista", papel: "colaborador", url: "/requisicoes", viewport: { width: 1440, height: 2000 }, espera: 900,
    clip: (p) => p.getByText("Requisições que eu abri").locator("xpath=ancestor::div[contains(@class,'rounded')][last()]"), marcas: [
    [1, (p) => p.locator("main table thead th").nth(0)],
    [2, (p) => p.locator("main table thead th").nth(1)],
    [3, (p) => p.locator("main table tbody tr").nth(2).locator("td").nth(1)],
    [4, (p) => p.locator("main table tbody tr").first().locator("td").nth(4)],
    [5, (p) => p.locator("main table").locator("xpath=following::*[contains(.,'Mostrando') or contains(.,'por página')][1]")],
  ] },
];
