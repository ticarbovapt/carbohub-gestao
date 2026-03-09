import React from "react";
import { motion } from "framer-motion";
import { 
  ShoppingCart, 
  Package, 
  Truck, 
  Settings, 
  FileText, 
  HeadphonesIcon,
  ArrowRight,
  AlertCircle
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface FlowStage {
  key: string;
  label: string;
  icon: React.ReactNode;
  count: number;
  color: string;
  bgColor: string;
}

function useOSFlowData() {
  return useQuery({
    queryKey: ["os-flow-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, current_department, status")
        .in("status", ["active", "draft"]);

      if (error) throw error;

      const counts: Record<string, number> = {
        venda: 0,
        preparacao: 0,
        expedicao: 0,
        operacao: 0,
        administrativo: 0,
        financeiro: 0,
        pos_venda: 0,
      };

      data?.forEach((os) => {
        if (os.current_department && counts.hasOwnProperty(os.current_department)) {
          counts[os.current_department]++;
        }
      });

      return counts;
    },
  });
}

export function OperationalFlowMap() {
  const { data: flowData, isLoading } = useOSFlowData();

  const stages: FlowStage[] = [
    {
      key: "venda",
      label: "Comercial",
      icon: <ShoppingCart className="h-4 w-4" />,
      count: flowData?.venda || 0,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      key: "preparacao",
      label: "Preparação",
      icon: <Package className="h-4 w-4" />,
      count: flowData?.preparacao || 0,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-500/10",
    },
    {
      key: "expedicao",
      label: "Expedição",
      icon: <Truck className="h-4 w-4" />,
      count: flowData?.expedicao || 0,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10",
    },
    {
      key: "operacao",
      label: "Operação",
      icon: <Settings className="h-4 w-4" />,
      count: flowData?.operacao || 0,
      color: "text-carbo-green",
      bgColor: "bg-carbo-green/10",
    },
    {
      key: "administrativo",
      label: "Administrativo",
      icon: <FileText className="h-4 w-4" />,
      count: (flowData?.administrativo || 0) + (flowData?.financeiro || 0),
      color: "text-slate-600 dark:text-slate-400",
      bgColor: "bg-slate-500/10",
    },
    {
      key: "pos_venda",
      label: "Pós-Venda",
      icon: <HeadphonesIcon className="h-4 w-4" />,
      count: flowData?.pos_venda || 0,
      color: "text-teal-600 dark:text-teal-400",
      bgColor: "bg-teal-500/10",
    },
  ];

  // Find the stage with the most OS (bottleneck)
  const maxCount = Math.max(...stages.map((s) => s.count));
  const hasBottleneck = maxCount > 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <React.Fragment key={i}>
              <Skeleton className="h-16 w-24 rounded-lg flex-shrink-0" />
              {i < 5 && <Skeleton className="h-4 w-4 flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  const totalActive = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-carbo-blue animate-pulse" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Fluxo Operacional
          </h2>
        </div>
        {totalActive > 0 && (
          <span className="text-xs text-muted-foreground">
            {totalActive} OP em andamento
          </span>
        )}
      </div>

      {/* Flow visualization */}
      <div className="relative">
        {/* Mobile: Vertical layout */}
        <div className="flex flex-col gap-2 md:hidden">
          {stages.map((stage, index) => (
            <motion.div
              key={stage.key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index }}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-all",
                stage.count > 0 && stage.count === maxCount
                  ? "border-amber-500/50 bg-amber-500/5"
                  : "border-border bg-card"
              )}
            >
              <div className={cn("p-2 rounded-lg", stage.bgColor, stage.color)}>
                {stage.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {stage.label}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-lg font-bold",
                  stage.count > 0 ? stage.color : "text-muted-foreground"
                )}>
                  {stage.count}
                </span>
                {stage.count > 0 && stage.count === maxCount && hasBottleneck && (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Desktop: Horizontal flow */}
        <div className="hidden md:flex items-center justify-between gap-1 overflow-x-auto pb-2">
          {stages.map((stage, index) => (
            <React.Fragment key={stage.key}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 * index }}
                className={cn(
                  "flex flex-col items-center p-3 rounded-xl border min-w-[100px] transition-all",
                  stage.count > 0 && stage.count === maxCount
                    ? "border-amber-500/50 bg-amber-500/5 shadow-sm"
                    : "border-border bg-card hover:bg-accent/50"
                )}
              >
                <div className={cn("p-2 rounded-lg mb-2", stage.bgColor, stage.color)}>
                  {stage.icon}
                </div>
                <span className={cn(
                  "text-2xl font-bold",
                  stage.count > 0 ? stage.color : "text-muted-foreground"
                )}>
                  {stage.count}
                </span>
                <span className="text-xs text-muted-foreground text-center mt-1">
                  {stage.label}
                </span>
                {stage.count > 0 && stage.count === maxCount && hasBottleneck && (
                  <div className="flex items-center gap-1 mt-1 text-amber-500">
                    <AlertCircle className="h-3 w-3" />
                    <span className="text-[10px] font-medium">Gargalo</span>
                  </div>
                )}
              </motion.div>
              
              {index < stages.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {totalActive === 0 && (
        <p className="text-center text-sm text-muted-foreground py-2">
          Nenhuma OP ativa no momento
        </p>
      )}
    </motion.div>
  );
}
