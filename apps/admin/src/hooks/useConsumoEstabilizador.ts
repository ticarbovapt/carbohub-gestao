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
// ⚠️ AS LINHAS SÃO AGRUPADAS PELO PRODUTO DE VERDADE. "CarboZé 100ml", o
// "- Microdistribuidor" e o "- PDV" são o mesmo frasco, e o "KIT 10und sachê"
// é o mesmo sachê numa caixa de dez. Para a pergunta de produção eles são UM
// item; em linhas separadas, o produto aparece partido em três e nenhuma das
// partes responde "quanto deste produto saiu". Quem diz quem é quem é o
// cadastro (`preco_de` e a BOM de componente único) — ver `resolverBase`.
//
// ⚠️ O PERÍODO é de quem chama. A tela pede o histórico inteiro — a pergunta
// é de produção ("quanto líquido esta operação consome"), não de mês.
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaEstabilizador {
  baseId: string;
  nome: string;
  codigo: string | null;
  /** Unidades do produto-base (o kit de 10 conta como 10 sachês). */
  unidades: number;
  /** Litros por UMA unidade do base. */
  litrosPorUnidade: number;
  litros: number;
}

export interface MesEstabilizador {
  /** `YYYY-MM`. */
  mes: string;
  litros: number;
  /** Litros por produto-base naquele mês — a quebra da barra empilhada. */
  porProduto: Record<string, number>;
}

export interface ConsumoEstabilizador {
  litros: number;
  unidades: number;
  linhas: LinhaEstabilizador[];
  /** Série mensal, do mês mais antigo ao mais recente. */
  meses: MesEstabilizador[];
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

  const grupos = new Map<string, LinhaEstabilizador>();
  const semBom: ConsumoEstabilizador["semBom"] = [];
  let onlineIncompleto = false;

  for (const p of unidades.data?.produtos ?? []) {
    // ⚠️ Os dois canais na MESMA unidade. `onItens` é `null` quando algum SKU
    // daquele produto não tem prateleira cadastrada: aí o on-line daquele
    // produto fica DE FORA e a tela diz isso, em vez de somar só a equipe e
    // mostrar um consumo menor com cara de total.
    if (p.onItens === null) onlineIncompleto = true;
    const itens = (p.onItens ?? 0) + p.eqItens;
    if (itens <= 0) continue;

    const litrosPorItem = p.productId ? bom.data?.litrosPorItem.get(p.productId) : undefined;
    const base = p.productId ? bom.data?.base.get(p.productId) : undefined;
    if (litrosPorItem === undefined || base === undefined) {
      semBom.push({ nome: p.nome, codigo: p.productCode, itens });
      continue;
    }
    if (litrosPorItem <= 0) continue;   // resolve, e não leva o insumo

    const linha = grupos.get(base.id) ?? {
      baseId: base.id, nome: base.nome, codigo: base.codigo,
      unidades: 0,
      // ⚠️ O "× N ml" do rótulo é o do BASE, não o do item: no grupo do sachê
      // convivem o avulso (12 ml) e o kit (120 ml), e os dois viram sachês.
      litrosPorUnidade: bom.data?.litrosPorItem.get(base.id) ?? litrosPorItem,
      litros: 0,
    };
    linha.unidades += itens * base.porItem;
    linha.litros += itens * litrosPorItem;
    grupos.set(base.id, linha);
  }

  // ── A série mensal, pelo mesmo caminho ────────────────────────────────────
  const porMes = new Map<string, MesEstabilizador>();
  for (const r of unidades.data?.porMes ?? []) {
    const litrosPorItem = r.productId ? bom.data?.litrosPorItem.get(r.productId) : undefined;
    const base = r.productId ? bom.data?.base.get(r.productId) : undefined;
    if (!litrosPorItem || !base) continue;   // já contado no `semBom` acima
    const m = porMes.get(r.mes) ?? { mes: r.mes, litros: 0, porProduto: {} };
    const l = r.itens * litrosPorItem;
    m.litros += l;
    m.porProduto[base.id] = (m.porProduto[base.id] ?? 0) + l;
    porMes.set(r.mes, m);
  }

  const linhas = [...grupos.values()].sort((a, b) => b.litros - a.litros);
  const arred = (v: number) => Math.round(v * 1000) / 1000;

  return {
    litros: arred(linhas.reduce((s, l) => s + l.litros, 0)),
    unidades: linhas.reduce((s, l) => s + l.unidades, 0),
    linhas: linhas.map((l) => ({ ...l, litros: arred(l.litros) })),
    meses: [...porMes.values()]
      .map((m) => ({ ...m, litros: arred(m.litros) }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
    semBom: semBom.sort((a, b) => b.itens - a.itens),
    onlineIncompleto,
    carregando: unidades.isLoading || bom.isLoading,
    erro: unidades.error ?? bom.error ?? null,
  };
}
