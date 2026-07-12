import { useState } from "react";
import { CheckCircle2, XCircle, Receipt, FileUp } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { usePurchaseInvoices, usePurchaseOrders } from "@/hooks/usePurchasing";
import { LancarNFDialog } from "./OCActionsDialogs";
import type { PurchaseOrder } from "@/types/purchasing";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";

function MatchIcon({ match }: { match: boolean }) {
  return match ? (
    <CheckCircle2 className="h-4 w-4 text-success" />
  ) : (
    <XCircle className="h-4 w-4 text-destructive" />
  );
}

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

// Aba Notas Fiscais = posto de trabalho de quem lança a NF (fiscal/financeiro).
// Fila: OCs já recebidas que ainda não têm NF lançada. A ação de lançar mora
// AQUI (não na aba de Ordens de Compra).
export function InvoicesList() {
  const { data: invoices, isLoading } = usePurchaseInvoices();
  const { data: orders } = usePurchaseOrders();
  const [nfOC, setNfOC] = useState<PurchaseOrder | null>(null);

  const ocNumberById = new Map((orders ?? []).map((o: any) => [o.id, o.oc_number]));
  const ocWithInvoice = new Set((invoices ?? []).map((i) => i.purchase_order_id));

  // OCs recebidas (total ou parcial) e ainda sem NF lançada.
  const aguardando = (orders ?? []).filter(
    (o) => (o.status === "recebida" || o.status === "parcialmente_recebida") && !ocWithInvoice.has(o.id)
  );

  return (
    <div className="space-y-6">
      {/* Fila: aguardando lançamento de NF */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Aguardando lançamento de NF</h3>
          {aguardando.length > 0 && <CarboBadge variant="warning" className="text-[10px]">{aguardando.length}</CarboBadge>}
        </div>
        <CarboTable>
          <CarboTableHeader>
            <CarboTableRow>
              <CarboTableHead>OC</CarboTableHead>
              <CarboTableHead>Fornecedor</CarboTableHead>
              <CarboTableHead>Valor OC</CarboTableHead>
              <CarboTableHead>Ações</CarboTableHead>
            </CarboTableRow>
          </CarboTableHeader>
          <CarboTableBody>
            {!aguardando.length ? (
              <CarboTableRow>
                <CarboTableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <FileUp className="h-8 w-8 text-muted-foreground/50" />
                    <span>Nenhuma OC aguardando NF</span>
                  </div>
                </CarboTableCell>
              </CarboTableRow>
            ) : (
              aguardando.map((oc) => (
                <CarboTableRow key={oc.id} interactive className="cursor-pointer" onClick={() => setNfOC(oc)}>
                  <CarboTableCell className="font-mono font-medium">{oc.oc_number}</CarboTableCell>
                  <CarboTableCell>{oc.supplier_name}</CarboTableCell>
                  <CarboTableCell className="font-mono">{brl(oc.total_value)}</CarboTableCell>
                  <CarboTableCell onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" className="h-8 gap-1 bg-carbo-green hover:bg-carbo-green/90 text-white" onClick={() => setNfOC(oc)}>
                      <FileUp className="h-4 w-4" /> Lançar NF
                    </Button>
                  </CarboTableCell>
                </CarboTableRow>
              ))
            )}
          </CarboTableBody>
        </CarboTable>
      </div>

      {/* Histórico de NFs */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Notas fiscais lançadas</h3>
        <CarboTable>
          <CarboTableHeader>
            <CarboTableRow>
              <CarboTableHead>Nº NF</CarboTableHead>
              <CarboTableHead>OC</CarboTableHead>
              <CarboTableHead>Data NF</CarboTableHead>
              <CarboTableHead>Valor</CarboTableHead>
              <CarboTableHead>OC ✓</CarboTableHead>
              <CarboTableHead>Receb. ✓</CarboTableHead>
              <CarboTableHead>Valor ✓</CarboTableHead>
              <CarboTableHead>Verificação</CarboTableHead>
            </CarboTableRow>
          </CarboTableHeader>
          <CarboTableBody>
            {isLoading ? (
              <CarboTableRow>
                <CarboTableCell colSpan={8} className="text-center text-muted-foreground py-8">Carregando...</CarboTableCell>
              </CarboTableRow>
            ) : !invoices?.length ? (
              <CarboTableRow>
                <CarboTableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Receipt className="h-8 w-8 text-muted-foreground/50" />
                    <span>Nenhuma nota fiscal registrada</span>
                  </div>
                </CarboTableCell>
              </CarboTableRow>
            ) : (
              invoices.map((inv) => {
                const allMatch = inv.oc_match && inv.receiving_match && inv.value_match;
                return (
                  <CarboTableRow key={inv.id}>
                    <CarboTableCell className="font-mono font-medium">{inv.invoice_number}</CarboTableCell>
                    <CarboTableCell className="font-mono text-sm">{ocNumberById.get(inv.purchase_order_id) ?? "—"}</CarboTableCell>
                    <CarboTableCell className="text-sm">
                      {format(new Date(inv.invoice_date), "dd/MM/yyyy", { locale: ptBR })}
                    </CarboTableCell>
                    <CarboTableCell className="font-mono">{brl(inv.invoice_value)}</CarboTableCell>
                    <CarboTableCell><MatchIcon match={inv.oc_match} /></CarboTableCell>
                    <CarboTableCell><MatchIcon match={inv.receiving_match} /></CarboTableCell>
                    <CarboTableCell><MatchIcon match={inv.value_match} /></CarboTableCell>
                    <CarboTableCell>
                      <CarboBadge variant={allMatch ? "success" : "warning"} dot>
                        {allMatch ? "Conferida" : "Pendente"}
                      </CarboBadge>
                    </CarboTableCell>
                  </CarboTableRow>
                );
              })
            )}
          </CarboTableBody>
        </CarboTable>
      </div>

      <LancarNFDialog oc={nfOC} onClose={() => setNfOC(null)} />
    </div>
  );
}
