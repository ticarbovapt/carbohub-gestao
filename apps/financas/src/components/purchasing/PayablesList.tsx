import { useState } from "react";
import { CreditCard, CheckCircle2, Upload } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { usePurchasePayables, useUpdatePayableStatus } from "@/hooks/usePurchasing";
import { PAYABLE_STATUS_LABELS, type PayableStatus } from "@/types/purchasing";
import { format, isPast, isToday } from "date-fns";
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

export function PayablesList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: payables, isLoading } = usePurchasePayables(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const updateStatus = useUpdatePayableStatus();
  const [payingId, setPayingId] = useState<string | null>(null);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  const getEffectiveStatus = (p: { status: PayableStatus; due_date: string }) => {
    if (p.status === "programado" && isPast(new Date(p.due_date)) && !isToday(new Date(p.due_date))) {
      return "atrasado";
    }
    return p.status;
  };

  const handlePay = async () => {
    if (!payingId) return;
    await updateStatus.mutateAsync({ id: payingId, status: "pago" });
    setPayingId(null);
  };

  return (
    <div className="space-y-4">
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
                  <CarboTableCell>
                    {p.status !== "pago" && p.status !== "cancelado" && (
                      <Button
                        variant="ghost" size="sm" className="gap-1.5 text-success"
                        onClick={() => setPayingId(p.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Pagar
                      </Button>
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
          <p className="text-sm text-muted-foreground">Deseja marcar esta conta como paga?</p>
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
