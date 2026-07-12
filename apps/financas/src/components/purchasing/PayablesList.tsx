import { useState, useEffect } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { CreditCard, CheckCircle2, Undo2, Ban, ChevronLeft, ChevronRight } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { usePurchasePayablesOpen, usePurchasePayablesPaged, useUpdatePayableStatus } from "@/hooks/usePurchasing";
import { useAuth } from "@/contexts/AuthContext";
import { PAYABLE_STATUS_LABELS, type PayableStatus } from "@/types/purchasing";
import { format, isPast, isToday, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";

const statusVariantMap: Record<PayableStatus, any> = {
  programado: "info",
  pago: "success",
  atrasado: "destructive",
  cancelado: "cancelled",
};

const isOverdue = (p: { status: PayableStatus; due_date: string }) =>
  p.status !== "pago" && p.status !== "cancelado" && isPast(new Date(p.due_date)) && !isToday(new Date(p.due_date));

const effectiveStatus = (p: { status: PayableStatus; due_date: string }) =>
  isOverdue(p) ? "atrasado" : p.status;

const monthBounds = (ym: string) => {
  // ym = "2026-07" → primeiro e último dia do mês.
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`;
  const last = new Date(y, m, 0).toISOString().slice(0, 10);
  return { first, last };
};

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

export function PayablesList({ initialStatus }: { initialStatus?: string } = {}) {
  const { gestor } = useAuth();
  const [statusFilter, setStatusFilter] = usePersistedState<string>("compras.pagar.status", "all");
  const [source, setSource] = usePersistedState<string>("compras.pagar.source", "all");
  // Padrão: mês atual (chave v2 pra aplicar o novo default mesmo pra quem já usou).
  const [mes, setMes] = usePersistedState<string>("compras.pagar.mes.v2", CURRENT_MONTH);
  const [from, setFrom] = usePersistedState<string>("compras.pagar.from", "");
  const [to, setTo] = usePersistedState<string>("compras.pagar.to", "");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = usePersistedState<number>("compras.pagar.pageSize", 20);
  const [payingId, setPayingId] = useState<string | null>(null);

  // Período efetivo: o Mês tem prioridade; senão usa De/Até.
  const periodo = mes ? monthBounds(mes) : { first: from, last: to };

  // Só sobrescreve o filtro quando veio um deep-link real dos KPIs (não vazio).
  useEffect(() => { if (initialStatus) { setStatusFilter(initialStatus); setPage(0); } }, [initialStatus]);
  // Qualquer mudança de filtro volta pra primeira página.
  useEffect(() => { setPage(0); }, [statusFilter, source, mes, from, to, pageSize]);

  const updateStatus = useUpdatePayableStatus();
  const { data: openRows } = usePurchasePayablesOpen(source);
  const { data: paged, isLoading } = usePurchasePayablesPaged({ source, status: statusFilter, from: periodo.first, to: periodo.last, page, pageSize });
  const rows = paged?.rows ?? [];
  const total = paged?.count ?? 0;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  // Resumo (aging) sobre o que está EM ABERTO (respeita só o filtro de origem).
  const abertas = openRows ?? [];
  const sum = (arr: any[]) => arr.reduce((s, p) => s + Number(p.amount || 0), 0);
  const vencidas = abertas.filter(isOverdue);
  const venceHoje = abertas.filter((p) => isToday(new Date(p.due_date)));
  const vence7 = abertas.filter((p) => { const d = differenceInCalendarDays(new Date(p.due_date), new Date()); return d >= 1 && d <= 7; });

  const applyMes = (ym: string) => { setMes(ym); setFrom(""); setTo(""); };
  const clearPeriodo = () => { setMes(""); setFrom(""); setTo(""); };

  const payingPayable = rows.find((p) => p.id === payingId);
  const handlePay = async () => {
    if (!payingId) return;
    await updateStatus.mutateAsync({ id: payingId, status: "pago" });
    setPayingId(null);
  };

  const from1 = total === 0 ? 0 : page * pageSize + 1;
  const to1 = Math.min(total, (page + 1) * pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  return (
    <div className="space-y-4">
      {/* Resumo de aging */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">A pagar (em aberto)</p>
          <p className="text-lg font-bold">{formatCurrency(sum(abertas))}</p>
          <p className="text-[11px] text-muted-foreground">{abertas.length} conta(s)</p>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">Vencido</p>
          <p className="text-lg font-bold text-destructive">{formatCurrency(sum(vencidas))}</p>
          <p className="text-[11px] text-muted-foreground">{vencidas.length} conta(s)</p>
        </div>
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
          <p className="text-xs text-warning-foreground">Vence hoje</p>
          <p className="text-lg font-bold">{formatCurrency(sum(venceHoje))}</p>
          <p className="text-[11px] text-muted-foreground">{venceHoje.length} conta(s)</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Próximos 7 dias</p>
          <p className="text-lg font-bold">{formatCurrency(sum(vence7))}</p>
          <p className="text-[11px] text-muted-foreground">{vence7.length} conta(s)</p>
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
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(PAYABLE_STATUS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mês</Label>
          <Input type="month" className="w-[150px]" value={mes} onChange={(e) => applyMes(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">De</Label>
          <Input type="date" className="w-[150px]" value={from} onChange={(e) => { setMes(""); setFrom(e.target.value); }} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Input type="date" className="w-[150px]" value={to} onChange={(e) => { setMes(""); setTo(e.target.value); }} />
        </div>
        {(mes || from || to) && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearPeriodo}>Limpar período</Button>
        )}
      </div>

      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Fornecedor</CarboTableHead>
            <CarboTableHead>Origem</CarboTableHead>
            <CarboTableHead>Valor</CarboTableHead>
            <CarboTableHead>Vencimento</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            <CarboTableHead>Pago em</CarboTableHead>
            <CarboTableHead>Ações</CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {isLoading ? (
            <CarboTableRow>
              <CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</CarboTableCell>
            </CarboTableRow>
          ) : !rows.length ? (
            <CarboTableRow>
              <CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">
                <div className="flex flex-col items-center gap-2">
                  <CreditCard className="h-8 w-8 text-muted-foreground/50" />
                  <span>Nenhuma conta a pagar com esses filtros</span>
                </div>
              </CarboTableCell>
            </CarboTableRow>
          ) : (
            rows.map((p) => {
              const eff = effectiveStatus(p);
              const isBling = p.source === "bling";
              return (
                <CarboTableRow key={p.id}>
                  <CarboTableCell className="font-medium">{p.supplier_name}</CarboTableCell>
                  <CarboTableCell>
                    <CarboBadge variant={isBling ? "secondary" : "info"} className="text-[10px]" title={isBling ? (p.bling_numero ? `Bling nº ${p.bling_numero}` : "Importada do Bling") : "Criada no sistema"}>
                      {isBling ? "Bling" : "Sistema"}
                    </CarboBadge>
                  </CarboTableCell>
                  <CarboTableCell className="font-mono">{formatCurrency(p.amount)}</CarboTableCell>
                  <CarboTableCell className="text-sm">
                    {format(new Date(p.due_date), "dd/MM/yyyy", { locale: ptBR })}
                  </CarboTableCell>
                  <CarboTableCell>
                    <CarboBadge variant={statusVariantMap[eff]} dot>{PAYABLE_STATUS_LABELS[eff]}</CarboBadge>
                  </CarboTableCell>
                  <CarboTableCell className="text-sm text-muted-foreground">
                    {p.paid_at ? format(new Date(p.paid_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                  </CarboTableCell>
                  <CarboTableCell onClick={(e) => e.stopPropagation()}>
                    {!gestor ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : p.status === "pago" ? (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
                        onClick={() => updateStatus.mutate({ id: p.id, status: "programado" })} title="Estornar pagamento">
                        <Undo2 className="h-3.5 w-3.5" /> Estornar
                      </Button>
                    ) : p.status === "cancelado" ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="gap-1.5 text-success" onClick={() => setPayingId(p.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Pagar
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                          onClick={() => updateStatus.mutate({ id: p.id, status: "cancelado" })} title="Cancelar conta">
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
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
            <SelectContent>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span>{from1}–{to1} de {total}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground">{page + 1} / {lastPage + 1}</span>
          <Button variant="outline" size="sm" className="gap-1" disabled={page >= lastPage} onClick={() => setPage((p) => Math.min(lastPage, p + 1))}>
            Próxima <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Payment Confirmation Dialog */}
      <Dialog open={!!payingId} onOpenChange={() => setPayingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
          </DialogHeader>
          {payingPayable ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Marcar esta conta como paga?</p>
              <div className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Fornecedor</span><strong>{payingPayable.supplier_name}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Valor</span><strong className="font-mono">{formatCurrency(payingPayable.amount)}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vencimento</span><strong>{format(new Date(payingPayable.due_date), "dd/MM/yyyy", { locale: ptBR })}</strong></div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Deseja marcar esta conta como paga?</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayingId(null)}>Cancelar</Button>
            <Button onClick={handlePay} disabled={updateStatus.isPending} className="gap-1.5 carbo-gradient text-white">
              <CheckCircle2 className="h-4 w-4" />
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
