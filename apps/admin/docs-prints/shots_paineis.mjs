// Prints da área "paineis" (ver shots.mjs): Mapa da Conquista, Portal de
// Vendas, Licenciados, Metas (Placar), Suprimentos e Configurar Metas.
// O número de cada marcador é o MESMO `n` do item em src/docs/secoes/paineis.ts.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const btn = (t) => (p) => p.getByRole("button", { name: t });
const txt = (t) => (p) => p.getByText(t, { exact: false }).first();
const sel = (s) => (p) => p.locator(s);
const dlg = (p) => p.locator('[role="dialog"]').last();
const cartao = (t) => (p) => p.locator("main div.rounded-2xl, main div.rounded-xl, main div.rounded-lg").filter({ has: p.getByText(t, { exact: true }) }).last();
const ALTO = (h) => ({ width: 1440, height: h });

// ── O IBGE falso do Mapa ────────────────────────────────────────────────────
// A tela busca a lista de municípios e o desenho dos estados no IBGE (fora do
// harness). Aqui o desenho vem do brazil-states.geojson do repo e a lista é
// montada com o número real de municípios por UF; os nomes das cidades
// acesas são os mesmos do fx_paineis.ts (o resto é preenchimento).
const QTD_UF = { AC: 22, AL: 102, AP: 16, AM: 62, BA: 417, CE: 184, DF: 1, ES: 78, GO: 246, MA: 217, MT: 141, MS: 79, MG: 853, PA: 144, PB: 223, PR: 399, PE: 185, PI: 224, RJ: 92, RN: 167, RS: 497, RO: 52, RR: 15, SC: 295, SP: 645, SE: 75, TO: 139 };
const ACESAS = {
  RN: ["Natal", "Parnamirim", "Mossoró", "São Gonçalo do Amarante", "Macaíba", "Caicó"],
  PE: ["Recife", "Jaboatão dos Guararapes", "Olinda", "Caruaru", "Ipojuca", "Petrolina"],
  PB: ["João Pessoa", "Campina Grande", "Santa Rita"], CE: ["Fortaleza", "Caucaia", "Juazeiro do Norte"],
  BA: ["Salvador", "Feira de Santana"], SP: ["São Paulo", "Campinas", "Barueri", "Santos"],
  AL: ["Maceió"], SE: ["Aracaju"], MG: ["Belo Horizonte"], PR: ["Curitiba"], GO: ["Goiânia"],
};
const geo = JSON.parse(fs.readFileSync(path.join(AQUI, "../../../public/data/brazil-states.geojson"), "utf8"));
const CODIGO = Object.fromEntries(geo.features.map((f) => [f.properties.sigla, f.properties.codigo_ibg]));
const MALHA_BR = JSON.stringify({ type: "FeatureCollection", features: geo.features.map((f) => ({ type: "Feature", geometry: f.geometry, properties: { codarea: String(f.properties.codigo_ibg) } })) });
const MUNICIPIOS = JSON.stringify(Object.entries(QTD_UF).flatMap(([uf, n]) => {
  const nomes = ACESAS[uf] ?? [];
  return Array.from({ length: n }, (_, i) => ({
    id: Number(CODIGO[uf]) * 100000 + i + 1,
    nome: nomes[i] ?? `Município ${i + 1} (${uf})`,
    microrregiao: { mesorregiao: { UF: { sigla: uf } } },
  }));
}));
const ibge = async (p) => {
  await p.route(/servicodados\.ibge\.gov\.br/, (r) => {
    const u = r.request().url();
    if (u.includes("/localidades/municipios")) return r.fulfill({ status: 200, contentType: "application/json", body: MUNICIPIOS });
    if (u.includes("/malhas/paises/BR") && u.includes("intrarregiao=UF")) return r.fulfill({ status: 200, contentType: "application/json", body: MALHA_BR });
    return r.fulfill({ status: 404, body: "{}" });
  });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);
};
const placar = (t) => (p) => p.locator("main div.rounded-lg, main div.rounded-xl").filter({ has: p.locator("div.text-xs", { hasText: t }) }).last();

