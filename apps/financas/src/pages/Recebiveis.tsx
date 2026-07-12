import { useState, useEffect } from "react";
import { HandCoins, CheckCircle2, Ban, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useAuth } from "@/contexts/AuthContext";
import {
  useReceivablesOpen, useReceivablesPaged, useUpdateReceivableStatus, useCreateReceivable,
  RECEIVABLE_STATUS_LABELS, type Receivable, type ReceivableStatus,
} from "@/hooks/useReceivables";
import { format, isPast, isToday, differenceInCalendarDays, addMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);
const isYm = (v: string) => /^\d{4}-\d{2}$/.test(v);
const monthBounds = (ym: string) => {
  const valid = isYm(ym) ? ym : CURRENT_MONTH;
  const [y, m] = valid.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { first: `${valid}-01`, last: `${valid}-${String(lastDay).padStart(2, "0")}` };
};

const statusVariant: Record<ReceivableStatus, any> = {
  programado: "info", recebido: "success", atrasado: "destructive", cancelado: "cancelled",
};
const isOverdue = (r: { status: ReceivableStatus; due_date: string }) =>
  r.status !== "recebido" && r.status !== "cancelado" && isPast(new Date(r.due_date)) && !isToday(new Date(r.due_date));
const effectiveStatus = (r: { status: ReceivableStatus; due_date: string }): ReceivableStatus =>
  isOverdue(r) ? "atrasado" : r.status;

