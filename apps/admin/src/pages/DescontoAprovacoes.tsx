import { useState } from "react";
import {
  BadgePercent, AlertTriangle, CheckCircle2, XCircle, Clock, Plus, Trash2, Save, Factory, CalendarClock,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  useDiscountApprovals, useDecideDiscount, useDiscountTiersAdmin, useSaveDiscountTiers,
  type DiscountApproval, type TierRow, type DiscountAuthority,
} from "@/hooks/useDiscountApprovals";
import {
  useProductionApprovals, useDecideProduction, useProductionConfigAdmin, useSaveProductionConfig,
  type ProductionApproval, type PrazoConfigAdmin,
} from "@/hooks/useProductionApprovals";

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");
const fmtDay = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");

const AUTHORITY_LABEL: Record<DiscountAuthority, string> = { auto: "Automático", gestor: "Gestor", ceo: "CEO" };
const tierBadge = (t: string) =>
  t === "ceo" ? <CarboBadge variant="destructive">CEO</CarboBadge>
  : t === "gestor" ? <CarboBadge variant="warning">Gestor</CarboBadge>
  : <CarboBadge variant="success">Auto</CarboBadge>;
const statusBadge = (s: string) =>
  s === "approved" ? <CarboBadge variant="success">Aprovado</CarboBadge>
  : s === "rejected" ? <CarboBadge variant="destructive">Recusado</CarboBadge>
  : s === "pending" ? <CarboBadge variant="warning">Pendente</CarboBadge>
  : <CarboBadge variant="secondary">Auto-aprovado</CarboBadge>;

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

