// ─────────────────────────────────────────────────────────────────────────────
// Dashboard ESPELHADO (Fase 1 / KPI-level) — Logística.
//
// Espelha o essencial de src/pages/dashboards/DashboardLogistica.tsx +
// src/components/logistics/LogisticsKPIs.tsx + src/hooks/useShipments.ts.
//
// Fonte (schema public): os_shipments → status, estimated_delivery
//   status ∈ {separacao_pendente, separando, separado, em_transporte, entregue, cancelado}
//   Pendentes = separacao_pendente|separando · Atrasado = não entregue/cancelado & venc.
// Lê os_shipments direto (sem join a service_orders — KPI-level).
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ShipmentRow {
  status: string | null;
  estimated_delivery: string | null;
}

export interface LogisticaData {
  pendentes: number;
  emTransporte: number;
  entregues: number;
  atrasados: number;
  porStatus: { status: string; label: string; count: number; color: string }[];
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  separacao_pendente: { label: "Aguardando", color: "#f59e0b" },
  separando: { label: "Separando", color: "#3b82f6" },
  separado: { label: "Separado", color: "#8b5cf6" },
  em_transporte: { label: "Em transporte", color: "#06b6d4" },
  entregue: { label: "Entregue", color: "#10b981" },
  cancelado: { label: "Cancelado", color: "#ef4444" },
};
const STATUS_ORDER = Object.keys(STATUS_META);

export function useDashLogistica() {
  return useQuery({
    queryKey: ["dash-logistica-overview"],
    queryFn: async (): Promise<LogisticaData> => {
      const { data, error } = await supabase
        .from("os_shipments" as never)
        .select("status, estimated_delivery");
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as ShipmentRow[];
      const now = new Date();

      const pendentes = rows.filter(
        (s) => s.status === "separacao_pendente" || s.status === "separando"
      ).length;
      const emTransporte = rows.filter((s) => s.status === "em_transporte").length;
      const entregues = rows.filter((s) => s.status === "entregue").length;
      const atrasados = rows.filter((s) => {
        if (s.status === "entregue" || s.status === "cancelado") return false;
        if (!s.estimated_delivery) return false;
        return new Date(s.estimated_delivery) < now;
      }).length;

      const counts = new Map<string, number>();
      for (const s of rows) {
        const key = s.status ?? "desconhecido";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const porStatus = STATUS_ORDER
        .filter((k) => (counts.get(k) ?? 0) > 0)
        .map((k) => ({
          status: k,
          label: STATUS_META[k].label,
          count: counts.get(k) ?? 0,
          color: STATUS_META[k].color,
        }));

      return { pendentes, emTransporte, entregues, atrasados, porStatus };
    },
  });
}
