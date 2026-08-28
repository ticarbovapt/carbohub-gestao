import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Mapa SKU da plataforma → produto do MRP  (`sku_product_mappings`)
//
// A migração 20260955 fez `unidades_por_venda` ser O número: quantas unidades
// FÍSICAS saem da prateleira quando UMA unidade daquele SKU é vendida. Kit de 5
// frascos = 5. `units_per_kit` e `display_units_per_pack` ficam como LEGADO —
// esta tela não os escreve, de propósito: dois campos para a mesma pergunta é
// garantia de divergirem, e já divergiram (×5 numa aba, 1× em outra).
//
// ⚠️ `product_id` tem de apontar para o produto UNITÁRIO (o frasco), nunca para
// o kit — é isso que faz 1 venda × 5 baixar 5 frascos. Apontar para o kit com
// fator 5 baixaria 5 KITS. A tela AVISA (não bloqueia): quem conhece o catálogo
// é quem está cadastrando.
//
// RLS: leitura E escrita exigem `carbo_e_time_interno()`. Erro de permissão
// aqui chega como linha zerada/insert recusado, não como 403 legível.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

/** Plataformas aceitas pelo CHECK `sku_platform_valida` da tabela.
 *  ⚠️ Valor fora desta lista é INSERT falhando — e um mapa cadastrado com
 *  plataforma que não existe em `ecommerce_orders` nunca casa e nunca reclama.
 *
 *  ⚠️ A PayT só pode entrar AQUI depois da migração
 *  `20260962000000_payt_no_lugar_do_tiktok.sql`, que a acrescenta aos DOIS
 *  CHECKs (`sku_platform_valida` e `ecommerce_orders_platform_check`). Front
 *  aceitando e banco recusando é INSERT falhando calado.
 *
 *  O TikTok Shop saiu da lista (nunca foi integrado; a PayT tomou o lugar dele
 *  nas telas). Ele continua no CHECK do banco de propósito — remover valor de
 *  CHECK quebra a migração se alguma linha histórica ainda o usar, e
 *  `rotuloPlataforma` já degrada para o valor cru. */
export const PLATAFORMAS = [
  { value: "mercadolivre", label: "Mercado Livre" },
  { value: "amazon", label: "Amazon" },
  { value: "nuvemshop", label: "Nuvemshop" },
  { value: "shopee", label: "Shopee" },
  { value: "payt", label: "PayT" },
] as const;

/** Radix Select não aceita `value=""` — sentinela para `platform = null`. */
export const TODAS_AS_PLATAFORMAS = "__todas__";

export const rotuloPlataforma = (p: string | null | undefined) =>
  p == null || p === TODAS_AS_PLATAFORMAS
    ? "Todas as plataformas"
    : (PLATAFORMAS.find((x) => x.value === p)?.label ?? p);

export interface ProdutoAlvo {
  id: string;
  name: string;
  product_code: string;
  stock_unit: string | null;
}

export interface SkuMapeamento {
  id: string;
  platform_sku: string;
  platform: string | null;
  product_id: string;
  unidades_por_venda: number;
  is_active: boolean;
  /** LEGADO — exibido só para conferência; a tela não escreve. */
  units_per_kit: number | null;
  display_units_per_pack: number | null;
  description: string | null;
  updated_at: string | null;
  produto: {
    id: string;
    name: string;
    product_code: string;
    stock_unit: string | null;
    bonificacao_de: string | null;
  } | null;
}

export interface SkuSemMapa {
  platform: string;
  /** ⚠️ `null` = a venda chegou SEM SKU na origem (a Shopee é assim hoje). NÃO é
   *  mapeável por SKU — e é justamente por isso que ela precisa APARECER. */
  product_sku: string | null;
  product_name: string | null;
  linhas: number;
  packs: number;
  ultima_venda: string | null;
}

export interface MapeamentoInput {
  id?: string;
  platform_sku: string;
  /** `null` = vale para todas as plataformas. */
  platform: string | null;
  product_id: string;
  /** Quantos itens do `product_id` saem da prateleira por venda. */
  unidades_por_venda: number;
  /**
   * Quantas unidades o CLIENTE levou por venda. ⚠️ NÃO é o mesmo número: o kit
   * de sachês entrega 10 ao comprador e tira 1 caixa fechada do galpão. É este
   * campo que os painéis de venda contam, e até agora ele não tinha tela —
   * quem operava não conseguia corrigir o número que a diretoria lia.
   */
  display_units_per_pack: number | null;
}

const CHAVE = ["ops", "sku-mapeamento"] as const;

