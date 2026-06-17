import { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, RefreshCw, AlertTriangle, Clock, CheckCircle2, Cog, Package, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { ResolveAlertDialog } from "@/components/campo/ResolveAlertDialog";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";

// TODO: ligar em <tabela de alertas> (Supabase) na fase de lógica.

type Prioridade = "critical" | "high" | "medium" | "low";
const PRIORIDADE_CONFIG: Record<Prioridade, { label: string; color: string }> = {
  critical: { label: "Crítico", color: "#ef4444" }, high: { label: "Alta", color: "#f97316" },
  medium: { label: "Média", color: "#f59e0b" }, low: { label: "Baixa", color: "#22c55e" },
};
type AlertStatus = "open" | "in_progress" | "resolved";

interface Alert { id: string; titulo: string; descricao: string; tipo: "maquina" | "estoque" | "manutencao"; prioridade: Prioridade; status: AlertStatus; licenciado: string | null; created_at: string; }
const ALERTS: Alert[] = [];

const TIPO_ICON = { maquina: Cog, estoque: Package, manutencao: Wrench };

export default function Alertas() {
  const [prioFilter, setPrioFilter] = useState<Prioridade | "all">("all");
  const [resolveAlert, setResolveAlert] = useState<Alert | null>(null);

  const stats = useMemo(() => ({
    open: ALERTS.filter((a) => a.status === "open").length,
    inProg: ALERTS.filter((a) => a.status === "in_progress").length,
    critical: ALERTS.filter((a) => a.prioridade === "critical" && a.status !== "resolved").length,
    resolvedToday: ALERTS.filter((a) => a.status === "resolved").length,
  }), []);
  const filtered = ALERTS.filter((a) => prioFilter === "all" || a.prioridade === prioFilter);

  const KPIS = [
    { label: "Abertos", value: stats.open, icon: AlertTriangle, color: "text-destructive" },
    { label: "Em Andamento", value: stats.inProg, icon: Clock, color: "text-amber-500" },
    { label: "Críticos", value: stats.critical, icon: AlertTriangle, color: "text-red-500" },
    { label: "Resolvidos Hoje", value: stats.resolvedToday, icon: CheckCircle2, color: "text-green-600" },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1200px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Bell className="h-6 w-6" /> Central de Alertas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monitoramento da rede CarboOPS</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => toast("Atualizar (em breve)")} className="gap-2"><RefreshCw className="h-4 w-4" /> Atualizar</Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {KPIS.map((k) => (
            <div key={k.label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><k.icon className={cn("h-5 w-5", k.color)} /></div>
              <div><p className="text-xs text-muted-foreground">{k.label}</p><p className={cn("text-xl font-bold", k.color)}>{k.value}</p></div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Select value={prioFilter} onValueChange={(v) => setPrioFilter(v as Prioridade | "all")}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              <SelectItem value="critical">Crítico</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="low">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          {filtered.map((a) => {
            const cfg = PRIORIDADE_CONFIG[a.prioridade];
            const TipoIcon = TIPO_ICON[a.tipo];
            return (
              <div key={a.id} className={cn("flex items-start gap-3 rounded-xl border bg-card p-3", a.prioridade === "critical" && "border-red-300 dark:border-red-800", a.status === "resolved" && "opacity-50")}>
                <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.color + "20", color: cfg.color }}><TipoIcon className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-foreground truncate">{a.titulo}</p>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: cfg.color + "20", color: cfg.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />{cfg.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.descricao}</p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    {a.licenciado && <span>{a.licenciado}</span>}
                    <span>{format(new Date(a.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                    <span className="capitalize">{a.tipo}</span>
                  </div>
                </div>
                {a.status !== "resolved" && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={() => setResolveAlert(a)}>Resolver</Button>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-xl border bg-card">
              <CarboEmptyState icon={Bell} title="Nenhum alerta" description="Nenhum alerta registrado." />
            </div>
          )}
        </div>
      </div>

      <ResolveAlertDialog
        open={resolveAlert !== null}
        onOpenChange={(o) => { if (!o) setResolveAlert(null); }}
        titulo={resolveAlert?.titulo}
      />
    </div>
  );
}
