import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bell, RefreshCw, AlertTriangle, Clock, CheckCircle2, Package, Loader2, ChevronRight, ShoppingCart, Truck, Factory, Receipt, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { useStock } from "@/hooks/useStock";
import { HUBS } from "@/components/estoque/stockData";
import { usePosVendaOrders, POSVENDA_STAGES } from "@/hooks/usePosVenda";
import { useProductionOrders } from "@/hooks/useProductionOrders";
import { useProducibility } from "@/hooks/useProducibility";
import { useOS } from "@/hooks/useOS";

// ─────────────────────────────────────────────────────────────────────────────
// Central de Alertas — feed unificado de PENDÊNCIAS operacionais (não só estoque).
// Junta, de dados reais do app, o que precisa de ação AGORA: estoque abaixo do
// mínimo, pedidos parados, produzidos aguardando mover, NF pendente, OPs atrasadas
// e OS de campo do dia/atrasadas. Alertas são vivos: somem quando a pendência sai.
// Somente leitura — nenhuma escrita aqui.
// ─────────────────────────────────────────────────────────────────────────────

type Prioridade = "critical" | "high" | "medium" | "low";
const PRIORIDADE_CONFIG: Record<Prioridade, { label: string; color: string }> = {
  critical: { label: "Crítico", color: "#ef4444" }, high: { label: "Alta", color: "#f97316" },
  medium: { label: "Média", color: "#f59e0b" }, low: { label: "Baixa", color: "#22c55e" },
};
const PRIO_ORDER: Record<Prioridade, number> = { critical: 0, high: 1, medium: 2, low: 3 };

type Kind = "estoque" | "pedido" | "produzido" | "nf" | "op" | "os";
const KIND_CONFIG: Record<Kind, { label: string; icon: typeof Package }> = {
  estoque:   { label: "Estoque",   icon: Package },
  pedido:    { label: "Pedidos",   icon: Truck },
  produzido: { label: "Produção",  icon: CheckCircle2 },
  nf:        { label: "NF",        icon: Receipt },
  op:        { label: "OPs",       icon: Factory },
  os:        { label: "OS campo",  icon: Wrench },
};

