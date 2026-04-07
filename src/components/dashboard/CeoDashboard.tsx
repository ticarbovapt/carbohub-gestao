import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LastLoginTab } from "./LastLoginTab";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IntelligenceHub } from "@/components/intelligence/IntelligenceHub";
import { StockRuptureAlert } from "@/components/machines/StockRuptureAlert";
import { cn } from "@/lib/utils";
import { CARBO_ROLE_INFO, MACRO_FLOW_INFO, MacroFlow } from "@/types/carboRoles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  Users,
  FileText,
  DollarSign,
  Target,
  Map,
  ShoppingCart,
  BarChart3,
  Package,
} from "lucide-react";
import { OperationalFlowMap } from "@/components/home/OperationalFlowMap";
import { TerritorialMap } from "@/components/maps/TerritorialMap";
import { Link } from "react-router-dom";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

/**
 * Dashboard do CEO - Visão estratégica global
 * Layout otimizado: KPIs + Gráficos (topo) → Mapa (inferior)
 */
export function CeoDashboard() {
  // Buscar dados reais para os KPIs
  const { data: kpiData, isLoading: kpiLoading } = useQuery({
    queryKey: ["ceo-dashboard-kpis"],
    queryFn: async () => {
      const [osResult, osOverdueResult, licenseesResult, machinesResult, ordersResult, prevMonthOrders] = await Promise.all([
        supabase
          .from("service_orders")
          .select("id, status")
          .in("status", ["active", "draft"]),
        supabase
          .from("service_orders")
          .select("id")
          .eq("status", "active")
          .lt("sla_deadline", new Date().toISOString()),
        supabase
          .from("licensees")
          .select("id")
          .eq("status", "active"),
        supabase
          .from("machines")
          .select("id")
          .eq("status", "operational"),
        supabase
          .from("carboze_orders_secure")
          .select("total, created_at")
          .gte("created_at", new Date(new Date().setDate(1)).toISOString()),
        supabase
          .from("carboze_orders_secure")
          .select("total")
          .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString())
          .lt("created_at", new Date(new Date().setDate(1)).toISOString()),
      ]);

      const activeOS = osResult.data?.length || 0;
      const overdueOS = osOverdueResult.data?.length || 0;
      const activeLicensees = licenseesResult.data?.length || 0;
      const activeMachines = machinesResult.data?.length || 0;
      const monthlyRevenue = ordersResult.data?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
      const totalOrders = ordersResult.data?.length || 0;
      const prevRevenue = prevMonthOrders.data?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
      const growthPercent = prevRevenue > 0 ? Math.round(((monthlyRevenue - prevRevenue) / prevRevenue) * 100) : 0;

      return {
        activeOS,
        overdueOS,
        activeLicensees,
        activeMachines,
        monthlyRevenue,
        totalOrders,
        growthPercent,
      };
    },
  });

  // Buscar dados de máquinas para ruptura
  const { data: machinesForRupture = [] } = useQuery({
    queryKey: ["ceo-machines-rupture"],
    queryFn: async () => {
      const { data } = await supabase
        .from("machines")
        .select("id, machine_id, model, status, capacity, units_since_last_refill, licensees:licensee_id(name)")
        .eq("status", "operational");
      return data || [];
    },
  });

  const { data: consumptionHistory = [] } = useQuery({
    queryKey: ["ceo-consumption-history"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data } = await supabase
        .from("machine_consumption_history")
        .select("machine_id, units_dispensed")
        .gte("date", thirtyDaysAgo.toISOString().split("T")[0]);
      return data || [];
    },
  });

  // Top licensees ranking
  const { data: partnerRanking } = useQuery({
    queryKey: ["ceo-partner-ranking"],
    queryFn: async () => {
      const { data } = await supabase
        .from("licensee_gamification")
        .select("licensee_id, total_score, level, total_orders, licensees:licensee_id(name, code)")
        .order("total_score", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  // Período do gráfico de vendas
  const [salesPeriod, setSalesPeriod] = useState<"semanas" | "meses" | "periodo">("semanas");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");

  // Buscar dados de vendas com filtro por período
  const { data: salesData } = useQuery({
    queryKey: ["ceo-sales-chart", salesPeriod, periodFrom, periodTo],
    queryFn: async () => {
      let from: Date;
      const now = new Date();

      if (salesPeriod === "semanas") {
        from = new Date(now);
        from.setDate(now.getDate() - 56); // 8 semanas
      } else if (salesPeriod === "meses") {
        from = new Date(now.getFullYear(), now.getMonth() - 5, 1); // 6 meses
      } else {
        // período personalizado
        if (!periodFrom) { from = new Date(now); from.setDate(now.getDate() - 30); }
        else from = new Date(periodFrom + "T00:00:00");
      }

      let query = supabase
        .from("carboze_orders_secure")
        .select("total, created_at")
        .gte("created_at", from.toISOString())
        .order("created_at", { ascending: true });

      if (salesPeriod === "periodo" && periodTo) {
        query = query.lte("created_at", periodTo + "T23:59:59");
      }

      const { data, error } = await query;
      if (error) throw error;

      const grouped: Record<string, { vendas: number; receita: number }> = {};

      data?.forEach((order) => {
        const date = new Date(order.created_at);
        let key: string;
        if (salesPeriod === "meses") {
          key = date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        } else {
          // group by week
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
        }
        if (!grouped[key]) grouped[key] = { vendas: 0, receita: 0 };
        grouped[key].vendas++;
        grouped[key].receita += order.total || 0;
      });

      return Object.entries(grouped).map(([name, values]) => ({ name, ...values }));
    },
  });

  // Buscar dados de OS por departamento para gráfico
  const { data: osByDepartment } = useQuery({
    queryKey: ["ceo-os-by-department"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("current_department")
        .in("status", ["active", "draft"]);

      if (error) throw error;

      const counts: Record<string, number> = {};
      data?.forEach((os) => {
        const dept = os.current_department || "outros";
        counts[dept] = (counts[dept] || 0) + 1;
      });

      const deptNames: Record<string, string> = {
        venda: "Vendas",
        preparacao: "Preparação",
        expedicao: "Expedição",
        operacao: "Operação",
        pos_venda: "Pós-Venda",
        administrativo: "Administrativo",
      };

      return Object.entries(counts).map(([key, value]) => ({
        name: deptNames[key] || key,
        value,
      }));
    },
  });

  // Buscar alertas/gargalos reais
  const { data: alerts } = useQuery({
    queryKey: ["ceo-alerts"],
    queryFn: async () => {
      const alertsList: { title: string; description: string; severity: "high" | "medium" | "low" }[] = [];

      const { data: overdueOS } = await supabase
        .from("service_orders")
        .select("id")
        .eq("status", "active")
        .lt("sla_deadline", new Date().toISOString());

      if (overdueOS && overdueOS.length > 0) {
        alertsList.push({
           title: "OP com SLA vencido",
           description: `${overdueOS.length} OP aguardando há mais de 48h`,
          severity: "high",
        });
      }

      const { data: lowStockMachines } = await supabase
        .from("machines")
        .select("id")
        .eq("has_active_alert", true);

      if (lowStockMachines && lowStockMachines.length > 0) {
        alertsList.push({
          title: "Estoque baixo",
          description: `${lowStockMachines.length} máquinas com alerta de reposição`,
          severity: "medium",
        });
      }

      const { data: pendingInvoice } = await supabase
        .from("carboze_orders_secure")
        .select("id")
        .eq("status", "confirmed")
        .is("invoice_number", null);

      if (pendingInvoice && pendingInvoice.length > 0) {
        alertsList.push({
          title: "Faturamento pendente",
          description: `${pendingInvoice.length} pedidos aguardando NF`,
          severity: "low",
        });
      }

      return alertsList.length > 0 ? alertsList : [
        { title: "Sistema operando normalmente", description: "Nenhum gargalo identificado", severity: "low" as const }
      ];
    },
  });

  // Conquistas recentes
  const { data: achievements } = useQuery({
    queryKey: ["ceo-achievements"],
    queryFn: async () => {
      const achievementsList: { title: string; description: string }[] = [];
      const startOfMonth = new Date(new Date().setDate(1)).toISOString();

      const { data: completedOS } = await supabase
        .from("service_orders")
        .select("id")
        .eq("status", "completed")
        .gte("updated_at", startOfMonth);

      if (completedOS && completedOS.length > 0) {
        achievementsList.push({
          title: "OP concluídas no mês",
          description: `${completedOS.length} ordens finalizadas`,
        });
      }

      const { data: newLicensees } = await supabase
        .from("licensees")
        .select("id")
        .gte("created_at", startOfMonth);

      if (newLicensees && newLicensees.length > 0) {
        achievementsList.push({
          title: "Novos licenciados",
          description: `${newLicensees.length} licenciados cadastrados`,
        });
      }

      return achievementsList.length > 0 ? achievementsList : [
        { title: "Metas em andamento", description: "Acompanhe o progresso das operações" }
      ];
    },
  });

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `R$ ${(value / 1000).toFixed(1)}K`;
    }
    return `R$ ${value.toFixed(0)}`;
  };

  const CHART_COLORS = ["hsl(var(--carbo-green))", "hsl(var(--carbo-blue))", "#8884d8", "#82ca9d", "#ffc658", "#ff7c43"];

  return (
    <div className="space-y-6">
      {/* Tabs wrapper */}
      <Tabs defaultValue="overview" className="space-y-0">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="last-login" className="gap-2">
            <Clock className="h-4 w-4" />
            Last Login
          </TabsTrigger>
        </TabsList>

        <TabsContent value="last-login">
          <LastLoginTab />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
      {/* Header estratégico */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Cockpit Estratégico
          </h1>
          <p className="text-muted-foreground">
            Visão global do ecossistema Carbo
          </p>
        </div>
        <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700">
          {CARBO_ROLE_INFO.ceo.icon} Admin Estratégico
        </Badge>
      </div>

      {/* KPIs principais - Grid 6 colunas */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          title="OP Ativas"
          value={kpiLoading ? null : kpiData?.activeOS?.toString() || "0"}
          change={12}
          icon={<FileText className="h-4 w-4" />}
          color="blue"
          isLoading={kpiLoading}
        />
        <KpiCard
          title="OP Atrasadas"
          value={kpiLoading ? null : kpiData?.overdueOS?.toString() || "0"}
          change={kpiData?.overdueOS ? -kpiData.overdueOS : 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="amber"
          isLoading={kpiLoading}
        />
        <KpiCard
          title="Licenciados"
          value={kpiLoading ? null : kpiData?.activeLicensees?.toString() || "0"}
          change={3}
          icon={<Users className="h-4 w-4" />}
          color="green"
          isLoading={kpiLoading}
        />
        <KpiCard
          title="Receita Mensal"
          value={kpiLoading ? null : formatCurrency(kpiData?.monthlyRevenue || 0)}
          change={kpiData?.growthPercent || 0}
          icon={<DollarSign className="h-4 w-4" />}
          color="purple"
          isLoading={kpiLoading}
        />
        <KpiCard
          title="Crescimento"
          value={kpiLoading ? null : `${kpiData?.growthPercent || 0}%`}
          change={kpiData?.growthPercent || 0}
          icon={<TrendingUp className="h-4 w-4" />}
          color="emerald"
          isLoading={kpiLoading}
        />
        <KpiCard
          title="Máquinas"
          value={kpiLoading ? null : kpiData?.activeMachines?.toString() || "0"}
          change={-2}
          icon={<Target className="h-4 w-4" />}
          color="blue"
          isLoading={kpiLoading}
        />
      </div>

      {/* Gráficos Analíticos - Seção Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de Vendas e Receita */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-carbo-green" />
                  Performance de Vendas
                </CardTitle>
                <CardDescription>
                  {salesPeriod === "semanas" ? "Últimas 8 semanas" : salesPeriod === "meses" ? "Últimos 6 meses" : "Período personalizado"}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/orders">Ver detalhes</Link>
              </Button>
            </div>
            {/* Period filter pills */}
            <div className="flex items-center gap-1.5 pt-2 flex-wrap">
              {(["semanas", "meses", "periodo"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setSalesPeriod(p)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    salesPeriod === p
                      ? "bg-carbo-green text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {p === "semanas" ? "Semanas" : p === "meses" ? "Meses" : "Período"}
                </button>
              ))}
              {salesPeriod === "periodo" && (
                <div className="flex items-center gap-1.5 ml-1">
                  <DatePickerInput
                    value={periodFrom}
                    onChange={setPeriodFrom}
                    placeholder="De"
                    className="h-6 text-[11px] px-2"
                  />
                  <span className="text-[11px] text-muted-foreground">até</span>
                  <DatePickerInput
                    value={periodTo}
                    onChange={setPeriodTo}
                    placeholder="Até"
                    className="h-6 text-[11px] px-2"
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesData || []}>
                  <defs>
                    <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--carbo-green))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--carbo-green))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => [
                      name === 'receita' ? formatCurrency(value) : value,
                      name === 'receita' ? 'Receita' : 'Vendas'
                    ]}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="receita" 
                    stroke="hsl(var(--carbo-green))" 
                    fillOpacity={1}
                    fill="url(#colorReceita)"
                    strokeWidth={2}
                  />
                  <Bar dataKey="vendas" fill="hsl(var(--carbo-blue))" opacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico de OP por Departamento */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-carbo-blue" />
               OP por Departamento
            </CardTitle>
            <CardDescription>Distribuição atual</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={osByDepartment || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {(osByDepartment || []).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mapa de Fluxo Operacional */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Fluxo Operacional</CardTitle>
          <CardDescription>Progressão das OP através das etapas</CardDescription>
        </CardHeader>
        <CardContent>
          <OperationalFlowMap />
        </CardContent>
      </Card>

      {/* Alertas e Conquistas - Grid 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Gargalos Identificados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts?.map((alert, idx) => (
                <AlertItem 
                  key={idx}
                  title={alert.title}
                  description={alert.description}
                  severity={alert.severity}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Conquistas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {achievements?.map((achievement, idx) => (
                <AchievementItem 
                  key={idx}
                  title={achievement.title}
                  description={achievement.description}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BI Section: Ranking + Rupture + Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking de Parceiros */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-carbo-blue" />
              Ranking de Parceiros
            </CardTitle>
            <CardDescription>Top licenciados por score de performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {partnerRanking?.map((partner: any, idx: number) => (
                <div key={partner.licensee_id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
                    idx === 0 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                    idx === 1 ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" :
                    "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                  )}>
                    {idx + 1}º
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{partner.licensees?.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      Score: {partner.total_score} · {partner.total_orders || 0} pedidos
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">{partner.level}</Badge>
                </div>
              )) || (
                <p className="text-sm text-muted-foreground text-center py-4">Sem dados de ranking</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stock Rupture Alert */}
        <StockRuptureAlert 
          machines={machinesForRupture} 
          consumptionHistory={consumptionHistory} 
        />
      </div>

      {/* Intelligence Hub */}
      <IntelligenceHub />

      {/* Mapa Territorial - Posição estratégica inferior */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Map className="h-5 w-5 text-carbo-green" />
                Mapa Territorial do Ecossistema
              </CardTitle>
              <CardDescription>Visualização geográfica de operações</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild className="gap-2">
              <Link to="/mapa-territorial">
                <Map className="h-4 w-4" />
                Ver mapa completo
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <TerritorialMap 
            height="400px" 
            showStats={true}
            showLegend={true}
            initialLayers={["licensees", "os", "pdvs"]}
          />
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Componentes auxiliares
function KpiCard({ 
  title, 
  value, 
  change, 
  icon, 
  color,
  isLoading
}: { 
  title: string; 
  value: string | null; 
  change: number; 
  icon: React.ReactNode;
  color: string;
  isLoading?: boolean;
}) {
  const isPositive = change >= 0;
  
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  };
  
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center justify-between mb-2">
          <div className={`p-2 rounded-lg ${colorClasses[color] || colorClasses.blue}`}>
            {icon}
          </div>
          <div className={`flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(change)}%
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-xl font-bold">{value}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{title}</p>
      </CardContent>
    </Card>
  );
}

function AlertItem({ 
  title, 
  description, 
  severity 
}: { 
  title: string; 
  description: string; 
  severity: "high" | "medium" | "low";
}) {
  const colors = {
    high: "border-l-destructive bg-destructive/10",
    medium: "border-l-warning bg-warning/10",
    low: "border-l-primary bg-primary/10",
  };
  
  return (
    <div className={`p-3 rounded-lg border-l-4 ${colors[severity]}`}>
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function AchievementItem({ 
  title, 
  description 
}: { 
  title: string; 
  description: string;
}) {
  return (
    <div className="p-3 rounded-lg border-l-4 border-l-success bg-success/10">
      <p className="font-medium text-sm">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
