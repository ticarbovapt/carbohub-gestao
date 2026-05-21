import { useMemo } from "react";
import { subDays, format, startOfDay, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EcommercePlatform = "mercadolivre" | "amazon" | "tiktok" | "shopee";
export type EcommercePeriod   = "today" | "7d" | "30d" | "month";

export interface EcommerceProduct {
  id: string;
  name: string;
  sku: string;
  /** How many real units are dispatched per order (pack multiplier). Configurable later. */
  units_per_pack: number;
  orders: number;
  units_sold: number; // orders × units_per_pack
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
  /** false = awaiting API integration; mock data shown */
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

// ─────────────────────────────────────────────────────────────────────────────
// Mock data generators
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTS_TEMPLATE: Omit<EcommerceProduct, "orders" | "units_sold" | "revenue">[] = [
  { id: "p1", name: "CarboPRO 100ml",       sku: "SKU-CP100",  units_per_pack: 10 },
  { id: "p2", name: "CarboZé 100ml",        sku: "SKU-CZ100",  units_per_pack: 10 },
  { id: "p3", name: "CarboPRO Pack 5un",    sku: "SKU-CP100-5", units_per_pack: 5 },
  { id: "p4", name: "CarboVapt 70ml",       sku: "SKU-VAPT70", units_per_pack: 10 },
  { id: "p5", name: "Kit Iniciante",        sku: "KIT-INIT",   units_per_pack: 1  },
];

/** Generates a deterministic but varied daily series for mock display */
function generateDailySales(
  days: number,
  baseOrders: number,
  baseRevenue: number,
  seed: number
): EcommerceDailySale[] {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, i) => {
    const d     = subDays(today, days - 1 - i);
    const noise = Math.sin(i * seed + seed) * 0.3 + 1; // ±30% variation
    const orders  = Math.max(0, Math.round(baseOrders  * noise));
    const units   = orders * 8; // avg 8 units per order
    const revenue = Math.round(baseRevenue * noise * 100) / 100;
    return {
      date:    d.toISOString(),
      label:   format(d, "dd/MM", { locale: ptBR }),
      orders,
      units,
      revenue,
    };
  });
}

function mockMetrics(
  platform: EcommercePlatform,
  days: number,
  baseOrders: number,
  baseRevenue: number,
  seed: number
): EcommerceMetrics {
  const daily = generateDailySales(days, baseOrders, baseRevenue, seed);
  const totalOrders   = daily.reduce((s, d) => s + d.orders,  0);
  const totalRevenue  = daily.reduce((s, d) => s + d.revenue, 0);
  const totalUnits    = daily.reduce((s, d) => s + d.units,   0);
  const cancelled     = Math.round(totalOrders * 0.04);
  const pending       = Math.round(totalOrders * 0.08);
  const shipped       = Math.round(totalOrders * 0.18);
  const delivered     = totalOrders - cancelled - pending - shipped;

  const products: EcommerceProduct[] = PRODUCTS_TEMPLATE.map((p, idx) => {
    const share  = [0.35, 0.28, 0.17, 0.12, 0.08][idx] ?? 0.05;
    const orders = Math.round(totalOrders * share);
    return {
      ...p,
      orders,
      units_sold: orders * p.units_per_pack,
      revenue:   Math.round(orders * (totalRevenue / totalOrders) * 100) / 100,
    };
  });

  return {
    platform,
    totalOrders,
    totalUnitsSold: totalUnits,
    totalRevenue:   Math.round(totalRevenue * 100) / 100,
    avgTicket:      totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
    cancelledOrders: cancelled,
    pendingOrders:   pending,
    shippedOrders:   shipped,
    deliveredOrders: delivered,
    avgRating:       3.8 + seed * 0.3,
    products,
    dailySales:      daily,
    isConnected:     false, // ← flip to true when real API is wired
  };
}

function getDays(period: EcommercePeriod): number {
  switch (period) {
    case "today":  return 1;
    case "7d":     return 7;
    case "month":  return new Date().getDate(); // days elapsed this month
    default:       return 30;
  }
}

// Per-platform mock baselines (orders/day, revenue/day, seed)
const PLATFORM_BASELINES: Record<EcommercePlatform, [number, number, number]> = {
  mercadolivre: [22, 1540, 1.1],
  amazon:       [14,  980, 1.7],
  tiktok:       [ 9,  630, 2.3],
  shopee:       [18, 1260, 0.9],
};

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useDashEcommerce(
  platform: EcommercePlatform,
  period: EcommercePeriod
): { data: EcommerceMetrics; isLoading: false } {
  const data = useMemo(() => {
    const [baseOrders, baseRevenue, seed] = PLATFORM_BASELINES[platform];
    return mockMetrics(platform, getDays(period), baseOrders, baseRevenue, seed);
  }, [platform, period]);

  // When real integration arrives: replace useMemo with useQuery hitting Supabase
  // e.g. .from("ecommerce_orders").select(...).eq("platform", platform).gte("created_at", rangeStart)
  return { data, isLoading: false };
}

export function useEcommerceComparativo(
  platforms: EcommercePlatform[],
  period: EcommercePeriod
): { data: ComparativoMetrics[]; isLoading: false } {
  const data = useMemo((): ComparativoMetrics[] =>
    platforms.map((p) => {
      const [baseOrders, baseRevenue, seed] = PLATFORM_BASELINES[p];
      const m = mockMetrics(p, getDays(period), baseOrders, baseRevenue, seed);
      return {
        platform:        m.platform,
        totalOrders:     m.totalOrders,
        totalUnitsSold:  m.totalUnitsSold,
        totalRevenue:    m.totalRevenue,
        avgTicket:       m.avgTicket,
        cancelledOrders: m.cancelledOrders,
        dailySales:      m.dailySales,
      };
    }),
  [platforms, period]);

  return { data, isLoading: false };
}