// ── Fila de aprovações ────────────────────────────────────────────────────────
function Fila() {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const { data: rows = [], isLoading } = useDiscountApprovals(filter);
  const decide = useDecideDiscount();
  const [detail, setDetail] = useState<DiscountApproval | null>(null);
  const [notes, setNotes] = useState("");

  const FILTERS: [typeof filter, string][] = [
    ["pending", "Pendentes"], ["approved", "Aprovados"], ["rejected", "Recusados"], ["all", "Todos"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === key ? "border-carbo-green bg-carbo-green/10 text-carbo-green" : "bg-card text-muted-foreground hover:bg-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : rows.length === 0 ? (
        <CarboEmptyState icon={CheckCircle2} title="Nada na fila"
          description={filter === "pending" ? "Nenhum desconto aguardando aprovação. Com a alçada desligada, tudo é aprovado automaticamente." : "Nenhum registro neste filtro."} />
      ) : (
        <CarboCard>
          <CarboCardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Pedido</th>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 font-medium text-right">Subtotal</th>
                  <th className="px-4 py-2 font-medium text-right">Desconto</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                  <th className="px-4 py-2 font-medium">Alçada</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40 cursor-pointer"
                    onClick={() => { setDetail(r); setNotes(""); }}>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{r.order_number || "—"}<div className="text-[10px] text-muted-foreground">{fmtDate(r.created_at)}</div></td>
                    <td className="px-4 py-2 max-w-[160px] truncate">{r.customer_name || "—"}</td>
                    <td className="px-4 py-2 max-w-[140px] truncate text-muted-foreground">{r.vendedor_name || "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{brl(Number(r.subtotal))}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-destructive whitespace-nowrap">- {brl(Number(r.discount))}{r.discount_percent > 0 ? ` (${r.discount_percent}%)` : ""}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{brl(Number(r.total))}</td>
                    <td className="px-4 py-2">{tierBadge(r.discount_approval_tier)}</td>
                    <td className="px-4 py-2">
                      {statusBadge(r.discount_approval_status)}
                      {r.discount_approver_name && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          por {r.discount_approver_name}{r.discount_approved_at ? ` · ${fmtDate(r.discount_approved_at)}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {r.discount_approval_status === "pending" ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" className="h-7 text-emerald-600 hover:text-emerald-600"
                            disabled={decide.isPending} onClick={() => decide.mutate({ orderId: r.id, decision: "approved" })}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-destructive hover:text-destructive"
                            disabled={decide.isPending} onClick={() => decide.mutate({ orderId: r.id, decision: "rejected" })}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CarboCardContent>
        </CarboCard>
      )}

      {/* Detalhe / decisão */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm">{detail.order_number || "Pedido"}</span>
                  {statusBadge(detail.discount_approval_status)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Cliente</span><span className="text-right">{detail.customer_name || "—"}</span>
                  <span className="text-muted-foreground">Vendedor</span><span className="text-right">{detail.vendedor_name || "—"}</span>
                  <span className="text-muted-foreground">Subtotal</span><span className="text-right tabular-nums">{brl(Number(detail.subtotal))}</span>
                  <span className="text-muted-foreground">Desconto</span><span className="text-right tabular-nums text-destructive">- {brl(Number(detail.discount))}{detail.discount_percent > 0 ? ` (${detail.discount_percent}%)` : ""}</span>
                  <span className="text-muted-foreground">Total</span><span className="text-right tabular-nums font-semibold">{brl(Number(detail.total))}</span>
                  <span className="text-muted-foreground">Alçada exigida</span><span className="text-right">{AUTHORITY_LABEL[(detail.discount_approval_tier as DiscountAuthority)] ?? "—"}</span>
                  {detail.discount_approver_name && (
                    <>
                      <span className="text-muted-foreground">Decidido por</span>
                      <span className="text-right">{detail.discount_approver_name}{detail.discount_approved_at ? ` · ${fmtDate(detail.discount_approved_at)}` : ""}</span>
                    </>
                  )}
                </div>
                {detail.discount_reason && (
                  <div className="text-xs"><span className="text-muted-foreground">Motivo: </span>{detail.discount_reason}</div>
                )}
                {detail.discount_approver_notes && (
                  <div className="text-xs"><span className="text-muted-foreground">Nota do aprovador: </span>{detail.discount_approver_notes}</div>
                )}
                {detail.discount_approval_status === "pending" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Observação (opcional)</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo da decisão…" />
                  </div>
                )}
              </div>
              {detail.discount_approval_status === "pending" && (
                <DialogFooter className="gap-2">
                  <Button variant="outline" className="text-destructive"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ orderId: detail.id, decision: "rejected", notes }, { onSuccess: () => setDetail(null) })}>
                    <XCircle className="h-4 w-4 mr-1" /> Recusar
                  </Button>
                  <CarboButton disabled={decide.isPending}
                    onClick={() => decide.mutate({ orderId: detail.id, decision: "approved", notes }, { onSuccess: () => setDetail(null) })}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                  </CarboButton>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Configuração da alçada ────────────────────────────────────────────────────
function Config() {
  const { data } = useDiscountTiersAdmin();
  const save = useSaveDiscountTiers();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [tiers, setTiers] = useState<TierRow[] | null>(null);

  // Hidrata do servidor uma vez.
  const eff = enabled ?? data?.enabled ?? false;
  const effTiers = tiers ?? data?.tiers ?? [];

  const setTier = (i: number, patch: Partial<TierRow>) =>
    setTiers(effTiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTier = () =>
    setTiers([...effTiers, { min_percent: 0, max_percent: null, authority: "gestor", label: null, sort_order: effTiers.length }]);
  const removeTier = (i: number) => setTiers(effTiers.filter((_, idx) => idx !== i));

  return (
    <CarboCard>
      <CarboCardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
          <div>
            <p className="text-sm font-medium">Alçada ativada</p>
            <p className="text-xs text-muted-foreground">
              Enquanto <b>desativada</b>, todo desconto é aprovado automaticamente (nada entra na fila).
            </p>
          </div>
          <Switch checked={eff} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Faixas de aprovação (por %)</Label>
            <Button size="sm" variant="outline" onClick={addTier}><Plus className="h-4 w-4 mr-1" /> Faixa</Button>
          </div>
          {effTiers.length === 0 && (
            <p className="text-xs text-muted-foreground">Sem faixas — com a alçada ligada e sem faixas, tudo continua automático. Ex.: 0–5% Automático, 5–10% Gestor, 10%+ CEO.</p>
          )}
          <div className="space-y-2">
            {effTiers.map((t, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">De (%)</Label>
                  <Input type="number" min={0} step="0.01" className="w-20" value={t.min_percent}
                    onChange={(e) => setTier(i, { min_percent: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Até (%)</Label>
                  <Input type="number" min={0} step="0.01" className="w-20" placeholder="∞"
                    value={t.max_percent ?? ""} onChange={(e) => setTier(i, { max_percent: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div className="space-y-1 flex-1 min-w-[140px]">
                  <Label className="text-[11px]">Aprovado por</Label>
                  <Select value={t.authority} onValueChange={(v) => setTier(i, { authority: v as DiscountAuthority })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automático (sem aprovação)</SelectItem>
                      <SelectItem value="gestor">Gestor (superior)</SelectItem>
                      <SelectItem value="ceo">CEO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeTier(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <CarboButton disabled={save.isPending}
            onClick={() => save.mutate({ enabled: eff, tiers: effTiers })}>
            <Save className="h-4 w-4 mr-1" /> Salvar configuração
          </CarboButton>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

// ── Fila de aprovações de FABRICAÇÃO ──────────────────────────────────────────
function FilaFabricacao() {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const { data: rows = [], isLoading } = useProductionApprovals(filter);
  const decide = useDecideProduction();
  const [detail, setDetail] = useState<ProductionApproval | null>(null);
  const [notes, setNotes] = useState("");

  const FILTERS: [typeof filter, string][] = [
    ["pending", "Pendentes"], ["approved", "Liberados"], ["rejected", "Recusados"], ["all", "Abaixo do mínimo"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === key ? "border-carbo-green bg-carbo-green/10 text-carbo-green" : "bg-card text-muted-foreground hover:bg-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : rows.length === 0 ? (
        <CarboEmptyState icon={CheckCircle2} title="Nada na fila"
          description={filter === "pending" ? "Nenhuma fabricação aguardando liberação. Com a alçada desligada, prazos curtos são apenas sinalizados." : "Nenhum registro neste filtro."} />
      ) : (
        <CarboCard>
          <CarboCardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Pedido</th>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 font-medium">Entrega</th>
                  <th className="px-4 py-2 font-medium">PPF</th>
                  <th className="px-4 py-2 font-medium">PPE</th>
                  <th className="px-4 py-2 font-medium text-center">Dias úteis</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40 cursor-pointer"
                    onClick={() => { setDetail(r); setNotes(""); }}>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{r.order_number || "—"}<div className="text-[10px] text-muted-foreground">{fmtDate(r.created_at)}</div></td>
                    <td className="px-4 py-2 max-w-[150px] truncate">{r.customer_name || "—"}</td>
                    <td className="px-4 py-2 max-w-[130px] truncate text-muted-foreground">{r.vendedor_name || "—"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDay(r.agreed_delivery_date)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDay(r.ppf_date)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDay(r.ppe_date)}</td>
                    <td className={`px-4 py-2 text-center tabular-nums ${r.delivery_below_minimum ? "text-destructive font-semibold" : ""}`}>{r.delivery_lead_business_days ?? "—"}</td>
                    <td className="px-4 py-2">
                      {statusBadge(r.production_approval_status)}
                      {r.production_approver_name && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">por {r.production_approver_name}{r.production_approved_at ? ` · ${fmtDate(r.production_approved_at)}` : ""}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {r.production_approval_status === "pending" ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" className="h-7 text-emerald-600 hover:text-emerald-600"
                            disabled={decide.isPending} onClick={() => decide.mutate({ orderId: r.id, decision: "approved" })}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-destructive hover:text-destructive"
                            disabled={decide.isPending} onClick={() => decide.mutate({ orderId: r.id, decision: "rejected" })}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CarboCardContent>
        </CarboCard>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm">{detail.order_number || "Pedido"}</span>
                  {statusBadge(detail.production_approval_status)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Cliente</span><span className="text-right">{detail.customer_name || "—"}</span>
                  <span className="text-muted-foreground">Vendedor</span><span className="text-right">{detail.vendedor_name || "—"}</span>
                  <span className="text-muted-foreground">Entrega combinada</span><span className="text-right">{fmtDay(detail.agreed_delivery_date)}</span>
                  <span className="text-muted-foreground">Fabricar até (PPF)</span><span className="text-right">{fmtDay(detail.ppf_date)}</span>
                  <span className="text-muted-foreground">Expedir até (PPE)</span><span className="text-right">{fmtDay(detail.ppe_date)}</span>
                  <span className="text-muted-foreground">Dias úteis p/ fabricar</span><span className={`text-right ${detail.delivery_below_minimum ? "text-destructive font-semibold" : ""}`}>{detail.delivery_lead_business_days ?? "—"}</span>
                  {detail.production_approver_name && (
                    <>
                      <span className="text-muted-foreground">Decidido por</span>
                      <span className="text-right">{detail.production_approver_name}{detail.production_approved_at ? ` · ${fmtDate(detail.production_approved_at)}` : ""}</span>
                    </>
                  )}
                </div>
                {detail.production_approver_notes && (
                  <div className="text-xs"><span className="text-muted-foreground">Nota: </span>{detail.production_approver_notes}</div>
                )}
                {detail.production_approval_status === "pending" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Observação (opcional)</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo da decisão…" />
                  </div>
                )}
              </div>
              {detail.production_approval_status === "pending" && (
                <DialogFooter className="gap-2">
                  <Button variant="outline" className="text-destructive" disabled={decide.isPending}
                    onClick={() => decide.mutate({ orderId: detail.id, decision: "rejected", notes }, { onSuccess: () => setDetail(null) })}>
                    <XCircle className="h-4 w-4 mr-1" /> Recusar
                  </Button>
                  <CarboButton disabled={decide.isPending}
                    onClick={() => decide.mutate({ orderId: detail.id, decision: "approved", notes }, { onSuccess: () => setDetail(null) })}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Liberar fabricação
                  </CarboButton>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Configuração de prazos ────────────────────────────────────────────────────
function ConfigFabricacao() {
  const { data } = useProductionConfigAdmin();
  const save = useSaveProductionConfig();
  const [local, setLocal] = useState<PrazoConfigAdmin | null>(null);
  const eff = local ?? data ?? { enabled: false, min_business_days: 3, ship_offset_days: 1 };
  const patch = (p: Partial<PrazoConfigAdmin>) => setLocal({ ...eff, ...p });

  return (
    <CarboCard>
      <CarboCardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
          <div>
            <p className="text-sm font-medium">Alçada de fabricação ativada</p>
            <p className="text-xs text-muted-foreground">
              Enquanto <b>desativada</b>, vendas com prazo curto são apenas sinalizadas (auto-liberadas) — nada entra na fila.
            </p>
          </div>
          <Switch checked={eff.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Mínimo de dias úteis para fabricar</Label>
            <Input type="number" min={1} value={eff.min_business_days} onChange={(e) => patch({ min_business_days: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Offset do PPE (dias úteis após PPF)</Label>
            <Input type="number" min={0} value={eff.ship_offset_days} onChange={(e) => patch({ ship_offset_days: Number(e.target.value) })} />
          </div>
        </div>
        <div className="flex justify-end">
          <CarboButton disabled={save.isPending} onClick={() => save.mutate(eff)}>
            <Save className="h-4 w-4 mr-1" /> Salvar configuração
          </CarboButton>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

export default function Aprovacoes() {
  const { canAdmin } = useAuth();
  const [section, setSection] = useState<"desconto" | "fabricacao">("desconto");
  const [tab, setTab] = useState<"fila" | "config">("fila");

  if (!canAdmin) {
    return <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8"><RestrictedNotice /></main>;
  }

  const isDesc = section === "desconto";

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-5">
      <CarboPageHeader
        icon={isDesc ? BadgePercent : Factory}
        title="Aprovações"
        description={isDesc ? "Descontos que precisam de aval e a alçada de desconto." : "Fabricações de prazo curto e as regras de prazo."}
        actions={
          <div className="flex gap-1 rounded-lg border p-1">
            {([["desconto", "Desconto", BadgePercent], ["fabricacao", "Fabricação", Factory]] as const).map(([k, label, Ico]) => (
              <button key={k} onClick={() => { setSection(k); setTab("fila"); }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  section === k ? "bg-carbo-green/10 text-carbo-green" : "text-muted-foreground hover:bg-muted"}`}>
                <Ico className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex gap-1 rounded-lg border p-1 w-fit">
        {([["fila", "Fila", Clock], ["config", isDesc ? "Configuração da alçada" : "Regras de prazo", isDesc ? BadgePercent : CalendarClock]] as const).map(([k, label, Ico]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === k ? "bg-carbo-green/10 text-carbo-green" : "text-muted-foreground hover:bg-muted"}`}>
            <Ico className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {isDesc
        ? (tab === "fila" ? <Fila /> : <Config />)
        : (tab === "fila" ? <FilaFabricacao /> : <ConfigFabricacao />)}
    </main>
  );
}
