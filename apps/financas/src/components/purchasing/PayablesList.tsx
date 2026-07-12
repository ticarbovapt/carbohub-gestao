import { useState, useEffect } from "react";
import { CreditCard, CheckCircle2, Undo2, Ban } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { usePurchasePayables, useUpdatePayableStatus } from "@/hooks/usePurchasing";
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

export function PayablesList({ initialStatus }: { initialStatus?: string } = {}) {
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus ?? "all");
  // Sincroniza quando a aba é aberta via KPI já com um filtro (ex: "atrasado").
  useEffect(() => { if (initialStatus) setStatusFilter(initialStatus); }, [initialStatus]);
  // Busca TODAS e filtra no cliente pelo status EFETIVO — senão o filtro
  // "Atrasado" não acha nada (no banco elas ficam como "programado").
  const { data: allPayables, isLoading } = usePurchasePayables();
  const updateStatus = useUpdatePayableStatus();
  const { gestor } = useAuth();
  const [payingId, setPayingId] = useState<string | null>(null);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  // Regra ÚNICA de "vencido" (usada na lista e no resumo): em aberto e a data já passou.
  const isOverdue = (p: { status: PayableStatus; due_date: string }) =>
    p.status !== "pago" && p.status !== "cancelado" && isPast(new Date(p.due_date)) && !isToday(new Date(p.due_date));

  const getEffectiveStatus = (p: { status: PayableStatus; due_date: string }) =>
    isOverdue(p) ? "atrasado" : p.status;

  const payables = (allPayables ?? []).filter((p) => statusFilter === "all" || getEffectiveStatus(p) === statusFilter);

  // Resumo (aging) sobre o que está EM ABERTO — sempre no total (ignora o filtro).
  const abertas = (allPayables ?? []).filter((p) => p.status !== "pago" && p.status !== "cancelado");
  const sum = (arr: typeof abertas) => arr.reduce((s, p) => s + Number(p.amount || 0), 0);
  const vencidas = abertas.filter(isOverdue);
  const venceHoje = abertas.filter((p) => isToday(new Date(p.due_date)));
  const vence7 = abertas.filter((p) => { const d = differenceInCalendarDays(new Date(p.due_date), new Date()); return d >= 1 && d <= 7; });

  const payingPayable = (allPayables ?? []).find((p) => p.id === payingId);

  const handlePay = async () => {
    if (!payingId) return;
    await updateStatus.mutateAsync({ id: payingId, status: "pago" });
    setPayingId(null);
  };

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

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(PAYABLE_STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Fornecedor</CarboTableHead>
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
              <CarboTableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</CarboTableCell>
            </CarboTableRow>
          ) : !payables?.length ? (
            <CarboTableRow>
              <CarboTableCell colSpan={6} className="text-center text-muted-foreground py-8">
                <div className="flex flex-col items-center gap-2">
                  <CreditCard className="h-8 w-8 text-muted-foreground/50" />
                  <span>Nenhuma conta a pagar</span>
                </div>
              </CarboTableCell>
            </CarboTableRow>
          ) : (
            payables.map((p) => {
              const effectiveStatus = getEffectiveStatus(p);
              return (
                <CarboTableRow key={p.id}>
                  <CarboTableCell className="font-medium">{p.supplier_name}</CarboTableCell>
                  <CarboTableCell className="font-mono">{formatCurrency(p.amount)}</CarboTableCell>
                  <CarboTableCell className="text-sm">
                    {format(new Date(p.due_date), "dd/MM/yyyy", { locale: ptBR })}
                  </CarboTableCell>
                  <CarboTableCell>
                    <CarboBadge variant={statusVariantMap[effectiveStatus]} dot>
                      {PAYABLE_STATUS_LABELS[effectiveStatus]}
                    </CarboBadge>
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
