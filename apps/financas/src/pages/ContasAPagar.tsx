import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Button } from "@/components/ui/button";
import { Wallet, Plus, AlertTriangle, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePayables, usePayableMutations } from "@/hooks/usePayables";
import { NovaContaPagarDialog } from "@/components/NovaContaPagarDialog";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const dt = (s: string) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");

function Kpi({ icon: Icon, label, value, color }: { icon: typeof Wallet; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${color}`} /> {label}</div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function ContasAPagar() {
  const { data: payables = [], isLoading } = usePayables();
  const { markPaid } = usePayableMutations();
  const [novaOpen, setNovaOpen] = useState(false);

  const abertas = payables.filter((p) => p.status !== "pago" && p.status !== "cancelado");
  const aPagar = abertas.reduce((s, p) => s + p.amount, 0);
  const atrasados = abertas.filter((p) => p.overdue).length;

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1400px] mx-auto">
        <CarboPageHeader
          title="Contas a Pagar"
          description="Lance contas (de OCs recebidas ou manuais), marque pagas e acompanhe vencimentos"
          icon={CreditCard}
          actions={<Button onClick={() => setNovaOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Lançar Conta</Button>}
        />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Kpi icon={CreditCard} label="A Pagar (em aberto)" value={brl(aPagar)} color="text-warning" />
          <Kpi icon={AlertTriangle} label="Atrasados" value={String(atrasados)} color={atrasados > 0 ? "text-destructive" : "text-muted-foreground"} />
          <Kpi icon={Wallet} label="Total de contas" value={String(payables.length)} color="text-carbo-blue" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
        ) : payables.length === 0 ? (
          <CarboEmptyState title="Nenhuma conta a pagar" description='Lance a primeira em "Lançar Conta".' icon={CreditCard} />
        ) : (
          <div className="overflow-x-auto">
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Fornecedor</CarboTableHead>
                  <CarboTableHead>OC</CarboTableHead>
                  <CarboTableHead>Vencimento</CarboTableHead>
                  <CarboTableHead className="text-right">Valor</CarboTableHead>
                  <CarboTableHead>Status</CarboTableHead>
                  <CarboTableHead>Ações</CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {payables.map((p) => {
                  const label = p.status === "pago" ? "Pago" : p.status === "cancelado" ? "Cancelado" : p.overdue ? "Atrasado" : "Programado";
                  const variant = p.status === "pago" ? "success" : p.status === "cancelado" ? "secondary" : p.overdue ? "destructive" : "warning";
                  return (
                    <CarboTableRow key={p.id}>
                      <CarboTableCell className="font-medium">{p.supplier_name}</CarboTableCell>
                      <CarboTableCell className="font-mono text-sm text-muted-foreground">{p.oc_number ?? "—"}</CarboTableCell>
                      <CarboTableCell className="text-sm text-muted-foreground">{dt(p.due_date)}</CarboTableCell>
                      <CarboTableCell className="text-right font-semibold">{brl(p.amount)}</CarboTableCell>
                      <CarboTableCell><CarboBadge variant={variant} dot>{label}</CarboBadge></CarboTableCell>
                      <CarboTableCell>
                        {p.status !== "pago" && p.status !== "cancelado" && (
                          <Button variant="ghost" size="sm" className="h-8 text-xs text-success" disabled={markPaid.isPending}
                            onClick={async () => {
                              try { await markPaid.mutateAsync(p.id); toast.success("Conta marcada como paga."); }
                              catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao marcar pago."); }
                            }}>Marcar pago</Button>
                        )}
                      </CarboTableCell>
                    </CarboTableRow>
                  );
                })}
              </CarboTableBody>
            </CarboTable>
          </div>
        )}
      </div>

      <NovaContaPagarDialog open={novaOpen} onOpenChange={setNovaOpen} />
    </div>
  );
}
