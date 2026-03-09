import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Shield,
  Package,
  Lightbulb,
  Activity,
  Loader2,
  RefreshCw,
  ChevronRight,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAIInsights, useForecastSnapshots, type AIInsight, type ForecastSnapshot } from "@/hooks/useIntelligence";
import { useQueryClient } from "@tanstack/react-query";

const TYPE_CONFIG: Record<string, { icon: typeof Brain; label: string; color: string }> = {
  sla_risk: { icon: AlertTriangle, label: "Risco SLA", color: "text-destructive" },
  revenue_anomaly: { icon: Activity, label: "Anomalia Receita", color: "text-warning-foreground" },
  revenue_concentration: { icon: Shield, label: "Concentração", color: "text-warning-foreground" },
  licensee_performance: { icon: TrendingUp, label: "Performance", color: "text-accent" },
  stock_rupture: { icon: Package, label: "Ruptura Estoque", color: "text-destructive" },
  operational_risk: { icon: Zap, label: "Risco Operacional", color: "text-destructive" },
};

const SEVERITY_STYLES: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  critical: { bg: "bg-destructive/5", border: "border-destructive/25", badge: "bg-destructive text-white", text: "text-destructive" },
  warning: { bg: "bg-warning/5", border: "border-warning/25", badge: "bg-warning text-warning-foreground", text: "text-warning-foreground" },
  stable: { bg: "bg-primary/5", border: "border-primary/15", badge: "bg-primary text-primary-foreground", text: "text-primary" },
};

function InsightCard({ insight, onDismiss }: { insight: AIInsight; onDismiss: (id: string) => void }) {
  const config = TYPE_CONFIG[insight.type] || { icon: Brain, label: insight.type, color: "text-muted-foreground" };
  const style = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.warning;
  const Icon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`rounded-xl border p-4 ${style.bg} ${style.border} transition-all hover:shadow-sm`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg}`}>
          <Icon className={`h-4 w-4 ${config.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{config.label}</span>
            <Badge className={`text-[10px] px-1.5 py-0 ${style.badge}`}>
              {insight.severity === "critical" ? "CRÍTICO" : insight.severity === "warning" ? "ATENÇÃO" : "ESTÁVEL"}
            </Badge>
          </div>
          <p className="text-sm font-medium text-foreground leading-snug">{insight.message}</p>
          {insight.recommendation && (
            <div className="mt-2 flex items-start gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">{insight.recommendation}</p>
            </div>
          )}
        </div>
        <button
          onClick={() => onDismiss(insight.id)}
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

function ForecastCard({ forecast }: { forecast: ForecastSnapshot }) {
  const style = SEVERITY_STYLES[forecast.risk_level] || SEVERITY_STYLES.stable;

  return (
    <div className={`rounded-xl border p-4 ${style.bg} ${style.border}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-muted-foreground uppercase">{forecast.entity}</span>
        <Badge variant="outline" className="text-[10px]">{forecast.period_days}d</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-lg font-black tabular-nums text-foreground">{forecast.projected_volume?.toLocaleString("pt-BR") ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">Volume projetado</p>
        </div>
        <div>
          <p className="text-lg font-black tabular-nums text-foreground">
            {forecast.projected_revenue ? `R$ ${forecast.projected_revenue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}` : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">Receita projetada</p>
        </div>
      </div>
      {forecast.confidence != null && (
        <div className="mt-2">
          <div className="h-1 rounded-full bg-border overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.min(forecast.confidence * 100, 100)}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">Confiança: {Math.round(forecast.confidence * 100)}%</p>
        </div>
      )}
    </div>
  );
}

export function IntelligenceHub() {
  const queryClient = useQueryClient();
  const { data: insights = [], isLoading: insightsLoading } = useAIInsights();
  const { data: forecasts = [], isLoading: forecastsLoading } = useForecastSnapshots();
  const [running, setRunning] = useState<"insights" | "forecast" | null>(null);

  const runEngine = async (engine: "insights" | "forecast") => {
    setRunning(engine);
    try {
      const fnName = engine === "insights" ? "intelligence-engine" : "forecast-engine";
      const { data, error } = await supabase.functions.invoke(fnName);
      if (error) throw error;
      toast.success(`${engine === "insights" ? "Alertas" : "Forecast"} gerados com sucesso!`, {
        description: `${data?.insights_count || data?.forecasts_count || 0} resultados.`,
      });
      queryClient.invalidateQueries({ queryKey: engine === "insights" ? ["ai-insights"] : ["forecast-snapshots"] });
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao executar ${engine}.`);
    } finally {
      setRunning(null);
    }
  };

  const dismissInsight = async (id: string) => {
    await supabase.from("ai_insights").update({ is_dismissed: true, dismissed_at: new Date().toISOString() }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["ai-insights"] });
  };

  const criticalCount = insights.filter(i => i.severity === "critical").length;
  const warningCount = insights.filter(i => i.severity === "warning").length;

  const latestForecasts = forecasts.slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Radar Estratégico Inteligente</h2>
            <p className="text-xs text-muted-foreground">IA preditiva e prescritiva em tempo real</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runEngine("insights")}
            disabled={running !== null}
          >
            {running === "insights" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Analisar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runEngine("forecast")}
            disabled={running !== null}
          >
            {running === "forecast" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <TrendingUp className="h-3.5 w-3.5 mr-1.5" />}
            Forecast
          </Button>
        </div>
      </div>

      {/* Summary badges */}
      {(criticalCount > 0 || warningCount > 0) && (
        <div className="flex gap-3">
          {criticalCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-xs font-bold text-destructive">{criticalCount} Crítico{criticalCount > 1 ? "s" : ""}</span>
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-warning" />
              <span className="text-xs font-bold text-warning-foreground">{warningCount} Atenção</span>
            </div>
          )}
        </div>
      )}

      {/* Insights Section */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          Alertas Inteligentes
        </h3>
        {insightsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : insights.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum alerta ativo. Clique em &quot;Analisar&quot; para gerar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {insights.map(insight => (
                <InsightCard key={insight.id} insight={insight} onDismiss={dismissInsight} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <Separator />

      {/* Forecast Section */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5" />
          Forecast Preditivo
        </h3>
        {forecastsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : latestForecasts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum forecast gerado. Clique em &quot;Forecast&quot; para gerar.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {latestForecasts.map(f => (
              <ForecastCard key={f.id} forecast={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
