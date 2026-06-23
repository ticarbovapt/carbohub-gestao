import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Check, X, Eye, Package, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useRcRequests, useRcMutations, type RcStatus } from "@/hooks/useRcRequests";
import { useGenerateOc } from "@/hooks/usePurchaseOrders";
import { RCDetailsDialog, type RCLite } from "@/components/RCDetailsDialog";
import { RCAprovarDialog } from "@/components/RCAprovarDialog";
import { RCRejeitarDialog } from "@/components/RCRejeitarDialog";

const RC_STATUS_LABELS: Record<RcStatus, string> = {
  rascunho: "Rascunho", aguardando_aprovacao: "Aguardando Aprovação", aprovada: "Aprovada", rejeitada: "Rejeitada", cancelada: "Cancelada",
};
const RC_STATUS_VARIANT: Record<RcStatus, "secondary" | "warning" | "success" | "destructive"> = {
  rascunho: "secondary", aguardando_aprovacao: "warning", aprovada: "success", rejeitada: "destructive", cancelada: "secondary",
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const dt = (s: string) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export default function Requisicoes() {
  const { data: rcs = [], isLoading } = useRcRequests();
  const { approve, reject } = useRcMutations();
  const generateOc = useGenerateOc();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [detailRc, setDetailRc] = useState<RCLite | null>(null);
  const [aprovarRc, setAprovarRc] = useState<{ id: string; number: string } | null>(null);
  const [rejeitarRc, setRejeitarRc] = useState<{ id: string; number: string } | null>(null);

  const filtered = rcs.filter((rc) => statusFilter === "all" || rc.status === statusFilter);
  const pendentes = rcs.filter((rc) => rc.status === "aguardando_aprovacao").length;

  const handleGerarOc = async (rc: { id: string; rc_number: string }) => {
    try {
      await generateOc.mutateAsync(rc.id);
      toast.success(`OC gerada a partir da ${rc.rc_number}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a OC.");
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Requisições de Compra"
          description="Aprove ou reprove as requisições criadas pela operação. Após aprovar, a OC pode ser gerada aqui ou no Ops."
          icon={ClipboardList}
        />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-4 w-4 text-warning" /> Aguardando aprovação</div>
            <p className="text-2xl font-bold text-warning">{pendentes}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(RC_STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
        ) : filtered.length === 0 ? (
          <CarboEmptyState title="Nenhuma requisição" description={rcs.length === 0 ? "As requisições criadas no Ops aparecem aqui." : "Ajuste o filtro de status."} icon={ClipboardList} />
        ) : (
          <div className="overflow-x-auto">
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Nº RC</CarboTableHead><CarboTableHead>Centro de Custo</CarboTableHead><CarboTableHead>Tipo</CarboTableHead>
                  <CarboTableHead className="text-right">Valor Estimado</CarboTableHead><CarboTableHead>Status</CarboTableHead><CarboTableHead>Data</CarboTableHead><CarboTableHead>Ações</CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {filtered.map((rc) => (
                  <CarboTableRow key={rc.id}>
                    <CarboTableCell className="font-mono font-medium">{rc.rc_number}</CarboTableCell>
                    <CarboTableCell>{rc.cost_center}</CarboTableCell>
                    <CarboTableCell className="text-sm text-muted-foreground">{rc.tipo}</CarboTableCell>
                    <CarboTableCell className="text-right font-semibold">{brl(rc.valor)}</CarboTableCell>
                    <CarboTableCell><CarboBadge variant={RC_STATUS_VARIANT[rc.status]} dot>{RC_STATUS_LABELS[rc.status]}</CarboBadge></CarboTableCell>
                    <CarboTableCell className="text-sm text-muted-foreground">{dt(rc.data)}</CarboTableCell>
                    <CarboTableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Detalhes" onClick={() => setDetailRc({ rc_number: rc.rc_number, cost_center: rc.cost_center, tipo: rc.tipo, valor: rc.valor, statusLabel: RC_STATUS_LABELS[rc.status], statusVariant: RC_STATUS_VARIANT[rc.status], items: rc.items, suggested_supplier: rc.suggested_supplier, data: rc.data })}><Eye className="h-4 w-4" /></Button>
                        {rc.status === "aguardando_aprovacao" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-success" title="Aprovar" onClick={() => setAprovarRc({ id: rc.id, number: rc.rc_number })}><Check className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Reprovar" onClick={() => setRejeitarRc({ id: rc.id, number: rc.rc_number })}><X className="h-4 w-4" /></Button>
                          </>
                        )}
                        {rc.status === "aprovada" && !rc.has_oc && (
                          <Button variant="outline" size="sm" className="h-8 gap-1" disabled={generateOc.isPending} title="Gerar Ordem de Compra" onClick={() => handleGerarOc(rc)}><Package className="h-3.5 w-3.5" /> Gerar OC</Button>
                        )}
                        {rc.status === "aprovada" && rc.has_oc && <CarboBadge variant="success" dot>OC gerada</CarboBadge>}
                      </div>
                    </CarboTableCell>
                  </CarboTableRow>
                ))}
              </CarboTableBody>
            </CarboTable>
          </div>
        )}
      </div>

      <RCDetailsDialog rc={detailRc} open={detailRc !== null} onOpenChange={(v) => !v && setDetailRc(null)} />
      <RCAprovarDialog
        rcNumber={aprovarRc?.number ?? null}
        open={aprovarRc !== null}
        onOpenChange={(v) => !v && setAprovarRc(null)}
        onConfirm={aprovarRc ? async () => { await approve.mutateAsync(aprovarRc.id); toast.success(`Requisição ${aprovarRc.number} aprovada.`); setAprovarRc(null); } : undefined}
      />
      <RCRejeitarDialog
        rcNumber={rejeitarRc?.number ?? null}
        open={rejeitarRc !== null}
        onOpenChange={(v) => !v && setRejeitarRc(null)}
        onConfirm={rejeitarRc ? async () => { await reject.mutateAsync(rejeitarRc.id); toast.success(`Requisição ${rejeitarRc.number} reprovada.`); setRejeitarRc(null); } : undefined}
      />
    </div>
  );
}
