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

// ⚠️ O item é JSONB e tem DOIS dialetos: o histórico antigo gravou as chaves
// em português (`produto`, `quantidade`, `preco_unitario`) e o atual grava em
// inglês. O `toVenda()` do `useVendas` já lê os dois — ler só um aqui faria a
// venda antiga contar ZERO unidade, calada, e o histórico é justamente o que
// esta seção existe para mostrar.
interface ItemVenda {
  name?: string | null;
  produto?: string | null;
  product_id?: string | null;
  product_code?: string | null;
  quantity?: number | null;
  quantidade?: number | null;
  bonificacao?: number | null;
  is_bonificacao?: boolean | null;
  kind?: string | null;
  total?: number | null;
}

const itemNome = (i: ItemVenda) => (i?.name ?? i?.produto ?? "").trim();
const itemQtd = (i: ItemVenda) => Number(i?.quantity ?? i?.quantidade ?? 0) || 0;

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
      const pedidos = await lerTudo<{ id: string; conta_metrica: boolean | null; segmento: string | null; data_efetiva: string | null; items: ItemVenda[] | null }>(
        (de, ate) => {
          let q = db.from("carbo_vendas_metrica")
            .select("id, conta_metrica, segmento, data_efetiva, items")
            .order("data_efetiva", { ascending: false })
            .order("id", { ascending: false });
          if (from) q = q.gte("data_efetiva", from);
          if (to) q = q.lte("data_efetiva", to);
          return q.range(de, ate);
        },
      );
      const comItens = pedidos.filter((p) => p.conta_metrica === true && p.segmento !== "online");

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

      // product_id → identidade, para o nome e o código serem os do CADASTRO.
      const idsProduto = new Set<string>();
      for (const m of linhasMapa) if (m.product_id) idsProduto.add(m.product_id);
      for (const o of comItens) {
        for (const i of o.items ?? []) if (i?.product_id) idsProduto.add(i.product_id);
      }
      const nomePorId = new Map<string, { nome: string; code: string | null }>();
      if (idsProduto.size > 0) {
        const { data: prods } = await db.from("mrp_products")
          .select("id, name, product_code")
          .in("id", [...idsProduto]) as { data: { id: string; name: string | null; product_code: string | null }[] | null };
        for (const p of prods ?? []) nomePorId.set(p.id, { nome: p.name ?? p.product_code ?? "Produto sem nome", code: p.product_code });
      }
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
        const pid = sku ? (produtoDoSku.get(`${r.platform} ${sku}`) ?? produtoDoSku.get(`* ${sku}`)) : undefined;
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
      for (const o of comItens) {
        for (const i of o.items ?? []) {
          // Serviço não tem unidade física e não entra numa contagem de frascos.
          if (i?.kind === "service") continue;
          const pid = i?.product_id ?? null;
          const ident = pid ? nomePorId.get(pid) : undefined;
          const key = pid ? `prod:${pid}` : `nome:${(itemNome(i) || "?").toLocaleLowerCase("pt-BR")}`;
          const linha = acc.get(key) ?? novo(key, ident?.nome ?? itemNome(i) ?? "Produto sem nome", ident?.code ?? i?.product_code ?? null, !!pid);

          // ⚠️ A bonificação ENTRA na contagem: ela saiu da prateleira e chegou
          // ao cliente. `bonificacao` é o modelo antigo (campo na linha paga) e
          // a linha `is_bonificacao` é o novo (quantidade própria, valor zero).
          // Os dois convivem no histórico — ler só um perde metade dos brindes.
          const qtd = itemQtd(i);
          const bonus = Number(i?.bonificacao) || 0;
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
      };
    },
  });
}
