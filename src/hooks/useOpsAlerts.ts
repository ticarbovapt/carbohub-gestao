import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AlertPrioridade = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "in_progress" | "resolved" | "dismissed";

export interface OpsAlert {
  id: string;
  tipo: string;
  licensee_id: string | null;
  machine_id: string | null;
  titulo: string;
  descricao: string | null;
  prioridade: AlertPrioridade;
  status: AlertStatus;
  source_table: string | null;
  source_id: string | null;
  assigned_to: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  licensees?: { name: string } | null;
}

export const PRIORIDADE_CONFIG: Record<AlertPrioridade, { label: string; color: string; bg: string }> = {
  critical: { label: "Crítico",  color: "#ef4444", bg: "bg-red-50 dark:bg-red-950/30" },
  high:     { label: "Alta",     color: "#f97316", bg: "bg-orange-50 dark:bg-orange-950/30" },
  medium:   { label: "Média",    color: "#f59e0b", bg: "bg-amber-50 dark:bg-amber-950/30" },
  low:      { label: "Baixa",    color: "#22c55e", bg: "bg-green-50 dark:bg-green-950/30" },
};

export const STATUS_CONFIG: Record<AlertStatus, { label: string; variant: string }> = {
  open:        { label: "Aberto",       variant: "destructive" },
  in_progress: { label: "Em Andamento", variant: "warning" },
  resolved:    { label: "Resolvido",    variant: "success" },
  dismissed:   { label: "Ignorado",     variant: "secondary" },
};

export type AlertFilters = {
  status?: AlertStatus | "all";
  prioridade?: AlertPrioridade | "all";
  licensee_id?: string | null;
};

export function useOpsAlerts(filters?: AlertFilters) {
  return useQuery({
    queryKey: ["ops-alerts", filters],
    queryFn: async () => {
      let q = (supabase as any)
        .from("ops_alerts")
        .select(`*, licensees(name)`)
        .order("created_at", { ascending: false })
        .limit(200);

      if (filters?.status && filters.status !== "all") {
        q = q.eq("status", filters.status);
      }
      if (filters?.prioridade && filters.prioridade !== "all") {
        q = q.eq("prioridade", filters.prioridade);
      }
      if (filters?.licensee_id) {
        q = q.eq("licensee_id", filters.licensee_id);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OpsAlert[];
    },
  });
}

/** Count of open + in_progress alerts — used for badge */
export function useOpsAlertsBadge() {
  return useQuery({
    queryKey: ["ops-alerts-badge"],
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("ops_alerts")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]);
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 60_000, // refresh every minute
  });
}

export function useUpdateAlertStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      assigned_to,
    }: {
      id: string;
      status: AlertStatus;
      assigned_to?: string | null;
    }) => {
      const patch: Record<string, unknown> = { status };
      if (assigned_to !== undefined) patch.assigned_to = assigned_to;
      if (status === "resolved") {
        const { data: auth } = await supabase.auth.getUser();
        patch.resolved_at = new Date().toISOString();
        patch.resolved_by = auth.user?.id ?? null;
      }
      const { error } = await (supabase as any)
        .from("ops_alerts")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops-alerts"] });
      qc.invalidateQueries({ queryKey: ["ops-alerts-badge"] });
      toast.success("Alerta atualizado!");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}
