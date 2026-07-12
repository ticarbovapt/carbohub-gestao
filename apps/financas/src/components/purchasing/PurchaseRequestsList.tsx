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
  MOTIVO_LABELS,
  PRIORITY_LABELS,
  type PurchaseRequest,
  type PurchaseRequestStatus,
} from "@/types/purchasing";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgLabels } from "@/hooks/useTeamMembers";
import { CotacoesPanel } from "./CotacoesPanel";
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
  convertida: "default",
};

// Perfis do sistema (id → nome/setor) pra mostrar o SETOR do solicitante da RC.
function useRequesterInfo() {
  return useQuery({
    queryKey: ["all_profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("carbo_all_profiles");
      if (error) throw error;
      const byId = new Map<string, { full_name: string | null; department: string | null }>();
      for (const p of (data ?? []) as any[]) byId.set(p.id, { full_name: p.full_name, department: p.department });
      return byId;
    },
  });
}

export function PurchaseRequestsList({ showNewForm, onCloseForm }: PurchaseRequestsListProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [setorFilter, setSetorFilter] = useState<string>("all");
  const [escopoFilter, setEscopoFilter] = useState<string>("all");
  const { data: allRequests, isLoading } = usePurchaseRequests(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const approveRC = useApprovePurchaseRequest();
  const { gestor } = useAuth();
  const { data: requesterById } = useRequesterInfo();
  const { data: labels } = useOrgLabels();
  const deptLabel = labels?.deptLabel ?? {};

  const setorOf = (rc: PurchaseRequest) => requesterById?.get(rc.requested_by)?.department ?? null;
  const requesterName = (rc: PurchaseRequest) => requesterById?.get(rc.requested_by)?.full_name ?? "—";

  // Setores presentes (pra montar o filtro).
  const setores = Array.from(new Set((allRequests ?? []).map(setorOf).filter(Boolean) as string[]))
    .sort((a, b) => (deptLabel[a] ?? a).localeCompare(deptLabel[b] ?? b, "pt-BR"));

  // Filtro client-side por Tipo e Setor (status já vem filtrado do servidor).
  const escopoOf = (rc: PurchaseRequest) => (rc as any).escopo ?? "individual";
  const requests = (allRequests ?? []).filter((rc) => {
    if (tipoFilter !== "all" && rc.purchase_type !== tipoFilter) return false;
    if (setorFilter !== "all" && setorOf(rc) !== setorFilter) return false;
    if (escopoFilter !== "all" && escopoOf(rc) !== escopoFilter) return false;
    return true;
  });

  const [selectedRC, setSelectedRC] = useState<PurchaseRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const canApprove = gestor;

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
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(REQUEST_STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo de compra" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(PURCHASE_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={setorFilter} onValueChange={setSetorFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Setor solicitante" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os setores</SelectItem>
            {setores.map((d) => <SelectItem key={d} value={d}>{deptLabel[d] ?? d}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={escopoFilter} onValueChange={setEscopoFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Escopo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Setor e Individual</SelectItem>
            <SelectItem value="setor">Do setor</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Nº RC</CarboTableHead>
            <CarboTableHead>Solicitante</CarboTableHead>
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
              <CarboTableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Carregando...
              </CarboTableCell>
            </CarboTableRow>
          ) : !requests?.length ? (
            <CarboTableRow>
              <CarboTableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Nenhuma requisição encontrada
              </CarboTableCell>
            </CarboTableRow>
          ) : (
            requests.map((rc) => (
              <CarboTableRow key={rc.id} interactive className="cursor-pointer" onClick={() => setSelectedRC(rc)}>
                <CarboTableCell className="font-mono font-medium">{rc.rc_number}</CarboTableCell>
                <CarboTableCell>
                  <div className="leading-tight">
                    <p className="font-medium">{requesterName(rc)}</p>
                    {setorOf(rc) && <p className="text-xs text-muted-foreground">{deptLabel[setorOf(rc)!] ?? setorOf(rc)}</p>}
                  </div>
                </CarboTableCell>
                <CarboTableCell>{rc.cost_center}</CarboTableCell>
                <CarboTableCell>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{(rc as any).motivo ? (MOTIVO_LABELS[(rc as any).motivo] ?? PURCHASE_TYPE_LABELS[rc.purchase_type]) : PURCHASE_TYPE_LABELS[rc.purchase_type]}</span>
                    <CarboBadge variant={escopoOf(rc) === "setor" ? "info" : "secondary"} className="text-[10px]">
                      {escopoOf(rc) === "setor" ? "Setor" : "Individual"}
                    </CarboBadge>
                    {((rc as any).priority === "critica" || (rc as any).priority === "alta") && (
                      <CarboBadge variant={(rc as any).priority === "critica" ? "destructive" : "warning"} className="text-[10px]">
                        {PRIORITY_LABELS[(rc as any).priority]}
                      </CarboBadge>
                    )}
                  </div>
                </CarboTableCell>
                <CarboTableCell className="font-mono">{formatCurrency(rc.estimated_value)}</CarboTableCell>
                <CarboTableCell>
                  <CarboBadge variant={statusVariantMap[rc.status]} dot>
                    {REQUEST_STATUS_LABELS[rc.status]}
                  </CarboBadge>
                </CarboTableCell>
                <CarboTableCell className="text-muted-foreground text-sm">
                  {format(new Date(rc.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </CarboTableCell>
                <CarboTableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedRC(rc)} title="Ver detalhes">
                      <Eye className="h-4 w-4" />
                    </Button>
                    {canApprove && rc.status === "aguardando_aprovacao" && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={() => handleApprove(rc.id)} title="Aprovar">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => { setRejectingId(rc.id); setShowRejectDialog(true); }}
                          title="Rejeitar"
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
                <div><span className="text-muted-foreground">Solicitante:</span> <strong>{requesterName(selectedRC)}</strong></div>
                <div><span className="text-muted-foreground">Setor:</span> <strong>{setorOf(selectedRC) ? (deptLabel[setorOf(selectedRC)!] ?? setorOf(selectedRC)) : "—"}</strong></div>
                <div><span className="text-muted-foreground">Escopo:</span> <strong>{escopoOf(selectedRC) === "setor" ? "Do setor" : "Individual"}</strong></div>
                {(selectedRC as any).motivo && (
                  <div><span className="text-muted-foreground">Motivo:</span> <strong>{MOTIVO_LABELS[(selectedRC as any).motivo] ?? (selectedRC as any).motivo}</strong></div>
                )}
                {(selectedRC as any).priority && (selectedRC as any).priority !== "normal" && (
                  <div><span className="text-muted-foreground">Prioridade:</span> <strong>{PRIORITY_LABELS[(selectedRC as any).priority]}</strong></div>
                )}
                {(selectedRC as any).needed_by && (
                  <div><span className="text-muted-foreground">Precisa até:</span> <strong>{format(new Date((selectedRC as any).needed_by), "dd/MM/yyyy", { locale: ptBR })}</strong></div>
                )}
                <div><span className="text-muted-foreground">Centro de Custo:</span> <strong>{selectedRC.cost_center}</strong></div>
                <div><span className="text-muted-foreground">Tipo:</span> <strong>{PURCHASE_TYPE_LABELS[selectedRC.purchase_type]}</strong></div>
                <div><span className="text-muted-foreground">Fornecedor:</span> <strong>{selectedRC.suggested_supplier || "—"}</strong></div>
                <div><span className="text-muted-foreground">Valor:</span> <strong className="kpi-number">{formatCurrency(selectedRC.estimated_value)}</strong></div>
                {(selectedRC as any).reference_url && (
                  <div className="col-span-2"><span className="text-muted-foreground">Link:</span> <a href={(selectedRC as any).reference_url} target="_blank" rel="noopener" className="text-carbo-green underline break-all">{(selectedRC as any).reference_url}</a></div>
                )}
              </div>
              {selectedRC.justification && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Observação</p>
                  <p className="text-sm bg-muted/50 rounded-lg p-3">{selectedRC.justification}</p>
                </div>
              )}
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
              {selectedRC.items?.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Cotações por item</p>
                  <CotacoesPanel requestId={selectedRC.id} items={selectedRC.items as any} />
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
