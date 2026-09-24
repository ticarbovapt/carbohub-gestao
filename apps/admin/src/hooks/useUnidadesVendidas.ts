import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerTudo } from "@/lib/lerTudo";
import {
  COLUNAS_MAPA_SKU, construirMapaUnidades, normalizarSku, unidadesExibidas,
  type MapaUnidades, type SkuMappingRow,
} from "@/lib/skuUnidades";

// ═══════════════════════════════════════════════════════════════════════════
// UNIDADES VENDIDAS — on-line e equipe, na MESMA unidade
//
// A pergunta é "quantos frascos/sachês o cliente levou", e ela tem duas
// origens que contam coisas diferentes:
//
//   ecommerce_orders.quantity   PACKS  — o que a plataforma anunciou
//   carboze_orders.items[].quantity    ITENS DO CATÁLOGO — o que a equipe vendeu
//
// ⚠️ Os dois NÃO são a mesma unidade, e somá-los cru erra em silêncio. O kit
// de sachês é o caso: a plataforma vende 1 pack que entrega 10 sachês; a
// equipe vende 1 item de catálogo que TAMBÉM é o kit de 10. Tratar os dois
// "1" como iguais diria 2 unidades onde foram 20.
//
// ⚠️ E a conversão NÃO pode ser inventada. Ela é derivada do cadastro que já
// existe, `sku_product_mappings`, usando os DOIS campos exatamente como eles
// são definidos:
//
//     display_units_per_pack   quantas unidades o CLIENTE levou
//     unidades_por_venda       quantos itens saem da PRATELEIRA
//
//     SKU 124 → CZ100              display  5 · prateleira 5 → 1 un. por item
//     SKU 120 → KIT-CARB-SACH-10ML display 10 · prateleira 1 → 10 un. por item
//
// A razão `display / prateleira` responde exatamente "quantas unidades vale UM
// item do catálogo" — que é o fator que falta do lado da equipe. Não é regra
// nova: é a mesma tabela, lida na direção que ainda não era usada.
//
// ⚠️ Fator desconhecido devolve `null`, NUNCA 1. Um `1` inventado some da
// lista de trabalho: a linha fica plausível e ninguém vai cadastrar o mapa que
// falta. É a doença do `Math.round(unidades/pedidos)` inventando `×1`.
//
// ⚠️ Produto com fatores CONFLITANTES também devolve `null`. Dois SKUs
// apontando para o mesmo produto com razões diferentes é ambiguidade, e
// escolher uma enterraria a dúvida — a mesma regra da carga de PDV que não
// insere quando o nome bate com duas linhas.
// ═══════════════════════════════════════════════════════════════════════════

// Mesma lista branca da dedução de estoque e dos cartões do e-commerce. Contar
// aqui o que o estoque não deduz lá seria o painel discordando do sistema.
const EH_VENDA = new Set(["paid", "shipped", "delivered"]);
const ehVenda = (s: string | null) => EH_VENDA.has((s ?? "").toLowerCase());

export interface ProdutoUnidades {
  key: string;
  nome: string;
  productCode: string | null;
  /** `false` = a linha do e-commerce não resolve para produto do cadastro. */
  mapeado: boolean;
  // On-line
  onPacks: number;
  onUnidades: number;
  onReceita: number;
  // Equipe / balcão
  eqItens: number;
  /** `null` quando o fator daquele produto é desconhecido ou ambíguo. */
  eqUnidades: number | null;
  eqBonificadas: number;
  eqReceita: number;
  // Soma — só existe quando os dois lados estão na MESMA unidade.
  totalUnidades: number | null;
  totalReceita: number;
}

export interface UnidadesVendidas {
  produtos: ProdutoUnidades[];
  onUnidades: number;
  onPacks: number;
  onReceita: number;
  eqUnidades: number | null;
  eqItens: number;
  eqReceita: number;
  totalUnidades: number | null;
  /** Produtos da equipe sem fator conhecido — a lista de trabalho. */
  semFator: string[];
  /** Linhas cujo par quantidade/preço veio deslocado em duas casas. */
  linhasCorrigidas: number;
  /** % do valor que deveria contar e conta. `null` quando não há base. */
  cobertura: number | null;
  /** Venda real que não entrou por falta de nota válida. */
  semNotaPedidos: number;
  semNotaValor: number;
}

