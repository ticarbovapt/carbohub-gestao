import { CheckCircle2, XCircle, Receipt } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { usePurchaseInvoices } from "@/hooks/usePurchasing";
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

export function InvoicesList() {
  const { data: invoices, isLoading } = usePurchaseInvoices();

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <div className="space-y-4">
      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Nº NF</CarboTableHead>
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
              <CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</CarboTableCell>
            </CarboTableRow>
          ) : !invoices?.length ? (
            <CarboTableRow>
              <CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                  <CarboTableCell className="text-sm">
                    {format(new Date(inv.invoice_date), "dd/MM/yyyy", { locale: ptBR })}
                  </CarboTableCell>
                  <CarboTableCell className="font-mono">{formatCurrency(inv.invoice_value)}</CarboTableCell>
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
  );
}
