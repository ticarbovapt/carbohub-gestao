import { useState } from "react";
import { Eye, Send, Package } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePurchaseOrders, useUpdatePurchaseOrderStatus } from "@/hooks/usePurchasing";
import { ORDER_STATUS_LABELS, type PurchaseOrder, type PurchaseOrderStatus } from "@/types/purchasing";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";

const statusVariantMap: Record<PurchaseOrderStatus, any> = {
  gerada: "info",
  enviada_fornecedor: "warning",
  parcialmente_recebida: "warning",
  recebida: "success",
  cancelada: "cancelled",
};

export function PurchaseOrdersList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: orders, isLoading } = usePurchaseOrders(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const updateStatus = useUpdatePurchaseOrderStatus();
  const [selectedOC, setSelectedOC] = useState<PurchaseOrder | null>(null);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
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
      </div>

      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Nº OC</CarboTableHead>
            <CarboTableHead>Fornecedor</CarboTableHead>
            <CarboTableHead>Valor Total</CarboTableHead>
            <CarboTableHead>Previsão Entrega</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            <CarboTableHead>Data</CarboTableHead>
            <CarboTableHead>Ações</CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {isLoading ? (
            <CarboTableRow>
              <CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</CarboTableCell>
            </CarboTableRow>
          ) : !orders?.length ? (
            <CarboTableRow>
              <CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma OC encontrada</CarboTableCell>
            </CarboTableRow>
          ) : (
            orders.map((oc) => (
              <CarboTableRow key={oc.id} interactive>
                <CarboTableCell className="font-mono font-medium">{oc.oc_number}</CarboTableCell>
                <CarboTableCell>{oc.supplier_name}</CarboTableCell>
                <CarboTableCell className="font-mono">{formatCurrency(oc.total_value)}</CarboTableCell>
                <CarboTableCell className="text-muted-foreground text-sm">
                  {oc.expected_delivery ? format(new Date(oc.expected_delivery), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                </CarboTableCell>
                <CarboTableCell>
                  <CarboBadge variant={statusVariantMap[oc.status]} dot>
                    {ORDER_STATUS_LABELS[oc.status]}
                  </CarboBadge>
                </CarboTableCell>
                <CarboTableCell className="text-muted-foreground text-sm">
                  {format(new Date(oc.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </CarboTableCell>
                <CarboTableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedOC(oc)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {oc.status === "gerada" && (
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-carbo-blue"
                        onClick={() => updateStatus.mutate({ id: oc.id, status: "enviada_fornecedor" })}
                        title="Enviar ao Fornecedor"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CarboTableCell>
              </CarboTableRow>
            ))
          )}
        </CarboTableBody>
      </CarboTable>

      {/* OC Details Dialog */}
      <Dialog open={!!selectedOC} onOpenChange={() => setSelectedOC(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ordem de Compra {selectedOC?.oc_number}</DialogTitle>
            <DialogDescription>Detalhes da ordem de compra</DialogDescription>
          </DialogHeader>
          {selectedOC && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Fornecedor:</span> <strong>{selectedOC.supplier_name}</strong></div>
                <div><span className="text-muted-foreground">CNPJ/CPF:</span> <strong>{selectedOC.supplier_document || "—"}</strong></div>
                <div><span className="text-muted-foreground">Condição Pgto:</span> <strong>{selectedOC.payment_condition || "—"}</strong></div>
                <div><span className="text-muted-foreground">Valor Total:</span> <strong className="kpi-number">{formatCurrency(selectedOC.total_value)}</strong></div>
              </div>
              {selectedOC.items?.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
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
                          <td className="p-2 text-right">{item.quantidade} {item.unidade}</td>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
