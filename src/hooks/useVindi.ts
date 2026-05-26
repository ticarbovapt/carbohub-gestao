import { useEffect, useState } from "react";
import { subDays, startOfMonth, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VindiPeriod = "today" | "7d" | "30d" | "month";

export interface VindiDailySale {
  date:    string;
  label:   string;
  orders:  number;
  revenue: number;
}

export interface VindiProduct {
  product_id:   string;
  product_name: string;
  orders:       number;
  revenue:      number;
  pct:          number;
}

export interface VindiPaymentMethodStat {
  method:  string;
  label:   string;
  orders:  number;
  revenue: number;
  pct:     number;
}

export interface VindiMetrics {
  totalRevenue:     number;
  totalPaid:        number;
  totalPending:     number;
  totalCanceled:    number;
  totalFraud:       number;
  totalAttempts:    number;
  avgTicket:        number;
  paymentRate:      number;
  cancellationRate: number;
  dailySales:       VindiDailySale[];
  products:         VindiProduct[];
  paymentMethods:   VindiPaymentMethodStat[];
}

interface DBVindiOrder {
  charge_id:      string;
  product_id:     string | null;
  product_name:   string | null;
  amount:         number;
  status:         string;
  payment_method: string | null;
  installments:   number;
  paid_at:        string | null;
  created_at:     string;
}

const PM_LABELS: Record<string, string> = {
  credit_card: "Cartão de Crédito",
  bank_slip:   "Boleto",
  pix:         "Pix",
  unknown:     "Outro",
};

function getRangeStart(period: VindiPeriod): Date {
  const today = startOfDay(new Date());
  switch (period) {
    case "today": return today;
    case "7d":    return subDays(today, 6);
    case "month": return startOfMonth(today);
    default:      return subDays(today, 29);
  }
}

const DAY_LABELS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MONTH_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function dayLabel(dateStr: string, period: VindiPeriod): string {
  const d = new Date(dateStr);
  if (period === "today") return `${d.getHours()}h`;
  if (period === "7d")    return DAY_LABELS[d.getDay()];
  return `${d.getDate()}/${MONTH_LABELS[d.getMonth()]}`;
}

// ─── useVindiMetrics ──────────────────────────────────────────────────────────

export function useVindiMetrics(period: VindiPeriod) {
  const [metrics, setMetrics] = useState<VindiMetrics | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const from = getRangeStart(period);

    supabase
      .from("vindi_orders" as never)
      .select("charge_id,product_id,product_name,amount,status,payment_method,installments,paid_at,created_at")
      .gte("created_at", from.toISOString())
      .order("created_at", { ascending: true })
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        if (error) { console.error("[useVindiMetrics]", error); setLoading(false); return; }

        const all = (rows ?? []) as DBVindiOrder[];

        const paid     = all.filter(r => r.status === "paid");
        const pending  = all.filter(r => r.status === "pending");
        const canceled = all.filter(r => r.status === "canceled");
        const fraud    = all.filter(r => r.status === "fraud");

        const totalRevenue  = paid.reduce((s, r) => s + Number(r.amount), 0);
        const totalAttempts = all.length;
        const totalPaid     = paid.length;

        // Daily sales (grouped by date)
        const dayMap = new Map<string, { orders: number; revenue: number }>();
        for (const r of all) {
          const day = r.created_at.slice(0, 10);
          const e   = dayMap.get(day) ?? { orders: 0, revenue: 0 };
          if (r.status === "paid") e.revenue += Number(r.amount);
          e.orders++;
          dayMap.set(day, e);
        }
        const dailySales: VindiDailySale[] = Array.from(dayMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({
            date,
            label:   dayLabel(date, period),
            orders:  v.orders,
            revenue: Math.round(v.revenue * 100) / 100,
          }));

        // Products (from paid orders only)
        const prodMap = new Map<string, { name: string; orders: number; revenue: number }>();
        for (const r of paid) {
          const key = r.product_id ?? "sem-produto";
          const e   = prodMap.get(key) ?? { name: r.product_name ?? "Produto não identificado", orders: 0, revenue: 0 };
          e.orders++;
          e.revenue += Number(r.amount);
          prodMap.set(key, e);
        }
        const products: VindiProduct[] = Array.from(prodMap.entries())
          .map(([id, v]) => ({ product_id: id, product_name: v.name, orders: v.orders, revenue: v.revenue, pct: 0 }))
          .sort((a, b) => b.revenue - a.revenue)
          .map(p => ({ ...p, pct: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0 }));

        // Payment methods (from all orders)
        const pmMap = new Map<string, { orders: number; revenue: number }>();
        for (const r of all) {
          const key = r.payment_method ?? "unknown";
          const e   = pmMap.get(key) ?? { orders: 0, revenue: 0 };
          e.orders++;
          if (r.status === "paid") e.revenue += Number(r.amount);
          pmMap.set(key, e);
        }
        const paymentMethods: VindiPaymentMethodStat[] = Array.from(pmMap.entries())
          .map(([method, v]) => ({
            method,
            label:   PM_LABELS[method] ?? method,
            orders:  v.orders,
            revenue: v.revenue,
            pct:     totalAttempts > 0 ? (v.orders / totalAttempts) * 100 : 0,
          }))
          .sort((a, b) => b.orders - a.orders);

        setMetrics({
          totalRevenue:     Math.round(totalRevenue * 100) / 100,
          totalPaid,
          totalPending:     pending.length,
          totalCanceled:    canceled.length,
          totalFraud:       fraud.length,
          totalAttempts,
          avgTicket:        totalPaid > 0 ? Math.round((totalRevenue / totalPaid) * 100) / 100 : 0,
          paymentRate:      totalAttempts > 0 ? (totalPaid / totalAttempts) * 100 : 0,
          cancellationRate: totalAttempts > 0 ? ((canceled.length + fraud.length) / totalAttempts) * 100 : 0,
          dailySales,
          products,
          paymentMethods,
        });
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [period]);

  return { metrics, isLoading };
}

// ─── useVindiConnection ───────────────────────────────────────────────────────

export function useVindiConnection() {
  const [connected, setConnected]   = useState<boolean | null>(null);
  const [lastSync, setLastSync]     = useState<string | null>(null);
  const [isSaving, setIsSaving]     = useState(false);

  const SUPABASE_URL = (supabase as unknown as { supabaseUrl: string }).supabaseUrl;

  useEffect(() => {
    fetch(`${SUPABASE_URL}/functions/v1/vindi-auth`, {
      headers: { "Content-Type": "application/json" },
    })
      .then(async r => {
        if (!r.ok) { setConnected(false); return; }
        const d = await r.json() as { connected: boolean; last_synced_at?: string };
        setConnected(d.connected === true);
        setLastSync(d.last_synced_at ?? null);
      })
      .catch(() => setConnected(false));
  }, [SUPABASE_URL]);

  async function saveApiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
    setIsSaving(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/vindi-auth?action=save`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ api_key: apiKey }),
      });
      const d = await res.json() as { connected?: boolean; error?: string };
      if (d.connected) { setConnected(true); return { ok: true }; }
      return { ok: false, error: d.error ?? "Erro desconhecido" };
    } catch (e) {
      return { ok: false, error: String(e) };
    } finally {
      setIsSaving(false);
    }
  }

  async function forceSync(): Promise<void> {
    await fetch(`${SUPABASE_URL}/functions/v1/vindi-sync`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    "{}",
    });
  }

  return { connected, lastSync, isSaving, saveApiKey, forceSync };
}
