/**
 * Meu Painel — Representative Dashboard
 * Plan reference: /meu-painel — individual rep view (mobile-first)
 * Shows: daily tasks, personal pipeline, monthly goal progress, team ranking, stale leads
 */
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Target, AlertTriangle, CheckCircle2, Clock, TrendingUp,
  ChevronRight, MessageCircle, Trophy, BarChart3, Flame,
} from "lucide-react";
import { FUNNEL_CONFIG } from "@/types/crm";
import type { CRMLead, CRMGoal, CRMActivity } from "@/types/crm";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function semaphore(pct: number): string {
  if (pct >= 80) return "text-green-600";
  if (pct >= 50) return "text-amber-600";
  return "text-red-600";
}

function daysLeft(): number {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return end.getDate() - now.getDate();
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────
function useMyLeads(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-leads", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("crm_leads")
        .select("*")
        .eq("assigned_to", userId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CRMLead[];
    },
    enabled: !!userId,
  });
}

function useMyGoal(userId: string | undefined) {
  const period = currentPeriod();
  return useQuery({
    queryKey: ["my-goal", userId, period],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("crm_lead_goals")
        .select("*")
        .eq("user_id", userId)
        .eq("period", period)
        .is("funnel_type", null)
        .maybeSingle();
      return data as CRMGoal | null;
    },
    enabled: !!userId,
  });
}

