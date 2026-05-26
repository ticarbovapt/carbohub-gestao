import { useEffect, useRef, useState } from "react";
import { subDays, startOfMonth, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EcommercePlatform = "mercadolivre" | "amazon" | "tiktok" | "shopee";
export type EcommercePeriod   = "today" | "7d" | "30d" | "month";

export interface CommissionRate {
  id: string;
  platform: EcommercePlatform;
  rate: number;
  valid_from: string;
  created_at: string;
}

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
  netRevenue: number;
  avgTicket: number;
  cancelledOrders: number;
  cancellationRate: number;
  pendingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  commissionTotal: number;
  topProduct: EcommerceProduct | null;
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

function buildMetrics(platform: EcommercePlatform, rows: DBOrder[], rateHistory: CommissionRate[]): EcommerceMetrics {
  if (rows.length === 0) return emptyMetrics(platform);

  const totalOrders    = rows.length;
  const totalRevenue   = rows.reduce((s, r) => s + Number(r.total), 0);
  const totalUnitsSold = rows.reduce((s, r) => s + (r.units_real ?? r.quantity), 0);

  const cancelled  = rows.filter(r => r.status === "cancelled").length;
  const pending    = rows.filter(r => r.status === "pending").length;
  const shipped    = rows.filter(r => r.status === "shipped").length;
  const delivered  = rows.filter(r => r.status === "delivered").length;

  const activeRows       = rows.filter(r => r.status !== "cancelled");
  const netRevenue       = activeRows.reduce((s, r) => s + Number(r.total), 0);
  const cancellationRate = totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0;
  const commissionTotal  = activeRows.reduce((s, r) => {
    const rate = getRateForDate(rateHistory, platform, r.ordered_at);
    return s + Number(r.total) * rate;
  }, 0);

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
    netRevenue:      Math.round(netRevenue * 100) / 100,
    avgTicket:       totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
    cancelledOrders: cancelled,
    cancellationRate: Math.round(cancellationRate * 10) / 10,
    pendingOrders:   pending,
    shippedOrders:   shipped,
    deliveredOrders: delivered,
    commissionTotal: Math.round(commissionTotal * 100) / 100,
    topProduct:      products[0] ?? null,
    avgRating:       null,
    products,
    dailySales,
    isConnected:     true,
  };
}

export const PLATFORM_FEE_DEFAULT: Record<EcommercePlatform, number> = {
  mercadolivre: 0.16,
  amazon:       0.15,
  tiktok:       0.06,
  shopee:       0.12,
};

function getRateForDate(history: CommissionRate[], platform: EcommercePlatform, date: string): number {
  const day = date.slice(0, 10);
  const match = history
    .filter(r => r.valid_from <= day)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
  return match?.rate ?? PLATFORM_FEE_DEFAULT[platform];
}

