import { useState, useMemo, useEffect } from "react";
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
  DollarSign, Package, Trophy, Pencil, Trash2, Wrench, BadgePercent, Layers, Gift,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useSalesTargetsWithProgress, useUpsertSalesTarget, useDeleteSalesTarget } from "@/hooks/useSalesTargets";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useCanManageSalesTargets } from "@/hooks/useActionPermissions";
import { useCanalMetas } from "@/hooks/useCanalMetas";
import {
  useVendedorComissao, useToggleVendedorComissao,
  useBonificacaoPap, useUpsertBonificacaoPap,
  useComissaoFaixas, useUpsertComissaoFaixa, useDeleteComissaoFaixa,
} from "@/hooks/useComissaoConfig";
import { useAuth } from "@/contexts/AuthContext";

const LINHAS_OPTIONS = [
  { value: "", label: "Todas as linhas (geral)" },
  { value: "carboze_100ml", label: "CarboZé 100ml" },
  { value: "carboze_1l", label: "CarboZé 1L" },
  { value: "carboze_sache_10ml", label: "CarboZé Sachê 10ml" },
  { value: "carbopro", label: "CarboPRO 100ml" },
  { value: "carbovapt", label: "Descarbonização (Serviço)" },
];

// Serviço = descarbonização (Carbovapt). Demais linhas são produtos.
const SERVICO_LINHAS = new Set(["carbovapt"]);
const isServico = (linha: string | null) => !!linha && SERVICO_LINHAS.has(linha);

