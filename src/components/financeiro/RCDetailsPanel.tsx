import { useState } from "react";
import { ArrowLeft, Plus, Brain, CheckCircle2, XCircle, Star, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRCRequests, useRCQuotations, useRCAnalysis, useRCApprovalLogs, useCreateQuotation, useUpdateRCStatus, useRunIAAnalysis, useApproveRC, useConvertRCtoPC } from "@/hooks/useRCPurchasing";
import { RC_STATUS_LABELS, RC_FLOW_STEPS, type RCStatus } from "@/types/rcPurchasing";
import { RCFlowStepper } from "./RCFlowStepper";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  rcId: string;
  onBack: () => void;
}

export function RCDetailsPanel({ rcId, onBack }: Props) {
  const { isCeo, isAnyGestor, isMasterAdmin, user } = useAuth();
  const { data: rcs } = useRCRequests();
  const rc = rcs?.find(r => r.id === rcId);
  const { data: quotations } = useRCQuotations(rcId);
  const { data: analysis } = useRCAnalysis(rcId);
  const { data: approvalLogs } = useRCApprovalLogs(rcId);
  const createQuotation = useCreateQuotation();
  const updateStatus = useUpdateRCStatus();
  const runIA = useRunIAAnalysis();
  const approveRC = useApproveRC();
  const convertPC = useConvertRCtoPC();

  const [showAddQuote, setShowAddQuote] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [qFornecedor, setQFornecedor] = useState("");
  const [qPreco, setQPreco] = useState(0);
  const [qPrazo, setQPrazo] = useState(0);
  const [qCondicao, setQCondicao] = useState("");

  if (!rc) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  const status = rc.status as RCStatus;
  const quotationsCount = quotations?.length || 0;
  const hasMinQuotations = quotationsCount >= 3;
  const canApprove = (isCeo || isAnyGestor) && status === 'aguardando_aprovacao';
  const needsSecondApproval = rc.valor_estimado > 10000;
  const needsMasterAdmin = rc.valor_estimado > 50000;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  const handleAddQuotation = () => {
    if (!qFornecedor || qPreco <= 0) return;
    createQuotation.mutate({
      rc_id: rcId,
      fornecedor_nome: qFornecedor,
      preco: qPreco,
      prazo_entrega_dias: qPrazo,
      condicao_pagamento: qCondicao || undefined,
    }, {
      onSuccess: () => {
        setShowAddQuote(false);
        setQFornecedor(""); setQPreco(0); setQPrazo(0); setQCondicao("");
      }
    });
  };

  const handleSendToCotacao = () => {
    updateStatus.mutate({ id: rcId, status: 'em_cotacao' });
  };

  const handleRunIA = () => {
    updateStatus.mutate({ id: rcId, status: 'em_analise_ia' }, {
      onSuccess: () => runIA.mutate(rcId),
    });
  };

  const handleSendToApproval = () => {
    updateStatus.mutate({ id: rcId, status: 'aguardando_aprovacao' });
  };

  const handleApprove = () => {
    const nivel = needsMasterAdmin ? (isMasterAdmin ? 2 : 1) : 1;
    approveRC.mutate({ rc_id: rcId, approved: true, nivel });
  };

  const handleReject = () => {
    if (!rejectReason) return;
    approveRC.mutate({ rc_id: rcId, approved: false, justificativa: rejectReason, nivel: 1 }, {
      onSuccess: () => { setShowReject(false); setRejectReason(""); }
    });
  };

  const handleConvertPC = () => {
    convertPC.mutate(rc);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{rc.produto_nome || "Requisição"}</h2>
          <p className="text-xs text-muted-foreground">{rc.justificativa}</p>
        </div>
        <CarboBadge variant={status === 'aprovada' ? 'success' : status === 'rejeitada' ? 'destructive' : 'warning'}>
          {RC_STATUS_LABELS[status]}
        </CarboBadge>
      </div>

      {/* Flow Stepper */}
      <RCFlowStepper currentStatus={status} />

      {/* Info Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <CarboCard padding="sm">
          <CarboCardContent>
            <p className="text-xs text-muted-foreground mb-1">Valor Estimado</p>
            <p className="text-lg font-bold">{formatCurrency(rc.valor_estimado)}</p>
            {needsMasterAdmin && <p className="text-[10px] text-destructive mt-1">⚠️ Requer Master Admin (&gt; R$ 50k)</p>}
            {needsSecondApproval && !needsMasterAdmin && <p className="text-[10px] text-warning mt-1">⚠️ Requer 2 aprovadores (&gt; R$ 10k)</p>}
          </CarboCardContent>
        </CarboCard>
        <CarboCard padding="sm">
          <CarboCardContent>
            <p className="text-xs text-muted-foreground mb-1">Quantidade</p>
            <p className="text-lg font-bold">{rc.quantidade} {rc.unidade}</p>
          </CarboCardContent>
        </CarboCard>
        <CarboCard padding="sm">
          <CarboCardContent>
            <p className="text-xs text-muted-foreground mb-1">Centro de Custo</p>
            <p className="text-lg font-bold">{rc.centro_custo}</p>
          </CarboCardContent>
        </CarboCard>
      </div>

      {/* Quotations Section */}
      <CarboCard>
        <CarboCardHeader className="flex-row items-center justify-between">
          <CarboCardTitle className="text-sm">
            Cotações ({quotationsCount}/3 mínimas)
            {!hasMinQuotations && <span className="text-destructive ml-2 text-xs">• Mínimo 3 obrigatórias</span>}
            {hasMinQuotations && <span className="text-carbo-green ml-2 text-xs">✓ Mínimo atingido</span>}
          </CarboCardTitle>
          {(status === 'rascunho' || status === 'em_cotacao') && (isCeo || isAnyGestor) && (
            <Button size="sm" variant="outline" onClick={() => setShowAddQuote(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Cotação
            </Button>
          )}
        </CarboCardHeader>
        <CarboCardContent>
          {quotationsCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma cotação adicionada</p>
          ) : (
            <div className="divide-y divide-border">
              {quotations?.map((q, i) => (
                <div key={q.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{q.fornecedor_nome}</p>
                      {analysis?.fornecedor_recomendado_nome === q.fornecedor_nome && (
                        <CarboBadge variant="success" className="gap-1">
                          <Star className="h-3 w-3" /> IA Recomendado
                        </CarboBadge>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>Prazo: {q.prazo_entrega_dias}d</span>
                      {q.condicao_pagamento && <span>{q.condicao_pagamento}</span>}
                    </div>
                  </div>
                  <p className="font-bold text-sm">{formatCurrency(q.preco)}</p>
                </div>
              ))}
            </div>
          )}
        </CarboCardContent>
      </CarboCard>

      {/* IA Analysis */}
      {analysis && (
        <CarboCard className="border-primary/20 bg-primary/5">
          <CarboCardHeader>
            <CarboCardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              Análise IA
            </CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-warning" />
                <p className="font-medium text-sm">Recomendação: {analysis.fornecedor_recomendado_nome}</p>
                <CarboBadge variant="success">Score: {analysis.score.toFixed(1)}</CarboBadge>
              </div>
              <p className="text-sm text-muted-foreground">{analysis.justificativa}</p>
              {Array.isArray(analysis.ranking) && analysis.ranking.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  <p className="text-xs font-semibold text-muted-foreground">Ranking:</p>
                  {analysis.ranking.map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="font-bold w-4">{i + 1}.</span>
                      <span className="flex-1">{r.fornecedor_nome}</span>
                      <span className="font-medium">{r.score?.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CarboCardContent>
        </CarboCard>
      )}

      {/* Approval Logs */}
      {approvalLogs && approvalLogs.length > 0 && (
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="text-sm">Histórico de Aprovações</CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent>
            <div className="space-y-2">
              {approvalLogs.map(log => (
                <div key={log.id} className="flex items-center gap-2 text-sm">
                  {log.action === 'approved' ? (
                    <CheckCircle2 className="h-4 w-4 text-carbo-green" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="font-medium">{log.action === 'approved' ? 'Aprovado' : 'Rejeitado'}</span>
                  <span className="text-muted-foreground">Nível {log.nivel}</span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          </CarboCardContent>
        </CarboCard>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap">
        {status === 'rascunho' && (
          <Button onClick={handleSendToCotacao} className="carbo-gradient text-white">
            Enviar para Cotação
          </Button>
        )}
        {status === 'em_cotacao' && hasMinQuotations && (
          <Button onClick={handleRunIA} disabled={runIA.isPending} className="gap-2 carbo-gradient text-white">
            {runIA.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Brain className="h-4 w-4" />
            Analisar com IA
          </Button>
        )}
        {(status === 'em_analise_ia' && analysis) && (
          <Button onClick={handleSendToApproval} className="carbo-gradient text-white">
            Enviar para Aprovação
          </Button>
        )}
        {canApprove && (
          <>
            <Button onClick={handleApprove} className="bg-carbo-green hover:bg-carbo-green/90 text-white gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Aprovar
            </Button>
            <Button variant="destructive" onClick={() => setShowReject(true)} className="gap-2">
              <XCircle className="h-4 w-4" />
              Rejeitar
            </Button>
          </>
        )}
        {status === 'aprovada' && (isCeo || isAnyGestor) && (
          <Button onClick={handleConvertPC} disabled={convertPC.isPending} className="carbo-gradient text-white gap-2">
            {convertPC.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Gerar Pedido de Compra (PC)
          </Button>
        )}
      </div>

      {/* Add Quotation Dialog */}
      <Dialog open={showAddQuote} onOpenChange={setShowAddQuote}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Cotação</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Fornecedor</Label>
              <Input value={qFornecedor} onChange={e => setQFornecedor(e.target.value)} placeholder="Nome do fornecedor" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Preço (R$)</Label>
                <Input type="number" min={0} step={0.01} value={qPreco} onChange={e => setQPreco(Number(e.target.value))} />
              </div>
              <div className="grid gap-2">
                <Label>Prazo (dias)</Label>
                <Input type="number" min={0} value={qPrazo} onChange={e => setQPrazo(Number(e.target.value))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Condição de Pagamento</Label>
              <Input value={qCondicao} onChange={e => setQCondicao(e.target.value)} placeholder="Ex: 30/60/90" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddQuote(false)}>Cancelar</Button>
            <Button onClick={handleAddQuotation} disabled={createQuotation.isPending || !qFornecedor || qPreco <= 0} className="carbo-gradient text-white">
              {createQuotation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar RC</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Label>Justificativa (obrigatória)</Label>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Motivo da rejeição..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason || approveRC.isPending}>
              {approveRC.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
