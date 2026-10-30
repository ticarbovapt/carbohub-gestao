import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUnidadesVendidas, type UnidadesFiltro } from "@/hooks/useUnidadesVendidas";
import {
  CODIGO_ESTABILIZADOR, resolverEstabilizador,
  type BomRow, type ProdutoBomRow,
} from "@/lib/bomEstabilizador";

// ═══════════════════════════════════════════════════════════════════════════
// CONSUMO DE ESTABILIZADOR — litros, a partir do que foi VENDIDO
//
// litros = Σ (itens de catálogo vendidos do SKU) × (litros por item na BOM)
//
// ⚠️ A unidade do multiplicando é ITEM DE CATÁLOGO nos DOIS canais, e isso não
// é detalhe: a BOM é definida por item ("1 CZ100 leva 100 ml"). Do lado da
// equipe o item já é o que se conta; do lado on-line o que se conta é PACK, e
// um pack do SKU 124 são CINCO frascos. Multiplicar a BOM por packs erraria
// cinco vezes para menos no produto mais vendido da casa.
//
// ⚠️ A venda NÃO é recontada aqui. Vem do `useUnidadesVendidas`, que já sabe
// ler os sete dialetos do item JSONB, corrigir a escala do cadastro antigo do
// Bling, resolver o gêmeo de bonificação para o pai e aplicar a régua do
// `conta_metrica`. Uma segunda contagem de venda neste arquivo seria a 15ª
// definição de "venda que conta".
//
// ⚠️ A BONIFICAÇÃO ENTRA. O líquido saiu do tanque e o frasco saiu da
// prateleira; o fato de não ter sido cobrado é assunto do financeiro, não da
// produção. (Já vem somada no `eqItens`.)
//
// ⚠️ O PERÍODO é de quem chama. A tela pede o histórico inteiro — a pergunta
// é de produção ("quanto líquido esta operação consome"), não de mês.
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaEstabilizador {
  productId: string;
  nome: string;
  codigo: string | null;
  /** Itens de catálogo vendidos, os dois canais somados. */
  itens: number;
  /** Litros por item, segundo a BOM resolvida. */
  litrosPorItem: number;
  litros: number;
}

export interface ConsumoEstabilizador {
  litros: number;
  itens: number;
  linhas: LinhaEstabilizador[];
  /** Produtos vendidos cuja BOM não resolve — a lista de trabalho. */
  semBom: { nome: string; codigo: string | null; itens: number }[];
  /** `true` quando o on-line não converte em itens (SKU sem prateleira). */
  onlineIncompleto: boolean;
  carregando: boolean;
  erro: unknown;
}

/** A BOM inteira e o catálogo. Pequeno (dezenas de linhas) e quase estático. */
function useBomEstabilizador() {
  return useQuery({
    queryKey: ["bom-estabilizador", CODIGO_ESTABILIZADOR],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const db = supabase as unknown as { from: (t: string) => any };
      const { data: boms, error: errBom } = await db
        .from("mrp_bom")
        .select("product_id, insumo_id, quantity_per_unit, unit") as
        { data: BomRow[] | null; error: { message: string } | null };
      if (errBom) throw errBom;
      // ⚠️ O catálogo INTEIRO, insumo incluído: é a categoria que distingue a
      // folha ("tampa não tem lista, e tudo bem") do cadastro faltando.
      const { data: prods, error: errProd } = await db
        .from("mrp_products")
        .select("id, product_code, name, category, preco_de, bonificacao_de") as
        { data: ProdutoBomRow[] | null; error: { message: string } | null };
      if (errProd) throw errProd;
      return resolverEstabilizador(boms ?? [], prods ?? []);
    },
  });
}

export function useConsumoEstabilizador(filtros: UnidadesFiltro = {}): ConsumoEstabilizador {
  const unidades = useUnidadesVendidas(filtros);
  const bom = useBomEstabilizador();

  const linhas: LinhaEstabilizador[] = [];
  const semBom: ConsumoEstabilizador["semBom"] = [];
  let litros = 0;
  let itens = 0;
  let onlineIncompleto = false;

  for (const p of unidades.data?.produtos ?? []) {
    // ⚠️ Os dois canais na MESMA unidade. `onItens` é `null` quando algum SKU
    // daquele produto não tem prateleira cadastrada: aí o on-line daquele
    // produto fica DE FORA e a tela diz isso, em vez de somar só a equipe e
    // mostrar um consumo menor com cara de total.
    if (p.onItens === null) onlineIncompleto = true;
    const qtd = (p.onItens ?? 0) + p.eqItens;
    if (qtd <= 0) continue;
    const litrosPorItem = p.productId ? bom.data?.litrosPorItem.get(p.productId) : undefined;
    if (litrosPorItem === undefined) {
      semBom.push({ nome: p.nome, codigo: p.productCode, itens: qtd });
      continue;
    }
    itens += qtd;
    if (litrosPorItem <= 0) continue;   // resolve, e não leva o insumo
    const l = qtd * litrosPorItem;
    litros += l;
    linhas.push({ productId: p.productId!, nome: p.nome, codigo: p.productCode, itens: qtd, litrosPorItem, litros: l });
  }

  return {
    litros: Math.round(litros * 1000) / 1000,
    itens,
    linhas: linhas.sort((a, b) => b.litros - a.litros),
    semBom: semBom.sort((a, b) => b.itens - a.itens),
    onlineIncompleto,
    carregando: unidades.isLoading || bom.isLoading,
    erro: unidades.error ?? bom.error ?? null,
  };
}