function useMyPendingTasks(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-pending-tasks", userId],
    queryFn: async () => {
      if (!userId) return [];
      // Activities pending and due today or overdue, created by this user
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from("crm_lead_activities")
        .select("*, crm_leads(contact_name,trade_name,legal_name,funnel_type)")
        .eq("created_by", userId)
        .eq("status", "pending")
        .lte("due_at", today.toISOString())
        .order("due_at", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

function useTeamRanking() {
  const period = currentPeriod();
  const start = `${period}-01`;
  const end = new Date(new Date(start).setMonth(new Date(start).getMonth() + 1)).toISOString().slice(0, 10);

  return useQuery({
    queryKey: ["crm-team-ranking", period],
    queryFn: async () => {
      // Get all won leads this month + profile names
      const { data, error } = await supabase
        .from("crm_leads")
        .select("assigned_to, estimated_revenue, won_at")
        .not("won_at", "is", null)
        .gte("won_at", start)
        .lt("won_at", end);
      if (error) throw error;

      // Aggregate by user
      const byUser: Record<string, { won: number; revenue: number }> = {};
      for (const lead of data || []) {
        const uid = lead.assigned_to || "unassigned";
        if (!byUser[uid]) byUser[uid] = { won: 0, revenue: 0 };
        byUser[uid].won += 1;
        byUser[uid].revenue += Number(lead.estimated_revenue || 0);
      }

      // Fetch profiles for names
      const userIds = Object.keys(byUser).filter((id) => id !== "unassigned");
      let profiles: { id: string; full_name: string | null; username: string | null }[] = [];
      if (userIds.length > 0) {
        const { data: pData } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", userIds);
        profiles = pData || [];
      }

      return Object.entries(byUser)
        .map(([uid, stats]) => {
          const profile = profiles.find((p) => p.id === uid);
          return {
            user_id: uid,
            name: profile?.full_name || profile?.username || "Consultor",
            ...stats,
          };
        })
        .sort((a, b) => b.won - a.won);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
function GoalProgress({ goal, wonThisMonth, revenueThisMonth }: {
  goal: CRMGoal | null;
  wonThisMonth: number;
  revenueThisMonth: number;
}) {
  if (!goal) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
        Meta do mês não configurada.<br />Solicite ao gestor.
      </div>
    );
  }

  const wonPct = goal.target_won > 0 ? Math.min(100, Math.round((wonThisMonth / goal.target_won) * 100)) : 0;
  const revPct = goal.target_revenue > 0 ? Math.min(100, Math.round((revenueThisMonth / goal.target_revenue) * 100)) : 0;
  const dl = daysLeft();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Fechamentos</span>
          <span className={`font-bold ${semaphore(wonPct)}`}>{wonThisMonth} / {goal.target_won}</span>
        </div>
        <Progress value={wonPct} className="h-2" />
        <p className={`text-xs ${semaphore(wonPct)}`}>{wonPct}% da meta — {dl} dias restantes</p>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Receita</span>
          <span className={`font-bold ${semaphore(revPct)}`}>{fmt(revenueThisMonth)} / {fmt(goal.target_revenue)}</span>
        </div>
        <Progress value={revPct} className="h-2" />
        <p className={`text-xs ${semaphore(revPct)}`}>{revPct}% da meta</p>
      </div>
    </div>
  );
}

function TeamRanking({ ranking, myUserId }: { ranking: ReturnType<typeof useTeamRanking>["data"]; myUserId: string }) {
  if (!ranking || ranking.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">Nenhum fechamento este mês.</p>;
  }

  return (
    <div className="space-y-2">
      {ranking.map((entry, idx) => {
        const isMe = entry.user_id === myUserId;
        return (
          <div
            key={entry.user_id}
            className={`flex items-center gap-3 p-2 rounded-lg ${isMe ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"}`}
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              idx === 0 ? "bg-yellow-100 text-yellow-700" :
              idx === 1 ? "bg-slate-100 text-slate-600" :
              idx === 2 ? "bg-orange-100 text-orange-700" :
              "bg-muted text-muted-foreground"
            }`}>
              {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isMe ? "text-primary" : ""}`}>
                {entry.name} {isMe && <span className="text-xs">(você)</span>}
              </p>
              <p className="text-xs text-muted-foreground">{fmt(entry.revenue)}</p>
            </div>
            <Badge variant="secondary" className="text-xs">
              {entry.won} {entry.won === 1 ? "ganho" : "ganhos"}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function MeuPainel() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const { data: myLeads = [], isLoading: leadsLoading } = useMyLeads(user?.id);
  const { data: goal } = useMyGoal(user?.id);
  const { data: pendingTasks = [], isLoading: tasksLoading } = useMyPendingTasks(user?.id);
  const { data: ranking = [] } = useTeamRanking();

  const now = Date.now();
  const period = currentPeriod();
  const periodStart = new Date(`${period}-01T00:00:00`).getTime();

  // Derived stats
  const { staleLeads, activeLeads, wonThisMonth, revenueThisMonth, byFunnel } = useMemo(() => {
    const stale = myLeads.filter((l) => now - new Date(l.updated_at).getTime() > 7 * 24 * 60 * 60 * 1000);
    const won = myLeads.filter((l) =>
      l.won_at && new Date(l.won_at).getTime() >= periodStart &&
      ["convertido", "parceiro", "fechamento", "ativo"].includes(l.stage)
    );
    const active = myLeads.filter((l) =>
      !["convertido", "sem_interesse", "parceiro", "descartado", "fechamento"].includes(l.stage)
    );
    const rev = won.reduce((sum, l) => sum + Number(l.estimated_revenue || 0), 0);

    // Count active leads per funnel
    const funnel: Record<string, number> = {};
    for (const l of active) {
      funnel[l.funnel_type] = (funnel[l.funnel_type] || 0) + 1;
    }

    return { staleLeads: stale, activeLeads: active, wonThisMonth: won.length, revenueThisMonth: rev, byFunnel: funnel };
  }, [myLeads, now, periodStart]);

  const myRankPos = ranking.findIndex((r) => r.user_id === user?.id) + 1;

  const displayName = profile?.full_name?.split(" ")[0] || profile?.username || "Consultor";

  return (
    <BoardLayout>
      <div className="space-y-5 max-w-4xl">
        <CarboPageHeader
          title={`Meu Painel — ${displayName}`}
          description="Pipeline pessoal, metas do mês e atividades do dia"
          icon={BarChart3}
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CarboKPI
            title="Leads Ativos"
            value={activeLeads.length}
            icon={TrendingUp}
            iconColor="blue"
            loading={leadsLoading}
          />
          <CarboKPI
            title="Ganhos no mês"
            value={wonThisMonth}
            icon={CheckCircle2}
            iconColor="green"
            loading={leadsLoading}
          />
          <CarboKPI
            title="Sem atividade >7d"
            value={staleLeads.length}
            icon={AlertTriangle}
            iconColor="warning"
            loading={leadsLoading}
          />
          <CarboKPI
            title={myRankPos ? `Posição no ranking` : "Ranking"}
            value={myRankPos ? `#${myRankPos}` : "—"}
            icon={Trophy}
            iconColor="warning"
            loading={leadsLoading}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Goal Progress */}
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-primary" />
                Meta de {new Date(`${period}-01`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              <GoalProgress
                goal={goal ?? null}
                wonThisMonth={wonThisMonth}
                revenueThisMonth={revenueThisMonth}
              />
            </CarboCardContent>
          </CarboCard>

          {/* Team Ranking */}
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="flex items-center gap-2 text-sm">
                <Trophy className="h-4 w-4 text-amber-500" />
                Ranking da equipe — {new Date(`${period}-01`).toLocaleDateString("pt-BR", { month: "long" })}
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              <TeamRanking ranking={ranking} myUserId={user?.id || ""} />
            </CarboCardContent>
          </CarboCard>
        </div>

        {/* Pipeline por Funil */}
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="flex items-center gap-2 text-sm">
              <Flame className="h-4 w-4 text-orange-500" />
              Pipeline Pessoal
            </CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent>
            {leadsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[1,2,3,4].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : Object.keys(byFunnel).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum lead ativo atribuído a você.
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(byFunnel).map(([ft, count]) => {
                  const config = FUNNEL_CONFIG[ft as keyof typeof FUNNEL_CONFIG];
                  if (!config) return null;
                  return (
                    <button
                      key={ft}
                      onClick={() => navigate(`/crm/${ft}`)}
                      className="p-3 rounded-xl border border-border hover:shadow-md transition-shadow text-left"
                    >
                      <p className="text-2xl mb-1">{config.icon}</p>
                      <p className="text-xl font-bold" style={{ color: config.color }}>{count}</p>
                      <p className="text-xs text-muted-foreground leading-tight">{config.shortName}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </CarboCardContent>
        </CarboCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Pending Tasks */}
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-orange-500" />
                Tarefas pendentes
                {pendingTasks.length > 0 && (
                  <Badge variant="destructive" className="h-5 text-[10px]">{pendingTasks.length}</Badge>
                )}
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              {tasksLoading ? (
                <div className="space-y-2">{[1,2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : pendingTasks.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-1" />
                  <p className="text-sm text-muted-foreground">Sem tarefas pendentes.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingTasks.map((task: any) => {
                    const lead = task.crm_leads;
                    const leadName = lead?.trade_name || lead?.contact_name || "Lead";
                    const isOverdue = task.due_at && new Date(task.due_at) < new Date();
                    return (
                      <div key={task.id} className={`p-2.5 rounded-lg border text-sm ${isOverdue ? "border-destructive/40 bg-destructive/5" : "border-border"}`}>
                        <p className="font-medium truncate">{task.body}</p>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-xs text-muted-foreground truncate">{leadName}</p>
                          {isOverdue && (
                            <Badge variant="destructive" className="text-[9px] h-4">Vencida</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CarboCardContent>
          </CarboCard>

          {/* Stale Leads */}
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Leads sem atividade &gt;7 dias
                {staleLeads.length > 0 && (
                  <Badge variant="destructive" className="h-5 text-[10px]">{staleLeads.length}</Badge>
                )}
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              {leadsLoading ? (
                <div className="space-y-2">{[1,2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : staleLeads.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-1" />
                  <p className="text-sm text-muted-foreground">Todos os leads com atividade recente.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {staleLeads.slice(0, 5).map((lead) => {
                    const days = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24));
                    const config = FUNNEL_CONFIG[lead.funnel_type];
                    const name = lead.trade_name || lead.legal_name || lead.contact_name || "Sem nome";
                    return (
                      <button
                        key={lead.id}
                        onClick={() => navigate(`/crm/${lead.funnel_type}`)}
                        className="w-full text-left p-2.5 rounded-lg border border-amber-200 bg-amber-50/30 hover:bg-amber-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <Badge variant="outline" className="text-[10px] h-4 border-amber-400 text-amber-700">
                            {days}d
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px]">{config?.icon}</span>
                          <p className="text-[11px] text-muted-foreground">{config?.shortName}</p>
                        </div>
                      </button>
                    );
                  })}
                  {staleLeads.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">+ {staleLeads.length - 5} outros</p>
                  )}
                </div>
              )}
            </CarboCardContent>
          </CarboCard>
        </div>

        {/* WhatsApp quick actions for stale leads */}
        {staleLeads.length > 0 && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="flex items-center gap-2 text-sm">
                <MessageCircle className="h-4 w-4 text-green-600" />
                Acesso rápido — WhatsApp
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              <div className="flex flex-wrap gap-2">
                {staleLeads
                  .filter((l) => l.contact_whatsapp || l.contact_phone)
                  .slice(0, 8)
                  .map((lead) => {
                    const phone = (lead.contact_whatsapp || lead.contact_phone || "").replace(/\D/g, "");
                    const name = lead.trade_name || lead.contact_name || "Lead";
                    return (
                      <a
                        key={lead.id}
                        href={`https://wa.me/55${phone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 text-xs hover:bg-green-100 transition-colors"
                      >
                        <MessageCircle className="h-3 w-3" />
                        {name.length > 18 ? name.slice(0, 15) + "..." : name}
                      </a>
                    );
                  })}
              </div>
            </CarboCardContent>
          </CarboCard>
        )}
      </div>
    </BoardLayout>
  );
}
