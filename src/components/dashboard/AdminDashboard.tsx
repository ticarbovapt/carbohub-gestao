import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Users,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  BarChart3,
  Shield,
  Settings,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { DepartmentChart } from "./DepartmentChart";
import { TrendChart } from "./TrendChart";
import { EcosystemKPIs } from "./EcosystemKPIs";
import { useDepartmentDistribution, useOSTrend } from "@/hooks/useDashboardCharts";
import { AIAssistant } from "@/components/ai/AIAssistant";
import { MicroInteraction } from "@/components/animations/MicroInteraction";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LastLoginTab } from "./LastLoginTab";
import { Clock } from "lucide-react";

const DEPARTMENT_LABELS: Record<string, string> = {
  venda: "Venda",
  preparacao: "Preparação",
  expedicao: "Expedição",
  operacao: "Operação",
  pos_venda: "Pós-Venda",
};

export function AdminDashboard() {
  const navigate = useNavigate();

  // Global stats
  const { data: globalStats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-global-stats"],
    queryFn: async () => {
      const [osResult, usersResult, pendingResult] = await Promise.all([
        supabase.from("service_orders").select("status"),
        supabase.from("profiles").select("status"),
        supabase.from("profiles").select("id").eq("status", "pending"),
      ]);

      const osData = osResult.data || [];
      const usersData = usersResult.data || [];
      const pendingData = pendingResult.data || [];

      return {
        totalOS: osData.length,
        activeOS: osData.filter((o) => o.status === "active").length,
        completedOS: osData.filter((o) => o.status === "completed").length,
        totalUsers: usersData.filter((u) => u.status === "approved").length,
        pendingApprovals: pendingData.length,
      };
    },
  });

  // Department distribution
  const { data: deptDistribution, isLoading: deptLoading } = useDepartmentDistribution();
  
  // OS trend
  const { data: osTrend, isLoading: trendLoading } = useOSTrend(7);

  // Alerts
  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ["admin-alerts"],
    queryFn: async () => {
      const alerts: { type: string; message: string; severity: "warning" | "error" | "info" }[] = [];

      // Check for pending approvals
      const { data: pending } = await supabase
        .from("profiles")
        .select("id")
        .eq("status", "pending");

      if (pending && pending.length > 0) {
        alerts.push({
          type: "approval",
          message: `${pending.length} usuário(s) aguardando aprovação`,
          severity: "warning",
        });
      }

      // Check for overdue OS
      const { data: overdue } = await supabase
        .from("service_orders")
        .select("id")
        .eq("status", "active")
        .lt("due_date", new Date().toISOString());

      if (overdue && overdue.length > 0) {
        alerts.push({
          type: "overdue",
          message: `${overdue.length} OP atrasada(s)`,
          severity: "error",
        });
      }

      return alerts;
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2 font-plex">
            <Shield className="h-6 w-6 text-carbo-blue" />
            Painel Administrativo
          </h1>
          <p className="text-muted-foreground">
            Visão estratégica global do sistema
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={() => navigate("/admin")}
            className="hover:border-carbo-green hover:text-carbo-green"
          >
            <Settings className="h-4 w-4 mr-2" />
            Configurações
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                alert.severity === "error"
                  ? "bg-destructive/10 border-destructive/30"
                  : alert.severity === "warning"
                  ? "bg-warning/10 border-warning/30"
                  : "bg-carbo-blue/10 border-carbo-blue/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle
                  className={`h-5 w-5 ${
                    alert.severity === "error"
                      ? "text-destructive"
                      : alert.severity === "warning"
                      ? "text-warning"
                      : "text-carbo-blue"
                  }`}
                />
                <span className="font-medium">{alert.message}</span>
              </div>
              {alert.type === "approval" && (
                <Button size="sm" variant="outline" onClick={() => navigate("/admin/approval")}>
                  Revisar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tabs for different views */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="ecosystem">Ecossistema</TabsTrigger>
          <TabsTrigger value="last-login" className="gap-2">
            <Clock className="h-4 w-4" />
            Last Login
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Global KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MicroInteraction type="pop" delay={50}>
          <Card className="kpi-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-carbo-green/20 to-carbo-blue/20 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-carbo-green" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {statsLoading ? <Skeleton className="h-8 w-12" /> : globalStats?.totalOS || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Total OS</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>

        <MicroInteraction type="pop" delay={100}>
          <Card className="kpi-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-carbo-blue/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-carbo-blue" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {statsLoading ? <Skeleton className="h-8 w-12" /> : globalStats?.activeOS || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">OP Ativas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>

        <MicroInteraction type="pop" delay={150}>
          <Card className="kpi-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {statsLoading ? <Skeleton className="h-8 w-12" /> : globalStats?.completedOS || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Concluídas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>

        <MicroInteraction type="pop" delay={200}>
          <Card className="kpi-glow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-carbo-green/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-carbo-green" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {statsLoading ? <Skeleton className="h-8 w-12" /> : globalStats?.totalUsers || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Usuários</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>

        <MicroInteraction type="pop" delay={250}>
          <Card className={`kpi-glow ${globalStats?.pendingApprovals ? "border-warning" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground kpi-number">
                    {statsLoading ? <Skeleton className="h-8 w-12" /> : globalStats?.pendingApprovals || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MicroInteraction>
      </div>

          {/* Charts */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <TrendChart
              title="OP - Últimos 7 dias"
              description="Evolução de criação e conclusão"
              data={osTrend}
              isLoading={trendLoading}
              variant="os"
            />
            <DepartmentChart data={deptDistribution} isLoading={deptLoading} />
            
            {/* AI Assistant */}
            <Card className="border-carbo-green/20 bg-gradient-to-br from-carbo-green/5 to-carbo-blue/5">
              <CardContent className="pt-6">
                <AIAssistant />
              </CardContent>
            </Card>
          </div>

          {/* Quick Access Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
            <Card
              className="cursor-pointer hover:shadow-carbo transition-all hover:-translate-y-1 group"
              onClick={() => navigate("/os")}
            >
              <CardContent className="p-4 flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-carbo-green/10 to-carbo-blue/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">📋</span>
                </div>
                <p className="font-medium text-sm group-hover:text-carbo-green transition-colors">Ordens de Produção</p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-carbo transition-all hover:-translate-y-1 group"
              onClick={() => navigate("/admin")}
            >
              <CardContent className="p-4 flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-carbo-blue/10 to-carbo-green/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">⚙️</span>
                </div>
                <p className="font-medium text-sm group-hover:text-carbo-green transition-colors">Configurações</p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-carbo transition-all hover:-translate-y-1 group"
              onClick={() => navigate("/team")}
            >
              <CardContent className="p-4 flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-xl bg-carbo-blue/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">👥</span>
                </div>
                <p className="font-medium text-sm group-hover:text-carbo-green transition-colors">Equipe</p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-carbo transition-all hover:-translate-y-1 group"
              onClick={() => navigate("/analytics")}
            >
              <CardContent className="p-4 flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">📊</span>
                </div>
                <p className="font-medium text-sm group-hover:text-carbo-green transition-colors">Relatórios</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ecosystem">
          <EcosystemKPIs />
        </TabsContent>

        <TabsContent value="last-login">
          <LastLoginTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
