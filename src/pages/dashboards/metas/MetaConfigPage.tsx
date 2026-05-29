import { useState } from "react";
import { format, startOfMonth, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Target, Settings, Loader2,
} from "lucide-react";
import {
  useSalesTargetsWithProgress,
  useUpsertSalesTarget,
  useDeleteSalesTarget,
  type SalesTargetWithProgress,
} from "@/hooks/useSalesTargets";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import {
  useMetaStats,
  useUpsertMetaTarget,
  PLATFORM_META,
  ALL_PLATFORMS,
  type MetaPlatform,
} from "@/hooks/useMetaEcommerce";
import { useAuth } from "@/contexts/AuthContext";

function useCanSetTargets(): boolean {
  const { profile } = useAuth();
  if (!profile) return false;
  if (profile.department === "command") return true;
  if (profile.funcao === "head") return true;
  if (profile.secondary_funcao === "head") return true;
  return false;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Dialog de edição de meta e-commerce ──────────────────────────────────────
function EcoTargetDialog({ open, onClose, month, platform, currentTarget }: {
  open: boolean; onClose: () => void;
  month: Date; platform: MetaPlatform; currentTarget: number;
}) {
  const [digits, setDigits] = useState(currentTarget > 0 ? String(currentTarget) : "");
  const upsert = useUpsertMetaTarget();
  const meta = platform ? PLATFORM_META[platform] : { label: "Total Geral", emoji: "🎯", color: "#22c55e" };
  const numericValue = parseInt(digits.replace(/\D/g, "") || "0", 10);
  const displayValue = numericValue > 0
    ? numericValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 })
    : "";

  const handleSave = async () => {
    await upsert.mutateAsync({ month, platform, target_amount: numericValue });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{meta.emoji}</span> Meta {meta.label}
          </DialogTitle>
          <DialogDescription>{format(month, "MMMM 'de' yyyy", { locale: ptBR })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            type="text" inputMode="numeric"
            value={displayValue}
            onChange={e => setDigits(e.target.value.replace(/\D/g, ""))}
            className="text-xl font-bold tracking-wide"
            placeholder="R$ 0" autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}
            className="bg-carbo-green hover:bg-carbo-green/90 text-white">
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Tab = "vendedores" | "ecommerce";

export default function MetaConfigPage() {
  const [tab, setTab]       = useState<Tab>("vendedores");
  const [month, setMonth]   = useState(() => startOfMonth(new Date()));
  const [dialogOpen, setDialog] = useState(false);
  const [editTarget, setEdit]   = useState<SalesTargetWithProgress | null>(null);
  const [ecoDialog, setEcoDialog] = useState<{ platform: MetaPlatform; target: number } | null>(null);

  const [vendedorId, setVendedorId]     = useState("");
  const [targetDigits, setTargetDigits] = useState("");

  const canManage = useCanSetTargets();
  const monthStr  = month.toISOString().slice(0, 10);

  const { totalStats, platformStats } = useMetaStats(month);
  const today      = new Date();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth();

  const { data: targets = [], isLoading } = useSalesTargetsWithProgress(monthStr);
  const { data: teamMembers = [] }        = useTeamMembers();
  const upsert     = useUpsertSalesTarget();
  const deleteMeta = useDeleteSalesTarget();

  const activeMembers = teamMembers.filter(m =>
    m.status === "approved" && m.is_vendedor
  );

  const openNew = () => {
    setEdit(null);
    setVendedorId("");
    setTargetDigits("");
    setDialog(true);
  };

  const openEdit = (t: SalesTargetWithProgress) => {
    setEdit(t);
    setVendedorId(t.vendedor_id);
    setTargetDigits(String(Math.round(Number(t.target_amount))));
    setDialog(true);
  };

  const handleClose = () => { setDialog(false); setEdit(null); };

  const targetAmountNum = parseInt(targetDigits.replace(/\D/g, "") || "0", 10);
  const targetDisplay   = targetAmountNum > 0
    ? targetAmountNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : "";

  const handleSave = async () => {
    if (!vendedorId) return;
    await upsert.mutateAsync({
      vendedor_id: vendedorId,
      month: monthStr,
      target_amount: targetAmountNum,
      target_qty: 0,
      linha: null,
    });
    handleClose();
  };

  if (!canManage) {
    return (
      <BoardLayout>
        <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Target className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground text-center">Acesso restrito a heads e command.</p>
        </div>
      </BoardLayout>
    );
  }

  return (
    <BoardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6 text-carbo-green" /> Configurar Metas
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gerencie metas mensais de vendedores e e-commerce</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["vendedores", "ecommerce"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-carbo-green text-carbo-green bg-carbo-green/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t === "vendedores" ? "Vendedores" : "E-commerce"}
            </button>
          ))}
        </div>

        {/* ── Tab: Vendedores ─────────────────────────────────────────────── */}
        {tab === "vendedores" && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
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
              <Button size="sm" className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white"
                onClick={openNew}>
                <Plus className="h-4 w-4" /> Nova Meta
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />)}
              </div>
            ) : targets.length === 0 ? (
              <CarboCard>
                <CarboCardContent className="py-12 text-center space-y-3">
                  <Target className="h-10 w-10 mx-auto text-muted-foreground/30" />
                  <p className="text-muted-foreground">Nenhuma meta definida para este mês.</p>
                  <Button variant="outline" onClick={openNew}>
                    <Plus className="h-4 w-4 mr-1" /> Criar primeira meta
                  </Button>
                </CarboCardContent>
              </CarboCard>
            ) : (
              <div className="space-y-2">
                {targets.map(t => (
                  <CarboCard key={t.id}>
                    <CarboCardContent className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{t.vendedor?.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          Meta: {fmtBRL(Number(t.target_amount))} · Real: {fmtBRL(t.actual_amount || 0)} ({t.pct_amount || 0}%)
                        </p>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteMeta.mutate(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CarboCardContent>
                  </CarboCard>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Tab: E-commerce ─────────────────────────────────────────────── */}
        {tab === "ecommerce" && (
          <div className="space-y-3">
            {/* Meta total */}
            <CarboCard>
              <CarboCardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">🎯 Total Geral</p>
                  <p className="text-xs text-muted-foreground">
                    Meta: {totalStats.target > 0 ? fmtBRL(totalStats.target) : "Não definida"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  onClick={() => setEcoDialog({ platform: null, target: totalStats.target })}>
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </CarboCardContent>
            </CarboCard>

            {/* Por plataforma */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Por plataforma</p>
            {platformStats.map(stats => (
              <CarboCard key={String(stats.platform)}>
                <CarboCardContent className="p-3 flex items-center gap-3">
                  <span className="text-lg shrink-0">{stats.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{stats.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Meta: {stats.target > 0 ? fmtBRL(stats.target) : "Não definida"} · Real: {fmtBRL(stats.actual)} ({stats.actualPct.toFixed(0)}%)
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                    onClick={() => setEcoDialog({ platform: stats.platform, target: stats.target })}>
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </CarboCardContent>
              </CarboCard>
            ))}
          </div>
        )}
      </div>

      {/* ── Dialog Nova / Editar Meta ────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-carbo-green" />
              {editTarget ? "Editar Meta" : "Nova Meta"}
            </DialogTitle>
            <DialogDescription>
              {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Vendedor</Label>
              <Select
                value={vendedorId || "__none__"}
                onValueChange={v => setVendedorId(v === "__none__" ? "" : v)}
                disabled={!!editTarget}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Selecione o vendedor</SelectItem>
                  {activeMembers.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name || m.username || m.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Meta de Faturamento Mensal</Label>
              <Input
                type="text" inputMode="numeric"
                value={targetDisplay}
                onChange={e => setTargetDigits(e.target.value.replace(/\D/g, ""))}
                placeholder="R$ 0"
                className="text-xl font-bold tracking-wide"
                autoFocus
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={!vendedorId || targetAmountNum === 0 || upsert.isPending}
              className="bg-carbo-green hover:bg-carbo-green/90 text-white"
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog E-commerce Meta ────────────────────────────────────── */}
      {ecoDialog && (
        <EcoTargetDialog
          open={!!ecoDialog}
          onClose={() => setEcoDialog(null)}
          month={month}
          platform={ecoDialog.platform}
          currentTarget={ecoDialog.target}
        />
      )}
    </BoardLayout>
  );
}
