import { useEffect, useRef, useState } from "react";
import { subDays, startOfMonth, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EcommercePlatform = "mercadolivre" | "amazon" | "tiktok" | "shopee";
export type EcommercePeriod   = "today" | "7d" | "30d" | "month";

export interface EcommerceProduct {
  id: string;
  name: string;
  sku: string;
  units_per_pack: number;
  orders: number;
  units_sold: number;
  revenue: number;
}

export interface EcommerceDailySale {
  date: string;
  label: string;
  orders: number;
  units: number;
  revenue: number;
}

export interface EcommerceMetrics {
  platform: EcommercePlatform;
  totalOrders: number;
  totalUnitsSold: number;
  totalRevenue: number;
  avgTicket: number;
  cancelledOrders: number;
  pendingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  avgRating: number | null;
  products: EcommerceProduct[];
  dailySales: EcommerceDailySale[];
  isConnected: boolean;
}

export interface ComparativoMetrics {
  platform: EcommercePlatform;
  totalOrders: number;
  totalUnitsSold: number;
  totalRevenue: number;
  avgTicket: number;
  cancelledOrders: number;
  dailySales: EcommerceDailySale[];
}

// Path 1 — raw DB aggregation (no business logic transformation)
export interface RawCheckMetrics {
  totalOrders: number;
  totalQuantity: number;
  totalUnitsReal: number;
  totalRevenue: number;
  cancelledOrders: number;
  pendingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getRangeStart(period: EcommercePeriod): Date {
  const today = startOfDay(new Date());
  switch (period) {
    case "today": return today;
    case "7d":    return subDays(today, 6);
    case "month": return startOfMonth(today);
    default:      return subDays(today, 29);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB row type (what comes from ecommerce_orders)
// ─────────────────────────────────────────────────────────────────────────────

interface DBOrder {
  id: string;
  platform: string;
  order_id: string;
  product_sku: string | null;
  product_name: string | null;
  quantity: number;
  units_real: number;
  unit_price: number;
  total: number;
  status: string;
  ordered_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// System-logic aggregator (Path 2)
// ─────────────────────────────────────────────────────────────────────────────

function buildMetrics(platform: EcommercePlatform, rows: DBOrder[]): EcommerceMetrics {
  if (rows.length === 0) return emptyMetrics(platform);

  const totalOrders    = rows.length;
  const totalRevenue   = rows.reduce((s, r) => s + Number(r.total), 0);
  const totalUnitsSold = rows.reduce((s, r) => s + (r.units_real ?? r.quantity), 0);

  const cancelled  = rows.filter(r => r.status === "cancelled").length;
  const pending    = rows.filter(r => r.status === "pending").length;
  const shipped    = rows.filter(r => r.status === "shipped").length;
  const delivered  = rows.filter(r => r.status === "delivered").length;

  // Group by product SKU
  const skuMap = new Map<string, { name: string; orders: number; units: number; revenue: number }>();
  for (const r of rows) {
    const key  = r.product_sku ?? r.product_name ?? "Sem SKU";
    const name = r.product_name ?? r.product_sku ?? "Produto desconhecido";
    const prev = skuMap.get(key) ?? { name, orders: 0, units: 0, revenue: 0 };
    skuMap.set(key, {
      name,
      orders:  prev.orders  + 1,
      units:   prev.units   + (r.units_real ?? r.quantity),
      revenue: prev.revenue + Number(r.total),
    });
  }

  const products: EcommerceProduct[] = Array.from(skuMap.entries()).map(([sku, v], i) => ({
    id:           `p-${i}`,
    name:         v.name,
    sku,
    units_per_pack: v.orders > 0 ? Math.round(v.units / v.orders) : 1,
    orders:       v.orders,
    units_sold:   v.units,
    revenue:      Math.round(v.revenue * 100) / 100,
  })).sort((a, b) => b.revenue - a.revenue);

  // Group by day
  const dayMap = new Map<string, { orders: number; units: number; revenue: number }>();
  for (const r of rows) {
    const day = r.ordered_at.slice(0, 10);
    const prev = dayMap.get(day) ?? { orders: 0, units: 0, revenue: 0 };
    dayMap.set(day, {
      orders:  prev.orders  + 1,
      units:   prev.units   + (r.units_real ?? r.quantity),
      revenue: prev.revenue + Number(r.total),
    });
  }

  const dailySales: EcommerceDailySale[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      label:   format(new Date(date + "T12:00:00"), "dd/MM", { locale: ptBR }),
      orders:  v.orders,
      units:   v.units,
      revenue: Math.round(v.revenue * 100) / 100,
    }));

  return {
    platform,
    totalOrders,
    totalUnitsSold,
    totalRevenue:    Math.round(totalRevenue * 100) / 100,
    avgTicket:       totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
    cancelledOrders: cancelled,
    pendingOrders:   pending,
    shippedOrders:   shipped,
    deliveredOrders: delivered,
    avgRating:       null,
    products,
    dailySales,
    isConnected:     true,
  };
}

function emptyMetrics(platform: EcommercePlatform): EcommerceMetrics {
  return {
    platform,
    totalOrders: 0, totalUnitsSold: 0, totalRevenue: 0, avgTicket: 0,
    cancelledOrders: 0, pendingOrders: 0, shippedOrders: 0, deliveredOrders: 0,
    avgRating: null, products: [], dailySales: [],
    isConnected: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH 1 — Raw check hook (simple DB aggregation, no business logic)
// ─────────────────────────────────────────────────────────────────────────────

export function useEcommerceRawCheck(
  platform: EcommercePlatform,
  period: EcommercePeriod
): RawCheckMetrics | null {
  const [data, setData] = useState<RawCheckMetrics | null>(null);

  useEffect(() => {
    const from = getRangeStart(period).toISOString().slice(0, 10);

    supabase
      .from("ecommerce_raw_summary" as never)
      .select("*")
      .eq("platform", platform)
      .gte("day", from)
      .then(({ data: rows, error }) => {
        if (error || !rows?.length) { setData(null); return; }
        const r = rows as Record<string, number>[];
        setData({
          totalOrders:     r.reduce((s, x) => s + (x.total_orders   ?? 0), 0),
          totalQuantity:   r.reduce((s, x) => s + (x.total_quantity  ?? 0), 0),
          totalUnitsReal:  r.reduce((s, x) => s + (x.total_units_real ?? 0), 0),
          totalRevenue:    r.reduce((s, x) => s + Number(x.total_revenue  ?? 0), 0),
          cancelledOrders: r.reduce((s, x) => s + (x.cancelled_orders ?? 0), 0),
          pendingOrders:   r.reduce((s, x) => s + (x.pending_orders  ?? 0), 0),
          shippedOrders:   r.reduce((s, x) => s + (x.shipped_orders  ?? 0), 0),
          deliveredOrders: r.reduce((s, x) => s + (x.delivered_orders ?? 0), 0),
        });
      });
  }, [platform, period]);

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH 2 — System hook (full business logic + real-time)
// ─────────────────────────────────────────────────────────────────────────────

// Platforms that use OAuth token stored in system_tokens
const TOKEN_PLATFORMS: Partial<Record<EcommercePlatform, string>> = {
  mercadolivre: "mercadolivre",
};

async function isConnectedViaToken(platform: EcommercePlatform): Promise<boolean> {
  const tokenId = TOKEN_PLATFORMS[platform];
  if (!tokenId) return false;
  const { data } = await supabase
    .from("system_tokens" as never)
    .select("access_token,expires_at")
    .eq("id", tokenId)
    .maybeSingle() as { data: { access_token: string; expires_at: string } | null };
  if (!data?.access_token) return false;
  // Consider connected if token isn't expired yet (cron renews before expiry)
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  return true;
}

async function fetchOrders(platform: EcommercePlatform, period: EcommercePeriod): Promise<EcommerceMetrics> {
  const from = getRangeStart(period).toISOString();

  const [{ data, error }, connected] = await Promise.all([
    supabase
      .from("ecommerce_orders" as never)
      .select("id,platform,order_id,product_sku,product_name,quantity,units_real,unit_price,total,status,ordered_at")
      .eq("platform", platform)
      .gte("ordered_at", from),
    isConnectedViaToken(platform),
  ]);

  if (error) { console.error("[useDashEcommerce]", error.message); return emptyMetrics(platform); }

  const rows = (data ?? []) as DBOrder[];
  if (rows.length === 0 && !connected) return emptyMetrics(platform);

  // Connected but no orders yet in this period → return zeros with isConnected: true
  if (rows.length === 0) return { ...emptyMetrics(platform), isConnected: true };

  return buildMetrics(platform, rows);
}

export function useDashEcommerce(
  platform: EcommercePlatform,
  period: EcommercePeriod
): { data: EcommerceMetrics; isLoading: boolean } {
  const [data, setData]         = useState<EcommerceMetrics>(emptyMetrics(platform));
  const [isLoading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchOrders(platform, period).then(m => {
      if (!cancelled) { setData(m); setLoading(false); }
    });

    // Real-time: re-fetch whenever a row for this platform changes
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`ecommerce-rt-${platform}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "ecommerce_orders", filter: `platform=eq.${platform}` },
        () => { fetchOrders(platform, period).then(m => { if (!cancelled) setData(m); }); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [platform, period]);

  return { data, isLoading };
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparativo hook
// ─────────────────────────────────────────────────────────────────────────────

export function useEcommerceComparativo(
  platforms: EcommercePlatform[],
  period: EcommercePeriod
): { data: ComparativoMetrics[]; isLoading: boolean } {
  const [data, setData]         = useState<ComparativoMetrics[]>([]);
  const [isLoading, setLoading] = useState(true);
  const platformsKey = platforms.join(",");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const from = getRangeStart(period).toISOString();

    supabase
      .from("ecommerce_orders" as never)
      .select("platform,order_id,quantity,units_real,total,status,ordered_at")
      .in("platform", platforms)
      .gte("ordered_at", from)
      .then(({ data: rows }) => {
        if (cancelled) return;
        const allRows = (rows ?? []) as DBOrder[];
        const result: ComparativoMetrics[] = platforms.map(p => {
          const m = buildMetrics(p, allRows.filter(r => r.platform === p));
          return {
            platform:        m.platform,
            totalOrders:     m.totalOrders,
            totalUnitsSold:  m.totalUnitsSold,
            totalRevenue:    m.totalRevenue,
            avgTicket:       m.avgTicket,
            cancelledOrders: m.cancelledOrders,
            dailySales:      m.dailySales,
          };
        });
        setData(result);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformsKey, period]);

  return { data, isLoading };
}