/** O índice único é parcial (`where is_active`) e usa
 *  `coalesce(platform,'__todas__')`. Sem tradução, o usuário recebe o texto do
 *  Postgres com o nome do índice — que não diz o que fazer. */
function traduzErro(e: any): Error {
  const codigo = e?.code ?? "";
  const msg = String(e?.message ?? e ?? "erro desconhecido");
  if (codigo === "23505" || msg.includes("sku_product_mappings_unico")) {
    return new Error(
      "Já existe um mapa ATIVO para esse SKU nessa plataforma. " +
        "Edite o mapa existente ou desative-o antes de criar outro.",
    );
  }
  if (msg.includes("sku_platform_valida")) {
    return new Error("Plataforma inválida — escolha uma da lista.");
  }
  // ⚠️ O CHECK genérico (23514) desta tabela só pode ser o das unidades: o da
  // plataforma já foi tratado acima, pelo NOME da constraint.
  if (codigo === "23514" || msg.includes("sku_unidades_por_venda_check")) {
    return new Error("As unidades por venda têm de ser um número inteiro maior que zero.");
  }
  if (codigo === "42501" || msg.toLowerCase().includes("row-level security")) {
    return new Error("Sem permissão para alterar o mapa (é preciso ser do time interno).");
  }
  return new Error(msg);
}

/** Lista completa do mapa, com o produto de destino já junto. */
export function useSkuMapeamentos() {
  return useQuery({
    queryKey: [...CHAVE, "lista"],
    queryFn: async (): Promise<SkuMapeamento[]> => {
      const { data, error } = await db
        .from("sku_product_mappings")
        .select(
          "id, platform_sku, platform, product_id, unidades_por_venda, is_active, " +
            "units_per_kit, display_units_per_pack, description, updated_at, " +
            "produto:product_id(id, name, product_code, stock_unit, bonificacao_de)",
        )
        .order("is_active", { ascending: false })
        .order("platform_sku", { ascending: true });
      if (error) throw traduzErro(error);
      return ((data ?? []) as any[]).map((m) => ({
        ...m,
        unidades_por_venda: Number(m.unidades_por_venda ?? 1),
      })) as SkuMapeamento[];
    },
  });
}

/** Produtos que podem ser DESTINO do mapa.
 *  ⚠️ `.is("bonificacao_de", null)`: o gêmeo de bonificação não é produto para o
 *  resto do sistema (sem saldo, sem produção, fora do MRP). Um mapa apontando
 *  para ele cairia num SKU que nunca tem estoque. */
export function useProdutosDoMapa() {
  return useQuery({
    queryKey: [...CHAVE, "produtos"],
    queryFn: async (): Promise<ProdutoAlvo[]> => {
      const { data, error } = await db
        .from("mrp_products")
        .select("id, name, product_code, stock_unit")
        .eq("is_active", true)
        .is("bonificacao_de", null)
        .order("product_code");
      if (error) throw traduzErro(error);
      return (data ?? []) as ProdutoAlvo[];
    },
  });
}

/** A LISTA DE TRABALHO: SKU que já vendeu e não tem mapa, por volume.
 *  Mesma consulta da medição (b) da 20260955, feita sobre `carbo_estoque_ensaio`
 *  — a view do ENSAIO, que não escreve estoque nenhum. */
export function useSkusSemMapa() {
  return useQuery({
    queryKey: [...CHAVE, "sem-mapa"],
    queryFn: async (): Promise<SkuSemMapa[]> => {
      const { data, error } = await db
        .from("carbo_estoque_ensaio")
        .select("platform, product_sku, product_name, qtd_vendida, veredito, ordered_at")
        .ilike("veredito", "%SEM MAPEAMENTO%")
        .order("ordered_at", { ascending: false })
        .limit(5000);
      if (error) throw traduzErro(error);

      // ⚠️ Linha SEM `product_sku` NÃO é descartada. Ela era descartada por um
      // `if (!r.product_sku) continue`, e o efeito era o pior possível: a Shopee
      // (3 linhas, todas sem SKU na origem) SUMIA da lista de trabalho. Sumir é
      // pior que aparecer errado — o problema fica invisível, que é exatamente a
      // doença do "SKU sem mapa não erra: ele some". A linha aparece, dizendo
      // que não dá para mapear por SKU, e o botão vem desabilitado.
      //
      // A chave é JSON, não concatenação: `platform` e `product_sku` são texto
      // livre e um separador qualquer pode aparecer dentro deles — e `null`
      // precisa ser uma chave distinta de qualquer string, não virar "null".
      const agg = new Map<string, SkuSemMapa>();
      for (const r of (data ?? []) as any[]) {
        const sku: string | null = r.product_sku ?? null;
        const chave = JSON.stringify([r.platform ?? null, sku]);
        const atual = agg.get(chave);
        const packs = Number(r.qtd_vendida ?? 0);
        if (atual) {
          atual.linhas += 1;
          atual.packs += packs;
          if (!atual.product_name && r.product_name) atual.product_name = r.product_name;
          if (r.ordered_at && (!atual.ultima_venda || r.ordered_at > atual.ultima_venda))
            atual.ultima_venda = r.ordered_at;
        } else {
          agg.set(chave, {
            platform: r.platform,
            product_sku: sku,
            product_name: r.product_name ?? null,
            linhas: 1,
            packs,
            ultima_venda: r.ordered_at ?? null,
          });
        }
      }
      return [...agg.values()].sort((a, b) => b.packs - a.packs || b.linhas - a.linhas);
    },
  });
}

