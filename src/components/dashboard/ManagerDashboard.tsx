import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  TrendingUp,
  Clock,
  AlertTriangle,
  ChevronRight,
  Filter,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { AIAssistant } from "@/components/ai/AIAssistant";
import { MicroInteraction } from "@/components/animations/MicroInteraction";

import { DEPARTMENT_LABELS } from "@/constants/departments";

export function ManagerDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  // Fetch team members in manager's department
  const { data: teamStats, isLoading: teamLoading } = useQuery({
    queryKey: ["team-stats", profile?.department, departmentFilter],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("*")
        .eq("status", "approved");

      if (departmentFilter !== "all") {
        query = query.eq("department", departmentFilter as "venda" | "preparacao" | "expedicao" | "operacao" | "pos_venda");
      } else if (profile?.department) {
        query = query.eq("department", profile.department);
      }

      const { data, error } = await query;
      if (error) throw error;

      return {
        total: data?.length || 0,
        members: data || [],
      };
    },
    enabled: !!profile,
  });

  // Fetch OS by department
  const { data: osStats, isLoading: osLoading } = useQuery({
    queryKey: ["os-stats", profile?.department, departmentFilter],
    queryFn: async () => {
      let query = supabase
        .from("service_orders")
        .select("*");

      if (departmentFilter !== "all") {
        query = query.eq("current_department", departmentFilter as "venda" | "preparacao" | "expedicao" | "operacao" | "pos_venda");
      }

      const { data, error } = await query;
      if (error) throw error;

      const active = data?.filter((o) => o.status === "active").length || 0;
      const completed = data?.filter((o) => o.status === "completed").length || 0;
      const delayed = data?.filter((o) => {
        if (!o.due_date) return false;
        return new Date(o.due_date) < new Date() && o.status === "active";
      }).length || 0;

      return { active, completed, delayed, total: data?.length || 0 };
    },
    enabled: !!profile,
  });

  // Fetch bottleneck stages
  const { data: bottlenecks, isLoading: bottlenecksLoading } = useQuery({
    queryKey: ["bottlenecks", departmentFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("current_department")
        .eq("status", "active");

      if (error) throw error;

      const counts: Record<string, number> = {};
      data?.forEach((os) => {
        counts[os.current_department] = (counts[os.current_department] || 0) + 1;
      });

      return Object.entries(counts)
        .map(([dept, count]) => ({ department: dept, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    },
  });

  const completionRate = osStats
    ? Math.round((osStats.completed / Math.max(osStats.total, 1)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-plex">
            Dashboard do Gestor
          </h1>
          <p className="text-muted-foreground">
            Acompanhe o desempenho da sua equipe
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-44 h-10">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(DEPARTMENT_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MicroInteraction type="pop" delay={50}>
          <Card className="kpi-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-carbo-blue/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-carbo-blue" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {teamLoading ? <Skeleton className="h-8 w-12" /> : teamStats?.total || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Colaboradores</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>

        <MicroInteraction type="pop" delay={100}>
          <Card className="kpi-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {osLoading ? <Skeleton className="h-8 w-12" /> : `${completionRate}%`}
                  </p>
                  <p className="text-xs text-muted-foreground">Taxa Conclusão</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>

        <MicroInteraction type="pop" delay={150}>
          <Card className="kpi-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {osLoading ? <Skeleton className="h-8 w-12" /> : osStats?.active || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">OP Ativas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>

        <MicroInteraction type="pop" delay={200}>
          <Card className={`kpi-glow ${osStats?.delayed ? "border-destructive/50" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {osLoading ? <Skeleton className="h-8 w-12" /> : osStats?.delayed || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Atrasadas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Bottlenecks */}
        <Card className="shadow-board-lg">
          <CardHeader>
            <CardTitle className="text-lg font-plex">Etapas com Gargalo</CardTitle>
          </CardHeader>
          <CardContent>
            {bottlenecksLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            ) : bottlenecks && bottlenecks.length > 0 ? (
              <div className="space-y-3">
                {bottlenecks.map((item, index) => (
                  <div key={item.department} className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground w-6 kpi-number">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">
                          {DEPARTMENT_LABELS[item.department] || item.department}
                        </span>
                        <Badge 
                          variant="secondary"
                          className={index === 0 ? "bg-destructive/10 text-destructive" : ""}
                        >
                          {item.count} OS
                        </Badge>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${index === 0 ? "bg-destructive" : "progress-gradient"}`}
                          style={{ width: `${(item.count / (bottlenecks[0]?.count || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground">Nenhum gargalo identificado</p>
                <p className="text-xs text-success mt-1">✨ Excelente fluxo de trabalho!</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Performance */}
        <Card className="shadow-board-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-plex">Desempenho da Equipe</CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/team")}
              className="hover:text-carbo-green"
            >
              Ver todos <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {teamLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : teamStats && teamStats.members.length > 0 ? (
              <div className="space-y-3">
                {teamStats.members.slice(0, 5).map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:border-carbo-green/30 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-full carbo-gradient flex items-center justify-center">
                      <span className="text-xs font-semibold text-white">
                        {member.full_name?.charAt(0) || "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.full_name || "Usuário"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {DEPARTMENT_LABELS[member.department || ""] || "Sem departamento"}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-xs bg-success/10 text-success"
                    >
                      Ativo
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">
                Nenhum colaborador encontrado
              </p>
            )}
          </CardContent>
        </Card>

        {/* AI Assistant */}
        <Card className="border-carbo-green/20 bg-gradient-to-br from-carbo-green/5 to-carbo-blue/5 shadow-board-lg">
          <CardContent className="pt-6">
            <AIAssistant />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Button
          size="lg"
          className="h-14 carbo-gradient text-white hover:opacity-90"
          onClick={() => navigate("/os")}
        >
          📋 Ver Ordens de Produção
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-14 hover:border-carbo-green hover:text-carbo-green"
          onClick={() => navigate("/analytics")}
        >
          📊 Relatórios Detalhados
        </Button>
      </div>
    </div>
  );
}
