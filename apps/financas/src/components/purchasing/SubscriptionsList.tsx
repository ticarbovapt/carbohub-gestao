import { useMemo, useState } from "react";
import { useParamUrl, confirmar } from "@carbo/shell";
import { Plus, Edit2, Trash2, Pause, Play, RefreshCw, CreditCard, CalendarClock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSubscriptions, useCreateSubscription, useUpdateSubscription, useDeleteSubscription } from "@/hooks/useSubscriptions";
import { usePaymentMethods, labelPaymentMethod } from "@/hooks/usePaymentMethods";
import {
  SUBSCRIPTION_CYCLE_LABELS, SUBSCRIPTION_STATUS_LABELS, subscriptionMonthlyCost,
  type Subscription, type SubscriptionCycle, type SubscriptionStatus, type SubscriptionCharge,
} from "@/types/purchasing";
import { useAuth } from "@/contexts/AuthContext";
import { dataBR, diasAte, hojeISO } from "@/lib/datas";

const money = (v: number, cur: string) =>
  new Intl.NumberFormat(cur === "USD" ? "en-US" : "pt-BR", { style: "currency", currency: cur || "BRL" }).format(v || 0);

const statusVariant: Record<SubscriptionStatus, any> = { ativa: "success", pausada: "warning", cancelada: "cancelled" };
const VISOES: SubscriptionStatus[] = ["ativa", "pausada", "cancelada"];

const emptyForm = {
  nome: "", departamento: "", valor: "", currency: "BRL", ciclo: "mensal" as SubscriptionCycle,
  proximo_vencimento: "", payment_method_id: "", cobranca: "automatica" as SubscriptionCharge,
  status: "ativa" as SubscriptionStatus, responsavel: "", url: "", notes: "",
};