function useInvalida() {
  const qc = useQueryClient();
  // A lista de "sem mapa" muda junto: mapear um SKU tira ele de lá.
  return () => qc.invalidateQueries({ queryKey: CHAVE });
}

/** Cria ou edita. `unidades_por_venda` vai INTEIRO — o CHECK do banco recusa
 *  fracionário, e arredondar em silêncio faria o total deixar de fechar. */
export function useSalvarMapeamento() {
  const invalida = useInvalida();
  return useMutation({
    mutationFn: async (input: MapeamentoInput) => {
      const payload = {
        platform_sku: input.platform_sku.trim(),
        platform: input.platform,
        product_id: input.product_id,
        unidades_por_venda: input.unidades_por_venda,
        // ⚠️ Gravado JUNTO, e de propósito. Deixá-lo de fora fazia a tela
        // salvar metade da verdade: o estoque passava a baixar certo e os
        // painéis continuavam contando o número antigo, sem ninguém perceber.
        display_units_per_pack: input.display_units_per_pack,
        updated_at: new Date().toISOString(),
      };
      const q = input.id
        ? db.from("sku_product_mappings").update(payload).eq("id", input.id)
        : db.from("sku_product_mappings").insert({ ...payload, is_active: true });
      const { error } = await q;
      if (error) throw traduzErro(error);
    },
    onSuccess: invalida,
  });
}

export function useAlternarMapeamento() {
  const invalida = useInvalida();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await db
        .from("sku_product_mappings")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw traduzErro(error);
    },
    onSuccess: invalida,
  });
}

export function useApagarMapeamento() {
  const invalida = useInvalida();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("sku_product_mappings").delete().eq("id", id);
      if (error) throw traduzErro(error);
    },
    onSuccess: invalida,
  });
}

/** O nome do destino tem "kit". ⚠️ Isto SOZINHO não é problema — ver
 *  `kitImplausivel`. Exportado porque é a metade legível da regra. */
export const pareceKit = (p?: { product_code?: string | null; name?: string | null } | null) =>
  !!p && /kit/i.test(`${p.product_code ?? ""} ${p.name ?? ""}`);

/** ⚠️ O aviso de KIT, e é MAIS SUTIL que "destino com nome de kit".
 *
 *  O destino tem de ser o que está FISICAMENTE NA PRATELEIRA, e isso varia por
 *  produto — medido no HUB-SP:
 *
 *    CZ100 (frasco avulso)      saldo 345    kit de 5  → fator 5, destino FRASCO
 *    KIT-CARB-SACH-10ML         saldo 1253   kit de 10 → fator 1, destino KIT
 *    CARB-SACH-10ML (avulso)    saldo ZERO   ← a LogHouse guarda kits FECHADOS
 *
 *  Ou seja: destino ser um kit, com fator 1, está CERTO — é o único cadastro que
 *  funciona para o sachê, porque o avulso não existe na prateleira. Avisar nesse
 *  caso é gritar no caso normal, acusando de erro quem acertou; e aviso que
 *  grita no caso normal é o que ensina a ignorar o aviso que importa.
 *
 *  A combinação implausível é destino-KIT **com fator > 1**: aí sim a venda
 *  baixaria N KITS em vez de N frascos. Só ela avisa. Nunca bloqueia: quem
 *  conhece a prateleira é quem opera. */
export const kitImplausivel = (
  p: { product_code?: string | null; name?: string | null } | null | undefined,
  fator: number,
) => pareceKit(p) && Number.isFinite(fator) && fator > 1;
