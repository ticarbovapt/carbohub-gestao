import { useState } from "react";
import { FileText, Eye, CheckCircle2, XCircle, Send } from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { usePurchaseRequests, useApprovePurchaseRequest } from "@/hooks/usePurchasing";
import { PurchaseRequestForm } from "./PurchaseRequestForm";
import {
  REQUEST_STATUS_LABELS,
  PURCHASE_TYPE_LABELS,
  type PurchaseRequest,
  type PurchaseRequestStatus,
} from "@/types/purchasing";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CarboTable,
  CarboTableHeader,
  CarboTableBody,
  CarboTableRow,
  CarboTableHead,
  CarboTableCell,
} from "@/components/ui/carbo-table";

interface PurchaseRequestsListProps {
  showNewForm: boolean;
  onCloseForm: () => void;
}

const statusVariantMap: Record<PurchaseRequestStatus, any> = {
  rascunho: "draft",
  aguardando_aprovacao: "warning",
  aprovada: "success",
  rejeitada: "destructive",
  cancelada: "cancelled",
};

export function PurchaseRequestsList({ showNewForm, onCloseForm }: PurchaseRequestsListProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: requests, isLoading } = usePurchaseRequests(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const approveRC = useApprovePurchaseRequest();
  const { isCeo, isAnyGestor } = useAuth();

  const [selectedRC, setSelectedRC] = useState<PurchaseRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const canApprove = isCeo || isAnyGestor;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  const handleApprove = async (id: string) => {
    await approveRC.mutateAsync({ id, approved: true });
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    await approveRC.mutateAsync({ id: rejectingId, approved: false, rejection_reason: rejectReason });
    setShowRejectDialog(false);
    setRejectReason("");
    setRejectingId(null);
  };

  return (
    <div className="space-y-4">
      {showNewForm && <PurchaseRequestForm onClose={onCloseForm} />}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(REQUEST_STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Nº RC</CarboTableHead>
            <CarboTableHead>Centro de Custo</CarboTableHead>
            <CarboTableHead>Tipo</CarboTableHead>
            <CarboTableHead>Valor Estimado</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            <CarboTableHead>Data</CarboTableHead>
            <CarboTableHead>Ações</CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {isLoading ? (
            <CarboTableRow>
              <CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">
                Carregando...
              </CarboTableCell>
            </CarboTableRow>
          ) : !requests?.length ? (
            <CarboTableRow>
              <CarboTableCell colSpan={7} className="text-center text-muted-foreground py-8">
                Nenhuma requisição encontrada
              </CarboTableCell>
            </CarboTableRow>
          ) : (
            requests.map((rc) => (
              <CarboTableRow key={rc.id} interactive>
                <CarboTableCell className="font-mono font-medium">{rc.rc_number}</CarboTableCell>
                <CarboTableCell>{rc.cost_center}</CarboTableCell>
                <CarboTableCell>{PURCHASE_TYPE_LABELS[rc.purchase_type]}</CarboTableCell>
                <CarboTableCell className="font-mono">{formatCurrency(rc.estimated_value)}</CarboTableCell>
                <CarboTableCell>
                  <CarboBadge variant={statusVariantMap[rc.status]} dot>
                    {REQUEST_STATUS_LABELS[rc.status]}
                  </CarboBadge>
                </CarboTableCell>
                <CarboTableCell className="text-muted-foreground text-sm">
                  {format(new Date(rc.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </CarboTableCell>
                <CarboTableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedRC(rc)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {canApprove && rc.status === "aguardando_aprovacao" && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={() => handleApprove(rc.id)}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => { setRejectingId(rc.id); setShowRejectDialog(true); }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CarboTableCell>
              </CarboTableRow>
            ))
          )}
        </CarboTableBody>
      </CarboTable>

      {/* Details Dialog */}
      <Dialog open={!!selectedRC} onOpenChange={() => setSelectedRC(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Requisição {selectedRC?.rc_number}</DialogTitle>
            <DialogDescription>Detalhes da requisição de compra</DialogDescription>
          </DialogHeader>
          {selectedRC && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Centro de Custo:</span> <strong>{selectedRC.cost_center}</strong></div>
                <div><span className="text-muted-foreground">Tipo:</span> <strong>{PURCHASE_TYPE_LABELS[selectedRC.purchase_type]}</strong></div>
                <div><span className="text-muted-foreground">Fornecedor:</span> <strong>{selectedRC.suggested_supplier || "—"}</strong></div>
                <div><span className="text-muted-foreground">Valor:</span> <strong className="kpi-number">{formatCurrency(selectedRC.estimated_value)}</strong></div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Justificativa</p>
                <p className="text-sm bg-muted/50 rounded-lg p-3">{selectedRC.justification}</p>
              </div>
              {selectedRC.operational_impact && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Impacto Operacional</p>
                  <p className="text-sm bg-muted/50 rounded-lg p-3">{selectedRC.operational_impact}</p>
                </div>
              )}
              {selectedRC.items?.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Itens</p>
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
                        {selectedRC.items.map((item, idx) => (
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
                </div>
              )}
              {selectedRC.rejection_reason && (
                <div className="bg-destructive/10 rounded-lg p-3">
                  <p className="text-sm font-medium text-destructive">Motivo da Rejeição</p>
                  <p className="text-sm mt-1">{selectedRC.rejection_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Requisição</DialogTitle>
            <DialogDescription>Informe o motivo da rejeição</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Motivo *</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Descreva o motivo..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason || approveRC.isPending}>
              Rejeitar RC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
