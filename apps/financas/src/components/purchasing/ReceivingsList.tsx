import { useState } from "react";
import { AlertTriangle, CheckCircle2, Package, PackageCheck } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { usePurchaseReceivings, usePurchaseOrders } from "@/hooks/usePurchasing";
import { RECEIVING_STATUS_LABELS, type ReceivingStatus, type PurchaseOrder } from "@/types/purchasing";
import { ReceberDialog } from "./OCActionsDialogs";
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

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

// Aba Recebimento = posto de trabalho de quem RECEBE. Mostra as OCs que ainda
// precisam ser conferidas (fila) e o histórico do que já foi recebido. A ação de
// conferir mora AQUI (não na aba de Ordens de Compra).
export function ReceivingsList() {
  const { data: receivings, isLoading } = usePurchaseReceivings();
  const { data: orders } = usePurchaseOrders();
  const [receberOC, setReceberOC] = useState<PurchaseOrder | null>(null);

  const ocNumberById = new Map((orders ?? []).map((o: any) => [o.id, o.oc_number]));

  // OCs aguardando recebimento: geradas/enviadas/parciais (ainda não recebidas
  // por completo) e não canceladas.
  const aguardando = (orders ?? []).filter(
    (o) => o.status === "gerada" || o.status === "enviada_fornecedor" || o.status === "parcialmente_recebida"
  );

  return (
    <div className="space-y-6">
      {/* Fila: aguardando recebimento */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Aguardando recebimento</h3>
          {aguardando.length > 0 && <CarboBadge variant="warning" className="text-[10px]">{aguardando.length}</CarboBadge>}
        </div>
        <CarboTable>
          <CarboTableHeader>
            <CarboTableRow>
              <CarboTableHead>OC</CarboTableHead>
              <CarboTableHead>Fornecedor</CarboTableHead>
              <CarboTableHead>Itens</CarboTableHead>
              <CarboTableHead>Valor</CarboTableHead>
              <CarboTableHead>Previsão</CarboTableHead>
              <CarboTableHead>Ações</CarboTableHead>
            </CarboTableRow>
          </CarboTableHeader>
          <CarboTableBody>
            {!aguardando.length ? (
              <CarboTableRow>
                <CarboTableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <PackageCheck className="h-8 w-8 text-muted-foreground/50" />
                    <span>Nenhuma OC aguardando recebimento</span>
                  </div>
                </CarboTableCell>
              </CarboTableRow>
            ) : (
              aguardando.map((oc) => (
                <CarboTableRow key={oc.id} interactive className="cursor-pointer" onClick={() => setReceberOC(oc)}>
                  <CarboTableCell className="font-mono font-medium">{oc.oc_number}</CarboTableCell>
                  <CarboTableCell>{oc.supplier_name}</CarboTableCell>
                  <CarboTableCell>{oc.items?.length || 0} itens</CarboTableCell>
                  <CarboTableCell className="font-mono">{brl(oc.total_value)}</CarboTableCell>
                  <CarboTableCell className="text-muted-foreground text-sm">
                    {oc.expected_delivery ? format(new Date(oc.expected_delivery), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                  </CarboTableCell>
                  <CarboTableCell onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" className="h-8 gap-1 bg-carbo-green hover:bg-carbo-green/90 text-white" onClick={() => setReceberOC(oc)}>
                      <PackageCheck className="h-4 w-4" /> Conferir
                    </Button>
                  </CarboTableCell>
                </CarboTableRow>
              ))
            )}
          </CarboTableBody>
        </CarboTable>
      </div>

      {/* Histórico de recebimentos */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Histórico de recebimentos</h3>
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
                  <CarboTableCell className="font-mono text-sm">{ocNumberById.get(rec.purchase_order_id) ?? `${rec.purchase_order_id.slice(0, 8)}…`}</CarboTableCell>
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

      <ReceberDialog oc={receberOC} onClose={() => setReceberOC(null)} />
    </div>
  );
}
