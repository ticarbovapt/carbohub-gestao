import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subDays, startOfMonth, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Meta Ads — o gasto e a conversão que a Meta reporta.
//
// ⚠️ A REGRA QUE MAIS SE ERRA AQUI: métrica derivada NÃO se soma nem se tira
// média. ROAS do mês não é a média dos ROAS diários — é `soma(valor) /
// soma(gasto)`. Um dia com R$ 2 de gasto e uma venda de R$ 200 tem ROAS 100, e
// entrar na média com o mesmo peso de um dia de R$ 5.000 dá um número que não
// existe. Por isso TODA agregação aqui soma os brutos primeiro e só então
// divide — a função `derivar()` é o único lugar que faz essa conta.
//
// A view `meta_ads_diario` já entrega as derivadas por LINHA (dia × anúncio),
// e essas servem só para a linha; qualquer total é recalculado no cliente.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
};

export type MetaPeriod = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

export interface MetaRange { from: string; to: string }
export interface MetaCustom { from?: string; to?: string }

export const PERIOD_LABEL: Record<MetaPeriod, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Mês atual",
  custom: "Personalizado",
};

/** Início e fim do período, em YYYY-MM-DD, ambos INCLUSIVOS. */
export function rangeDoPeriodo(period: MetaPeriod, custom?: MetaCustom): MetaRange {
  const hoje = new Date();
  const f = (d: Date) => format(d, "yyyy-MM-dd");

  switch (period) {
    case "today":     return { from: f(hoje), to: f(hoje) };
    case "yesterday": return { from: f(subDays(hoje, 1)), to: f(subDays(hoje, 1)) };
    case "7d":        return { from: f(subDays(hoje, 6)), to: f(hoje) };
    case "30d":       return { from: f(subDays(hoje, 29)), to: f(hoje) };
    case "month":     return { from: f(startOfMonth(hoje)), to: f(hoje) };
    case "custom":    return { from: custom?.from ?? f(subDays(hoje, 29)), to: custom?.to ?? f(hoje) };
  }
}

// ── Linha crua da view ───────────────────────────────────────────────────────

export interface MetaAdRow {
  dia: string;
  act_id: string;
  conta: string;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string;
  ad_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  reach: number;
  meta_compras: number;
  meta_valor_compras: number;
  moeda: string | null;
  sincronizado_em: string;
}

/** Os brutos que se somam. Tudo o mais é conta. */
interface Brutos {
  spend: number;
  impressions: number;
  link_clicks: number;
  compras: number;
  valor: number;
}

export interface MetaDerivadas extends Brutos {
  /** `null` = denominador zero. NUNCA 0: "sem impressão" não é "CPM de zero". */
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  cpa: number | null;
  roas: number | null;
}

const ZERO: Brutos = { spend: 0, impressions: 0, link_clicks: 0, compras: 0, valor: 0 };

function somar(a: Brutos, r: MetaAdRow): Brutos {
  return {
    spend:       a.spend + Number(r.spend ?? 0),
    impressions: a.impressions + Number(r.impressions ?? 0),
    link_clicks: a.link_clicks + Number(r.link_clicks ?? 0),
    compras:     a.compras + Number(r.meta_compras ?? 0),
    valor:       a.valor + Number(r.meta_valor_compras ?? 0),
  };
}

/**
 * A ÚNICA conta de métrica derivada do módulo.
 *
 * ⚠️ Divisor zero devolve `null`, não `0` nem `Infinity`. A tela mostra "—" e
 * quem lê entende "não dá para calcular"; um `0` no CPA seria lido como
 * "aquisição de graça", que é o oposto do que aconteceu.
 */
function derivar(b: Brutos): MetaDerivadas {
  const div = (n: number, d: number) => (d > 0 ? n / d : null);
  return {
    ...b,
    cpm:  div(b.spend * 1000, b.impressions),
    cpc:  div(b.spend, b.link_clicks),
    ctr:  div(b.link_clicks * 100, b.impressions),
    cpa:  div(b.spend, b.compras),
    roas: div(b.valor, b.spend),
  };
}

// ── A árvore campanha → conjunto → anúncio ───────────────────────────────────

export interface MetaNo extends MetaDerivadas {
  id: string;
  nome: string;
  filhos?: MetaNo[];
}

function agrupar(
  linhas: MetaAdRow[],
  chave: (r: MetaAdRow) => { id: string; nome: string },
  filhosDe?: (linhasDoGrupo: MetaAdRow[]) => MetaNo[],
): MetaNo[] {
  const mapa = new Map<string, { nome: string; linhas: MetaAdRow[] }>();
  for (const r of linhas) {
    const { id, nome } = chave(r);
    const atual = mapa.get(id);
    if (atual) atual.linhas.push(r);
    else mapa.set(id, { nome, linhas: [r] });
  }
  return [...mapa.entries()]
    .map(([id, g]) => ({
      id,
      nome: g.nome,
      ...derivar(g.linhas.reduce(somar, ZERO)),
      filhos: filhosDe ? filhosDe(g.linhas) : undefined,
    }))
    // Maior gasto primeiro: é onde o dinheiro está e onde a decisão acontece.
    .sort((a, b) => b.spend - a.spend);
}

