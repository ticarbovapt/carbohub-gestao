import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, RefreshCw, AlertTriangle, Clock, CheckCircle2, Package, Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { useStock } from "@/hooks/useStock";
import { HUBS } from "@/components/estoque/stockData";

// ─────────────────────────────────────────────────────────────────────────────
// Central de Alertas — derivada de dados reais do app (sem integração).
//  Fonte atual: estoque abaixo do mínimo (warehouse_stock + política de mínimo).
//  Alertas são vivos: somem sozinhos quando o saldo é reposto. Por isso a ação é
//  "Ver no estoque" (leva ao hub) — não há "resolver" manual.
// ─────────────────────────────────────────────────────────────────────────────

type Prioridade = "critical" | "high" | "medium" | "low";
const PRIORIDADE_CONFIG: Record<Prioridade, { label: string; color: string }> = {
  critical: { label: "Crítico", color: "#ef4444" }, high: { label: "Alta", color: "#f97316" },
  medium: { label: "Média", color: "#f59e0b" }, low: { label: "Baixa", color: "#22c55e" },
};
const PRIO_ORDER: Record<Prioridade, number> = { critical: 0, high: 1, medium: 2, low: 3 };

interface StockAlert {
  id: string; titulo: string; descricao: string; prioridade: Prioridade; hubSlug: string;
}

export default function Alertas() {
  const navigate = useNavigate();
  const { data: stock = [], isLoading, isFetching, refetch } = useStock();
  const [prioFilter, setPrioFilter] = useState<Prioridade | "all">("all");

  const alerts = useMemo<StockAlert[]>(() => {
    const out: StockAlert[] = [];
    for (const p of stock) {
      for (const hub of HUBS) {
        if (hub.id === "bling") continue; // Bling não controla mínimo
        const qty = p.hubs[hub.id] ?? 0;
        // Mínimo POR HUB (ops_stock_min) — mesma fonte do resto do sistema.
        // Não usa safety_stock_qty legado (senão diverge da tela de estoque/reposição).
        const min = p.mins[hub.id] ?? 0;
        // Estoque NEGATIVO é sempre crítico — mesmo sem mínimo configurado (indica
        // dedução além do disponível). Fora isso, só alerta abaixo do mínimo.
        const negativo = qty < 0;
        if (!negativo && (!min || min <= 0 || qty >= min)) continue;
        const prioridade: Prioridade = qty <= 0 ? "critical" : qty < min * 0.5 ? "high" : "medium";
        out.push({
          id: `${p.id}-${hub.id}`,
          titulo: `${p.name} — ${hub.label}`,
          descricao: negativo
            ? `Saldo NEGATIVO ${qty} ${p.stock_unit} (${p.product_code})`
            : `Saldo ${qty} ${p.stock_unit} • mínimo ${min} (${p.product_code})`,
          prioridade,
          hubSlug: hub.slug,
        });
      }
    }
    return out.sort((a, b) => PRIO_ORDER[a.prioridade] - PRIO_ORDER[b.prioridade]);
  }, [stock]);

  const filtered = alerts.filter((a) => prioFilter === "all" || a.prioridade === prioFilter);
  const stats = useMemo(() => ({
    total: alerts.length,
    critical: alerts.filter((a) => a.prioridade === "critical").length,
    high: alerts.filter((a) => a.prioridade === "high").length,
    medium: alerts.filter((a) => a.prioridade === "medium").length,
  }), [alerts]);

  const KPIS = [
    { label: "Alertas", value: stats.total, icon: Bell, color: "text-foreground" },
    { label: "Críticos (zerado)", value: stats.critical, icon: AlertTriangle, color: "text-red-500" },
    { label: "Alta", value: stats.high, icon: AlertTriangle, color: "text-orange-500" },
    { label: "Média", value: stats.medium, icon: Clock, color: "text-amber-500" },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1200px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Bell className="h-6 w-6" /> Central de Alertas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Estoque abaixo do mínimo na rede</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2"><RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /> Atualizar</Button>
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
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
        ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const cfg = PRIORIDADE_CONFIG[a.prioridade];
            return (
              <div key={a.id} className={cn("flex items-start gap-3 rounded-xl border bg-card p-3", a.prioridade === "critical" && "border-red-300 dark:border-red-800")}>
                <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.color + "20", color: cfg.color }}><Package className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-foreground truncate">{a.titulo}</p>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: cfg.color + "20", color: cfg.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />{cfg.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.descricao}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0 gap-1" onClick={() => navigate(`/estoque/${a.hubSlug}`)}>Ver no estoque <ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-xl border bg-card">
              <CarboEmptyState icon={CheckCircle2} title="Tudo certo" description="Nenhum item abaixo do mínimo." />
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
