import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Agregações do Dashboard de Produção — a partir de production_orders e
// ops_checklists (dados reais já existentes). Sem integração, sem tabela nova.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

const OP_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho", planejada: "Planejada", aguardando_separacao: "Aguard. Separação",
  separada: "Separada", aguardando_liberacao: "Aguard. Liberação", liberada_producao: "Liberada",
  em_producao: "Em Produção", aguardando_confirmacao: "Aguard. Confirmação", confirmada: "Confirmada",
  aguardando_qualidade: "Aguard. Qualidade", qualidade_aprovada: "QA Aprovado", liberada: "Liberada",
  concluida: "Concluída", bloqueada: "Bloqueada", cancelada: "Cancelada",
};
const STATUS_PALETTE = ["#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e", "#ef4444", "#06b6d4", "#f97316", "#64748b"];

const DEPT_LABELS: Record<string, string> = {
  preparacao: "Preparação", operacao: "Operação", expedicao: "Expedição", pos_venda: "Pós-Venda",
};

export interface TrendPoint { label: string; criadas: number; concluidas: number; }
export interface StatusSlice { label: string; count: number; color: string; }
export interface RecentChecklist { id: string; nome: string; departamento: string; done: number; total: number; }

export interface ProductionDashboard {
  opAtivas: number;
  opTotal: number;
  opConcluidas: number;
  checklistsTotal: number;
  checklistsCompletos: number;
  etapasPendentes: number;
  opTrend: TrendPoint[];
  opByStatus: StatusSlice[];
  recentChecklists: RecentChecklist[];
}

// dd/MM a partir de "YYYY-MM-DD" sem passar por Date (evita erro de fuso).
const ddmm = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };

export function useProductionDashboard() {
  return useQuery({
    queryKey: ["ops", "production-dashboard"],
    queryFn: async (): Promise<ProductionDashboard> => {
      // Agregação no servidor (RPC) — antes puxava todas as OPs/checklists pro cliente.
      const { data, error } = await (db as any).rpc("ops_production_dashboard");
      if (error) throw error;
      const d = (data ?? {}) as {
        opTotal?: number; opAtivas?: number; opConcluidas?: number;
        statusCounts?: Record<string, number>;
        trend?: { d: string; criadas: number; concluidas: number }[];
        checklistsTotal?: number; etapasPendentes?: number; checklistsCompletos?: number;
        recentChecklists?: { id: string; nome: string; departamento: string; done: number; total: number }[];
      };

      const opByStatus: StatusSlice[] = Object.entries(d.statusCounts ?? {}).map(([s, count], i) => ({
        label: OP_STATUS_LABELS[s] ?? s, count: Number(count), color: STATUS_PALETTE[i % STATUS_PALETTE.length],
      }));

      const opTrend: TrendPoint[] = (d.trend ?? []).map((t) => ({
        label: ddmm(t.d), criadas: Number(t.criadas) || 0, concluidas: Number(t.concluidas) || 0,
      }));

      const recentChecklists: RecentChecklist[] = (d.recentChecklists ?? []).map((c) => ({
        id: c.id, nome: c.nome, departamento: DEPT_LABELS[c.departamento] ?? c.departamento,
        done: Number(c.done) || 0, total: Number(c.total) || 0,
      }));

      return {
        opAtivas: Number(d.opAtivas) || 0, opTotal: Number(d.opTotal) || 0, opConcluidas: Number(d.opConcluidas) || 0,
        checklistsTotal: Number(d.checklistsTotal) || 0, checklistsCompletos: Number(d.checklistsCompletos) || 0,
        etapasPendentes: Number(d.etapasPendentes) || 0,
        opTrend, opByStatus, recentChecklists,
      };
    },
  });
}
