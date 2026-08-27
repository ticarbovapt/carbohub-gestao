import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, getDaysInMonth, getDate, format } from "date-fns";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Dia e mês são os de QUEM VENDE, não os de UTC
// ─────────────────────────────────────────────────────────────────────────────
//
// `ordered_at` é timestamptz e chega como ISO em UTC. Fatiar a string
// (`slice(0, 10)`, `slice(0, 7)`) devolve a data UTC: venda das 21h de Brasília
// é 00h UTC do dia seguinte. Num gráfico diário isso troca o dia; na virada do
// mês, joga o faturamento do dia 31 para o mês seguinte — e a meta do mês fecha
// errada nas duas pontas.
//
// Mesma correção já feita em useDashEcommerce.ts. Ver CLAUDE.md.
const diaLocal = (iso: string | null | undefined): string | null =>
  iso ? format(new Date(iso), "yyyy-MM-dd") : null;
const mesLocal = (iso: string | null | undefined): string | null =>
  iso ? format(new Date(iso), "yyyy-MM") : null;

// Lista BRANCA de faturamento — espelha public.ecommerce_status_e_venda() e o
// useDashEcommerce. Era lista negra (`status != 'cancelled'`), que punha pedido
// PENDENTE — dinheiro que ainda não entrou — dentro do realizado da meta.
// Status novo de plataforma nova fica de fora até alguém decidir que é venda.
const VENDA_STATUSES = ["paid", "shipped", "delivered"];


// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MetaPlatform = "mercadolivre" | "nuvemshop" | "amazon" | "shopee" | null;

