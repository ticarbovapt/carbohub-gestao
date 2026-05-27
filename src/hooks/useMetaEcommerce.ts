import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, getDaysInMonth, getDate } from "date-fns";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MetaPlatform = "mercadolivre" | "amazon" | "tiktok" | "shopee" | "vindi" | null;

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
  amazon:       { label: "Amazon",        emoji: "📦", color: "#FF9900" },
  tiktok:       { label: "TikTok Shop",   emoji: "🎵", color: "#FF0050" },
  shopee:       { label: "Shopee",        emoji: "🧡", color: "#EE4D2D" },
  vindi:        { label: "LPs / Assin.",  emoji: "📄", color: "#6366f1" },
};

export const ALL_PLATFORMS: MetaPlatform[] = [
  "mercadolivre", "amazon", "tiktok", "shopee", "vindi",
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
        .neq("status", "cancelled");

      if (ordersError) throw ordersError;

      // Sum per platform
      const platformRevenue: Record<string, number> = {};
      for (const o of orders || []) {
        platformRevenue[o.platform] = (platformRevenue[o.platform] || 0) + Number(o.total || 0);
      }

      // 2. Vindi (LPs / Assinaturas) — paid only
      const { data: vindi, error: vindiError } = await (supabase as any)
        .from("vindi_orders")
        .select("amount, paid_at")
        .gte("paid_at", start)
        .lte("paid_at", end)
        .eq("status", "paid");

      if (vindiError) throw vindiError;

      const vindiRevenue = (vindi || []).reduce(
        (sum: number, v: any) => sum + Number(v.amount || 0),
        0
      );

      platformRevenue["vindi"] = vindiRevenue;

      // Total across all
      const total = Object.values(platformRevenue).reduce((a, b) => a + b, 0);

      return { platformRevenue, total };
    },
    refetchInterval: 30_000, // refresh every 30s for near-real-time
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily revenue breakdown for the current month (chart)
// ─────────────────────────────────────────────────────────────────────────────

export function useMetaDailyActuals(month: Date) {
  const start = startOfMonth(month).toISOString();
  const end   = endOfMonth(month).toISOString();

  return useQuery({
    queryKey: ["meta_ecommerce_daily", start],
    queryFn: async () => {
      const { data: orders, error } = await (supabase as any)
        .from("ecommerce_orders")
        .select("total, ordered_at, platform")
        .gte("ordered_at", start)
        .lte("ordered_at", end)
        .neq("status", "cancelled");

      if (error) throw error;

      const { data: vindi, error: vindiError } = await (supabase as any)
        .from("vindi_orders")
        .select("amount, paid_at")
        .gte("paid_at", start)
        .lte("paid_at", end)
        .eq("status", "paid");

      if (vindiError) throw vindiError;

      // Build day → revenue map
      const dayMap: Record<string, number> = {};
      for (const o of orders || []) {
        const day = o.ordered_at?.slice(0, 10);
        if (day) dayMap[day] = (dayMap[day] || 0) + Number(o.total || 0);
      }
      for (const v of vindi || []) {
        const day = v.paid_at?.slice(0, 10);
        if (day) dayMap[day] = (dayMap[day] || 0) + Number(v.amount || 0);
      }

      // Generate all days of the month up to today
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

  // If no total target is set, derive it from the sum of platform targets
  const totalFromPlatforms = ALL_PLATFORMS.reduce(
    (sum, p) => sum + getTarget(p),
    0
  );
  const totalTarget = getTarget(null) || totalFromPlatforms;
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
// Upsert target mutation
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
      const { data: userData } = await supabase.auth.getUser();
      const monthStr = startOfMonth(month).toISOString().slice(0, 10);

      const { error } = await (supabase as any)
        .from("meta_ecommerce")
        .upsert(
          {
            month: monthStr,
            platform,
            target_amount,
            created_by: userData.user?.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "month,platform" }
        );
      if (error) throw error;
    },
    onSuccess: (_, { month }) => {
      const monthStr = startOfMonth(month).toISOString().slice(0, 10);
      qc.invalidateQueries({ queryKey: ["meta_ecommerce_targets", monthStr] });
      toast.success("Meta salva com sucesso");
    },
    onError: (e: Error) => toast.error("Erro ao salvar meta: " + e.message),
  });
}
