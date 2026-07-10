import { useEffect, useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Factory, Plus, LayoutGrid, List, Search, TrendingUp, Target, XCircle,
  Pencil, Trash2, ClipboardCheck, Loader2, CalendarClock, Clock, CheckCircle2, AlertTriangle, ChevronDown,
} from "lucide-react";
import { useProducibility } from "@/hooks/useProducibility";
import { useMrpProducts } from "@/hooks/useMrpProducts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { OPFormDialog } from "@/components/producao/OPFormDialog";
import { ConfirmOPDialog } from "@/components/producao/ConfirmOPDialog";
import { DeleteConfirmDialog } from "@/components/producao/DeleteConfirmDialog";
import { MoveOPDialog } from "@/components/producao/MoveOPDialog";
import { toast } from "sonner";
import { useProductionOrders, useProductionOrderMutations, type OpRow, type OpStatus as OpStatusT } from "@/hooks/useProductionOrders";

type OpStatus =
  | "rascunho" | "planejada" | "aguardando_separacao" | "separada" | "aguardando_liberacao"
  | "liberada_producao" | "em_producao" | "envase" | "rotulagem" | "aguardando_confirmacao" | "confirmada"
  | "aguardando_qualidade" | "qualidade_aprovada" | "liberada" | "concluida" | "bloqueada" | "cancelada";

const OP_STATUS_LABELS: Record<OpStatus, string> = {
  rascunho: "Pedido", planejada: "Planejada", aguardando_separacao: "Aguard. Separação",
  separada: "Separada", aguardando_liberacao: "Aguard. Liberação", liberada_producao: "Liberada p/ Produção",
  em_producao: "Em Produção", envase: "Envase", rotulagem: "Rotulagem",
  aguardando_confirmacao: "Aguard. Confirmação", confirmada: "Confirmada",
  aguardando_qualidade: "Aguard. Qualidade", qualidade_aprovada: "QA Aprovado", liberada: "Liberada",
  concluida: "Concluída", bloqueada: "Bloqueada", cancelada: "Cancelada",
};
const OP_STATUS_COLORS: Record<OpStatus, string> = {
  rascunho: "bg-gray-500", planejada: "bg-blue-500", aguardando_separacao: "bg-amber-500",
  separada: "bg-cyan-500", aguardando_liberacao: "bg-indigo-500", liberada_producao: "bg-teal-500",
  em_producao: "bg-orange-500", envase: "bg-orange-500", rotulagem: "bg-pink-500",
  aguardando_confirmacao: "bg-purple-500", confirmada: "bg-violet-500",
  aguardando_qualidade: "bg-yellow-500", qualidade_aprovada: "bg-green-500", liberada: "bg-emerald-500",
  concluida: "bg-green-600", bloqueada: "bg-red-500", cancelada: "bg-gray-400",
};
const PRIORITY_LABELS: Record<number, string> = { 1: "Urgente", 2: "Alta", 3: "Normal", 4: "Baixa", 5: "Planejado" };
const PRIORITY_BADGE_COLORS: Record<number, string> = { 1: "bg-red-500", 2: "bg-orange-500", 3: "bg-blue-500", 4: "bg-gray-400", 5: "bg-gray-300" };
const DEMAND_SOURCE_LABELS: Record<string, string> = { venda: "Venda", recorrencia: "Recorrência", safety_stock: "Safety Stock", pcp_manual: "PCP Manual", pos_venda: "Pós-venda" };

// Ao soltar o card numa coluna, aplica statuses[0] (o status "canônico" da coluna).
// Soltar em "Separação" → separada → deduz os insumos do HUB-RN (ver useProductionOrders).
const KANBAN_COLUMNS: { id: string; label: string; emoji: string; color: string; statuses: OpStatus[] }[] = [
  { id: "pedidos", label: "Pedidos", emoji: "📋", color: "#64748b", statuses: ["rascunho"] },
  { id: "planejada", label: "Planejada", emoji: "📅", color: "#3b82f6", statuses: ["planejada"] },
  { id: "separacao", label: "Separação", emoji: "🔧", color: "#f59e0b", statuses: ["separada", "aguardando_separacao"] },
  { id: "envase", label: "Envase", emoji: "🧪", color: "#f97316", statuses: ["envase", "aguardando_liberacao", "liberada_producao", "em_producao"] },
  { id: "rotulagem", label: "Rotulagem", emoji: "🏷️", color: "#ec4899", statuses: ["rotulagem"] },
  { id: "qualidade", label: "Qualidade", emoji: "🔍", color: "#8b5cf6", statuses: ["aguardando_confirmacao", "confirmada", "aguardando_qualidade", "qualidade_aprovada", "liberada"] },
  { id: "concluida", label: "Concluída", emoji: "📦", color: "#16a34a", statuses: ["concluida"] },
  { id: "bloqueada", label: "Bloqueada", emoji: "🚫", color: "#ef4444", statuses: ["bloqueada", "cancelada"] },
];