export const SHOTS = [
  // ── Mapa da Conquista ──
  { chave: "mapa-conquista", papel: "gestor", url: "/mapa-da-conquista", antes: ibge, espera: 1200, marcas: [
    [1, placar("Cidades")],
    [2, placar("Estados")],
    [3, placar("Novas")],
    [4, placar("Pedidos")],
    [5, placar("Faturamento")],
    [6, (p) => btn("Toda presença")(p).locator("..")],
    [7, btn("Tela cheia")],
    [8, (p) => p.locator("main button[role=combobox]").first()],
    [9, (p) => btn("Por estado")(p).locator("..")],
    [10, sel("main .leaflet-container")],
    [11, (p) => p.getByText("Ainda não", { exact: true }).locator("xpath=ancestor::div[contains(@class,'absolute')][1]")],
    [12, (p) => p.locator("main div.rounded-lg, main div.rounded-xl").filter({ has: p.getByText(/Conquistas ·/) }).last()],
    [13, (p) => p.locator("main div.rounded-lg, main div.rounded-xl").filter({ has: p.getByText("Cidades por estado", { exact: true }) }).last()],
  ] },
  { chave: "mapa-nao-localizadas", papel: "gestor", url: "/mapa-da-conquista", viewport: ALTO(1300), antes: ibge,
    clip: (p) => p.locator("main div.rounded-lg, main div.rounded-xl").filter({ has: p.getByText(/não localizada/) }).last(), marcas: [
    [1, txt("não localizada(s) na lista do IBGE")],
    [2, (p) => p.locator("main div.rounded-lg, main div.rounded-xl").filter({ has: p.getByText(/não localizada/) }).last().locator("div.flex-wrap")],
  ] },

  // ── Portal de Vendas ──
  { chave: "painel-lojas", papel: "gestor", url: "/portal-de-vendas", viewport: ALTO(1100), marcas: [
    [1, (p) => p.getByRole("button", { name: /7 dias/ }).locator("..")],
    [2, cartao("Receita")],
    [3, cartao("Vendas")],
    [4, cartao("Unidades vendidas")],
    [5, cartao("Lojas ativas")],
    [6, cartao("Total de lojas")],
    [7, cartao("Estoque")],
    [8, cartao("Ticket médio")],
    [9, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Total Faturado no Período" }).last()],
    [10, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Unidades Vendidas no Período" }).last()],
  ] },
  { chave: "painel-lojas-colab", papel: "colaborador", url: "/portal-de-vendas", viewport: ALTO(600), marcas: [
    [1, txt("Sem dados do Portal de Vendas")],
  ] },

  // ── Licenciados ──
  { chave: "painel-licenciados", papel: "gestor", url: "/licenciados", viewport: ALTO(1500), marcas: [
    [1, (p) => p.getByRole("button", { name: /7 dias/ }).locator("..")],
    [2, cartao("Receita no período")],
    [3, cartao("Serviços no período")],
    [4, cartao("Ticket médio")],
    [5, (p) => p.locator("main div.rounded-xl").filter({ has: p.getByText("Lojas ativas", { exact: true }) }).first()],
    [6, (p) => btn("Serviços")(p).locator("..")],
    [7, (p) => btn("Mês")(p).locator("..")],
    [8, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Top Licenciados" }).last()],
    [9, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Serviços por Categoria" }).last()],
    [10, (p) => p.locator("main div.rounded-2xl").filter({ has: p.getByRole("heading", { name: "Últimos serviços" }) }).last()],
  ] },
  { chave: "painel-licenciados-lojas", papel: "gestor", url: "/licenciados", viewport: ALTO(2500),
    antes: async (p) => { await btn(/Mostrar mais/)(p).click(); await p.waitForTimeout(500); },
    clip: (p) => p.locator("main div.rounded-2xl").filter({ has: p.getByRole("heading", { name: "Lojas ativas" }) }).last(), marcas: [
    [1, (p) => p.locator("main div.rounded-2xl").filter({ has: p.getByRole("heading", { name: "Lojas ativas" }) }).last().locator("span.text-xs").first()],
    [2, (p) => p.getByText("sem registro", { exact: true }).first()],
    [3, (p) => p.getByRole("button", { name: "Recolher", exact: true })],
  ] },

  // ── Metas (Placar) ──
  { chave: "placar-metas", papel: "gestor", url: "/placar-de-metas", viewport: ALTO(1400), marcas: [
    [1, (p) => btn("Mensal")(p).locator("..")],
    [2, (p) => p.locator("main span.capitalize").first().locator("..")],
    [3, txt("Esperado hoje")],
    [4, (p) => p.locator("main div.rounded-xl, main div.rounded-lg").filter({ has: p.getByText("Total do Time", { exact: true }) }).last()],
    [5, (p) => p.getByText("precisa/dia").locator("..")],
    [6, txt("Projeção do time")],
    [7, (p) => p.locator("main div.rounded-xl, main div.rounded-lg").filter({ has: p.getByText("Top 3 do Mês", { exact: true }) }).last()],
    [8, (p) => p.locator("main div.border-l-2").first()],
    [9, (p) => p.locator("main div.border-l-2").filter({ hasText: "Rafael Costa" }).getByText(/Faltam/).locator("..")],
    [10, (p) => p.locator("main div.border-l-2").filter({ hasText: "Rafael Costa" }).getByText(/vs mês ant/)],
  ] },
  { chave: "placar-semanal", papel: "gestor", url: "/placar-de-metas", viewport: ALTO(900),
    antes: async (p) => { await btn("Semanal")(p).click(); await p.waitForTimeout(800); }, marcas: [
    [1, (p) => btn("Semanal")(p).locator("..")],
    [2, (p) => p.locator("main span.w-40").first().locator("..")],
    [3, txt("Top 3 da Semana")],
    [4, txt("Desempenho da Semana")],
  ] },

  // ── Suprimentos ──
  { chave: "suprimentos-topo", papel: "gestor", url: "/suprimentos", viewport: ALTO(1500), espera: 1500,
    clip: (p) => [p.locator("main div.space-y-6 > *").first(), p.locator("main div.rounded-2xl").filter({ hasText: "Excesso de Estoque" }).last()], marcas: [
    [1, (p) => p.locator("main div.border-l-4").filter({ hasText: "Capital em estoque" })],
    [2, (p) => p.locator("main div.border-l-4").filter({ hasText: "Giro anualizado" })],
    [3, (p) => p.locator("main div.border-l-4").filter({ hasText: "Capital congelado" })],
    [4, (p) => p.locator("main div.border-l-4").filter({ hasText: "Risco de ruptura" })],
    [5, (p) => p.locator("main div.border-l-4").filter({ hasText: "Cobertura de custo" })],
    [6, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Repor até o mínimo" }).last()],
    [7, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Produtos Parados" }).last()],
    [8, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Excesso de Estoque" }).last()],
  ] },
  { chave: "suprimentos-meio", papel: "gestor", url: "/suprimentos", viewport: ALTO(3200), espera: 1500,
    clip: (p) => [p.locator("main div.rounded-2xl").filter({ hasText: "Concentração (ABC)" }).last(), p.locator("main div.rounded-2xl").filter({ hasText: "Custo de Fabricação" }).last()], marcas: [
    [1, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Concentração (ABC)" }).last()],
    [2, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Top 10 Produtos por Valor" }).last()],
    [3, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Custo de Fabricação" }).last()],
  ] },
  { chave: "suprimentos-fim", papel: "gestor", url: "/suprimentos", viewport: ALTO(3600), espera: 1500,
    clip: (p) => [p.locator("main div.rounded-2xl").filter({ hasText: "Fluxo de Caixa em Estoque" }).last(), p.locator("main div.rounded-2xl").filter({ hasText: "Custos a Cadastrar" }).last()], marcas: [
    [1, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Fluxo de Caixa em Estoque" }).last()],
    [2, (p) => btn("30d")(p).locator("..")],
    [3, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Fluxo Líquido por Categoria" }).last()],
    [4, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Valor Mobilizado por Categoria" }).last()],
    [5, (p) => p.locator("main div.rounded-2xl").filter({ hasText: "Custos a Cadastrar" }).last()],
  ] },

  // ── Configurar Metas ──
  { chave: "metas-config", papel: "gestor", url: "/configurar-metas", viewport: ALTO(1050), marcas: [
    [1, (p) => btn("Vendedores")(p).locator("..")],
    [2, (p) => p.getByRole("button", { name: "Mês anterior" }).locator("..")],
    [3, (p) => p.locator("main div.rounded-xl, main div.rounded-lg").filter({ has: p.getByText(/^Meta geral de/) }).last()],
    [4, btn(/Ajustar distribuição/)],
    [5, (p) => p.getByRole("button", { name: "Meta padrão", exact: true }).first()],
    [6, (p) => p.getByText("Específica deste mês").first()],
    [7, (p) => p.getByRole("button", { name: /Meta padrão/ }).nth(1)],
    [8, (p) => p.getByRole("button", { name: /Meta deste mês/ }).first()],
    [9, btn(/Voltar ao padrão/)],
  ] },
  { chave: "metas-distribuir", papel: "gestor", url: "/configurar-metas", viewport: ALTO(1300),
    antes: async (p) => { await btn(/Ajustar distribuição/)(p).click(); await p.waitForTimeout(600); },
    clip: (p) => p.locator("main div.rounded-xl, main div.rounded-lg").filter({ has: p.getByText(/^Meta geral de/) }).last(), marcas: [
    [1, (p) => p.getByText("Valor da meta geral").locator("..")],
    [2, btn(/Dividir igual/)],
    [3, btn(/Proporcional ao realizado/)],
    [4, (p) => p.locator("main div.h-2.w-full").first().locator("..")],
    [5, (p) => p.locator("main div.divide-y.rounded-lg.border div.flex-wrap").first().locator("input")],
    [6, (p) => p.getByRole("button", { name: /^(Travar|Destravar)$/ }).first()],
    [7, btn(/Salvar distribuição/)],
  ] },
  { chave: "metas-dialogo", papel: "gestor", url: "/configurar-metas", viewport: ALTO(900),
    antes: async (p) => { await p.getByRole("button", { name: /Meta deste mês/ }).first().click(); await p.waitForTimeout(700); },
    clip: (p) => dlg(p), marcas: [
    [1, (p) => dlg(p).locator("h2")],
    [2, (p) => dlg(p).getByRole("combobox")],
    [3, (p) => dlg(p).locator("input")],
    [4, (p) => dlg(p).getByRole("button", { name: "Salvar" })],
  ] },
  { chave: "metas-ecommerce", papel: "gestor", url: "/configurar-metas", viewport: ALTO(1700),
    antes: async (p) => { await btn("E-commerce")(p).click(); await p.waitForTimeout(1200); }, marcas: [
    [1, (p) => btn("E-commerce")(p)],
    [2, (p) => p.locator("main div.rounded-xl, main div.rounded-lg").filter({ has: p.getByText(/^Meta geral de/) }).last()],
    [3, (p) => p.locator("main div.rounded-xl, main div.rounded-lg").filter({ has: p.getByText("Nuvemshop", { exact: true }) }).last()],
    [4, (p) => p.getByRole("button", { name: /Editar meta de Nuvemshop/ })],
    [5, (p) => p.locator("main div.rounded-xl, main div.rounded-lg").filter({ has: p.getByText("Shopee", { exact: true }) }).last()],
    [6, (p) => p.locator("main div.rounded-xl, main div.rounded-lg").filter({ has: p.getByText("Total Geral", { exact: true }) }).last()],
  ] },
];