export interface MetaEcommerce {
  id: string;
  month: string;
  platform: MetaPlatform;
  target_amount: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformMetaStats {
  platform: MetaPlatform;
  label: string;
  emoji: string;
  color: string;
  target: number;
  actual: number;
  actualPct: number;
  expectedPct: number;
  projectedEOM: number;         // projeção fim do mês
  progressColor: "green" | "yellow" | "red" | "gray";
  remaining: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_META: Record<
  string,
  { label: string; emoji: string; color: string }
> = {
  mercadolivre: { label: "Mercado Livre", emoji: "🛒", color: "#FFD700" },
  nuvemshop:    { label: "Nuvemshop",     emoji: "🛍️", color: "#2D9CDB" },
  amazon:       { label: "Amazon",        emoji: "📦", color: "#FF9900" },
  // ⚠️ Mesmo emoji e mesmo hex da tela de Vendas Online
  // (EcommerceVendas.tsx). Duas telas do mesmo sistema com cores
  // diferentes para a mesma marca é a divergência silenciosa que este
  // repo já pagou no quotePdf.ts do mkt.
  shopee:       { label: "Shopee",        emoji: "🧡", color: "#EE4D2D" },
};

// Os canais reais de venda online, na mesma ordem da tela Vendas Online.
// ⚠️ Esta é a ÚNICA lista. Havia uma segunda escrita à mão no cálculo do
// total do mês, e as duas já estavam prestes a divergir: a Shopee entraria
// numa e não na outra, e o card do topo mostraria menos que os gráficos —
// sem erro em lugar nenhum.
export const ALL_PLATFORMS: MetaPlatform[] = [
  "mercadolivre", "nuvemshop", "amazon", "shopee",
];

// ─────────────────────────────────────────────────────────────────────────────
// Smart color helper
// actualPct vs expectedPct with ±15% yellow band
// ─────────────────────────────────────────────────────────────────────────────

export function getProgressColor(
  actual: number,
  target: number,
  dayOfMonth: number,
  daysInMonth: number
): "green" | "yellow" | "red" | "gray" {
  if (target === 0) return "gray";
  const actualPct = (actual / target) * 100;
  const expectedPct = (dayOfMonth / daysInMonth) * 100;
  if (actualPct >= expectedPct) return "green";
  if (actualPct >= expectedPct - 15) return "yellow";
  return "red";
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch saved targets for a given month
// ─────────────────────────────────────────────────────────────────────────────

export function useMetaTargets(month: Date) {
  const monthStr = startOfMonth(month).toISOString().slice(0, 10);

  return useQuery({
    queryKey: ["meta_ecommerce_targets", monthStr],
    queryFn: async (): Promise<MetaEcommerce[]> => {
      const { data, error } = await (supabase as any)
        .from("meta_ecommerce")
        .select("*")
        .eq("month", monthStr);
      if (error) throw error;
      return data || [];
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch actual ecommerce revenue for a given month (by platform + vindi)
// ─────────────────────────────────────────────────────────────────────────────

export function useMetaActuals(month: Date) {
  const start = startOfMonth(month).toISOString();
  const end   = endOfMonth(month).toISOString();

  return useQuery({
    queryKey: ["meta_ecommerce_actuals", start],
    queryFn: async () => {
      // 1. Marketplace orders (grouped by platform)
      const { data: orders, error: ordersError } = await (supabase as any)
        .from("ecommerce_orders")
        .select("platform, total, ordered_at, status")
        .gte("ordered_at", start)
        .lte("ordered_at", end)
        .in("status", VENDA_STATUSES);

      if (ordersError) throw ordersError;

      // Sum per platform
      const platformRevenue: Record<string, number> = {};
      for (const o of orders || []) {
        platformRevenue[o.platform] = (platformRevenue[o.platform] || 0) + Number(o.total || 0);
      }

      // Total = soma dos canais reais, lida de ALL_PLATFORMS.
      // ⚠️ Era uma lista literal aqui, ao lado de ALL_PLATFORMS. Acrescentar
      // canal num lugar e esquecer o outro fazia a META somar a plataforma
      // nova e o REALIZADO não — o percentual mentiria sem nada quebrar.
      const total = (ALL_PLATFORMS.filter(Boolean) as string[]).reduce(
        (a, p) => a + (platformRevenue[p] || 0),
        0
      );

      return { platformRevenue, total };
    },
    refetchInterval: 30_000, // refresh every 30s for near-real-time
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily revenue breakdown for the current month (chart)
// ─────────────────────────────────────────────────────────────────────────────

// platform = null → total dos 3 canais (ML + Nuvemshop + Amazon)
// platform = "mercadolivre" | "nuvemshop" | "amazon" → filtra ecommerce_orders
export function useMetaDailyActuals(month: Date, platform: MetaPlatform = null) {
  const start = startOfMonth(month).toISOString();
  const end   = endOfMonth(month).toISOString();

  return useQuery({
    queryKey: ["meta_ecommerce_daily", start, platform ?? "all"],
    queryFn: async () => {
      const dayMap: Record<string, number> = {};

      // ecommerce_orders, com filtro opcional de plataforma (null = os 3 canais).
      let query = (supabase as any)
        .from("ecommerce_orders")
        .select("total, ordered_at, platform")
        .gte("ordered_at", start)
        .lte("ordered_at", end)
        .in("status", VENDA_STATUSES);

      // ⚠️ `null` = Total, e Total é a soma dos canais REAIS — não "tudo que
      // houver na tabela". Sem o `.in`, um canal fora da lista (TikTok, ou um
      // valor gravado por engano) entraria no gráfico Total e não no card do
      // topo, e os dois números do mesmo mês discordariam.
      query = platform !== null
        ? query.eq("platform", platform)
        : query.in("platform", ALL_PLATFORMS.filter(Boolean) as string[]);

      const { data: orders, error } = await query;
      if (error) throw error;
      for (const o of orders || []) {
        const day = diaLocal(o.ordered_at);
        if (day) dayMap[day] = (dayMap[day] || 0) + Number(o.total || 0);
      }

      // Gera todos os dias do mês até hoje
      const today = new Date();
      const daysInMonth = getDaysInMonth(month);
      const isCurrentMonth =
        month.getFullYear() === today.getFullYear() &&
        month.getMonth() === today.getMonth();
      const maxDay = isCurrentMonth ? getDate(today) : daysInMonth;

      const result = [];
      for (let d = 1; d <= maxDay; d++) {
        const dayStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        result.push({ day: d, date: dayStr, revenue: dayMap[dayStr] || 0 });
      }

      return result;
    },
    refetchInterval: 30_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Composed: targets + actuals → PlatformMetaStats[]
// ─────────────────────────────────────────────────────────────────────────────

export function useMetaStats(month: Date): {
  totalStats: PlatformMetaStats;
  platformStats: PlatformMetaStats[];
  isLoading: boolean;
} {
  const { data: targets, isLoading: loadingTargets } = useMetaTargets(month);
  const { data: actuals, isLoading: loadingActuals } = useMetaActuals(month);

  const today     = new Date();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth();
  const dayOfMonth  = isCurrentMonth ? getDate(today) : getDaysInMonth(month);
  const daysInMonth = getDaysInMonth(month);

  const getTarget = (platform: MetaPlatform): number => {
    const t = (targets || []).find(
      (t) => t.platform === platform
    );
    return t ? Number(t.target_amount) : 0;
  };

  const getActual = (platform: MetaPlatform): number => {
    if (!actuals) return 0;
    if (platform === null) return actuals.total;
    return actuals.platformRevenue[platform as string] || 0;
  };

  const buildStats = (platform: MetaPlatform): PlatformMetaStats => {
    const meta = platform ? PLATFORM_META[platform] : { label: "Total Geral", emoji: "🎯", color: "#22c55e" };
    const target = getTarget(platform);
    const actual = getActual(platform);
    const actualPct = target > 0 ? (actual / target) * 100 : 0;
    const expectedPct = (dayOfMonth / daysInMonth) * 100;
    const projectedEOM = dayOfMonth > 0 ? (actual / dayOfMonth) * daysInMonth : 0;
    const progressColor = getProgressColor(actual, target, dayOfMonth, daysInMonth);

    return {
      platform,
      label: meta.label,
      emoji: meta.emoji,
      color: meta.color,
      target,
      actual,
      actualPct,
      expectedPct,
      projectedEOM,
      progressColor,
      remaining: Math.max(0, target - actual),
    };
  };

  // ⚠️ O Total Geral É a soma das metas por plataforma. Não existe meta total
  // separada.
  //
  // Antes era `getTarget(null) || totalFromPlatforms` — a linha gravada com
  // `platform IS NULL` VENCIA a soma. Dava para definir 15k + 80k + 5k por
  // canal e uma meta geral de 200k, e a tela mostrava 200k: um número que
  // ninguém tinha como bater e que não correspondia a pedido nenhum feito aos
  // canais. Hoje elas coincidem por coincidência, não por regra.
  //
  // Derivar elimina a possibilidade de discordarem. Quem quer subir a meta
  // geral sobe a de algum canal — que é a decisão que alguém precisa tomar de
  // qualquer forma.
  const totalFromPlatforms = ALL_PLATFORMS.reduce(
    (sum, p) => sum + getTarget(p),
    0
  );
  // ⚠️ A soma VENCE; a linha legada `platform IS NULL` cobre o mês que nunca
  // teve meta por canal. Sem essa reserva, um mês antigo em que só existia meta
  // total passaria a exibir R$ 0 — e com meta zero o mês inteiro vira "sem meta
  // definida", tendo batido 120%. Reescrever o passado não estava no pedido.
  const totalTarget = totalFromPlatforms || getTarget(null);
  const totalActual = getActual(null);
  const actualPctTotal = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
  const projectedEOMTotal = dayOfMonth > 0 ? (totalActual / dayOfMonth) * daysInMonth : 0;

  const totalStats: PlatformMetaStats = {
    platform: null,
    label: "Total Geral",
    emoji: "🎯",
    color: "#22c55e",
    target: totalTarget,
    actual: totalActual,
    actualPct: actualPctTotal,
    expectedPct: (dayOfMonth / daysInMonth) * 100,
    projectedEOM: projectedEOMTotal,
    progressColor: getProgressColor(totalActual, totalTarget, dayOfMonth, daysInMonth),
    remaining: Math.max(0, totalTarget - totalActual),
  };

  const platformStats = ALL_PLATFORMS.map(buildStats);

  return {
    totalStats,
    platformStats,
    isLoading: loadingTargets || loadingActuals,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Historical monthly totals (all available data, per platform or total)
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthlyHistoryEntry {
  month: string;   // "2025-04"
  label: string;   // "abr/25"
  revenue: number;
  target: number;
}

export function useMetaMonthlyHistory(platform: MetaPlatform = null) {
  return useQuery({
    queryKey: ["meta_ecommerce_history", platform ?? "all"],
    queryFn: async () => {
      const dayMap: Record<string, number> = {};

      // Histórico dos 3 canais (ecommerce_orders); null = total dos 3.
      let query = (supabase as any)
        .from("ecommerce_orders")
        .select("total, ordered_at")
        .in("status", VENDA_STATUSES)
        .not("ordered_at", "is", null);
      if (platform !== null) query = query.eq("platform", platform);
      const { data, error } = await query;
      if (error) throw error;
      for (const o of data || []) {
        const m = mesLocal(o.ordered_at);
        if (m) dayMap[m] = (dayMap[m] || 0) + Number(o.total || 0);
      }

      // Busca as metas. ⚠️ No Total, SOMA as plataformas — e usa a linha
      // `platform IS NULL` só como reserva.
      //
      // A linha nula é LEGADO: de meses em que só existia meta total. Ignorá-la
      // apagaria a linha tracejada de meta do gráfico Histórico naqueles meses,
      // desenhando um degrau para zero que lê como "a meta despencou".
      //
      // A precedência é o inverso da regra antiga: a soma vence quando existe,
      // o gravado cobre o mês que nunca teve meta por canal. Assim o histórico
      // continua contando a verdade de cada mês, e nada é apagado.
      let targetsQuery = (supabase as any)
        .from("meta_ecommerce")
        .select("month, platform, target_amount");
      if (platform !== null) targetsQuery = targetsQuery.eq("platform", platform);
      const { data: targets } = await targetsQuery;

      const targetMap: Record<string, number> = {};
      if (platform !== null) {
        for (const t of targets || []) {
          const m = t.month?.slice(0, 7);
          if (m) targetMap[m] = Number(t.target_amount || 0);
        }
      } else {
        const soma: Record<string, number> = {};
        const legado: Record<string, number> = {};
        const reais = new Set(ALL_PLATFORMS.filter(Boolean) as string[]);
        for (const t of targets || []) {
          const m = t.month?.slice(0, 7);
          if (!m) continue;
          if (t.platform == null) legado[m] = Number(t.target_amount || 0);
          // ⚠️ Só canais REAIS entram na soma: meta gravada para um canal fora
          // da lista não pode inflar o total do mês.
          else if (reais.has(String(t.platform))) {
            soma[m] = (soma[m] || 0) + Number(t.target_amount || 0);
          }
        }
        for (const m of new Set([...Object.keys(soma), ...Object.keys(legado)])) {
          targetMap[m] = soma[m] || legado[m] || 0;
        }
      }

      const monthLabel = (m: string) => {
        const [y, mo] = m.split("-");
        return new Date(Number(y), Number(mo) - 1, 1)
          .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
          .replace(".", "");
      };

      return Object.entries(dayMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, revenue]) => ({
          month,
          label: monthLabel(month),
          revenue,
          target: targetMap[month] || 0,
        })) as MonthlyHistoryEntry[];
    },
    staleTime: 5 * 60 * 1000, // 5 min — histórico muda pouco
  });
}
// ─────────────────────────────────────────────────────────────────────────────

export function useUpsertMetaTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      month,
      platform,
      target_amount,
    }: {
      month: Date;
      platform: MetaPlatform;
      target_amount: number;
    }) => {
      // ⚠️ A meta TOTAL não se grava mais — ela é derivada da soma.
      //
      // O caminho continuava aberto sem chamador na tela do admin, e há OUTRA
      // tela (a da raiz/controle) que ainda o chama. Campo que aceita, salva,
      // dá toast de sucesso e não muda nada é a pior forma de erro: quem usou
      // acredita que definiu a meta.
      //
      // A recusa mora aqui, na entrada da mutation, e não em cada tela — pelo
      // mesmo motivo que a regra de estoque mora na RPC e não no /vender, que
      // existe em seis cópias.
      if (platform === null) {
        throw new Error(
          "A meta total é a soma das metas por plataforma — grave por plataforma.",
        );
      }
      const { data: userData } = await supabase.auth.getUser();
      const monthStr = startOfMonth(month).toISOString().slice(0, 10);
      const now = new Date().toISOString();

      // Upsert manual: não usar onConflict com platform porque NULL != NULL
      // no PostgreSQL — a constraint nunca dispara para platform IS NULL.
      // Usa limit(1) em vez de maybeSingle() para não lançar erro se houver
      // duplicatas legadas (criadas antes do fix do índice).
      let selectQuery = (supabase as any)
        .from("meta_ecommerce")
        .select("id")
        .eq("month", monthStr);

      selectQuery = platform === null
        ? selectQuery.is("platform", null)
        : selectQuery.eq("platform", platform);

      const { data: rows } = await selectQuery.limit(1);
      const existing = Array.isArray(rows) ? rows[0] : null;

      if (existing?.id) {
        const { error } = await (supabase as any)
          .from("meta_ecommerce")
          .update({ target_amount, updated_at: now })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("meta_ecommerce")
          .insert({
            month: monthStr,
            platform,
            target_amount,
            created_by: userData.user?.id,
            updated_at: now,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, { month }) => {
      const monthStr = startOfMonth(month).toISOString().slice(0, 10);
      qc.invalidateQueries({ queryKey: ["meta_ecommerce_targets", monthStr] });
      toast.success("Meta salva com sucesso");
    },
    onError: (e: Error) => toast.error("Erro ao salvar meta: " + e.message),
  });
}