export interface MetaAdsResumo {
  total: MetaDerivadas;
  /** Série diária, em ordem cronológica, para o gráfico. */
  serie: Array<{ dia: string } & MetaDerivadas>;
  /** Campanha → conjunto → anúncio. */
  arvore: MetaNo[];
  moeda: string;
  /** Quando o sync tocou estes dados pela última vez. */
  atualizadoEm: string | null;
  linhas: number;
}

function resumir(linhas: MetaAdRow[]): MetaAdsResumo {
  const serie = agrupar(linhas, (r) => ({ id: r.dia, nome: r.dia }))
    .map((n) => ({ dia: n.id, ...n }))
    .sort((a, b) => a.dia.localeCompare(b.dia));

  const arvore = agrupar(
    linhas,
    (r) => ({ id: r.campaign_id ?? "sem-campanha", nome: r.campaign_name ?? "(sem campanha)" }),
    (daCampanha) => agrupar(
      daCampanha,
      (r) => ({ id: r.adset_id ?? "sem-conjunto", nome: r.adset_name ?? "(sem conjunto)" }),
      (doConjunto) => agrupar(doConjunto, (r) => ({ id: r.ad_id, nome: r.ad_name ?? r.ad_id })),
    ),
  );

  const atualizadoEm = linhas.length
    ? linhas.reduce((max, r) => (r.sincronizado_em > max ? r.sincronizado_em : max), linhas[0].sincronizado_em)
    : null;

  return {
    total: derivar(linhas.reduce(somar, ZERO)),
    serie,
    arvore,
    moeda: linhas.find((r) => r.moeda)?.moeda ?? "BRL",
    atualizadoEm,
    linhas: linhas.length,
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function useMetaAdsContas() {
  return useQuery({
    queryKey: ["meta-ads", "contas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from("meta_ads_accounts")
        .select("act_id, apelido, moeda, ativo")
        .eq("ativo", true)
        .order("apelido", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ act_id: string; apelido: string; moeda: string | null; ativo: boolean }>;
    },
  });
}

export function useMetaAds(period: MetaPeriod, custom?: MetaCustom, actId?: string) {
  const { from, to } = rangeDoPeriodo(period, custom);

  return useQuery({
    queryKey: ["meta-ads", "insights", from, to, actId ?? "todas"],
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<MetaAdsResumo> => {
      let q = db
        .from("meta_ads_diario")
        .select("*")
        .gte("dia", from)
        .lte("dia", to);
      if (actId) q = q.eq("act_id", actId);

      // ⚠️ Teto explícito. O PostgREST corta em 1.000 por padrão e devolve a
      // página SEM avisar — o dashboard mostraria um total silenciosamente
      // menor que o real. 50k cobre ~30 dias de centenas de anúncios; se um dia
      // estourar, o certo é agregar em SQL, não subir este número.
      const { data, error } = await q.order("dia", { ascending: true }).limit(50000);
      if (error) throw error;

      return resumir((data ?? []) as MetaAdRow[]);
    },
  });
}

export interface MetaSyncLog {
  id: number;
  rodou_em: string;
  origem: string;
  act_id: string | null;
  linhas: number;
  ok: boolean;
  erro: string | null;
  duracao_ms: number | null;
}

export function useMetaAdsUltimoSync() {
  return useQuery({
    queryKey: ["meta-ads", "ultimo-sync"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from("meta_ads_sync_log")
        .select("*")
        .order("rodou_em", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as MetaSyncLog[];
    },
  });
}

/**
 * Dispara o sync na hora, com o JWT de quem clicou.
 *
 * ⚠️ 30 dias por padrão, e não "só hoje": a Meta ainda vai atribuir compras aos
 * cliques dos últimos 7 dias, então reler a janela é o que corrige o passado
 * recente. Ver o comentário da migração 20260970.
 */
export interface MetaSyncResultado { linhas?: number; contas?: number; aviso?: string }

export function useMetaAdsSync() {
  const qc = useQueryClient();
  // ⚠️ Genéricos explícitos. Sem eles o TanStack infere `TVariables = void` a
  // partir do parâmetro com default e `mutate(30)` vira erro de tipo — a
  // janela de dias precisa ser dito na chamada, não adivinhada aqui.
  return useMutation<MetaSyncResultado, Error, number>({
    mutationFn: async (dias: number) => {
      const { data, error } = await supabase.functions.invoke("meta-ads-sync", {
        body: { dias, source: "manual" },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error ?? "Falha no sync");
      return data as MetaSyncResultado;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["meta-ads"] });
      if (data?.aviso) toast.warning(data.aviso);
      else toast.success(`Meta Ads atualizado — ${data?.linhas ?? 0} linha(s) de ${data?.contas ?? 0} conta(s).`);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível sincronizar com a Meta.");
    },
  });
}

// ── Formatação (a tela inteira usa estas, para não divergir) ─────────────────

export const fmtMoeda = (v: number | null, moeda = "BRL") =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: moeda });

export const fmtNum = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export const fmtPct = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export const fmtRoas = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
