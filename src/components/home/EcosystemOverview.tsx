import React from "react";
import { motion } from "framer-motion";
import { 
  ClipboardList, 
  Building2, 
  Store, 
  Package, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  CheckCircle2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useLicenseeStats } from "@/hooks/useLicensees";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
  delay?: number;
}

function MiniKPICard({ title, value, subtitle, icon, variant = "default", delay = 0 }: KPICardProps) {
  const variantStyles = {
    default: "border-border bg-card",
    success: "border-carbo-green/30 bg-carbo-green/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    danger: "border-destructive/30 bg-destructive/5",
  };

  const iconStyles = {
    default: "text-muted-foreground bg-muted/50",
    success: "text-carbo-green bg-carbo-green/10",
    warning: "text-amber-500 bg-amber-500/10",
    danger: "text-destructive bg-destructive/10",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <Card className={cn("border transition-all hover:shadow-md", variantStyles[variant])}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", iconStyles[variant])}>
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{title}</p>
              <p className="text-xl font-bold text-foreground">{value}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Hook for PDV stats
function usePDVStats() {
  return useQuery({
    queryKey: ["pdv-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdvs")
        .select("id, status, has_stock_alert");

      if (error) throw error;

      return {
        total: data?.length || 0,
        active: data?.filter((p) => p.status === "active").length || 0,
        withAlerts: data?.filter((p) => p.has_stock_alert).length || 0,
      };
    },
  });
}

// Hook for OS by department stats
function useOSByDepartment() {
  return useQuery({
    queryKey: ["os-by-department"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, current_department, status")
        .in("status", ["active", "draft"]);

      if (error) throw error;

      const byDepartment = {
        venda: 0,
        preparacao: 0,
        expedicao: 0,
        operacao: 0,
        pos_venda: 0,
        financeiro: 0,
        administrativo: 0,
      };

      data?.forEach((os) => {
        if (os.current_department && byDepartment.hasOwnProperty(os.current_department)) {
          byDepartment[os.current_department as keyof typeof byDepartment]++;
        }
      });

      return {
        total: data?.length || 0,
        byDepartment,
        bottleneck: Object.entries(byDepartment).reduce((a, b) => a[1] > b[1] ? a : b, ["", 0]),
      };
    },
  });
}

// Hook for orders stats
function useOrderStats() {
  return useQuery({
    queryKey: ["order-stats-home"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("carboze_orders_secure")
        .select("id, status, total, created_at")
        .gte("created_at", thirtyDaysAgo.toISOString());

      if (error) throw error;

      return {
        total: data?.length || 0,
        totalValue: data?.reduce((sum, o) => sum + (Number(o.total) || 0), 0) || 0,
        delivered: data?.filter((o) => o.status === "delivered").length || 0,
      };
    },
  });
}

interface EcosystemOverviewProps {
  canAccessOps: boolean;
  canAccessLicensee: boolean;
  canAccessPDV: boolean;
}

export function EcosystemOverview({ canAccessOps, canAccessLicensee, canAccessPDV }: EcosystemOverviewProps) {
  const { data: dashboardStats, isLoading: dashboardLoading } = useDashboardStats("week");
  const { data: licenseeStats, isLoading: licenseeLoading } = useLicenseeStats();
  const { data: pdvStats, isLoading: pdvLoading } = usePDVStats();
  const { data: osStats, isLoading: osLoading } = useOSByDepartment();
  const { data: orderStats, isLoading: orderLoading } = useOrderStats();

  const isLoading = dashboardLoading || licenseeLoading || pdvLoading || osLoading || orderLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Build KPIs based on permissions
  const kpis: KPICardProps[] = [];

  // OS KPIs (visible to OPS users)
  if (canAccessOps) {
    kpis.push({
      title: "OP Ativas",
      value: osStats?.total || 0,
      subtitle: `${dashboardStats?.completedOS || 0} concluídas esta semana`,
      icon: <ClipboardList className="h-4 w-4" />,
      variant: osStats?.total && osStats.total > 0 ? "success" : "default",
    });

    // Calculate SLA (mock for now - would need real calculation)
    const avgSLA = dashboardStats?.avgCompletionTime 
      ? `${Math.round(dashboardStats.avgCompletionTime / 60)}h`
      : "—";
    
    kpis.push({
      title: "SLA Médio",
      value: avgSLA,
      subtitle: `${dashboardStats?.weeklyEfficiency || 0}% eficiência`,
      icon: <Clock className="h-4 w-4" />,
      variant: dashboardStats?.weeklyEfficiency && dashboardStats.weeklyEfficiency >= 80 ? "success" : "warning",
    });

    // Bottleneck
    const bottleneckDept = osStats?.bottleneck?.[0] || "—";
    const bottleneckCount = osStats?.bottleneck?.[1] || 0;
    const deptLabels: Record<string, string> = {
      venda: "Comercial",
      preparacao: "Preparação",
      expedicao: "Expedição",
      operacao: "Operação",
      pos_venda: "Pós-Venda",
      financeiro: "Financeiro",
      administrativo: "Administrativo",
    };

    if (bottleneckCount > 0) {
      kpis.push({
        title: "Gargalo Atual",
        value: deptLabels[bottleneckDept] || bottleneckDept,
        subtitle: `${bottleneckCount} OP paradas`,
        icon: <AlertTriangle className="h-4 w-4" />,
        variant: "warning",
      });
    }
  }

  // Licensee KPIs
  if (canAccessOps || canAccessLicensee) {
    kpis.push({
      title: "Licenciados Ativos",
      value: licenseeStats?.active || 0,
      subtitle: `${licenseeStats?.total || 0} total`,
      icon: <Building2 className="h-4 w-4" />,
      variant: "success",
    });
  }

  // PDV KPIs
  if (canAccessOps || canAccessPDV) {
    kpis.push({
      title: "PDVs Ativos",
      value: pdvStats?.active || 0,
      subtitle: pdvStats?.withAlerts ? `${pdvStats.withAlerts} com alertas` : undefined,
      icon: <Store className="h-4 w-4" />,
      variant: pdvStats?.withAlerts && pdvStats.withAlerts > 0 ? "warning" : "success",
    });
  }

  // Order KPIs
  if (canAccessOps) {
    kpis.push({
      title: "Pedidos (30 dias)",
      value: orderStats?.total || 0,
      subtitle: `${orderStats?.delivered || 0} entregues`,
      icon: <Package className="h-4 w-4" />,
      variant: "default",
    });

    if (orderStats?.totalValue && orderStats.totalValue > 0) {
      kpis.push({
        title: "Volume do Período",
        value: new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
          notation: "compact",
        }).format(orderStats.totalValue),
        subtitle: "Últimos 30 dias",
        icon: <TrendingUp className="h-4 w-4" />,
        variant: "success",
      });
    }
  }

  // Completion rate
  if (canAccessOps && dashboardStats) {
    kpis.push({
      title: "Taxa de Conclusão",
      value: `${dashboardStats.completionRate || 0}%`,
      subtitle: `${dashboardStats.completedChecklists || 0} checklists`,
      icon: <CheckCircle2 className="h-4 w-4" />,
      variant: dashboardStats.completionRate >= 80 ? "success" : dashboardStats.completionRate >= 50 ? "warning" : "danger",
    });
  }

  if (kpis.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-carbo-green animate-pulse" />
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Visão do Ecossistema
        </h2>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {kpis.map((kpi, index) => (
          <MiniKPICard key={kpi.title} {...kpi} delay={0.05 * index} />
        ))}
      </div>
    </motion.div>
  );
}