export function SubscriptionsList() {
  const { gestor } = useAuth();
  const canManage = gestor;
  // Filtros na URL: F5, link e Voltar.
  const [viewUrl, setView] = useParamUrl("ver", "ativa");
  const view: SubscriptionStatus = (VISOES as string[]).includes(viewUrl) ? (viewUrl as SubscriptionStatus) : "ativa";
  const [setorFilter, setSetorFilter] = useParamUrl("setor", "all");
  const [showForm, setShowForm] = useState(false);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: subs = [], isLoading } = useSubscriptions();
  const { data: methods = [] } = usePaymentMethods();
  const pmById = new Map(methods.map((m) => [m.id, m]));
  const create = useCreateSubscription();
  const update = useUpdateSubscription();
  const del = useDeleteSubscription();

  const setores = Array.from(new Set(subs.map((s) => s.departamento).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const visible = subs.filter((s) => {
    if (s.status !== view) return false;
    if (setorFilter !== "all" && (s.departamento ?? "") !== setorFilter) return false;
    return true;
  });

  // KPIs (só assinaturas ativas): custo mensal por moeda + manuais.
  // ⚠️ `proximo_vencimento` é DATA PURA: `new Date("2026-10-21")` é meia-noite
  // UTC e em Brasília vira o dia 20 — a data saía um dia antes. `diasAte` conta
  // sem fuso. E "vencida" e "a vencer em 7 dias" são DOIS números: juntos, o
  // cartão "a vencer" contava também o que já tinha passado.
  const hoje = hojeISO();
  const kpis = useMemo(() => {
    const ativas = subs.filter((s) => s.status === "ativa");
    const byCur: Record<string, number> = {};
    ativas.forEach((s) => { byCur[s.currency] = (byCur[s.currency] || 0) + subscriptionMonthlyCost(s); });
    const manuais = ativas.filter((s) => s.cobranca === "manual" && s.proximo_vencimento);
    const dias = (s: Subscription) => diasAte(s.proximo_vencimento, hoje) ?? Infinity;
    const manuaisVencidas = manuais.filter((s) => dias(s) < 0).length;
    const manuaisProximas = manuais.filter((s) => { const d = dias(s); return d >= 0 && d <= 7; }).length;
    return { qtd: ativas.length, byCur, manuaisVencidas, manuaisProximas };
  }, [subs, hoje]);

  const openCreate = () => { setForm(emptyForm); setEditSub(null); setShowForm(true); };
  const openEdit = (s: Subscription) => {
    setForm({
      nome: s.nome, departamento: s.departamento || "", valor: String(s.valor ?? ""), currency: s.currency || "BRL",
      ciclo: s.ciclo, proximo_vencimento: s.proximo_vencimento || "", payment_method_id: s.payment_method_id || "",
      cobranca: s.cobranca, status: s.status, responsavel: s.responsavel || "", url: s.url || "", notes: s.notes || "",
    });
    setEditSub(s); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) return;
    const payload: Partial<Subscription> = {
      nome: form.nome.trim(),
      departamento: form.departamento || null,
      valor: Number(form.valor) || 0,
      currency: form.currency,
      ciclo: form.ciclo,
      proximo_vencimento: form.proximo_vencimento || null,
      payment_method_id: form.payment_method_id || null,
      cobranca: form.cobranca,
      status: form.status,
      responsavel: form.responsavel || null,
      url: form.url || null,
      notes: form.notes || null,
    };
    try {
      if (editSub) await update.mutateAsync({ id: editSub.id, ...payload });
      else await create.mutateAsync(payload);
      setShowForm(false);
    } catch { /* o hook já avisou; o formulário fica aberto */ }
  };

  // ⚠️ O botão só alterna PAUSADA ↔ ATIVA. Cancelada não volta por um clique:
  // reativar uma assinatura encerrada é decisão, e mora no "Editar" (status).
  const setStatus = (s: Subscription, status: SubscriptionStatus) => update.mutate({ id: s.id, status });

  const excluir = async (s: Subscription) => {
    const ok = await confirmar({
      titulo: `Excluir "${s.nome}"?`,
      mensagem: "A assinatura e o histórico serão excluídos. Para só encerrar, marque como Cancelada.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (ok) del.mutate(s.id);
  };

  const dueBadge = (s: Subscription) => {
    if (!s.proximo_vencimento) return <span className="text-muted-foreground text-sm">—</span>;
    const days = diasAte(s.proximo_vencimento, hoje) ?? 0;
    const txt = dataBR(s.proximo_vencimento);
    // Só alerta quando é cobrança manual (é o que exige lembrar de pagar).
    const alert = s.status === "ativa" && s.cobranca === "manual" && days <= 7;
    return (
      <span className={`inline-flex items-center gap-1 text-sm ${alert ? "text-destructive font-medium" : ""}`}>
        {alert && <AlertTriangle className="h-3.5 w-3.5" />}
        {txt}{alert && days >= 0 && ` (${days}d)`}{alert && days < 0 && " (vencida)"}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <CarboCard variant="kpi" padding="sm">
          <CarboCardContent>
            <div className="flex items-center gap-2 mb-1"><RefreshCw className="h-4 w-4 text-carbo-green" /><span className="text-xs text-muted-foreground">Assinaturas ativas</span></div>
            <p className="text-2xl font-bold kpi-number">{kpis.qtd}</p>
          </CarboCardContent>
        </CarboCard>
        {Object.entries(kpis.byCur).map(([cur, val]) => (
          <CarboCard key={cur} variant="kpi" padding="sm">
            <CarboCardContent>
              <div className="flex items-center gap-2 mb-1"><CreditCard className="h-4 w-4 text-carbo-blue" /><span className="text-xs text-muted-foreground">Custo/mês ({cur})</span></div>
              <p className="text-base sm:text-lg font-bold kpi-number break-words">{money(val, cur)}</p>
            </CarboCardContent>
          </CarboCard>
        ))}
        <CarboCard variant="kpi" padding="sm">
          <CarboCardContent>
            <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-destructive" /><span className="text-xs text-muted-foreground">Manual vencida</span></div>
            <p className={`text-2xl font-bold kpi-number ${kpis.manuaisVencidas > 0 ? "text-destructive" : ""}`}>{kpis.manuaisVencidas}</p>
          </CarboCardContent>
        </CarboCard>
        <CarboCard variant="kpi" padding="sm">
          <CarboCardContent>
            <div className="flex items-center gap-2 mb-1"><CalendarClock className="h-4 w-4 text-warning" /><span className="text-xs text-muted-foreground">Manual a vencer (7 dias)</span></div>
            <p className="text-2xl font-bold kpi-number">{kpis.manuaisProximas}</p>
          </CarboCardContent>
        </CarboCard>
      </div>

      {/* Toolbar: Ativas/Paradas + setor + novo */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {VISOES.map((st) => (
              <button
                key={st} onClick={() => setView(st)} aria-pressed={view === st}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${view === st ? "bg-carbo-green text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                {st === "ativa" ? "Ativas" : st === "pausada" ? "Pausadas" : "Canceladas"}
              </button>
            ))}
          </div>
          <Select value={setorFilter} onValueChange={setSetorFilter}>
            <SelectTrigger className="w-full lg:w-[180px]"><SelectValue placeholder="Setor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {setores.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="gap-2 carbo-gradient text-white lg:self-auto self-start" size="sm">
            <Plus className="h-4 w-4" /> Nova assinatura
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Assinatura</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Cobrança</TableHead>
              <TableHead>Próx. vencimento</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="w-[130px]">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : visible.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                {view === "ativa" ? "Nenhuma assinatura ativa" : view === "pausada" ? "Nenhuma assinatura pausada" : "Nenhuma assinatura cancelada"}
              </TableCell></TableRow>
            ) : (
              visible.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="leading-tight">
                      <p className="font-medium">{s.url ? <a href={s.url} target="_blank" rel="noopener" className="hover:underline text-carbo-green">{s.nome}</a> : s.nome}</p>
                      {s.responsavel && <p className="text-xs text-muted-foreground">{s.responsavel}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{s.departamento || "—"}</TableCell>
                  <TableCell className="text-sm">
                    <span className="font-mono">{money(Number(s.valor), s.currency)}</span>
                    <span className="text-muted-foreground"> / {SUBSCRIPTION_CYCLE_LABELS[s.ciclo].toLowerCase()}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.cobranca === "manual"
                      ? <CarboBadge variant="warning" className="text-[10px]">Manual</CarboBadge>
                      : <span>{s.payment_method_id ? labelPaymentMethod(pmById.get(s.payment_method_id)) : "Automática"}</span>}
                  </TableCell>
                  <TableCell>{dueBadge(s)}</TableCell>
                  <TableCell><CarboBadge variant={statusVariant[s.status]} dot>{SUBSCRIPTION_STATUS_LABELS[s.status]}</CarboBadge></TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)} title="Editar"><Edit2 className="h-3.5 w-3.5" /></Button>
                        {s.status === "ativa" ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-warning" onClick={() => setStatus(s, "pausada")} title="Pausar"><Pause className="h-3.5 w-3.5" /></Button>
                        ) : s.status === "pausada" ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => setStatus(s, "ativa")} title="Reativar"><Play className="h-3.5 w-3.5" /></Button>
                        ) : null}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => excluir(s)} title="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editSub ? "Editar assinatura" : "Nova assinatura"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Claude Code, Supabase…" />
              </div>
              <div>
                <Label>Setor</Label>
                <Input value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} placeholder="TI, Ops, Marketing…" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Valor</Label>
                <Input type="number" min={0} step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
              </div>
              <div>
                <Label>Moeda</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="BRL">BRL (R$)</SelectItem><SelectItem value="USD">USD ($)</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ciclo</Label>
                <Select value={form.ciclo} onValueChange={(v) => setForm({ ...form, ciclo: v as SubscriptionCycle })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SUBSCRIPTION_CYCLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Cobrança</Label>
                <Select value={form.cobranca} onValueChange={(v) => setForm({ ...form, cobranca: v as SubscriptionCharge })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automatica">Automática (cai no cartão)</SelectItem>
                    <SelectItem value="manual">Manual (lembrar de pagar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Próximo vencimento</Label>
                <Input type="date" value={form.proximo_vencimento} onChange={(e) => setForm({ ...form, proximo_vencimento: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Cartão / forma de pagamento</Label>
                <Select value={form.payment_method_id || "none"} onValueChange={(v) => setForm({ ...form, payment_method_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum / não vinculado</SelectItem>
                    {methods.map((m) => <SelectItem key={m.id} value={m.id}>{labelPaymentMethod(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {editSub && (
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as SubscriptionStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div>
              <Label>Link do painel (opcional)</Label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
            </div>
            <div>
              <Label>Responsável / observação (opcional)</Label>
              <Input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} placeholder="Quem gerencia, plano…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.nome.trim() || create.isPending || update.isPending} className="carbo-gradient text-white">
              {editSub ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
