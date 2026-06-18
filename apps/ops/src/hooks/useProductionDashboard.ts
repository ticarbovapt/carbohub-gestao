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

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export function useProductionDashboard() {
  return useQuery({
    queryKey: ["ops", "production-dashboard"],
    queryFn: async (): Promise<ProductionDashboard> => {
      const [opsRes, clRes] = await Promise.all([
        db.from("production_orders").select("op_status, created_at, finished_at"),
        db.from("ops_checklists").select("id, nome, departamento, etapas, updated_at").order("updated_at", { ascending: false }),
      ]);
      if (opsRes.error) throw opsRes.error;
      if (clRes.error) throw clRes.error;
      const ops = opsRes.data ?? [];
      const cls = clRes.data ?? [];

      const ativos = ["rascunho", "planejada", "aguardando_separacao", "separada", "aguardando_liberacao", "liberada_producao", "em_producao", "aguardando_confirmacao", "aguardando_qualidade", "bloqueada"];
      const opAtivas = ops.filter((o: any) => ativos.includes(o.op_status)).length;
      const opConcluidas = ops.filter((o: any) => o.op_status === "confirmada" || o.op_status === "concluida").length;

      // OPs por status (pie)
      const statusCount = new Map<string, number>();
      for (const o of ops as any[]) statusCount.set(o.op_status, (statusCount.get(o.op_status) ?? 0) + 1);
      const opByStatus: StatusSlice[] = [...statusCount.entries()].map(([s, count], i) => ({
        label: OP_STATUS_LABELS[s] ?? s, count, color: STATUS_PALETTE[i % STATUS_PALETTE.length],
      }));

      // Tendência últimos 7 dias (criadas vs concluídas)
      const days: { key: string; label: string }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days.push({ key: dayKey(d), label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) });
      }
      const opTrend: TrendPoint[] = days.map(({ key, label }) => ({
        label,
        criadas: ops.filter((o: any) => (o.created_at ?? "").slice(0, 10) === key).length,
        concluidas: ops.filter((o: any) => (o.finished_at ?? "").slice(0, 10) === key).length,
      }));

      // Checklists
      let etapasPendentes = 0;
      let checklistsCompletos = 0;
      for (const c of cls as any[]) {
        const etapas = Array.isArray(c.etapas) ? c.etapas : [];
        const pend = etapas.filter((e: any) => !e.concluida).length;
        etapasPendentes += pend;
        if (etapas.length > 0 && pend === 0) checklistsCompletos++;
      }
      const recentChecklists: RecentChecklist[] = (cls as any[]).slice(0, 8).map((c) => {
        const etapas = Array.isArray(c.etapas) ? c.etapas : [];
        return {
          id: c.id, nome: c.nome, departamento: DEPT_LABELS[c.departamento] ?? c.departamento,
          done: etapas.filter((e: any) => e.concluida).length, total: etapas.length,
        };
      });

      return {
        opAtivas, opTotal: ops.length, opConcluidas,
        checklistsTotal: cls.length, checklistsCompletos, etapasPendentes,
        opTrend, opByStatus, recentChecklists,
      };
    },
  });
}
