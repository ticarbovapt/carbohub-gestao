import { useParams, useNavigate } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Factory,
  Package,
  Calendar,
  Clock,
  User,
  Tag,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  ClipboardCheck,
  Layers,
  BarChart3,
  FileText,
} from "lucide-react";
import {
  useProductionOrderOP,
  useUpdateProductionOrderOP,
  OP_STATUS_LABELS,
  OP_STATUS_COLORS,
  OP_STATUS_TRANSITIONS,
  DEMAND_SOURCE_LABELS,
  PRIORITY_LABELS,
  type OpStatus,
} from "@/hooks/useProductionOrders";
import { useAuth } from "@/contexts/AuthContext";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { EditOPDialog } from "@/components/production-orders/EditOPDialog";
import { DeleteOPDialog } from "@/components/production-orders/DeleteOPDialog";
import { ConfirmOPDialog } from "@/components/production-orders/ConfirmOPDialog";

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_STEP: Partial<Record<OpStatus, number>> = {
  rascunho: 0, planejada: 1, aguardando_separacao: 2, separada: 3,
  aguardando_liberacao: 4, liberada_producao: 5, em_producao: 6,
  aguardando_confirmacao: 7, confirmada: 8, aguardando_qualidade: 9,
  liberada: 10, concluida: 11,
};
const TOTAL_STEPS = 12;

const PRIORITY_COLORS: Record<number, string> = {
  1: "bg-red-500/10 text-red-700 border-red-500/30",
  2: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  3: "bg-gray-500/10 text-gray-600 border-gray-400/30",
  4: "bg-slate-500/10 text-slate-500 border-slate-400/20",
  5: "bg-slate-500/10 text-slate-400 border-slate-400/20",
};

function getQualityIcon(result: string) {
  switch (result) {
    case "aprovada":  return <CheckCircle2  className="h-4 w-4 text-green-500" />;
    case "bloqueada": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "reprovada": return <XCircle       className="h-4 w-4 text-destructive" />;
    default:          return <Clock         className="h-4 w-4 text-muted-foreground" />;
  }
}

// ── Detail Field ─────────────────────────────────────────────────────────────
function DetailField({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={cn("text-sm font-medium text-foreground", mono && "font-mono")}>{value ?? "—"}</div>
    </div>
  );
}

// ── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Timeline Step ─────────────────────────────────────────────────────────────
function TimelineStep({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 text-xs", done ? "text-green-600" : active ? "text-primary font-semibold" : "text-muted-foreground")}>
      <div className={cn("h-2 w-2 rounded-full flex-shrink-0",
        done ? "bg-green-500" : active ? "bg-primary" : "bg-muted-foreground/30"
      )} />
      {label}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProductionOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isManager } = useAuth();
  const canManage = isAdmin || isManager;

  const { data: order, isLoading } = useProductionOrderOP(id);
  const updateOP = useUpdateProductionOrderOP();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) {
    return (
      <BoardLayout>
        <div className="space-y-6 max-w-5xl mx-auto">
          <Skeleton className="h-12 w-80" />
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-48" />
        </div>
      </BoardLayout>
    );
  }

  if (!order) {
    return (
      <BoardLayout>
        <div className="text-center py-20 text-muted-foreground">
          <Factory className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">OP não encontrada</p>
          <Button variant="link" onClick={() => navigate("/production-orders")}>
            Voltar para Ordens de Produção
          </Button>
        </div>
      </BoardLayout>
    );
  }

  const statusStep = STATUS_STEP[order.op_status] ?? 0;
  const progressPct = (statusStep / (TOTAL_STEPS - 1)) * 100;
  const nextStatuses = OP_STATUS_TRANSITIONS[order.op_status] ?? [];
  const statusColor = OP_STATUS_COLORS[order.op_status] ?? "bg-gray-500";

  async function advanceTo(next: OpStatus) {
    await updateOP.mutateAsync({ id: order!.id, op_status: next });
  }

  const yieldPct = order.planned_quantity > 0 && order.good_quantity != null
    ? Math.round((order.good_quantity / order.planned_quantity) * 100)
    : null;

  return (
    <BoardLayout>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Header bar ── */}
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/production-orders")} className="mt-0.5">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {order.title || `OP-${order.id.slice(0, 8).toUpperCase()}`}
              </span>
              <Badge className={cn("text-white border-0 text-xs", statusColor)}>
                {OP_STATUS_LABELS[order.op_status]}
              </Badge>
              <Badge variant="outline" className={cn("text-xs", PRIORITY_COLORS[order.priority] ?? "")}>
                {PRIORITY_LABELS[order.priority] ?? `P${order.priority}`}
              </Badge>
            </div>
            <h1 className="text-2xl font-bold mt-1 leading-tight">
              {order.sku_name || order.title || "Ordem de Produção"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {order.sku_code && <span className="font-mono mr-2">{order.sku_code}</span>}
              Criada {formatDistanceToNow(new Date(order.created_at), { locale: ptBR, addSuffix: true })}
            </p>
          </div>

          {/* Action buttons */}
          {canManage && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {order.op_status === "aguardando_confirmacao" && (
                <Button size="sm" className="gap-2 carbo-gradient" onClick={() => setConfirmOpen(true)}>
                  <ClipboardCheck className="h-4 w-4" /> Confirmar
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
                <Edit className="h-4 w-4" /> Editar
              </Button>
              <Button size="sm" variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* ── Progress bar + pipeline ── */}
        <SectionCard title="Pipeline de Produção" icon={Layers}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Progress value={progressPct} className="flex-1 h-2 [&>div]:bg-primary" />
              <span className="text-xs font-mono text-muted-foreground w-10 text-right">{Math.round(progressPct)}%</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {(Object.entries(STATUS_STEP) as [OpStatus, number][])
                .sort(([,a],[,b]) => a - b)
                .map(([s, step]) => (
                  <TimelineStep
                    key={s}
                    label={OP_STATUS_LABELS[s]}
                    done={step < statusStep}
                    active={s === order.op_status}
                  />
                ))
              }
            </div>
            {/* Next-step actions */}
            {canManage && nextStatuses.length > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
                <span className="text-xs text-muted-foreground">Avançar para:</span>
                {nextStatuses.map(next => (
                  <Button
                    key={next}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    disabled={updateOP.isPending}
                    onClick={() => advanceTo(next)}
                  >
                    {OP_STATUS_LABELS[next]} <ChevronRight className="h-3 w-3" />
                  </Button>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Two-column layout ── */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* LEFT — main info */}
          <div className="lg:col-span-2 space-y-6">

            {/* Quantities */}
            <SectionCard title="Quantidades" icon={BarChart3}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center rounded-xl bg-muted/40 p-3">
                  <p className="text-2xl font-bold">{order.planned_quantity ?? order.quantity ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Planejado</p>
                </div>
                <div className="text-center rounded-xl bg-green-500/10 p-3">
                  <p className="text-2xl font-bold text-green-600">{order.good_quantity ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Bons</p>
                </div>
                <div className="text-center rounded-xl bg-destructive/10 p-3">
                  <p className="text-2xl font-bold text-destructive">{order.rejected_quantity ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Rejeitados</p>
                </div>
                <div className="text-center rounded-xl bg-blue-500/10 p-3">
                  <p className="text-2xl font-bold text-blue-600">{yieldPct != null ? `${yieldPct}%` : "—"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Rendimento</p>
                </div>
              </div>
            </SectionCard>

            {/* Materials list */}
            {order.materials && order.materials.length > 0 && (
              <SectionCard title="Materiais / BOM" icon={Package}>
                <div className="space-y-2">
                  {order.materials.map(mat => {
                    const sep = mat.theoretical_quantity > 0
                      ? Math.round((mat.separated_quantity / mat.theoretical_quantity) * 100)
                      : 0;
                    return (
                      <div key={mat.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{mat.product_name}</p>
                            {mat.is_critical && <Badge variant="destructive" className="text-[10px] h-4 px-1.5">Crítico</Badge>}
                          </div>
                          <Progress value={sep} className="h-1.5 mt-1.5 [&>div]:bg-blue-500" />
                        </div>
                        <div className="text-right flex-shrink-0 text-xs">
                          <p className="font-mono font-semibold">{mat.separated_quantity}/{mat.theoretical_quantity}</p>
                          <p className="text-muted-foreground">{mat.is_separated ? "✓ Separado" : "Pendente"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {/* Notes / Desvio */}
            {(order.description || order.deviation_notes) && (
              <SectionCard title="Observações" icon={FileText}>
                <div className="space-y-3">
                  {order.description && (
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Descrição</p>
                      <p className="text-sm">{order.description}</p>
                    </div>
                  )}
                  {order.deviation_notes && (
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Desvios registrados</p>
                      <p className="text-sm text-amber-600">{order.deviation_notes}</p>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}
          </div>

          {/* RIGHT — sidebar metadata */}
          <div className="space-y-6">

            <SectionCard title="Detalhes" icon={Tag}>
              <div className="space-y-4">
                <DetailField label="Fonte de Demanda" value={
                  <Badge variant="outline" className="text-xs">
                    {DEMAND_SOURCE_LABELS[order.demand_source] ?? order.demand_source}
                  </Badge>
                } />
                <Separator />
                <DetailField label="Qualidade" value={
                  <div className="flex items-center gap-1.5">
                    {getQualityIcon(order.quality_result)}
                    <span className="capitalize">{order.quality_result}</span>
                  </div>
                } />
                <Separator />
                {order.need_date && (
                  <>
                    <DetailField label="Prazo" value={
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {format(new Date(order.need_date), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                    } />
                    <Separator />
                  </>
                )}
                {order.started_at && (
                  <>
                    <DetailField label="Início" value={format(new Date(order.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} />
                    <Separator />
                  </>
                )}
                {order.finished_at && (
                  <>
                    <DetailField label="Conclusão" value={format(new Date(order.finished_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} />
                    <Separator />
                  </>
                )}
                <DetailField label="Criada em" value={format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} />
                <Separator />
                <DetailField label="Atualizada" value={formatDistanceToNow(new Date(order.updated_at), { locale: ptBR, addSuffix: true })} />
                <Separator />
                <DetailField label="ID" value={order.id.slice(0, 8).toUpperCase()} mono />
              </div>
            </SectionCard>

          </div>
        </div>
      </div>

      {/* Dialogs */}
      <EditOPDialog open={editOpen} onOpenChange={setEditOpen} order={order} />
      <DeleteOPDialog open={deleteOpen} onOpenChange={setDeleteOpen} order={order} onDeleted={() => navigate("/production-orders")} />
      <ConfirmOPDialog open={confirmOpen} onOpenChange={setConfirmOpen} order={order} />
    </BoardLayout>
  );
}