const CANAL_OPTIONS = [
  { value: "__none__", label: "Sem canal" },
  { value: "consumo", label: "Consumo (B2B)" },
  { value: "revenda", label: "Revenda (PDV)" },
  { value: "online", label: "On-line" },
];
const CANAL_LABEL: Record<string, string> = { consumo: "Consumo", revenda: "Revenda", online: "On-line" };
const CANAL_BADGE: Record<string, "info" | "warning" | "success"> = { consumo: "info", revenda: "warning", online: "success" };

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
  const canEdit = useCanManageSalesTargets();
  const { user } = useAuth();

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const monthStr = format(currentMonth, "yyyy-MM-dd");
  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: ptBR });
  const ano = currentMonth.getFullYear();
  const mesNum = currentMonth.getMonth() + 1;

  const { data: targets = [], isLoading } = useSalesTargetsWithProgress(monthStr);
  const { data: teamMembers = [] } = useTeamMembers();
  const upsert = useUpsertSalesTarget();
  const deleteMeta = useDeleteSalesTarget();

  // Cascata + comissão + bonificação
  const { data: canalMetas } = useCanalMetas(ano);
  const { data: vendComissao = {} } = useVendedorComissao();
  const toggleComissao = useToggleVendedorComissao();
  const { data: bonifPap } = useBonificacaoPap();
  const upsertBonif = useUpsertBonificacaoPap();
  const { data: faixas = [] } = useComissaoFaixas();
  const upsertFaixa = useUpsertComissaoFaixa();
  const deleteFaixa = useDeleteComissaoFaixa();

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<null | { vendedor_id: string; target_amount: number; target_qty: number; linha: string; canal: string; id?: string }>(null);

  const totalTargetAmount = targets.reduce((s, t) => s + t.target_amount, 0);
  const totalActualAmount = targets.reduce((s, t) => s + t.actual_amount, 0);
  const overallPct = totalTargetAmount > 0 ? Math.round((totalActualAmount / totalTargetAmount) * 100) : 0;
  const hitting = targets.filter((t) => t.pct_amount >= 100).length;

  const sortedTargets = useMemo(() =>
    [...targets].sort((a, b) => b.actual_amount - a.actual_amount),
    [targets]
  );

  const openNew = () => {
    setEditing({ vendedor_id: "", target_amount: 0, target_qty: 0, linha: "", canal: "__none__" });
    setDialog(true);
  };

  const openEdit = (t: typeof targets[0]) => {
    setEditing({ id: t.id, vendedor_id: t.vendedor_id, target_amount: t.target_amount, target_qty: t.target_qty, linha: t.linha || "", canal: t.canal || "__none__" });
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
      canal: editing.canal === "__none__" ? null : editing.canal,
    });
    setDialog(false);
  };

  // ── Cascata Canal → soma das metas dos vendedores ─────────────────────────
  const cascata = useMemo(() => {
    return (["consumo", "revenda", "online"] as const).map((canal) => {
      const metaCanal = canalMetas?.[canal]?.[mesNum] ?? 0;
      const somaVend = targets.filter((t) => t.canal === canal).reduce((s, t) => s + t.target_amount, 0);
      const realCanal = targets.filter((t) => t.canal === canal).reduce((s, t) => s + t.actual_amount, 0);
      return { canal, metaCanal, somaVend, realCanal, gap: metaCanal - somaVend };
    });
  }, [targets, canalMetas, mesNum]);

  // Faixa nova (form rápido)
  const addFaixa = () =>
    upsertFaixa.mutate({ ordem: (faixas.length ? Math.max(...faixas.map((f) => f.ordem)) : 0) + 1, min_pct: 0, max_pct: null, taxa: 0, ativo: true });

  // Input da bonificação PAP (seed quando carrega)
  const [papInput, setPapInput] = useState("");
  useEffect(() => {
    if (bonifPap) setPapInput(String(bonifPap.percentual ?? 0));
  }, [bonifPap]);
  const saveBonif = () => {
    const pct = Number(papInput.replace(",", "."));
    if (!isFinite(pct)) return;
    upsertBonif.mutate({ id: bonifPap?.id, percentual: pct, ativo: true, updatedBy: user?.id });
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

        {/* Cascata Canal → Vendedores */}
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Cascata Canal → Vendedores
            </CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent className="p-4 pt-0 grid grid-cols-1 md:grid-cols-3 gap-3">
            {cascata.map((c) => {
              const cobertura = c.metaCanal > 0 ? Math.round((c.somaVend / c.metaCanal) * 100) : 0;
              return (
                <div key={c.canal} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <CarboBadge variant={CANAL_BADGE[c.canal]} className="text-[10px]">{CANAL_LABEL[c.canal]}</CarboBadge>
                    <span className="text-[10px] text-muted-foreground">{cobertura}% distribuído</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Meta do canal</div>
                  <div className="text-lg font-bold tabular-nums">{formatCurrency(c.metaCanal)}</div>
                  <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cobertura >= 100 ? "bg-carbo-green" : "bg-carbo-blue"}`}
                      style={{ width: `${Math.min(cobertura, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] mt-1">
                    <span className="text-muted-foreground">Soma vendedores: {formatCurrency(c.somaVend)}</span>
                    {c.gap > 0
                      ? <span className="text-amber-500 font-medium">falta {formatCurrency(c.gap)}</span>
                      : <span className="text-carbo-green font-medium">coberto</span>}
                  </div>
                </div>
              );
            })}
          </CarboCardContent>
        </CarboCard>

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
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {t.canal && (
                            <CarboBadge variant={CANAL_BADGE[t.canal] ?? "secondary"} className="text-[9px]">
                              {CANAL_LABEL[t.canal] ?? t.canal}
                            </CarboBadge>
                          )}
                          {t.linha && (
                            <CarboBadge variant={isServico(t.linha) ? "warning" : "secondary"} className="text-[9px] gap-1">
                              {isServico(t.linha) ? <Wrench className="h-2.5 w-2.5" /> : <Package className="h-2.5 w-2.5" />}
                              {isServico(t.linha) ? "Serviço" : "Produto"}
                            </CarboBadge>
                          )}
                        </div>
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

                  {/* Tem comissão? */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                    <span className="text-xs flex items-center gap-1.5 text-muted-foreground">
                      <BadgePercent className="h-3.5 w-3.5" /> Comissão
                      {vendComissao[t.vendedor_id] && (
                        <CarboBadge variant="success" className="text-[9px]">ativa</CarboBadge>
                      )}
                    </span>
                    <Switch
                      checked={!!vendComissao[t.vendedor_id]}
                      disabled={!canEdit || toggleComissao.isPending}
                      onCheckedChange={(v) => toggleComissao.mutate({ vendedorId: t.vendedor_id, tem: v, updatedBy: user?.id })}
                    />
                  </div>
                </CarboCardContent>
              </CarboCard>
            ))}
          </div>
        )}

        {/* ── Comissão & Bonificação (configuração da gestão) ─────────────── */}
        {canEdit && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bonificação PAP */}
            <CarboCard>
              <CarboCardHeader>
                <CarboCardTitle className="text-sm flex items-center gap-2">
                  <Gift className="h-4 w-4 text-amber-500" /> Bonificação — PAP indicador (Descarbonização)
                </CarboCardTitle>
              </CarboCardHeader>
              <CarboCardContent className="p-4 pt-0 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Percentual pago ao PAP indicador sobre o valor da descarbonização (serviço Carbovapt).
                </p>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Percentual (%)</Label>
                    <Input inputMode="decimal" value={papInput} onChange={(e) => setPapInput(e.target.value)} placeholder="0" />
                  </div>
                  <CarboButton onClick={saveBonif} disabled={upsertBonif.isPending}>Salvar</CarboButton>
                </div>
              </CarboCardContent>
            </CarboCard>

            {/* Faixas de progressão de comissão */}
            <CarboCard>
              <CarboCardHeader className="flex-row items-center justify-between">
                <CarboCardTitle className="text-sm flex items-center gap-2">
                  <BadgePercent className="h-4 w-4 text-primary" /> Progressão de Comissão
                </CarboCardTitle>
                <CarboButton variant="outline" size="sm" onClick={addFaixa} disabled={upsertFaixa.isPending}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Faixa
                </CarboButton>
              </CarboCardHeader>
              <CarboCardContent className="p-4 pt-0 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Faixas por % de atingimento da meta → taxa de comissão. A gestão define os valores.
                </p>
                {faixas.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">Nenhuma faixa definida ainda.</p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px] text-muted-foreground uppercase tracking-wide">
                      <span>De (%)</span><span>Até (%)</span><span>Comissão (%)</span><span></span>
                    </div>
                    {faixas.map((f) => (
                      <div key={f.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        <Input className="h-8" type="number" defaultValue={f.min_pct}
                          onBlur={(e) => upsertFaixa.mutate({ ...f, min_pct: Number(e.target.value) })} />
                        <Input className="h-8" type="number" defaultValue={f.max_pct ?? ""}
                          placeholder="∞"
                          onBlur={(e) => upsertFaixa.mutate({ ...f, max_pct: e.target.value === "" ? null : Number(e.target.value) })} />
                        <Input className="h-8" type="number" step="0.1" defaultValue={f.taxa}
                          onBlur={(e) => upsertFaixa.mutate({ ...f, taxa: Number(e.target.value) })} />
                        <button onClick={() => deleteFaixa.mutate(f.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CarboCardContent>
            </CarboCard>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Produto / Serviço</Label>
                <Select value={editing?.linha || ""} onValueChange={(v) => setEditing((e) => e ? { ...e, linha: v } : e)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LINHAS_OPTIONS.map((l) => (
                      <SelectItem key={l.value || "all"} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Canal</Label>
                <Select value={editing?.canal || "__none__"} onValueChange={(v) => setEditing((e) => e ? { ...e, canal: v } : e)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CANAL_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