interface Pend {
  id: string; kind: Kind; titulo: string; descricao: string; prioridade: Prioridade;
  action: { label: string; go: () => void };
  // ação secundária opcional (ex.: "Requisitar" no estoque)
  action2?: { label: string; icon: typeof ShoppingCart; go: () => void };
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysSince = (s?: string | null) => {
  if (!s) return 0;
  const d = new Date(s).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
};
// Prioridade por idade (dias parado) — quanto mais velho, mais urgente.
const agePrio = (days: number, hi = 7, mid = 3): Prioridade => (days >= hi ? "high" : days >= mid ? "medium" : "low");

// Etapas terminais do pós-venda (não são pendência).
const TERMINAL = new Set(["entregue", "cancelado"]);
const STALE_DAYS = 3; // pedido "parado" a partir de 3 dias na mesma etapa
const stageLabel = (k: string) => POSVENDA_STAGES.find((s) => s.key === k)?.label ?? k;

export default function Alertas() {
  const navigate = useNavigate();
  const stockQ = useStock();
  const posQ = usePosVendaOrders();
  const opsQ = useProductionOrders();
  const osQ = useOS();
  const producible = useProducibility();
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");

  const isLoading = stockQ.isLoading || posQ.isLoading || opsQ.isLoading || osQ.isLoading;
  const isFetching = stockQ.isFetching || posQ.isFetching || opsQ.isFetching || osQ.isFetching;
  const refetchAll = () => { stockQ.refetch(); posQ.refetch(); opsQ.refetch(); osQ.refetch(); };

  const pends = useMemo<Pend[]>(() => {
    const out: Pend[] = [];
    const today = todayISO();

    // 1) Estoque abaixo do mínimo (por hub) — mantém "Requisitar" + "Ver no estoque".
    for (const p of stockQ.data ?? []) {
      for (const hub of HUBS) {
        if (hub.id === "bling") continue;
        const qty = p.hubs[hub.id] ?? 0;
        const min = p.mins[hub.id] ?? 0;
        const negativo = qty < 0;
        if (!negativo && (!min || min <= 0 || qty >= min)) continue;
        const prioridade: Prioridade = qty <= 0 ? "critical" : qty < min * 0.5 ? "high" : "medium";
        const suggestedQty = Math.max(1, Math.ceil((min || 0) - qty));
        out.push({
          id: `estoque-${p.id}-${hub.id}`, kind: "estoque",
          titulo: `${p.name} — ${hub.label}`,
          descricao: negativo ? `Saldo NEGATIVO ${qty} ${p.stock_unit} (${p.product_code})` : `Saldo ${qty} ${p.stock_unit} • mínimo ${min} (${p.product_code})`,
          prioridade,
          action: { label: "Ver no estoque", go: () => navigate(`/estoque/${hub.slug}`) },
          action2: { label: "Requisitar", icon: ShoppingCart, go: () => navigate("/compras", { state: { prefill: {
            descricao: p.name, quantidade: suggestedQty, unidade: p.stock_unit,
            motivo: qty <= 0 ? "ruptura" : "reposicao_safety", priority: qty <= 0 ? "critica" : "normal",
          } } }) },
        });
      }
    }

    // 2/3/4) Pós-venda: pedido parado, produzido aguardando mover, NF pendente.
    for (const o of posQ.data?.orders ?? []) {
      const stg = o.fulfillment_stage;
      if (TERMINAL.has(stg)) continue;
      // "parado há X" a partir da troca de etapa (coluna dedicada, não poluída).
      const idade = daysSince(o.stage_changed_at ?? o.updated_at ?? o.created_at);
      const goPos = { label: "Abrir rastreio", go: () => navigate("/logistica/pos-venda") };

      if (stg === "criar_op" && o.production_done) {
        out.push({ id: `prod-${o.id}`, kind: "produzido",
          titulo: `${o.customer_name} — ${o.order_number}`,
          descricao: `Produzido · aguardando mover p/ Em Separação${idade ? ` · há ${idade}d` : ""}`,
          prioridade: idade >= 2 ? "critical" : "high", action: goPos });
      } else if (stg === "gerar_nf") {
        out.push({ id: `nf-${o.id}`, kind: "nf",
          titulo: `${o.customer_name} — ${o.order_number}`,
          descricao: `Aguardando emissão da NF${idade ? ` · há ${idade}d` : ""}`,
          prioridade: agePrio(idade, 5, 2) === "low" ? "medium" : agePrio(idade, 5, 2), action: goPos });
      } else if (idade >= STALE_DAYS) {
        out.push({ id: `parado-${o.id}`, kind: "pedido",
          titulo: `${o.customer_name} — ${o.order_number}`,
          descricao: `Parado em “${stageLabel(stg)}” há ${idade}d`,
          prioridade: idade >= 10 ? "critical" : idade >= 7 ? "high" : "medium", action: goPos });
      }
    }

    // 5) OPs atrasadas (prazo vencido e ainda abertas).
    for (const op of opsQ.data ?? []) {
      if (op.op_status === "concluida" || op.op_status === "cancelada") continue;
      if (!op.need_date || op.need_date >= today) continue;
      const atraso = daysSince(op.need_date);
      out.push({ id: `op-${op.id}`, kind: "op",
        titulo: `${op.op_number ?? "OP"} — ${op.product_code ?? op.customer_name ?? ""}`.trim(),
        descricao: `Prazo vencido há ${atraso}d · ${op.planned_quantity} un`,
        prioridade: atraso >= 3 ? "critical" : "high",
        action: { label: "Abrir produção", go: () => navigate("/producao/ordens") } });
    }

    // 5b) OP PARADA DEMAIS na etapa (independe de prazo) — via stage_since.
    //     Cobre OPs internas sem need_date que empacam sem gerar alerta.
    for (const op of opsQ.data ?? []) {
      if (op.op_status === "concluida" || op.op_status === "cancelada") continue;
      const parado = daysSince(op.stage_since);
      if (parado == null || parado < 2) continue;
      if (op.need_date && op.need_date < today) continue; // já vira "atrasada" acima
      out.push({ id: `opdwell-${op.id}`, kind: "op",
        titulo: `${op.op_number ?? "OP"} — ${op.product_code ?? op.customer_name ?? ""}`.trim(),
        descricao: `Parada há ${parado}d na etapa atual · ${op.planned_quantity} un`,
        prioridade: parado >= 10 ? "critical" : parado >= 5 ? "high" : "medium",
        action: { label: "Abrir produção", go: () => navigate("/producao/ordens") } });
    }

    // 6) OS de campo do dia / atrasadas (stage != concluída).
    for (const os of osQ.data ?? []) {
      if (os.stage === "concluida") continue;
      if (!os.data_prevista || os.data_prevista > today) continue;
      const atrasada = os.data_prevista < today;
      out.push({ id: `os-${os.id}`, kind: "os",
        titulo: `${os.cliente_nome ?? "Cliente"}${os.placa ? ` — ${os.placa}` : ""}`,
        descricao: atrasada ? `OS atrasada (prevista ${os.data_prevista})` : "OS prevista para hoje",
        prioridade: atrasada ? "high" : "medium",
        action: { label: "Abrir OS", go: () => navigate("/campo/os") } });
    }

    // 7) Produção travada: OP pronta pra separar, OP em falta de insumo (via
    //    reserva) e insumo-gargalo. Sinais que só existiam dentro de Produção.
    const EARLY = new Set(["rascunho", "planejada", "aguardando_separacao"]);
    const earlyOps = (opsQ.data ?? []).filter((o) => EARLY.has(o.op_status));
    const verdicts = producible.allocate(earlyOps);
    for (const op of earlyOps) {
      const v = verdicts.get(op.id);
      if (v === "ok") {
        out.push({ id: `opready-${op.id}`, kind: "op",
          titulo: `${op.op_number ?? "OP"} — ${op.product_code ?? ""}`.trim(),
          descricao: `Pronta pra separar · ${op.planned_quantity} un`,
          prioridade: "medium",
          action: { label: "Abrir produção", go: () => navigate("/producao/ordens") } });
      } else if (v === "falta") {
        out.push({ id: `opfalta-${op.id}`, kind: "op",
          titulo: `${op.op_number ?? "OP"} — ${op.product_code ?? ""}`.trim(),
          descricao: `Travada — falta insumo em estoque · ${op.planned_quantity} un`,
          prioridade: "high",
          action: { label: "Abrir produção", go: () => navigate("/producao/ordens") } });
      }
    }
    for (const b of producible.bottlenecks) {
      out.push({ id: `gargalo-${b.insumoId}`, kind: "op",
        titulo: `Insumo-gargalo: ${b.name}`,
        descricao: `Zerado no HUB-RN · trava ${b.affected} produção(ões)`,
        prioridade: "critical",
        action: { label: "Abrir produção", go: () => navigate("/producao/ordens") } });
    }

    return out.sort((a, b) => PRIO_ORDER[a.prioridade] - PRIO_ORDER[b.prioridade]);
  }, [stockQ.data, posQ.data, opsQ.data, osQ.data, producible, navigate]);

  const byKind = useMemo(() => {
    const m = {} as Record<Kind, number>;
    for (const p of pends) m[p.kind] = (m[p.kind] ?? 0) + 1;
    return m;
  }, [pends]);

  const filtered = pends.filter((p) => kindFilter === "all" || p.kind === kindFilter);
  const stats = useMemo(() => ({
    total: pends.length,
    critical: pends.filter((a) => a.prioridade === "critical").length,
    high: pends.filter((a) => a.prioridade === "high").length,
  }), [pends]);

  const KPIS = [
    { label: "Pendências", value: stats.total, icon: Bell, color: "text-foreground" },
    { label: "Críticas", value: stats.critical, icon: AlertTriangle, color: "text-red-500" },
    { label: "Altas", value: stats.high, icon: AlertTriangle, color: "text-orange-500" },
  ];

  const CHIPS: { key: Kind | "all"; label: string; count: number }[] = [
    { key: "all", label: "Tudo", count: pends.length },
    ...(Object.keys(KIND_CONFIG) as Kind[]).map((k) => ({ key: k, label: KIND_CONFIG[k].label, count: byKind[k] ?? 0 })),
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1200px] mx-auto">
        <CarboPageHeader
          title="Central de Alertas"
          description="Pendências operacionais: estoque, pedidos, produção, NF e OS de campo"
          icon={Bell}
          actions={
            <Button variant="outline" size="sm" onClick={refetchAll} disabled={isFetching} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /> Atualizar
            </Button>
          }
        />

        <div className="grid grid-cols-3 gap-3">
          {KPIS.map((k) => (
            <div key={k.label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0"><k.icon className={cn("h-5 w-5", k.color)} /></div>
              <div className="min-w-0"><p className="text-xs text-muted-foreground truncate">{k.label}</p><p className={cn("text-xl font-bold", k.color)}>{k.value}</p></div>
            </div>
          ))}
        </div>

        {/* Filtro por tipo de pendência */}
        <div className="flex items-center gap-2 flex-wrap">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              onClick={() => setKindFilter(c.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 h-8 text-xs font-medium transition-colors",
                kindFilter === c.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {c.label}
              <span className="tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted">{c.count}</span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
        ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const cfg = PRIORIDADE_CONFIG[a.prioridade];
            const KindIcon = KIND_CONFIG[a.kind].icon;
            return (
              <div key={a.id} className={cn("flex items-start gap-3 rounded-xl border bg-card p-3", a.prioridade === "critical" && "border-red-300 dark:border-red-800")}>
                <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.color + "20", color: cfg.color }}><KindIcon className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-foreground truncate">{a.titulo}</p>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: cfg.color + "20", color: cfg.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />{cfg.label}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{KIND_CONFIG[a.kind].label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.descricao}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {a.action2 && (
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={a.action2.go}><a.action2.icon className="h-3.5 w-3.5" /> {a.action2.label}</Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={a.action.go}>{a.action.label} <ChevronRight className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-xl border bg-card">
              <CarboEmptyState icon={CheckCircle2} title="Tudo certo" description="Nenhuma pendência aberta neste filtro." />
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