interface LinhaOnline {
  platform: string;
  product_sku: string | null;
  product_name: string | null;
  quantity: number | null;
  units_real: number | null;
  total: number | null;
  status: string | null;
  ordered_at: string | null;
}

// ⚠️ O item é JSONB e tem SETE formatos no histórico — censo de 24/09/2026:
//
//   131 linhas  name · product_code · product_id · bonificacao · is_bonificacao…
//   120 linhas  product_name · sku_code · quantity · total · unit_price
//    57 linhas  name · product_code (sem product_id)
//    49 · 8 · 5 · 1   variações com menos campos, uma com bonus_quantity/has_bonus
//
// O segundo formato é o do importador do Bling, e ele NÃO usa `name`: eu lia
// `name`/`produto` e aquelas 120 linhas — 27.818 unidades, R$ 261 mil, 30% do
// total — apareciam como um card "(SEM NOME)". A quantidade entrava porque a
// chave dela coincide; o nome e o código não.
//
// ⚠️ Ler só um dialeto não dá erro: dá número menor com cara de certo.
interface ItemVenda {
  name?: string | null;
  produto?: string | null;
  product_name?: string | null;
  product_id?: string | null;
  product_code?: string | null;
  sku_code?: string | null;
  quantity?: number | null;
  quantidade?: number | null;
  bonificacao?: number | null;
  bonus_quantity?: number | null;
  is_bonificacao?: boolean | null;
  kind?: string | null;
  unit_price?: number | null;
  total?: number | null;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const itemNome = (i: ItemVenda) => (i?.name ?? i?.produto ?? i?.product_name ?? "").trim();
const itemCodigo = (i: ItemVenda) => (i?.product_code ?? i?.sku_code ?? "").trim().toUpperCase();
const itemQtd = (i: ItemVenda) => num(i?.quantity ?? i?.quantidade);
// Os dois nomes do mesmo campo. `bonus_quantity` só existe numa linha do
// histórico — e é exatamente o tipo de resto que some quando se lê "o formato
// atual" em vez de todos.
const itemBonus = (i: ItemVenda) => num(i?.bonificacao ?? i?.bonus_quantity);

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ A ESCALA DE CEM — quantidade inflada, total correto
//
// Medido em 24/09/2026 no código 020 do Bling (CarboZé 100 ml), confirmado
// pela equipe comercial contra o histórico de preço:
//
//   BLING-3   qtd 7500 × R$ 0,116 = R$ 870   →  são 75 un. a R$ 11,60
//   BLING-2   qtd 5000 × R$ 0,116 = R$ 580   →  são 50 un. a R$ 11,60
//   BLING-6   qtd  300 × R$ 0,300 = R$  90   →  são  3 un. a R$ 30,00
//
// O TOTAL da linha sempre esteve certo — o que veio errado do cadastro antigo
// do Bling é a divisão entre quantidade e preço, deslocada em duas casas. As
// nove linhas somavam 13.405 "unidades" onde foram 139: inflação de 96×.
//
// ⚠️ A regra é ESTREITA de propósito, e exige as DUAS condições:
//
//   1. preço unitário abaixo de R$ 1,00 — nenhum Produto Final é vendido
//      assim (o mais barato do catálogo é o sachê, a R$ 1,80);
//   2. quantidade múltipla de 100 — é o que faz a correção devolver um
//      número inteiro em vez de inventar uma fração.
//
// Uma condição só seria heurística. As duas juntas descrevem exatamente o
// defeito medido, e as linhas boas do MESMO código (3 un. a R$ 30, 2 un. a
// R$ 30) passam intactas — prova de que a régua não é "o código 020".
//
// ⚠️ E a correção é CONTADA e mostrada na tela. Corrigir em silêncio faria o
// painel discordar do Bling sem ninguém saber por quê — e a correção de
// verdade é no cadastro de origem, não aqui.
// ═══════════════════════════════════════════════════════════════════════════
const PRECO_MINIMO_PLAUSIVEL = 1;
const ESCALA = 100;

function corrigirEscala(qtd: number, precoUnit: number): { qtd: number; corrigida: boolean } {
  if (precoUnit > 0 && precoUnit < PRECO_MINIMO_PLAUSIVEL && qtd >= ESCALA && qtd % ESCALA === 0) {
    return { qtd: qtd / ESCALA, corrigida: true };
  }
  return { qtd, corrigida: false };
}

/** Chave de nome: sem acento, minúscula, espaços colapsados. */
const chaveNome = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();

export interface UnidadesFiltro { from?: string; to?: string }

export function useUnidadesVendidas(filtros: UnidadesFiltro = {}) {
  const { from, to } = filtros;
  return useQuery({
    queryKey: ["unidades-vendidas", from ?? "", to ?? ""],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<UnidadesVendidas> => {
      const db = supabase as unknown as { from: (t: string) => any };

      // ── 1. On-line: todas as plataformas, uma leitura só ──────────────────
      // ⚠️ `lerTudo`: o teto de 1.000 do PostgREST não avisa, e aqui são
      // milhares de linhas (uma por ITEM de pedido).
      const online = await lerTudo<LinhaOnline>((de, ate) => {
        let q = db.from("ecommerce_orders")
          .select("platform, product_sku, product_name, quantity, units_real, total, status, ordered_at")
          .order("ordered_at", { ascending: false })
          .order("id", { ascending: false });
        if (from) q = q.gte("ordered_at", new Date(`${from}T00:00:00`).toISOString());
        if (to) q = q.lte("ordered_at", new Date(`${to}T23:59:59.999`).toISOString());
        return q.range(de, ate);
      });

      // ── 2. Equipe: os pedidos que CONTAM, e os itens deles ────────────────
      // A régua de "conta" é a `conta_metrica` da view — a fonte única. Uma
      // regra própria aqui seria a 15ª definição de "venda que conta".
      //
      // ⚠️ Os itens vêm da MESMA linha (`items`, jsonb). A view os expõe
      // porque foi criada com `o.*` — e é por isso que o `useCarbozeVendas` já
      // lê `row.items` dela. Uma segunda leitura em `carboze_orders` só para
      // buscar os itens abriria a porta para as duas listas discordarem sobre
      // quais pedidos existem.
      //
      // ⚠️ `segmento !== 'online'`: o corte é o MESMO do resto do dashboard —
      // venda de marketplace já foi contada no lado de cima, e contá-la de
      // novo aqui duplicaria o produto dentro da própria seção.
      const pedidos = await lerTudo<{ id: string; conta_metrica: boolean | null; segmento: string | null; data_efetiva: string | null; items: ItemVenda[] | null; total: number | null; motivo_fora: string | null }>(
        (de, ate) => {
          let q = db.from("carbo_vendas_metrica")
            .select("id, conta_metrica, segmento, data_efetiva, items, total, motivo_fora")
            .order("data_efetiva", { ascending: false })
            .order("id", { ascending: false });
          if (from) q = q.gte("data_efetiva", from);
          if (to) q = q.lte("data_efetiva", to);
          return q.range(de, ate);
        },
      );
      const comItens = pedidos.filter((p) => p.conta_metrica === true && p.segmento !== "online");

      // ── Cobertura: quanto do que DEVERIA contar realmente conta ───────────
      //
      // ⚠️ O denominador NÃO é todo pedido. Cancelado, orçamento e bonificação
      // estão fora CORRETAMENTE — jogá-los aqui faria a cobertura parecer ruim
      // por causa de exclusões que são o comportamento certo, e um número que
      // sempre acusa problema ensina a ignorá-lo.
      //
      // O que fica de fora e NÃO deveria é a venda real sem nota: `aguardando_nf`
      // e `nf_invalida`. Medido em 24/09/2026 pelo lado do Bling: 327 pedidos
      // contando e 41 esperando nota — nenhum pedido perdido na ponte.
      const AUSENCIA_DE_NOTA = new Set(["aguardando_nf", "nf_invalida"]);
      const internos = pedidos.filter((p) => p.segmento !== "online");
      const valorConta = internos
        .filter((p) => p.conta_metrica === true)
        .reduce((s2, p) => s2 + (Number(p.total) || 0), 0);
      const semNota = internos.filter((p) => AUSENCIA_DE_NOTA.has(p.motivo_fora ?? ""));
      const valorSemNota = semNota.reduce((s2, p) => s2 + (Number(p.total) || 0), 0);
      const baseCobertura = valorConta + valorSemNota;

      // ── 3. O cadastro de SKU: unidades por pack E unidades por item ───────
      const { data: mapas, error: errMapa } = await db
        .from("sku_product_mappings")
        .select(`${COLUNAS_MAPA_SKU}, product_id`)
        .eq("is_active", true) as { data: (SkuMappingRow & { product_id: string | null })[] | null; error: { message: string } | null };
      if (errMapa) throw errMapa;
      const linhasMapa = mapas ?? [];

      const mapaUnidades: MapaUnidades = construirMapaUnidades(linhasMapa);

      // product_id → unidades que UM item do catálogo entrega.
      // `undefined` = nunca visto; `null` = visto e ambíguo.
      const fatorDoProduto = new Map<string, number | null>();
      for (const m of linhasMapa) {
        if (!m.product_id) continue;
        const display = m.display_units_per_pack;
        const prateleira = m.unidades_por_venda;
        if (!display || !prateleira || prateleira <= 0) continue;
        const razao = display / prateleira;
        if (!Number.isFinite(razao) || razao <= 0) continue;
        const atual = fatorDoProduto.get(m.product_id);
        if (atual === undefined) fatorDoProduto.set(m.product_id, razao);
        else if (atual !== razao) fatorDoProduto.set(m.product_id, null); // conflito
      }

      // ── O catálogo inteiro, e o alias do Bling ────────────────────────────
      //
      // ⚠️ O catálogo é lido INTEIRO, não filtrado pelos ids que aparecem nos
      // itens: é justamente o item SEM `product_id` que precisa achar o
      // produto, e ele só acha se o catálogo estiver todo na mão.
      const { data: prods } = await db.from("mrp_products")
        .select("id, name, product_code, bonificacao_de, category") as {
          data: { id: string; name: string | null; product_code: string | null; bonificacao_de: string | null; category: string | null }[] | null;
        };
      const nomePorId = new Map<string, { nome: string; code: string | null }>();
      // ⚠️ Só PRODUTO FINAL conta unidade vendida. O `mrp_products` também
      // guarda insumo, embalagem e semi-acabado — a "Bomboniere" (INS-BOM) é
      // insumo e aparecia como se fossem 400 unidades vendidas ao cliente.
      // Contar insumo aqui é a mesma doença de contar orçamento como venda.
      const categoriaPorId = new Map<string, string | null>();
      const porCodigo = new Map<string, string>();
      const porNome = new Map<string, string | null>(); // null = nome ambíguo
      for (const p of prods ?? []) {
        // ⚠️ O gêmeo de bonificação resolve para o PAI. Ele é a mesma garrafa
        // da mesma prateleira, e um card "CarboZé 100ml - bonificação" ao lado
        // do card do pai partiria o produto de novo — o defeito que esta
        // correção fecha.
        const destino = p.bonificacao_de ?? p.id;
        nomePorId.set(p.id, { nome: p.name ?? p.product_code ?? "Produto sem nome", code: p.product_code });
        categoriaPorId.set(p.id, p.category);
        const cod = (p.product_code ?? "").trim().toUpperCase();
        if (cod && !porCodigo.has(cod)) porCodigo.set(cod, destino);
        const nk = chaveNome(p.name ?? "");
        if (nk) porNome.set(nk, porNome.has(nk) && porNome.get(nk) !== destino ? null : destino);
      }

      // Alias: código do catálogo EXTERNO (Bling) → produto daqui. É CADASTRO
      // (`carbo_produto_alias`), não lista no código — produto novo no Bling
      // entra com um INSERT, sem deploy.
      const alias = new Map<string, string>();
      const { data: aliasRows, error: errAlias } = await db
        .from("carbo_produto_alias")
        .select("codigo, product_id") as { data: { codigo: string; product_id: string }[] | null; error: { message: string } | null };
      if (errAlias) {
        // Tabela ainda não migrada: o painel continua funcionando e os códigos
        // do Bling aparecem como produto próprio, marcados "sem mapa". Falha
        // que ESCONDE o produto seria pior que falha que o mostra separado.
        console.warn("[useUnidadesVendidas] carbo_produto_alias indisponível:", errAlias.message);
      }
      for (const a of aliasRows ?? []) alias.set(a.codigo.trim().toUpperCase(), a.product_id);

      /** A identidade do item, na ordem em que as pistas são confiáveis. */
      const resolverProduto = (i: ItemVenda): string | null => {
        // 1. `product_id` é o dado, não um palpite — e no gêmeo de bonificação
        //    ele já vem resolvido para o pai pelo /vender.
        if (i?.product_id) {
          const ident = nomePorId.get(i.product_id);
          if (ident) {
            const cod = (ident.code ?? "").trim().toUpperCase();
            return porCodigo.get(cod) ?? i.product_id;
          }
          return i.product_id;
        }
        const cod = itemCodigo(i);
        // 2. Alias do Bling (035, 084…). 3. O código do nosso catálogo.
        if (cod) {
          const viaAlias = alias.get(cod);
          if (viaAlias) return viaAlias;
          const viaCodigo = porCodigo.get(cod);
          if (viaCodigo) return viaCodigo;
        }
        // 4. Nome EXATO do catálogo (sem acento, minúsculo). ⚠️ Não é busca
        //    por semelhança: nome que bate com DOIS produtos devolve null e o
        //    item vira linha própria, em vez de a ambiguidade ser enterrada —
        //    a mesma regra da carga de PDV que não insere quando o nome casa
        //    com duas linhas.
        const nk = chaveNome(itemNome(i));
        if (nk) {
          const viaNome = porNome.get(nk);
          if (viaNome) return viaNome;
        }
        return null;
      };
      const produtoDoSku = new Map<string, string>(); // "<plataforma|*> <sku>" → product_id
      for (const m of linhasMapa) {
        const sku = normalizarSku(m.platform_sku);
        if (!sku || !m.product_id) continue;
        produtoDoSku.set(`${m.platform ?? "*"} ${sku}`, m.product_id);
      }

      // ── 4. Agrega ─────────────────────────────────────────────────────────
      const acc = new Map<string, ProdutoUnidades>();
      const novo = (key: string, nome: string, code: string | null, mapeado: boolean): ProdutoUnidades => ({
        key, nome, productCode: code, mapeado,
        onPacks: 0, onUnidades: 0, onReceita: 0,
        eqItens: 0, eqUnidades: 0, eqBonificadas: 0, eqReceita: 0,
        totalUnidades: 0, totalReceita: 0,
      });

      for (const r of online) {
        if (!ehVenda(r.status)) continue;
        const sku = normalizarSku(r.product_sku);
        // A MESMA resolução do lado da equipe (gêmeo → pai, código do
        // catálogo), senão o mesmo produto cairia em duas chaves e os dois
        // canais não se encontrariam na mesma linha.
        const bruto = sku ? (produtoDoSku.get(`${r.platform} ${sku}`) ?? produtoDoSku.get(`* ${sku}`)) : undefined;
        const pid = bruto ? resolverProduto({ product_id: bruto }) ?? bruto : undefined;
        const ident = pid ? nomePorId.get(pid) : undefined;
        // Linha que não resolve NÃO se mistura: vira linha própria, pelo SKU ou
        // pelo nome. Empurrá-la para dentro de um produto conhecido esconderia
        // o cadastro que falta.
        const key = pid ? `prod:${pid}` : sku ? `sku:${sku}` : `nome:${r.product_name ?? "?"}`;
        const linha = acc.get(key) ?? novo(key, ident?.nome ?? r.product_name ?? sku ?? "Produto desconhecido", ident?.code ?? null, !!pid);
        linha.onPacks += Number(r.quantity) || 0;
        linha.onUnidades += unidadesExibidas(mapaUnidades, r);
        linha.onReceita += Number(r.total) || 0;
        acc.set(key, linha);
      }

      const semFator = new Set<string>();
      let linhasCorrigidas = 0;
      for (const o of comItens) {
        for (const i of o.items ?? []) {
          // Serviço não tem unidade física e não entra numa contagem de frascos.
          if (i?.kind === "service") continue;
          const pid = resolverProduto(i);
          // Insumo/embalagem/semi-acabado não é unidade vendida ao cliente.
          // ⚠️ O corte é pela CATEGORIA do cadastro, nunca por uma lista de
          // nomes no código: produto novo entra pelo cadastro e obedece sozinho.
          if (pid && categoriaPorId.get(pid) !== "Produto Final") continue;
          const ident = pid ? nomePorId.get(pid) : undefined;
          const key = pid ? `prod:${pid}` : `nome:${chaveNome(itemNome(i)) || itemCodigo(i) || "?"}`;
          const linha = acc.get(key) ?? novo(
            key,
            ident?.nome ?? itemNome(i) ?? itemCodigo(i) ?? "Produto sem nome",
            ident?.code ?? itemCodigo(i) ?? null,
            !!pid,
          );

          // ⚠️ A bonificação ENTRA na contagem: ela saiu da prateleira e chegou
          // ao cliente. `bonificacao` é o modelo antigo (campo na linha paga) e
          // a linha `is_bonificacao` é o novo (quantidade própria, valor zero).
          // Os dois convivem no histórico — ler só um perde metade dos brindes.
          // ⚠️ A escala é corrigida ANTES de somar, e sobre a quantidade PAGA
          // e a bonificada separadamente — as duas vêm da mesma linha e do
          // mesmo cadastro deslocado.
          const escQtd = corrigirEscala(itemQtd(i), num(i?.unit_price));
          const escBon = corrigirEscala(itemBonus(i), num(i?.unit_price));
          const qtd = escQtd.qtd;
          const bonus = escBon.qtd;
          if (escQtd.corrigida || escBon.corrigida) linhasCorrigidas++;
          const itens = qtd + bonus;
          linha.eqItens += itens;
          linha.eqBonificadas += bonus + (i?.is_bonificacao ? qtd : 0);
          linha.eqReceita += Number(i?.total) || 0;

          const fator = pid ? fatorDoProduto.get(pid) : undefined;
          if (fator == null) {
            // Desconhecido OU ambíguo: a soma daquele produto deixa de existir,
            // em vez de virar um número plausível e errado.
            linha.eqUnidades = null;
            semFator.add(linha.nome);
          } else if (linha.eqUnidades !== null) {
            linha.eqUnidades += itens * fator;
          }
          acc.set(key, linha);
        }
      }

      const produtos = [...acc.values()].map((p) => ({
        ...p,
        onReceita: Math.round(p.onReceita * 100) / 100,
        eqReceita: Math.round(p.eqReceita * 100) / 100,
        totalUnidades: p.eqUnidades === null ? null : p.onUnidades + p.eqUnidades,
        totalReceita: Math.round((p.onReceita + p.eqReceita) * 100) / 100,
      })).sort((a, b) => (b.totalUnidades ?? b.onUnidades) - (a.totalUnidades ?? a.onUnidades) || b.totalReceita - a.totalReceita);

      const soma = (f: (p: ProdutoUnidades) => number) => produtos.reduce((s, p) => s + f(p), 0);
      // ⚠️ O total da equipe é `null` se QUALQUER produto estiver sem fator:
      // um total que ignora as linhas que não sabe somar é um total errado que
      // parece certo. Melhor não mostrar número do que mostrar um menor.
      const algumSemFator = produtos.some((p) => p.eqUnidades === null);
      const eqUnidades = algumSemFator ? null : soma((p) => p.eqUnidades ?? 0);
      const onUnidades = soma((p) => p.onUnidades);

      return {
        produtos,
        onUnidades,
        onPacks: soma((p) => p.onPacks),
        onReceita: Math.round(soma((p) => p.onReceita) * 100) / 100,
        eqUnidades,
        eqItens: soma((p) => p.eqItens),
        eqReceita: Math.round(soma((p) => p.eqReceita) * 100) / 100,
        totalUnidades: eqUnidades === null ? null : onUnidades + eqUnidades,
        semFator: [...semFator].sort((a, b) => a.localeCompare(b, "pt-BR")),
        linhasCorrigidas,
        cobertura: baseCobertura > 0 ? (valorConta / baseCobertura) * 100 : null,
        semNotaPedidos: semNota.length,
        semNotaValor: Math.round(valorSemNota * 100) / 100,
      };
    },
  });
}
