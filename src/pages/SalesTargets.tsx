import { useState, useMemo } from "react";
import { format, startOfMonth, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Target, Plus, ChevronLeft, ChevronRight, TrendingUp,
  DollarSign, Package, Trophy, Pencil, Trash2,
} from "lucide-react";
import { useSalesTargetsWithProgress, useUpsertSalesTarget, useDeleteSalesTarget } from "@/hooks/useSalesTargets";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useAuth } from "@/contexts/AuthContext";

const LINHAS_OPTIONS = [
  { value: "", label: "Todas as linhas (geral)" },
  { value: "carboze_100ml", label: "CarboZé 100ml" },
  { value: "carboze_1l", label: "CarboZé 1L" },
  { value: "carboze_sache_10ml", label: "CarboZé Sachê 10ml" },
  { value: "carbopro", label: "CarboPRO 100ml" },
  { value: "carbovapt", label: "CarboVapt" },
];

function progressColor(pct: number) {
  if (pct >= 100) return "bg-carbo-green";
  if (pct >= 75) return "bg-carbo-blue";
  if (pct >= 50) return "bg-warning";
  return "bg-destructive";
}

function progressVariant(pct: number): "success" | "info" | "warning" | "destructive" {
  if (pct >= 100) return "success";
  if (pct >= 75) return "info";
  if (pct >= 50) return "warning";
  return "destructive";
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(v);

export default function SalesTargets() {
  const { isMasterAdmin, isAdmin } = useAuth();
  const canEdit = isMasterAdmin || isAdmin;

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const monthStr = format(currentMonth, "yyyy-MM-dd");
  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: ptBR });

  const { data: targets = [], isLoading } = useSalesTargetsWithProgress(monthStr);
  const { data: teamMembers = [] } = useTeamMembers();
  const upsert = useUpsertSalesTarget();
  const deleteMeta = useDeleteSalesTarget();

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<null | { vendedor_id: string; target_amount: number; target_qty: number; linha: string; id?: string }>(null);

  const totalTargetAmount = targets.reduce((s, t) => s + t.target_amount, 0);
  const totalActualAmount = targets.reduce((s, t) => s + t.actual_amount, 0);
  const overallPct = totalTargetAmount > 0 ? Math.round((totalActualAmount / totalTargetAmount) * 100) : 0;
  const hitting = targets.filter((t) => t.pct_amount >= 100).length;

  const sortedTargets = useMemo(() =>
    [...targets].sort((a, b) => b.actual_amount - a.actual_amount),
    [targets]
  );

  const openNew = () => {
    setEditing({ vendedor_id: "", target_amount: 0, target_qty: 0, linha: "" });
    setDialog(true);
  };

  const openEdit = (t: typeof targets[0]) => {
    setEditing({ id: t.id, vendedor_id: t.vendedor_id, target_amount: t.target_amount, target_qty: t.target_qty, linha: t.linha || "" });
    setDialog(true);
  };

  const handleSave = async () => {
    if (!editing || !editing.vendedor_id) return;
    await upsert.mutateAsync({
      vendedor_id: editing.vendedor_id,
      month: monthStr,
      target_amount: editing.target_amount,
      target_qty: editing.target_qty,
      linha: editing.linha || null,
    });
    setDialog(false);
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Metas de Vendas"
          description="Acompanhe e configure metas mensais por vendedor"
          icon={Target}
          actions={
            canEdit && (
              <CarboButton onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" />
                Nova Meta
              </CarboButton>
            )
          }
        />

        {/* Month Navigator */}
        <div className="flex items-center justify-between">
          <CarboButton variant="outline" size="sm" onClick={() => setCurrentMonth((m) => startOfMonth(subMonths(m, 1)))}>
            <ChevronLeft className="h-4 w-4" />
          </CarboButton>
          <h2 className="text-lg font-semibold capitalize">{monthLabel}</h2>
          <CarboButton variant="outline" size="sm" onClick={() => setCurrentMonth((m) => startOfMonth(addMonths(m, 1)))}>
            <ChevronRight className="h-4 w-4" />
          </CarboButton>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CarboKPI title="Meta Total" value={formatCurrency(totalTargetAmount)} icon={Target} iconColor="blue" loading={isLoading} />
          <CarboKPI title="Realizado" value={formatCurrency(totalActualAmount)} icon={DollarSign} iconColor={overallPct >= 100 ? "success" : "warning"} loading={isLoading} />
          <CarboKPI title="% Atingimento" value={`${overallPct}%`} icon={TrendingUp} iconColor={overallPct >= 100 ? "success" : "warning"} loading={isLoading} />
          <CarboKPI title="Batendo Meta" value={`${hitting}/${targets.length}`} icon={Trophy} iconColor="green" loading={isLoading} />
        </div>

        {/* Overall progress bar */}
        {targets.length > 0 && (
          <CarboCard>
            <CarboCardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Progresso Geral do Time</span>
                <CarboBadge variant={progressVariant(overallPct)}>{overallPct}%</CarboBadge>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${progressColor(overallPct)}`}
                  style={{ width: `${Math.min(overallPct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{formatCurrency(totalActualAmount)} realizado</span>
                <span>{formatCurrency(totalTargetAmount)} meta</span>
              </div>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Vendedor Cards */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-40 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : targets.length === 0 ? (
          <CarboCard>
            <CarboEmptyState
              icon={Target}
              title="Nenhuma meta definida"
              description={`Configure metas para ${monthLabel}`}
              action={canEdit ? { label: "Nova Meta", onClick: openNew } : undefined}
            />
          </CarboCard>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sortedTargets.map((t, i) => (
              <CarboCard key={t.id} className={t.pct_amount >= 100 ? "border-carbo-green/50" : ""}>
                <CarboCardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                        {i < 3 ? <Trophy className="h-4 w-4" /> : i + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold">{t.vendedor?.full_name || "Vendedor"}</h3>
                        {t.linha && <p className="text-xs text-muted-foreground capitalize">{t.linha.replace(/_/g, " ")}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <CarboBadge variant={progressVariant(t.pct_amount)}>{t.pct_amount}%</CarboBadge>
                      {canEdit && (
                        <>
                          <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button onClick={() => deleteMeta.mutate(t.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Amount progress */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="flex items-center gap-1 text-muted-foreground"><DollarSign className="h-3 w-3" /> Faturamento</span>
                        <span className="font-medium">{formatCurrency(t.actual_amount)} / {formatCurrency(t.target_amount)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${progressColor(t.pct_amount)}`} style={{ width: `${Math.min(t.pct_amount, 100)}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="flex items-center gap-1 text-muted-foreground"><Package className="h-3 w-3" /> Unidades</span>
                        <span className="font-medium">{t.actual_qty} / {t.target_qty} un</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${progressColor(t.pct_qty)}`} style={{ width: `${Math.min(t.pct_qty, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </CarboCardContent>
              </CarboCard>
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar Meta" : "Nova Meta"} — {monthLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Select value={editing?.vendedor_id || ""} onValueChange={(v) => setEditing((e) => e ? { ...e, vendedor_id: v } : e)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {teamMembers.filter((m) => m.status === "approved").map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || m.username || m.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Linha (opcional)</Label>
              <Select value={editing?.linha || ""} onValueChange={(v) => setEditing((e) => e ? { ...e, linha: v } : e)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LINHAS_OPTIONS.map((l) => (
                    <SelectItem key={l.value || "all"} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Meta (R$)</Label>
                <Input
                  type="number" min={0}
                  value={editing?.target_amount || ""}
                  onChange={(e) => setEditing((ed) => ed ? { ...ed, target_amount: Number(e.target.value) } : ed)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Meta (unidades)</Label>
                <Input
                  type="number" min={0}
                  value={editing?.target_qty || ""}
                  onChange={(e) => setEditing((ed) => ed ? { ...ed, target_qty: Number(e.target.value) } : ed)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <CarboButton variant="outline" onClick={() => setDialog(false)}>Cancelar</CarboButton>
            <CarboButton onClick={handleSave} disabled={upsert.isPending || !editing?.vendedor_id}>
              Salvar Meta
            </CarboButton>
          </div>
        </DialogContent>
      </Dialog>
    </BoardLayout>
  );
}