function emptyMetrics(platform: EcommercePlatform): EcommerceMetrics {
  return {
    platform,
    totalOrders: 0, totalUnitsSold: 0, totalRevenue: 0, netRevenue: 0, avgTicket: 0,
    cancelledOrders: 0, cancellationRate: 0, pendingOrders: 0, shippedOrders: 0, deliveredOrders: 0,
    commissionTotal: 0, topProduct: null,
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

async function isConnectedViaToken(platform: EcommercePlatform): Promise<boolean> {
  const { data } = await supabase
    .from("platform_connection_status" as never)
    .select("is_connected")
    .eq("platform", platform)
    .maybeSingle() as { data: { is_connected: boolean } | null };
  return data?.is_connected === true;
}

async function fetchOrders(platform: EcommercePlatform, period: EcommercePeriod): Promise<EcommerceMetrics> {
  const from = getRangeStart(period).toISOString();

  const [{ data, error }, connected, { data: rateData }] = await Promise.all([
    supabase
      .from("ecommerce_orders" as never)
      .select("id,platform,order_id,product_sku,product_name,quantity,units_real,unit_price,total,status,ordered_at")
      .eq("platform", platform)
      .gte("ordered_at", from),
    isConnectedViaToken(platform),
    supabase
      .from("platform_commission_rates" as never)
      .select("id,platform,rate,valid_from,created_at")
      .eq("platform", platform)
      .order("valid_from", { ascending: false }),
  ]);

  if (error) { console.error("[useDashEcommerce]", error.message); return emptyMetrics(platform); }

  const rows        = (data ?? []) as DBOrder[];
  const rateHistory = (rateData ?? []) as CommissionRate[];

  if (rows.length === 0 && !connected) return emptyMetrics(platform);
  if (rows.length === 0) return { ...emptyMetrics(platform), isConnected: true };

  return { ...buildMetrics(platform, rows, rateHistory), isConnected: connected };
}

const PLATFORM_LABEL: Record<EcommercePlatform, string> = {
  mercadolivre: "Mercado Livre",
  amazon:       "Amazon",
  tiktok:       "TikTok Shop",
  shopee:       "Shopee",
};

export function useDashEcommerce(
  platform: EcommercePlatform,
  period: EcommercePeriod
): { data: EcommerceMetrics; isLoading: boolean } {
  const [data, setData]         = useState<EcommerceMetrics>(emptyMetrics(platform));
  const [isLoading, setLoading] = useState(true);
  const channelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const prevConnected = useRef<boolean | null>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Restore last known state from localStorage to detect disconnects across page refreshes
    const storageKey = `ecommerce_connected_${platform}`;
    prevConnected.current = localStorage.getItem(storageKey) === "true" ? true
                          : localStorage.getItem(storageKey) === "false" ? false
                          : null;
    setLoading(true);

    const load = () =>
      fetchOrders(platform, period).then(async m => {
        if (cancelled) return;
        // Detect disconnection → toast + persistent notification
        if (prevConnected.current === true && !m.isConnected) {
          toast.error(`⚠️ ${PLATFORM_LABEL[platform]} desconectado`, {
            description: "A integração caiu. Reconecte para continuar recebendo pedidos.",
            duration: 10000,
          });
          // Save to notification bell via RPC (bypasses RLS safely)
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await (supabase.rpc as Function)("notify_ecommerce_disconnected", {
              p_user_id:  user.id,
              p_platform: platform,
              p_title:    `⚠️ ${PLATFORM_LABEL[platform]} desconectado`,
              p_body:     "A integração caiu. Acesse Vendas Online e reconecte a plataforma.",
            });
          }
        }
        prevConnected.current = m.isConnected;
        localStorage.setItem(storageKey, String(m.isConnected));
        setData(m);
        setLoading(false);
      });

    load();

    // Poll connection status every 60s — detects drops without page refresh
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(load, 60_000);

    // Real-time: re-fetch on order changes AND token changes
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`ecommerce-rt-${platform}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "ecommerce_orders", filter: `platform=eq.${platform}` },
        () => fetchOrders(platform, period).then(m => { if (!cancelled) { setData(m); } })
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "system_tokens", filter: `id=eq.${platform}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [platform, period]);

  return { data, isLoading };
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission rates hook
// ─────────────────────────────────────────────────────────────────────────────

export function useCommissionRates(platform: EcommercePlatform) {
  const [history, setHistory] = useState<CommissionRate[]>([]);
  const [saving, setSaving]   = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("platform_commission_rates" as never)
      .select("id,platform,rate,valid_from,created_at")
      .eq("platform", platform)
      .order("valid_from", { ascending: false }) as { data: CommissionRate[] | null };
    setHistory(data ?? []);
  };

  useEffect(() => { load(); }, [platform]);

  const saveRate = async (rate: number, validFrom: string) => {
    setSaving(true);
    const { error } = await supabase
      .from("platform_commission_rates" as never)
      .insert({ platform, rate, valid_from: validFrom });
    setSaving(false);
    if (error) { toast.error("Erro ao salvar taxa"); return false; }
    toast.success("Taxa salva com sucesso");
    await load();
    return true;
  };

  const currentRate = history[0]?.rate ?? PLATFORM_FEE_DEFAULT[platform];

  return { history, currentRate, saveRate, saving };
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
          const m = buildMetrics(p, allRows.filter(r => r.platform === p), []);
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

// ─────────────────────────────────────────────────────────────────────────────
// Histórico mensal hook
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthlyMetrics {
  month: string;
  label: string;
  platform: EcommercePlatform;
  totalOrders: number;
  totalRevenue: number;
  totalUnitsSold: number;
  cancelledOrders: number;
  cancellationRate: number;
  avgTicket: number;
}

export function useEcommerceHistoricoMensal(
  platforms: EcommercePlatform[],
  fromMonth: string, // "2025-05"
  toMonth:   string, // "2026-05"
) {
  const [data, setData]         = useState<MonthlyMetrics[]>([]);
  const [isLoading, setLoading] = useState(true);
  const key = `${platforms.join(",")}|${fromMonth}|${toMonth}`;

  useEffect(() => {
    if (!platforms.length) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    const [ty, tm] = toMonth.split("-").map(Number);
    const lastDay  = new Date(ty, tm, 0).getDate();

    supabase
      .from("ecommerce_orders" as never)
      .select("platform,quantity,units_real,total,status,ordered_at")
      .in("platform", platforms)
      .gte("ordered_at", `${fromMonth}-01T00:00:00.000Z`)
      .lte("ordered_at", `${toMonth}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`)
      .limit(100000)
      .then(({ data: rows }) => {
        if (cancelled) return;

        const allRows = (rows ?? []) as DBOrder[];
        const MN = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        const map = new Map<string, MonthlyMetrics>();

        for (const r of allRows) {
          const month = r.ordered_at.slice(0, 7);
          const k     = `${r.platform}__${month}`;

          if (!map.has(k)) {
            const [y, m] = month.split("-");
            map.set(k, {
              month,
              label:           `${MN[parseInt(m) - 1]}/${y.slice(2)}`,
              platform:        r.platform as EcommercePlatform,
              totalOrders:     0, totalRevenue: 0, totalUnitsSold: 0,
              cancelledOrders: 0, cancellationRate: 0, avgTicket: 0,
            });
          }

          const e = map.get(k)!;
          e.totalOrders++;
          e.totalRevenue   += Number(r.total);
          e.totalUnitsSold += r.units_real ?? r.quantity;
          if (r.status === "cancelled") e.cancelledOrders++;
        }

        const result = Array.from(map.values()).map(e => ({
          ...e,
          totalRevenue:     Math.round(e.totalRevenue * 100) / 100,
          cancellationRate: e.totalOrders > 0 ? Math.round((e.cancelledOrders / e.totalOrders) * 1000) / 10 : 0,
          avgTicket:        e.totalOrders > 0 ? Math.round((e.totalRevenue / e.totalOrders) * 100) / 100 : 0,
        })).sort((a, b) => a.month.localeCompare(b.month));

        setData(result);
        setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, isLoading };
}