export default function Recebiveis() {
  const { gestor } = useAuth();
  const [statusFilter, setStatusFilter] = usePersistedState<string>("fin.receber.status", "all");
  const [source, setSource] = usePersistedState<string>("fin.receber.source", "all");
  const [mes, setMes] = usePersistedState<string>("fin.receber.mes", CURRENT_MONTH);
  const [from, setFrom] = usePersistedState<string>("fin.receber.from", "");
  const [to, setTo] = usePersistedState<string>("fin.receber.to", "");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = usePersistedState<number>("fin.receber.pageSize", 20);
  const [receiving, setReceiving] = useState<Receivable | null>(null);
  const [recAt, setRecAt] = useState(new Date().toISOString().slice(0, 10));
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ customer_name: "", amount: "", due_date: CURRENT_MONTH + "-01", notes: "" });

  const mesSafe = isYm(mes) ? mes : CURRENT_MONTH;
  const usaPeriodo = !!(from || to);
  const periodo = usaPeriodo ? { first: from, last: to } : monthBounds(mesSafe);
  const shiftMes = (delta: number) => setMes(format(addMonths(parseISO(`${mesSafe}-01`), delta), "yyyy-MM"));

  useEffect(() => { setPage(0); }, [statusFilter, source, mes, from, to, pageSize]);

  const update = useUpdateReceivableStatus();
  const create = useCreateReceivable();
  const { data: openRows } = useReceivablesOpen(source);
  const { data: paged, isLoading } = useReceivablesPaged({ source, status: statusFilter, from: periodo.first, to: periodo.last, page, pageSize });
  const rows = paged?.rows ?? [];
  const total = paged?.count ?? 0;

  const abertas = openRows ?? [];
  const sum = (arr: any[]) => arr.reduce((s, p) => s + Number(p.amount || 0), 0);
  const vencidas = abertas.filter(isOverdue);
  const venceHoje = abertas.filter((p) => isToday(new Date(p.due_date)));
  const vence7 = abertas.filter((p) => { const d = differenceInCalendarDays(new Date(p.due_date), new Date()); return d >= 1 && d <= 7; });

  const from1 = total === 0 ? 0 : page * pageSize + 1;
  const to1 = Math.min(total, (page + 1) * pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  const doReceive = async () => { if (receiving) { await update.mutateAsync({ id: receiving.id, status: "recebido", received_at: recAt }); setReceiving(null); } };
  const doCreate = async () => {
    if (!form.amount || !form.due_date) return;
    await create.mutateAsync({ customer_name: form.customer_name || null, amount: Number(form.amount), due_date: form.due_date, notes: form.notes || null });
    setShowNew(false); setForm({ customer_name: "", amount: "", due_date: CURRENT_MONTH + "-01", notes: "" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Títulos a receber de clientes — do sistema e do Bling — com baixa e aging.</p>
        <Button onClick={() => setShowNew(true)} className="gap-2 carbo-gradient text-white"><Plus className="h-4 w-4" /> Novo recebível</Button>
      </div>

      {/* Aging */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">A receber (em aberto)</p>
          <p className="text-lg font-bold">{brl(sum(abertas))}</p>
          <p className="text-[11px] text-muted-foreground">{abertas.length} título(s)</p>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">Vencido (inadimplência)</p>
          <p className="text-lg font-bold text-destructive">{brl(sum(vencidas))}</p>
          <p className="text-[11px] text-muted-foreground">{vencidas.length} título(s)</p>
        </div>
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
          <p className="text-xs text-warning-foreground">Vence hoje</p>
          <p className="text-lg font-bold">{brl(sum(venceHoje))}</p>
          <p className="text-[11px] text-muted-foreground">{venceHoje.length} título(s)</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Próximos 7 dias</p>
          <p className="text-lg font-bold">{brl(sum(vence7))}</p>
          <p className="text-[11px] text-muted-foreground">{vence7.length} título(s)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Origem</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              <SelectItem value="interno">Criadas no sistema</SelectItem>
              <SelectItem value="bling">Importadas do Bling</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(RECEIVABLE_STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mês</Label>
          <div className={`inline-flex items-center rounded-md border border-border h-10 ${usaPeriodo ? "opacity-40" : ""}`}>
            <button className="px-2 h-full hover:text-carbo-green disabled:opacity-40" onClick={() => shiftMes(-1)} disabled={usaPeriodo}><ChevronLeft className="h-4 w-4" /></button>
            <span className="px-2 text-sm min-w-[120px] text-center capitalize">{format(parseISO(`${mesSafe}-01`), "MMMM yyyy", { locale: ptBR })}</span>
            <button className="px-2 h-full hover:text-carbo-green disabled:opacity-40" onClick={() => shiftMes(1)} disabled={usaPeriodo}><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">De</Label><Input type="date" className="w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Até</Label><Input type="date" className="w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {usaPeriodo && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setFrom(""); setTo(""); }}>Limpar De/Até</Button>}
      </div>

      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Cliente</CarboTableHead>
            <CarboTableHead>Origem</CarboTableHead>
            <CarboTableHead>Valor</CarboTableHead>
            <CarboTableHead>Vencimento</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            <CarboTableHead>Recebido em</CarboTableHead>
            <CarboTableHead>Ações</CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {isLoading ? (
            <CarboTableRow><CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</CarboTableCell></CarboTableRow>
          ) : !rows.length ? (
            <CarboTableRow><CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">
              <div className="flex flex-col items-center gap-2"><HandCoins className="h-8 w-8 text-muted-foreground/50" /><span>Nenhum recebível com esses filtros</span></div>
            </CarboTableCell></CarboTableRow>
          ) : (
            rows.map((r) => {
              const eff = effectiveStatus(r);
              const isBling = r.source === "bling";
              return (
                <CarboTableRow key={r.id}>
                  <CarboTableCell className="font-medium">{r.customer_name || "—"}</CarboTableCell>
                  <CarboTableCell><CarboBadge variant={isBling ? "secondary" : "info"} className="text-[10px]">{isBling ? "Bling" : "Sistema"}</CarboBadge></CarboTableCell>
                  <CarboTableCell className="font-mono">{brl(r.amount)}</CarboTableCell>
                  <CarboTableCell className="text-sm">{format(new Date(r.due_date), "dd/MM/yyyy", { locale: ptBR })}</CarboTableCell>
                  <CarboTableCell><CarboBadge variant={statusVariant[eff]} dot>{RECEIVABLE_STATUS_LABELS[eff]}</CarboBadge></CarboTableCell>
                  <CarboTableCell className="text-sm text-muted-foreground">{r.received_at ? format(new Date(r.received_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}</CarboTableCell>
                  <CarboTableCell>
                    {!gestor ? <span className="text-muted-foreground text-xs">—</span>
                      : r.status === "recebido" ? (
                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => update.mutate({ id: r.id, status: "programado" })}>Estornar</Button>
                      ) : r.status === "cancelado" ? <span className="text-muted-foreground text-xs">—</span>
                      : (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="gap-1.5 text-success" onClick={() => { setRecAt(new Date().toISOString().slice(0, 10)); setReceiving(r); }}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Receber
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => update.mutate({ id: r.id, status: "cancelado" })} title="Cancelar título"><Ban className="h-3.5 w-3.5" /></Button>
                        </div>
                      )}
                  </CarboTableCell>
                </CarboTableRow>
              );
            })
          )}
        </CarboTableBody>
      </CarboTable>

      {/* Paginação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Por página</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
          </Select>
          <span>{from1}–{to1} de {total}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft className="h-4 w-4" /> Anterior</Button>
          <span className="text-sm text-muted-foreground">{page + 1} / {lastPage + 1}</span>
          <Button variant="outline" size="sm" className="gap-1" disabled={page >= lastPage} onClick={() => setPage((p) => Math.min(lastPage, p + 1))}>Próxima <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Baixa */}
      <Dialog open={!!receiving} onOpenChange={() => setReceiving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar recebimento</DialogTitle></DialogHeader>
          {receiving && (
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><strong>{receiving.customer_name || "—"}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Valor</span><strong className="font-mono">{brl(receiving.amount)}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vencimento</span><strong>{format(new Date(receiving.due_date), "dd/MM/yyyy", { locale: ptBR })}</strong></div>
              </div>
              <div className="space-y-1.5"><Label>Data do recebimento</Label><Input type="date" value={recAt} onChange={(e) => setRecAt(e.target.value)} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiving(null)}>Cancelar</Button>
            <Button onClick={doReceive} disabled={update.isPending} className="gap-1.5 carbo-gradient text-white"><CheckCircle2 className="h-4 w-4" /> Confirmar recebimento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo recebível */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo recebível</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Cliente</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} placeholder="Nome do cliente" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Valor (R$)</Label><Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Vencimento</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Observação</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={doCreate} disabled={!form.amount || !form.due_date || create.isPending} className="carbo-gradient text-white">Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