type OP = OpRow;

function KpiCard({ icon: Icon, label, value, sub, color }: { icon: typeof TrendingUp; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <div className={cn("flex items-center gap-2 text-sm", color)}>
        <Icon className="h-4 w-4" /><span>{label}</span>
      </div>
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

const dt = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);
// Só faz sentido cobrar "produzível" nas etapas antes da separação.
const EARLY_STAGES = new Set(["rascunho", "planejada", "aguardando_separacao"]);

export default function OrdensProducao() {
  const canManage = true; // acesso (gestor vs membro) entra na fase de permissões
  const { data: orders = [], isLoading } = useProductionOrders();
  const { create, remove, setStatus } = useProductionOrderMutations();
  const [bulkCreating, setBulkCreating] = useState(false);
  const producible = useProducibility();
  const { data: mrpProducts = [] } = useMrpProducts();
  const categoryById = useMemo(() => new Map(mrpProducts.map((p) => [p.id, p.category])), [mrpProducts]);

  // Etapa do kanban que a OP NÃO percorre, pela sua natureza/rota:
  //  • Semi-acabado (Envasado) → não passa por Rotulagem.
  //  • Produto Final "só rotular" → não passa por Envase (já vem envasado).
  const skippedColFor = (o: OP): string | null => {
    if (o.product_id && categoryById.get(o.product_id) === "Semi-acabado") return "rotulagem";
    if (o.production_route === "rotular") return "envase";
    return null;
  };
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  // Abre no Kanban por padrão e LEMBRA a última escolha (persiste no F5).
  const [viewMode, setViewMode] = useState<"list" | "kanban">(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("ops:op-view") : null;
    return saved === "list" || saved === "kanban" ? saved : "kanban";
  });
  useEffect(() => {
    try { localStorage.setItem("ops:op-view", viewMode); } catch { /* ignora */ }
  }, [viewMode]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<{ product_id: string; planned_quantity: number; demand_source?: string } | null>(null);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [repoCollapsed, setRepoCollapsed] = useState(false);
  const [repoShowAll, setRepoShowAll] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [editOp, setEditOp] = useState<OP | null>(null);
  const [confirmOp, setConfirmOp] = useState<OP | null>(null);
  const [deleteOp, setDeleteOp] = useState<OP | null>(null);
  const [pendingMove, setPendingMove] = useState<{ op: OP; toStatus: OpStatusT; fromLabel: string; toLabel: string; skipWarning: boolean } | null>(null);

  const colLabel = (status: OpStatus) => KANBAN_COLUMNS.find((c) => c.statuses.includes(status))?.label ?? OP_STATUS_LABELS[status];

  // ── Indicadores (todos calculados a partir das OPs reais) ──────────────────
  const abertas = orders.filter((o) => o.op_status !== "concluida" && o.op_status !== "cancelada");
  const aProduzir = abertas.reduce((s, o) => s + (o.planned_quantity || 0), 0);
  // Rendimento = aprovado / (aprovado + rejeitado), média das OPs com produção registrada.
  const finished = orders.filter((o) => (o.good_quantity ?? 0) + (o.rejected_quantity ?? 0) > 0);
  const rendimento = finished.length
    ? Math.round((finished.reduce((s, o) => {
        const g = o.good_quantity ?? 0, r = o.rejected_quantity ?? 0;
        return s + g / (g + r);
      }, 0) / finished.length) * 100)
    : null;
  const perdasTotais = orders.reduce((s, o) => s + (o.rejected_quantity ?? 0), 0);
  // Atrasadas: prazo vencido e ainda abertas. Prontas: dá pra separar agora.
  const atrasadas = abertas.filter((o) => o.need_date && o.need_date < todayISO()).length;
  const prontas = abertas.filter((o) => EARLY_STAGES.has(o.op_status) && producible.check(o.product_id, o.planned_quantity, o.production_route) === "ok").length;

  // Reposição sugerida: produzíveis no PONTO DE REPOSIÇÃO (perto do mínimo, não só
  // abaixo) e sem OP aberta. Repõe até 2× o mínimo. Crítico = já abaixo do mínimo.
  const REORDER_AT = 1.25; // dispara quando estoque ≤ 125% do mínimo
  const REPLENISH_TO = 2;  // sugere produzir até 2× o mínimo
  const openProductIds = useMemo(() => new Set(abertas.map((o) => o.product_id).filter(Boolean)), [abertas]);
  const suggestionsAll = useMemo(() => mrpProducts
    .filter((p) => (p.category === "Produto Final" || p.category === "Semi-acabado") && p.min_rn > 0)
    // Produção olha SÓ o HUB Natal (HUB-RN) — SP/LogHouse não contam pra reposição.
    .map((p) => ({ p, current: p.hubs.find((h) => h.warehouse_name === "HUB-RN")?.quantity ?? 0 }))
    .filter((x) => x.current <= x.p.min_rn * REORDER_AT)
    .map((x) => ({
      ...x,
      critico: x.current < x.p.min_rn,
      deficit: Math.max(1, Math.ceil(x.p.min_rn * REPLENISH_TO - x.current)),
      hasOpenOp: openProductIds.has(x.p.id),
      // nível de estoque relativo ao mínimo (0–100%), pra barrinha.
      level: Math.min(100, Math.round((x.current / x.p.min_rn) * 100)),
    }))
    // Acionáveis primeiro (sem OP), depois críticos, depois quem está mais baixo.
    .sort((a, b) => Number(a.hasOpenOp) - Number(b.hasOpenOp) || Number(b.critico) - Number(a.critico) || a.level - b.level),
    [mrpProducts, openProductIds]);
  const criticos = suggestionsAll.filter((s) => s.critico).length;
  const suggestions = onlyCritical ? suggestionsAll.filter((s) => s.critico) : suggestionsAll;
  // LB: ids que estão na fila de reposição — usado pra avisar dependência (semi baixo).
  const suggestedIds = useMemo(() => new Set(suggestionsAll.map((s) => s.p.id)), [suggestionsAll]);

  // LC: cria de uma vez as OPs de reposição das críticas (abaixo do mínimo, sem OP).
  const createAllCritical = async () => {
    const targets = suggestionsAll.filter((s) => s.critico && !s.hasOpenOp);
    if (!targets.length) return;
    setBulkCreating(true);
    let ok = 0;
    for (const t of targets) {
      try {
        await create.mutateAsync({ productId: t.p.id, productName: t.p.name, plannedQuantity: t.deficit, priority: 3, demandSource: "safety_stock", needDate: "", notes: "Reposição automática (estoque mínimo)" });
        ok++;
      } catch { /* segue as demais */ }
    }
    setBulkCreating(false);
    toast[ok ? "success" : "error"](ok ? `${ok} OP(s) de reposição criadas.` : "Não foi possível criar as OPs.");
  };

  const filtered = useMemo(() => orders.filter((o) => {
    if (statusFilter !== "all" && o.op_status !== statusFilter) return false;
    if (priorityFilter !== "all" && String(o.priority) !== priorityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!o.op_number.toLowerCase().includes(q) && !o.sku_code.toLowerCase().includes(q) && !o.sku_name.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [orders, searchQuery, statusFilter, priorityFilter]);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3"><Factory className="h-6 w-6 text-orange-500" /> Ordens de Produção</h1>
            <p className="text-muted-foreground mt-1">Gestão e acompanhamento de OPs</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              <button onClick={() => setViewMode("kanban")} className={`px-3 py-2 text-xs flex items-center gap-1.5 transition-colors ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}>
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban
              </button>
              <button onClick={() => setViewMode("list")} className={`px-3 py-2 text-xs flex items-center gap-1.5 border-l transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}>
                <List className="h-3.5 w-3.5" /> Lista
              </button>
            </div>
            {canManage && <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova OP</Button>}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard icon={Factory} label="OPs Abertas" value={String(abertas.length)} sub="em andamento" color="text-orange-500" />
          <KpiCard icon={CheckCircle2} label="Prontas p/ Separar" value={String(prontas)} sub="com insumo em estoque" color="text-emerald-500" />
          <KpiCard icon={CalendarClock} label="Atrasadas" value={String(atrasadas)} sub="prazo vencido" color={atrasadas > 0 ? "text-red-500" : "text-muted-foreground"} />
          <KpiCard icon={Target} label="A Produzir" value={`${aProduzir} un`} sub="planejado nas abertas" color="text-blue-500" />
          <KpiCard icon={TrendingUp} label="Rendimento Médio" value={rendimento != null ? `${rendimento}%` : "—"} sub="aprovado / produzido" color="text-green-500" />
          <KpiCard icon={XCircle} label="Perdas Totais" value={String(perdasTotais)} sub="unidades rejeitadas" color="text-red-500" />
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por OP ou SKU..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todos os status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(OP_STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todas as prioridades" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              {Object.entries(PRIORITY_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* LE: insumos-gargalo (em falta, travam vários produtos) */}
        {canManage && producible.bottlenecks.length > 0 && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <div className="flex items-center gap-2 mb-1.5 text-sm font-semibold text-red-600 dark:text-red-400">
              <XCircle className="h-4 w-4" /> Insumo em falta travando produção
            </div>
            <div className="flex flex-wrap gap-2">
              {producible.bottlenecks.map((b) => (
                <span key={b.insumoId} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-card px-2.5 py-1 text-xs">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-[11px] text-muted-foreground">afeta {b.affected} produto{b.affected > 1 ? "s" : ""}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Reposição sugerida (no ponto de reposição) */}
        {canManage && suggestionsAll.length > 0 && (
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <button onClick={() => setRepoCollapsed((v) => !v)} className="flex items-center gap-2 min-w-0">
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", repoCollapsed ? "-rotate-90" : "")} />
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">Reposição sugerida</span>
              </button>
              <span className="text-xs text-muted-foreground">
                {suggestionsAll.length} no ponto de reposição{criticos > 0 && <> · <span className="text-red-500 font-medium">{criticos} abaixo do mínimo</span></>}
              </span>
              {criticos > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setOnlyCritical((v) => !v)}
                    className={cn(
                      "text-xs rounded-md px-2.5 py-1.5 font-medium border transition-colors",
                      onlyCritical ? "bg-red-500 text-white border-red-500" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    só críticos
                  </button>
                  {suggestionsAll.some((s) => s.critico && !s.hasOpenOp) && (
                    <Button size="sm" variant="destructive" className="h-8 gap-1.5" disabled={bulkCreating} onClick={() => setBulkConfirm(true)}>
                      {bulkCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Criar {suggestionsAll.filter((s) => s.critico && !s.hasOpenOp).length} OPs
                    </Button>
                  )}
                </div>
              )}
            </div>
            {!repoCollapsed && (
            <div className="grid gap-3 p-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {(repoShowAll ? suggestions : suggestions.slice(0, 16)).map(({ p, current, deficit, critico, hasOpenOp, level }) => {
                // LA: rota recomendada — se tem envasado em estoque, dá pra só rotular.
                const semiId = producible.semiOf(p.id);
                const routeHint = semiId ? (producible.check(p.id, deficit, "rotular") === "ok" ? "rotular" : "zero") : null;
                const cascade = routeHint === "zero" && semiId && suggestedIds.has(semiId);
                return (
                <div
                  key={p.id}
                  className={cn(
                    "flex flex-col rounded-xl border p-3 transition-colors",
                    hasOpenOp ? "border-border bg-muted/30"
                      : critico ? "border-red-500/30 bg-red-500/[0.03]" : "border-amber-500/25 bg-amber-500/[0.03]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", hasOpenOp ? "bg-muted-foreground/40" : critico ? "bg-red-500" : "bg-amber-500")} />
                        <p className="text-sm font-semibold truncate">{p.name}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.product_code}</p>
                    </div>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                      p.category === "Semi-acabado" ? "bg-teal-600/15 text-teal-600 dark:text-teal-400" : "bg-emerald-700/15 text-emerald-600 dark:text-emerald-400",
                    )}>
                      {p.category === "Semi-acabado" ? "Semi-acabado" : "Produto Final"}
                    </span>
                  </div>

                  {/* Nível de estoque vs mínimo */}
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Estoque</span>
                      <span className="tabular-nums font-medium">
                        <span className={critico ? "text-red-500" : ""}>{current.toLocaleString("pt-BR")}</span>
                        <span className="text-muted-foreground"> / mín {p.min_rn.toLocaleString("pt-BR")} {p.stock_unit}</span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full", critico ? "bg-red-500" : "bg-amber-500")} style={{ width: `${Math.max(4, level)}%` }} />
                    </div>
                  </div>

                  {/* Rota recomendada / dependência */}
                  {!hasOpenOp && routeHint && (
                    <p className={cn("text-[11px] font-medium mt-2", routeHint === "rotular" ? "text-pink-600 dark:text-pink-400" : "text-orange-600 dark:text-orange-400")}>
                      {routeHint === "rotular" ? "🏷️ dá pra só rotular (tem envasado)" : "⚙️ produzir do zero (sem envasado)"}
                    </p>
                  )}
                  {!hasOpenOp && cascade && (
                    <p className="text-[11px] font-medium text-red-600 dark:text-red-400 mt-0.5">⤷ Envasado também baixo — produza ele antes</p>
                  )}

                  {/* Ação */}
                  <div className="mt-3 pt-2 border-t border-border/60">
                    {hasOpenOp ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                        <Clock className="h-3 w-3" /> OP em andamento
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8 gap-1.5"
                        onClick={() => { setCreateInitial({ product_id: p.id, planned_quantity: deficit, demand_source: "safety_stock" }); setCreateOpen(true); }}
                      >
                        <Plus className="h-3.5 w-3.5" /> Criar OP · {deficit} {p.stock_unit}
                      </Button>
                    )}
                  </div>
                </div>
                );
              })}
              {suggestions.length > 16 && (
                <button onClick={() => setRepoShowAll((v) => !v)} className="flex items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 font-medium p-3 transition-colors">
                  {repoShowAll ? "ver menos" : `+${suggestions.length - 16} mais`}
                </button>
              )}
            </div>
            )}
          </div>
        )}

        {/* Confirmação da criação em lote (LC) */}
        <AlertDialog open={bulkConfirm} onOpenChange={setBulkConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Criar OPs de reposição?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso vai gerar <strong>{suggestionsAll.filter((s) => s.critico && !s.hasOpenOp).length} ordens de produção</strong> para os produtos abaixo do estoque mínimo (fonte “Safety Stock”). Você pode ajustar ou excluir cada uma depois.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkCreating}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); createAllCritical().then(() => setBulkConfirm(false)); }} disabled={bulkCreating}>
                {bulkCreating ? "Criando…" : "Criar OPs"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Kanban ou Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
        ) : viewMode === "kanban" ? (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {KANBAN_COLUMNS.map((col) => {
              // Ordena por prioridade (1 = urgente primeiro), depois prazo mais próximo.
              const allItems = filtered
                .filter((o) => col.statuses.includes(o.op_status))
                .sort((a, b) => (a.priority - b.priority) || (a.need_date ?? "9999").localeCompare(b.need_date ?? "9999"));
              // Concluída/Bloqueada acumulam — mostra as recentes e resume o resto.
              const CAP = 12;
              const capped = col.id === "concluida" || col.id === "bloqueada";
              const items = capped ? allItems.slice(0, CAP) : allItems;
              const hiddenCount = allItems.length - items.length;
              const isOver = overCol === col.id;
              // Durante o arraste, apaga a coluna que a OP arrastada não percorre.
              const draggedOp = dragId ? orders.find((o) => o.id === dragId) : null;
              const isSkipped = !!draggedOp && skippedColFor(draggedOp) === col.id;
              const dropHere = () => {
                if (dragId) {
                  const cur = orders.find((o) => o.id === dragId);
                  const target = col.statuses[0];
                  // Não muda direto: abre a confirmação (ciente do estoque na Separação).
                  if (cur && cur.op_status !== target) {
                    setPendingMove({ op: cur, toStatus: target, fromLabel: colLabel(cur.op_status), toLabel: col.label, skipWarning: skippedColFor(cur) === col.id });
                  }
                }
                setDragId(null); setOverCol(null);
              };
              return (
                <div
                  key={col.id}
                  onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
                  onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
                  onDrop={dropHere}
                  className={cn(
                    "w-64 shrink-0 rounded-2xl border bg-board-surface/40 flex flex-col transition-all",
                    isOver ? "border-primary" : "border-border",
                    isSkipped ? "opacity-40" : "",
                  )}
                >
                  <div className="rounded-t-2xl px-3 py-2.5 border-b border-border flex items-center justify-between gap-2" style={{ background: col.color + "12" }}>
                    <span className="text-sm font-semibold flex items-center gap-1.5">
                      {col.emoji} {col.label}
                      {isSkipped && <span className="text-[9px] font-normal text-muted-foreground">(pula)</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      {canManage && col.id === "planejada" && (
                        <button onClick={() => { setCreateInitial(null); setCreateOpen(true); }} title="Nova OP" className="p-0.5 rounded hover:bg-black/10 text-muted-foreground hover:text-foreground transition-colors">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <span className="text-xs font-bold rounded-full px-2 py-0.5" style={{ background: col.color + "20", color: col.color }}>{allItems.length}</span>
                    </div>
                  </div>
                  <div className="p-2 space-y-2 min-h-[80px]">
                    {items.map((o) => {
                      const prod = EARLY_STAGES.has(o.op_status) ? producible.check(o.product_id, o.planned_quantity, o.production_route) : null;
                      const overdue = !!o.need_date && o.op_status !== "concluida" && o.op_status !== "cancelada" && o.need_date < todayISO();
                      const age = daysSince(o.created_at);
                      return (
                      <div
                        key={o.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); setDragId(o.id); }}
                        onDragEnd={() => { setDragId(null); setOverCol(null); }}
                        className={cn(
                          "rounded-xl border bg-card p-3 relative overflow-hidden cursor-grab active:cursor-grabbing",
                          dragId === o.id ? "opacity-50" : "",
                          o.priority <= 2 && o.op_status !== "concluida" && o.op_status !== "cancelada" ? "border-red-500/40 ring-1 ring-red-500/20" : "border-border",
                        )}
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: col.color }} />
                        <div className="flex items-center justify-between gap-2 pl-1.5">
                          <span className="font-mono text-xs font-medium text-blue-500">{o.op_number}</span>
                          <Badge variant="outline" className={cn("text-white border-0 text-[10px]", PRIORITY_BADGE_COLORS[o.priority])}>{PRIORITY_LABELS[o.priority]}</Badge>
                        </div>
                        <p className="text-sm font-semibold mt-1 pl-1.5">{o.sku_name}</p>
                        <p className="text-xs text-muted-foreground pl-1.5">{o.planned_quantity} un · {DEMAND_SOURCE_LABELS[o.demand_source]}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pl-1.5">
                          {o.production_route && (
                            <span className={cn(
                              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              o.production_route === "rotular" ? "bg-pink-500/15 text-pink-600 dark:text-pink-400" : "bg-orange-500/15 text-orange-600 dark:text-orange-400",
                            )}>
                              {o.production_route === "rotular" ? "🏷️ Só rotular" : "⚙️ Do zero"}
                            </span>
                          )}
                          {prod === "ok" && (
                            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> pronto p/ separar
                            </span>
                          )}
                          {prod === "falta" && (
                            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-destructive/15 text-destructive">
                              <AlertTriangle className="h-3 w-3" /> falta insumo
                            </span>
                          )}
                          {prod === "sem_ficha" && (
                            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
                              sem ficha
                            </span>
                          )}
                          {o.need_date && (
                            <span className={cn(
                              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              overdue ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
                            )}>
                              <CalendarClock className="h-3 w-3" /> {dt(o.need_date)}
                            </span>
                          )}
                          {age != null && age > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                              <Clock className="h-3 w-3" /> {age}d
                            </span>
                          )}
                        </div>
                      </div>
                      );
                    })}
                    {items.length === 0 && <p className="text-[11px] text-muted-foreground/50 text-center py-4">Vazio</p>}
                    {hiddenCount > 0 && (
                      <button onClick={() => { setStatusFilter(col.statuses[0]); setViewMode("list"); }} className="w-full text-[11px] text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-muted/50 transition-colors">
                        +{hiddenCount} mais — ver na Lista
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Factory className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Nenhuma OP encontrada</p>
            <p className="text-sm">Tente ajustar os filtros de busca.</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OP</TableHead><TableHead>SKU</TableHead><TableHead>Qtd</TableHead>
                  <TableHead>Prioridade</TableHead><TableHead>Status</TableHead><TableHead>Demanda</TableHead>
                  <TableHead>Necessidade</TableHead>{canManage && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell><span className="font-mono text-sm text-blue-500 font-medium">{o.op_number}</span></TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <span className="font-mono text-sm text-green-500 font-medium">{o.sku_code}</span>
                        <p className="text-xs text-muted-foreground">{o.sku_name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <span className="font-bold text-sm">{o.planned_quantity}</span>
                        {(o.good_quantity != null || o.rejected_quantity != null) && (
                          <p className="text-xs text-muted-foreground">{o.good_quantity ?? 0} ok / {o.rejected_quantity ?? 0} rej</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className={cn("text-white border-0 text-xs", PRIORITY_BADGE_COLORS[o.priority])}>{PRIORITY_LABELS[o.priority]}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={cn("text-white border-0 text-xs", OP_STATUS_COLORS[o.op_status])}>{OP_STATUS_LABELS[o.op_status]}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{DEMAND_SOURCE_LABELS[o.demand_source] || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{dt(o.need_date)}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {o.op_status === "aguardando_confirmacao" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-purple-500" onClick={() => setConfirmOp(o)} title="Confirmar Produção"><ClipboardCheck className="h-4 w-4" /></Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditOp(o)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteOp(o)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

      </div>

      {/* Dialogs */}
      <OPFormDialog
        key={createInitial?.product_id ?? "new"}
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) setCreateInitial(null); }}
        mode="create"
        initial={createInitial ?? undefined}
      />
      {editOp && (
        <OPFormDialog
          key={editOp.id}
          open={!!editOp}
          onOpenChange={(v) => { if (!v) setEditOp(null); }}
          mode="edit"
          id={editOp.id}
          initial={{
            product_id: editOp.product_id ?? "",
            product_label: editOp.sku_name,
            planned_quantity: editOp.planned_quantity,
            priority: String(editOp.priority),
            demand_source: editOp.demand_source,
            need_date: editOp.need_date ?? "",
          }}
        />
      )}
      <MoveOPDialog
        key={pendingMove?.op.id ?? "none"}
        open={!!pendingMove}
        onOpenChange={(v) => { if (!v) setPendingMove(null); }}
        op={pendingMove?.op ?? null}
        fromLabel={pendingMove?.fromLabel ?? ""}
        toLabel={pendingMove?.toLabel ?? ""}
        toStatus={pendingMove?.toStatus ?? "planejada"}
        skipWarning={pendingMove?.skipWarning ?? false}
        pending={setStatus.isPending}
        onConfirm={({ route, good, rejected }) => {
          if (!pendingMove) return;
          const { op, toStatus, toLabel } = pendingMove;
          // Só grava a rota quando ela é decidida na separação (evita sobrescrever).
          const routeArg = toStatus === "separada" ? { route } : {};
          const qualArg = toStatus === "concluida" ? { good, rejected } : {};
          setStatus.mutate(
            { id: op.id, op_status: toStatus, ...routeArg, ...qualArg },
            {
              onSuccess: () => { toast.success(`OP movida para ${toLabel}.`); setPendingMove(null); },
              onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível mover a OP."),
            },
          );
        }}
      />
      <ConfirmOPDialog
        open={!!confirmOp}
        onOpenChange={(v) => { if (!v) setConfirmOp(null); }}
        order={confirmOp ? { id: confirmOp.id, op_number: confirmOp.op_number, sku_code: confirmOp.sku_code, sku_name: confirmOp.sku_name, planned_quantity: confirmOp.planned_quantity } : null}
      />
      <DeleteConfirmDialog
        open={!!deleteOp}
        onOpenChange={(v) => { if (!v) setDeleteOp(null); }}
        title="Excluir OP?"
        description={`Esta ação não pode ser desfeita. A ordem de produção ${deleteOp?.op_number ?? ""} será excluída permanentemente.`}
        onConfirm={deleteOp ? async () => {
          try { await remove.mutateAsync(deleteOp.id); toast.success("Ordem de produção excluída."); setDeleteOp(null); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível excluir a OP."); }
        } : undefined}
      />
    </div>
  );
}
