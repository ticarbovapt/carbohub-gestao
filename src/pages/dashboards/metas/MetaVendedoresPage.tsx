import { useState } from "react";
import { format, startOfMonth, addMonths, subMonths, getDaysInMonth, getDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, Trophy, TrendingUp, Plus, Pencil, Trash2, Target,
} from "lucide-react";
import {
  useSalesTargetsWithProgress,
  useUpsertSalesTarget,
  useDeleteSalesTarget,
  type SalesTargetWithProgress,
} from "@/hooks/useSalesTargets";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useAuth } from "@/contexts/AuthContext";
import { getProgressColor } from "@/hooks/useMetaEcommerce";

// ─────────────────────────────────────────────────────────────────────────────
// Permission: only command/* or */head (or TI head, which is already superuser)
// ─────────────────────────────────────────────────────────────────────────────

function useCanSetTargets(): boolean {
  const { profile } = useAuth();
  if (!profile) return false;
  if (profile.department === "command") return true;
  if (profile.funcao === "head") return true;
  if (profile.secondary_funcao === "head") return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

const COLOR_MAP = {
  green:  { bar: "#22c55e", badge: "success"     as const, text: "text-green-500"         },
  yellow: { bar: "#f59e0b", badge: "warning"     as const, text: "text-amber-500"         },
  red:    { bar: "#ef4444", badge: "destructive" as const, text: "text-red-500"           },
  gray:   { bar: "#64748b", badge: "secondary"   as const, text: "text-muted-foreground"  },
};

const LINHAS_OPTIONS = [
  { value: "", label: "Todas as linhas (geral)" },
  { value: "carboze_100ml",      label: "CarboZé 100ml" },
  { value: "carboze_1l",         label: "CarboZé 1L" },
  { value: "carboze_sache_10ml", label: "CarboZé Sachê 10ml" },
  { value: "carbopro",           label: "CarboPRO 100ml" },
  { value: "carbovapt",          label: "CarboVapt" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Target dialog (create / edit)
// ─────────────────────────────────────────────────────────────────────────────

interface TargetDialogProps {
  open: boolean;
  onClose: () => void;
  month: string;
  editing: { id?: string; vendedor_id: string; target_amount: number; target_qty: number; linha: string } | null;
}

function TargetDialog({ open, onClose, month, editing }: TargetDialogProps) {
  const { data: teamMembers = [] } = useTeamMembers();
  const upsert = useUpsertSalesTarget();

  const [vendedorId, setVendedorId]       = useState(editing?.vendedor_id ?? "");
  const [targetAmount, setTargetAmount]   = useState(String(editing?.target_amount ?? 0));
  const [targetQty, setTargetQty]         = useState(String(editing?.target_qty ?? 0));
  const [linha, setLinha]                 = useState(editing?.linha ?? "");

  const isEdit = !!editing?.id;

  const handleSave = async () => {
    if (!vendedorId) return;
    await upsert.mutateAsync({
      vendedor_id: vendedorId,
      month,
      target_amount: Number(targetAmount) || 0,
      target_qty: Number(targetQty) || 0,
      linha: linha || null,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-carbo-green" />
            {isEdit ? "Editar Meta" : "Nova Meta"}
          </DialogTitle>
          <DialogDescription>
            {format(new Date(month), "MMMM 'de' yyyy", { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Vendedor</Label>
            <Select value={vendedorId} onValueChange={setVendedorId} disabled={isEdit}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o vendedor" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers
                  .filter(m => m.status === "active")
                  .map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name || m.username || m.id}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Meta de Faturamento (R$)</Label>
            <Input
              type="number"
              min={0}
              value={targetAmount}
              onChange={e => setTargetAmount(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Meta de Pedidos (qtd)</Label>
            <Input
              type="number"
              min={0}
              value={targetQty}
              onChange={e => setTargetQty(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Linha de produto</Label>
            <Select value={linha} onValueChange={setLinha}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as linhas (geral)" />
              </SelectTrigger>
              <SelectContent>
                {LINHAS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!vendedorId || upsert.isPending}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function MetaVendedoresPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{
    id?: string; vendedor_id: string; target_amount: number; target_qty: number; linha: string;
  } | null>(null);

  const canManage = useCanSetTargets();
  const monthStr = month.toISOString().slice(0, 10);
  const { data: targets = [], isLoading } = useSalesTargetsWithProgress(monthStr);
  const deleteMeta = useDeleteSalesTarget();

  const today = new Date();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth();
  const dayOfMonth  = isCurrentMonth ? getDate(today) : getDaysInMonth(month);
  const daysInMonth = getDaysInMonth(month);
  const expectedPct = (dayOfMonth / daysInMonth) * 100;

  // Sort by pct descending
  const sorted = [...targets].sort((a, b) => (b.pct_amount || 0) - (a.pct_amount || 0));

  // Totals
  const totalTarget = targets.reduce((s, t) => s + Number(t.target_amount), 0);
  const totalActual = targets.reduce((s, t) => s + (t.actual_amount || 0), 0);
  const totalPct    = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
  const hitting     = targets.filter(t => (t.pct_amount || 0) >= 100).length;

  const openNew = () => {
    setEditing({ vendedor_id: "", target_amount: 0, target_qty: 0, linha: "" });
    setDialogOpen(true);
  };

  const openEdit = (t: SalesTargetWithProgress) => {
    setEditing({ id: t.id, vendedor_id: t.vendedor_id, target_amount: t.target_amount, target_qty: t.target_qty, linha: t.linha || "" });
    setDialogOpen(true);
  };

  const totalColor = getProgressColor(totalActual, totalTarget, dayOfMonth, daysInMonth);
  const totalColors = COLOR_MAP[totalColor];

  return (
    <BoardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              🏆 Meta de Vendedores
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Performance e metas mensais por vendedor
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Month selector */}
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => setMonth(m => startOfMonth(subMonths(m, 1)))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold w-32 text-center capitalize">
                {format(month, "MMM 'de' yyyy", { locale: ptBR })}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => setMonth(m => startOfMonth(addMonths(m, 1)))}
                disabled={isCurrentMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {canManage && (
              <Button size="sm" className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Nova Meta
              </Button>
            )}
          </div>
        </div>

        {/* Context line */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400">
          <TrendingUp className="h-4 w-4 shrink-0" />
          <span>
            Esperado hoje: <strong>{fmtPct(expectedPct)}</strong> (dia {dayOfMonth}/{daysInMonth}) ·{" "}
            <span className="text-green-400 font-medium">verde</span> = na meta ·{" "}
            <span className="text-amber-400 font-medium">amarelo</span> = atenção ·{" "}
            <span className="text-red-400 font-medium">vermelho</span> = abaixo da projeção
          </span>
        </div>

        {/* Total summary */}
        {targets.length > 0 && (
          <CarboCard className={`border ${totalColor === "green" ? "border-green-500/30" : totalColor === "yellow" ? "border-amber-500/30" : totalColor === "red" ? "border-red-500/30" : ""}`}>
            <CarboCardContent className="p-4">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Total do Time</p>
                  <div className="flex items-end gap-2 mt-0.5">
                    <p className={`text-2xl font-bold tabular-nums ${totalColors.text}`}>{fmtBRL(totalActual)}</p>
                    <p className="text-muted-foreground mb-0.5">/ {fmtBRL(totalTarget)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums">{hitting}/{targets.length}</p>
                    <p className="text-[10px] text-muted-foreground">na meta</p>
                  </div>
                  <CarboBadge variant={totalColors.badge}>{fmtPct(totalPct)}</CarboBadge>
                </div>
              </div>
              <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, totalPct)}%`, backgroundColor: totalColors.bar }} />
                {expectedPct > 0 && expectedPct < 100 && (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
                    style={{ left: `${expectedPct}%` }} />
                )}
              </div>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Vendedor cards */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <CarboCard>
            <CarboCardContent className="py-16 text-center space-y-3">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground">Nenhuma meta definida para este mês.</p>
              {canManage && (
                <Button variant="outline" onClick={openNew}>
                  <Plus className="h-4 w-4 mr-1" />
                  Criar primeira meta
                </Button>
              )}
            </CarboCardContent>
          </CarboCard>
        ) : (
          <div className="space-y-3">
            {sorted.map((t, idx) => {
              const pct = t.pct_amount || 0;
              const color = getProgressColor(pct, 100, dayOfMonth, daysInMonth);
              const colors = COLOR_MAP[color];

              return (
                <CarboCard key={t.id}
                  className={`border ${color === "red" ? "border-red-500/30" : color === "yellow" ? "border-amber-500/30" : ""}`}>
                  <CarboCardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {/* Rank medal */}
                      <div className="w-7 text-center shrink-0">
                        {idx === 0 ? <span className="text-xl">🥇</span>
                         : idx === 1 ? <span className="text-xl">🥈</span>
                         : idx === 2 ? <span className="text-xl">🥉</span>
                         : <span className="text-sm font-bold text-muted-foreground">{idx + 1}º</span>}
                      </div>

                      {/* Content */}
                      <div className="flex-1 space-y-2 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">
                              {t.vendedor?.full_name || "—"}
                            </p>
                            {t.linha && (
                              <p className="text-xs text-muted-foreground">{t.linha}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p className={`text-lg font-bold tabular-nums ${colors.text}`}>
                                {fmtBRL(t.actual_amount || 0)}
                              </p>
                              <p className="text-xs text-muted-foreground">/ {fmtBRL(Number(t.target_amount))}</p>
                            </div>
                            <CarboBadge variant={colors.badge} size="sm">{fmtPct(pct)}</CarboBadge>
                            {canManage && (
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6"
                                  onClick={() => openEdit(t)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => deleteMeta.mutate(t.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(100, pct)}%`, backgroundColor: colors.bar }} />
                          {expectedPct > 0 && expectedPct < 100 && (
                            <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
                              style={{ left: `${expectedPct}%` }} />
                          )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            Faltam {fmtBRL(Math.max(0, Number(t.target_amount) - (t.actual_amount || 0)))}
                          </span>
                          {t.target_qty > 0 && (
                            <span>{t.actual_qty || 0} / {t.target_qty} pedidos</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CarboCardContent>
                </CarboCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog */}
      {dialogOpen && editing && (
        <TargetDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
          month={monthStr}
          editing={editing}
        />
      )}
    </BoardLayout>
  );
}
