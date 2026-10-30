import { useState } from "react";
import { ShoppingCart, Ban, Search } from "lucide-react";
import { useParamUrl, confirmar } from "@carbo/shell";
import { RegistrarCompraDialog } from "./OCActionsDialogs";
import { usePaymentMethods, labelPaymentMethod } from "@/hooks/usePaymentMethods";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { usePurchaseOrders, useCancelarOC } from "@/hooks/usePurchasing";
import { useAuth } from "@/contexts/AuthContext";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_TYPE_LABELS, type PurchaseOrder, type PurchaseOrderStatus } from "@/types/purchasing";
import { dataBR } from "@/lib/datas";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const statusVariantMap: Record<PurchaseOrderStatus, any> = {
  gerada: "info",
  comprada: "default",
  enviada_fornecedor: "warning",
  parcialmente_recebida: "warning",
  recebida: "success",
  cancelada: "cancelled",
};

export function PurchaseOrdersList() {
  const [statusFilter, setStatusFilter] = useParamUrl("status", "all");
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const { data: allOrders, isLoading } = usePurchaseOrders(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const termo = semAcento(busca.trim());
  const orders = (allOrders ?? []).filter((oc) =>
    !termo || semAcento(`${oc.oc_number} ${oc.supplier_name}`).includes(termo));
  const { data: methods = [] } = usePaymentMethods();
  const pmById = new Map(methods.map((m) => [m.id, m]));
  const { gestor } = useAuth();
  const cancelar = useCancelarOC();
  const [selectedOC, setSelectedOC] = useState<PurchaseOrder | null>(null);
  const [comprarOC, setComprarOC] = useState<PurchaseOrder | null>(null);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  const cancelarOC = async (oc: PurchaseOrder) => {
    const ok = await confirmar({
      titulo: `Cancelar a OC ${oc.oc_number}?`,
      mensagem: "A ordem sai do fluxo e não poderá ser recebida nem faturada.",
      confirmar: "Cancelar OC",
      cancelar: "Voltar",
      perigo: true,
    });
    if (!ok) return;
    cancelar.mutate(oc.id, { onSuccess: () => setSelectedOC(null) });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº da OC ou fornecedor…" className="pl-8" />
        </div>
      </div>

      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Nº OC</CarboTableHead>
            <CarboTableHead>Fornecedor</CarboTableHead>
            <CarboTableHead>Valor Total</CarboTableHead>
            <CarboTableHead>Pagamento</CarboTableHead>
            <CarboTableHead>Previsão Entrega</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            <CarboTableHead><span className="sr-only">Ação</span></CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {isLoading ? (
            <CarboTableRow>
              <CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</CarboTableCell>
            </CarboTableRow>
          ) : !orders.length ? (
            <CarboTableRow>
              <CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma OC encontrada</CarboTableCell>
            </CarboTableRow>
          ) : (
            orders.map((oc) => (
              <CarboTableRow key={oc.id} interactive onClick={() => setSelectedOC(oc)}>
                <CarboTableCell className="font-mono font-medium">{oc.oc_number}</CarboTableCell>
                <CarboTableCell>{oc.supplier_name}</CarboTableCell>
                <CarboTableCell className="font-mono">{formatCurrency(oc.total_value)}</CarboTableCell>
                <CarboTableCell>
                  {oc.purchased_at ? (
                    <div className="flex flex-col gap-0.5">
                      <CarboBadge variant={oc.is_paid ? "success" : "warning"} className="text-[10px] w-fit">
                        {oc.is_paid ? "Pago" : "A pagar"}
                      </CarboBadge>
                      <span className="text-[11px] text-muted-foreground">
                        {oc.payment_method_id
                          ? labelPaymentMethod(pmById.get(oc.payment_method_id))
                          : (oc.payment_type ? (PAYMENT_METHOD_TYPE_LABELS[oc.payment_type as keyof typeof PAYMENT_METHOD_TYPE_LABELS] ?? oc.payment_type) : "")}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </CarboTableCell>
                <CarboTableCell className="text-muted-foreground text-sm">{dataBR(oc.expected_delivery)}</CarboTableCell>
                <CarboTableCell>
                  <CarboBadge variant={statusVariantMap[oc.status]} dot>
                    {ORDER_STATUS_LABELS[oc.status]}
                  </CarboBadge>
                </CarboTableCell>
                <CarboTableCell onClick={(e) => e.stopPropagation()}>
                  {oc.status === "gerada" && (
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setComprarOC(oc)}>
                      <ShoppingCart className="h-4 w-4" /> Registrar compra
                    </Button>
                  )}
                </CarboTableCell>
              </CarboTableRow>
            ))
          )}
        </CarboTableBody>
      </CarboTable>

      {/* OC Details Dialog */}
      <Dialog open={!!selectedOC} onOpenChange={(o) => !o && setSelectedOC(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ordem de Compra {selectedOC?.oc_number}</DialogTitle>
            <DialogDescription>
              {selectedOC ? `${ORDER_STATUS_LABELS[selectedOC.status]} · gerada em ${dataBR(selectedOC.created_at)}` : "Detalhes da ordem de compra"}
            </DialogDescription>
          </DialogHeader>
          {selectedOC && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">Fornecedor:</span> <strong>{selectedOC.supplier_name}</strong></div>
                <div><span className="text-muted-foreground">CNPJ/CPF:</span> <strong>{selectedOC.supplier_document || "—"}</strong></div>
                <div><span className="text-muted-foreground">Condição Pgto:</span> <strong>{selectedOC.payment_condition || "—"}</strong></div>
                <div><span className="text-muted-foreground">Valor Total:</span> <strong className="kpi-number">{formatCurrency(selectedOC.total_value)}</strong></div>
                {(selectedOC.payment_method_id || selectedOC.payment_type) && (
                  <div>
                    <span className="text-muted-foreground">Forma de pagto:</span>{" "}
                    <strong>
                      {selectedOC.payment_method_id
                        ? labelPaymentMethod(pmById.get(selectedOC.payment_method_id))
                        : (PAYMENT_METHOD_TYPE_LABELS[selectedOC.payment_type as keyof typeof PAYMENT_METHOD_TYPE_LABELS] ?? selectedOC.payment_type)}
                    </strong>
                  </div>
                )}
                <div><span className="text-muted-foreground">Previsão de entrega:</span> <strong>{dataBR(selectedOC.expected_delivery)}</strong></div>
                {selectedOC.purchased_at && (
                  <>
                    <div><span className="text-muted-foreground">Comprada em:</span> <strong>{dataBR(selectedOC.purchased_at)}</strong></div>
                    <div>
                      <span className="text-muted-foreground">Pagamento:</span>{" "}
                      <strong>{selectedOC.is_paid ? `Pago${selectedOC.paid_at ? ` em ${dataBR(selectedOC.paid_at)}` : ""}` : `Em aberto${selectedOC.payment_due_date ? ` · vence ${dataBR(selectedOC.payment_due_date)}` : ""}`}</strong>
                    </div>
                  </>
                )}
              </div>
              {selectedOC.items?.length > 0 && (
                <div className="border border-border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2">Descrição</th>
                        <th className="text-right p-2">Qtd</th>
                        <th className="text-right p-2">Valor Unit.</th>
                        <th className="text-right p-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOC.items.map((item, idx) => (
                        <tr key={idx} className="border-t border-border">
                          <td className="p-2">{item.descricao}</td>
                          <td className="p-2 text-right whitespace-nowrap">{item.quantidade} {item.unidade}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(item.valor_unitario)}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(item.quantidade * item.valor_unitario)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {selectedOC && (selectedOC.status === "gerada" || (gestor && selectedOC.status === "comprada")) && (
            <DialogFooter className="flex-wrap gap-2">
              {gestor && (
                <Button variant="ghost" className="gap-1.5 text-destructive" disabled={cancelar.isPending} onClick={() => cancelarOC(selectedOC)}>
                  <Ban className="h-4 w-4" /> Cancelar OC
                </Button>
              )}
              {selectedOC.status === "gerada" && (
                <Button className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white" onClick={() => { setComprarOC(selectedOC); setSelectedOC(null); }}>
                  <ShoppingCart className="h-4 w-4" /> Registrar compra
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <RegistrarCompraDialog oc={comprarOC} onClose={() => setComprarOC(null)} />
    </div>
  );
}
