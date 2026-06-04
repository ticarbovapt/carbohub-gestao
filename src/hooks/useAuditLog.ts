import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AuditEntry {
  id: string;
  user_id: string | null;
  user_name: string;
  role: string | null;
  action: "INSERT" | "UPDATE" | "DELETE" | string;
  table_name: string;
  record_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditFilters {
  action?: string; // all | INSERT | UPDATE | DELETE
  table?: string;  // all | <table_name>
  search?: string; // nome / record_id
}

/**
 * Lê order_audit_logs (RLS já restringe a leitura à liderança). "Ao vivo" via
 * refetch a cada 15s. Junta o nome de quem fez a partir de profiles.
 */
export function useAuditLog(filters: AuditFilters = {}) {
  return useQuery<AuditEntry[]>({
    queryKey: ["audit-log", filters.action, filters.table],
    refetchInterval: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("order_audit_logs")
        .select("id, user_id, role, action, table_name, record_id, before_data, after_data, created_at")
        .order("created_at", { ascending: false })
        .limit(300);

      if (filters.action && filters.action !== "all") q = q.eq("action", filters.action);
      if (filters.table && filters.table !== "all") q = q.eq("table_name", filters.table);

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as any[];

      // Resolve nomes
      const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
      const names: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        (profs || []).forEach((p: any) => { names[p.id] = p.full_name; });
      }

      let result: AuditEntry[] = rows.map((r) => ({
        ...r,
        user_name: r.user_id ? (names[r.user_id] || "—") : "Sistema",
      }));

      const s = filters.search?.trim().toLowerCase();
      if (s) {
        result = result.filter(
          (r) => r.user_name.toLowerCase().includes(s) || (r.record_id || "").toLowerCase().includes(s),
        );
      }
      return result;
    },
  });
}
