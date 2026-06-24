import { useState } from "react";
import { AlertTriangle, CheckCircle2, Package } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { usePurchaseReceivings } from "@/hooks/usePurchasing";
import { RECEIVING_STATUS_LABELS, type ReceivingStatus } from "@/types/purchasing";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";

const statusVariantMap: Record<ReceivingStatus, any> = {
  pendente: "warning",
  conferido_ok: "success",
  conferido_divergencia: "destructive",
};

export function ReceivingsList() {
  const { data: receivings, isLoading } = usePurchaseReceivings();

  return (
    <div className="space-y-4">
      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>OC</CarboTableHead>
            <CarboTableHead>Data Recebimento</CarboTableHead>
            <CarboTableHead>Itens</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            <CarboTableHead>Divergência</CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {isLoading ? (
            <CarboTableRow>
              <CarboTableCell colSpan={5} className="text-center text-muted-foreground py-8">Carregando...</CarboTableCell>
            </CarboTableRow>
          ) : !receivings?.length ? (
            <CarboTableRow>
              <CarboTableCell colSpan={5} className="text-center text-muted-foreground py-8">
                <div className="flex flex-col items-center gap-2">
                  <Package className="h-8 w-8 text-muted-foreground/50" />
                  <span>Nenhum recebimento registrado</span>
                </div>
              </CarboTableCell>
            </CarboTableRow>
          ) : (
            receivings.map((rec) => (
              <CarboTableRow key={rec.id}>
                <CarboTableCell className="font-mono text-sm">{rec.purchase_order_id.slice(0, 8)}...</CarboTableCell>
                <CarboTableCell className="text-sm">
                  {format(new Date(rec.received_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </CarboTableCell>
                <CarboTableCell>{rec.items_received?.length || 0} itens</CarboTableCell>
                <CarboTableCell>
                  <CarboBadge variant={statusVariantMap[rec.status]} dot>
                    {RECEIVING_STATUS_LABELS[rec.status]}
                  </CarboBadge>
                </CarboTableCell>
                <CarboTableCell>
                  {rec.has_divergence ? (
                    <div className="flex items-center gap-1.5 text-destructive text-sm">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {rec.divergence_notes || "Sim"}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-success text-sm">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Sem divergências
                    </div>
                  )}
                </CarboTableCell>
              </CarboTableRow>
            ))
          )}
        </CarboTableBody>
      </CarboTable>
    </div>
  );
}
