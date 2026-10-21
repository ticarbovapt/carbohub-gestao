import { useState } from "react";
import { CheckCircle2, XCircle, Send, PackagePlus, Ban, Search } from "lucide-react";
import { useParamUrl, confirmar, pedirTexto } from "@carbo/shell";
import { toast } from "sonner";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { usePurchaseRequests, useApprovePurchaseRequest } from "@/hooks/usePurchasing";
import { useEnviarParaAprovacao, useCancelarRequisicao, podeCancelarRequisicao } from "@/hooks/useRequisicaoAcoes";
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
import { useTimeInterno } from "@/hooks/useTimeInterno";
import { useOrgLabels } from "@/hooks/useTeamMembers";
import { CotacoesPanel } from "./CotacoesPanel";
import { useQuotes } from "@/hooks/useCotacoes";
import { GerarOCDialog } from "./GerarOCDialog";
import { dataBR } from "@/lib/datas";
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

// O que "precisa de ação" significa depende de quem olha:
//   gestor  → aprovar (aguardando) e virar OC (aprovada) — de todo mundo
//   todos   → as SUAS em rascunho/aguardando/aprovada/rejeitada
const ACAO_DO_GESTOR: PurchaseRequestStatus[] = ["aguardando_aprovacao", "aprovada"];
const ACAO_DO_SOLICITANTE: PurchaseRequestStatus[] = ["rascunho", "aguardando_aprovacao", "aprovada", "rejeitada"];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function PurchaseRequestsList({ showNewForm, onCloseForm }: PurchaseRequestsListProps) {
  const [statusFilter, setStatusFilter] = useParamUrl("status", "all");
  const [tipoFilter, setTipoFilter] = useParamUrl("tipo", "all");
  const [setorFilter, setSetorFilter] = useParamUrl("setor", "all");
  const [escopoFilter, setEscopoFilter] = useParamUrl("escopo", "all");
  const [ver, setVer] = useParamUrl("ver", "acao");
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });

  const { data: allRequests, isLoading } = usePurchaseRequests(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const approveRC = useApprovePurchaseRequest();
  const enviar = useEnviarParaAprovacao();
  const cancelar = useCancelarRequisicao();
  const { gestor, user } = useAuth();
  const meuId = user?.id ?? null;

  // Nomes e setores SÓ do time interno (carbo_time_interno_lista). O
  // `carbo_all_profiles` devolvia a tabela inteira, lojista e licenciado inclusos.
  const { data: pessoas = [] } = useTimeInterno();
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));
  const { data: labels } = useOrgLabels();
  const deptLabel = labels?.deptLabel ?? {};

  const setorOf = (rc: PurchaseRequest) => pessoaPorId.get(rc.requested_by)?.department ?? null;
  const requesterName = (rc: PurchaseRequest) => pessoaPorId.get(rc.requested_by)?.full_name ?? "—";
  // Quem CLICOU em criar. Só interessa mostrar quando difere do solicitante.
  const registradoPor = (rc: PurchaseRequest) => {
    const autor = rc.created_by;
    if (!autor || autor === rc.requested_by) return null;
    return pessoaPorId.get(autor)?.full_name ?? "—";
  };
  const escopoOf = (rc: PurchaseRequest) => rc.escopo ?? "individual";
  // "Minha" = sou o solicitante ou fui eu quem lançou em nome de alguém.
  const ehMinha = (rc: PurchaseRequest) => !!meuId && (rc.requested_by === meuId || rc.created_by === meuId);

  const setores = Array.from(new Set((allRequests ?? []).map(setorOf).filter(Boolean) as string[]))
    .sort((a, b) => (deptLabel[a] ?? a).localeCompare(deptLabel[b] ?? b, "pt-BR"));

  // Status escolhido explicitamente vale SOBRE a visão.
  const visao = statusFilter !== "all" ? "todas" : ver;
  const precisaDeAcao = (rc: PurchaseRequest) =>
    (gestor && ACAO_DO_GESTOR.includes(rc.status)) ||
    (ehMinha(rc) && ACAO_DO_SOLICITANTE.includes(rc.status));

  const termo = semAcento(busca.trim());
  const requests = (allRequests ?? []).filter((rc) => {
    if (visao === "acao" && !precisaDeAcao(rc)) return false;
    if (tipoFilter !== "all" && rc.purchase_type !== tipoFilter) return false;
    if (setorFilter !== "all" && setorOf(rc) !== setorFilter) return false;
    if (escopoFilter !== "all" && escopoOf(rc) !== escopoFilter) return false;
    if (termo) {
      const alvo = semAcento([rc.rc_number, requesterName(rc), rc.cost_center, rc.suggested_supplier ?? ""].join(" "));
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });

  const [selectedRC, setSelectedRC] = useState<PurchaseRequest | null>(null);
  const [gerarOC, setGerarOC] = useState<PurchaseRequest | null>(null);

  // Cotações da RC aberta — o total NEGOCIADO, que é o que importa pra aprovar.
  const { data: selQuotes = [] } = useQuotes(selectedRC?.id ?? null);
  const totalCotado = selQuotes.filter((q) => q.selected).reduce((s, q) => s + q.unit_price * q.quantidade, 0);
  const itensComCotacao = new Set(selQuotes.filter((q) => q.selected).map((q) => q.item_index)).size;
  const itensSemCotacao = Math.max(0, (selectedRC?.items?.length ?? 0) - itensComCotacao);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  const ocupado = approveRC.isPending || enviar.isPending || cancelar.isPending;

  // Aprovar confirma UMA vez: o rodapé do detalhe já mostra estimado × cotado ×
  // itens sem cotação, que é exatamente o que a segunda confirmação repetia.
  const aprovar = (rc: PurchaseRequest) =>
    approveRC.mutate({ id: rc.id, approved: true }, { onSuccess: () => setSelectedRC(null) });

  const rejeitar = async (rc: PurchaseRequest) => {
    const motivo = await pedirTexto({
      titulo: `Rejeitar a ${rc.rc_number}?`,
      rotulo: "Motivo *",
      placeholder: "O solicitante vai ler isto.",
      obrigatorio: true,
      multilinha: true,
      confirmar: "Rejeitar",
      perigo: true,
    });
    if (!motivo) return;
    approveRC.mutate({ id: rc.id, approved: false, rejection_reason: motivo }, { onSuccess: () => setSelectedRC(null) });
  };

  const enviarParaAprovacao = (rc: PurchaseRequest) => {
    if (!(Number(rc.estimated_value) > 0)) {
      // Mesma regra do formulário: sem valor não vai para aprovação.
      toast.error("Falta o valor", { description: "O valor estimado precisa ser maior que zero para enviar à aprovação." });
      return;
    }
    enviar.mutate(rc.id, { onSuccess: () => setSelectedRC(null) });
  };

  const cancelarRC = async (rc: PurchaseRequest) => {
    const ok = await confirmar({
      titulo: `Cancelar a ${rc.rc_number}?`,
      mensagem: "A requisição sai do fluxo e não pode ser reaberta. As cotações ficam guardadas nela.",
      confirmar: "Cancelar requisição",
      cancelar: "Voltar",
      perigo: true,
    });
    if (!ok) return;
    cancelar.mutate({ id: rc.id, de: rc.status }, { onSuccess: () => setSelectedRC(null) });
  };

  const sel = selectedRC;
  const souDono = sel ? ehMinha(sel) : false;
  const podeMexer = souDono || gestor;
  // Gestor não aprova a PRÓPRIA RC. ⚠️ A regra mora só na tela (Fase 3: banco).
  const aprovaPropria = !!sel && souDono;
  const editavel = !!sel && (sel.status === "rascunho" || sel.status === "aguardando_aprovacao");

  const vazio = visao === "acao" && !termo && tipoFilter === "all" && setorFilter === "all" && escopoFilter === "all";

  return (
    <div className="space-y-4">
      {showNewForm && <PurchaseRequestForm onClose={onCloseForm} />}

      {/* Visão + busca */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit rounded-lg border border-border p-0.5">
          {([["acao", "Precisa de ação"], ["todas", "Todas"]] as const).map(([v, rotulo]) => (
            <button
              key={v}
              type="button"
              onClick={() => { setVer(v); if (statusFilter !== "all") setStatusFilter("all"); }}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${visao === v ? "bg-carbo-green text-white font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nº, solicitante, centro de custo, fornecedor…"
            className="pl-8"
          />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
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
          <SelectTrigger className="w-[170px]">
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
          <SelectTrigger className="w-[170px]">
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

      {/* Tabela — a linha inteira abre o detalhe */}
      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Nº RC</CarboTableHead>
            <CarboTableHead>Solicitante</CarboTableHead>
            <CarboTableHead>Centro de Custo</CarboTableHead>
            <CarboTableHead>Tipo</CarboTableHead>
            <CarboTableHead>Valor Estimado</CarboTableHead>
            <CarboTableHead>Prazo</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            <CarboTableHead>Data</CarboTableHead>
            <CarboTableHead><span className="sr-only">Ação</span></CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {isLoading ? (
            <CarboTableRow>
              <CarboTableCell colSpan={9} className="text-center text-muted-foreground py-8">
                Carregando...
              </CarboTableCell>
            </CarboTableRow>
          ) : !requests.length ? (
            <CarboTableRow>
              <CarboTableCell colSpan={9} className="text-center text-muted-foreground py-8">
                {vazio ? (
                  <div className="flex flex-col items-center gap-2">
                    <span>Nada precisa da sua ação agora.</span>
                    <Button variant="outline" size="sm" onClick={() => setVer("todas")}>Ver todas as requisições</Button>
                  </div>
                ) : (
                  "Nenhuma requisição encontrada"
                )}
              </CarboTableCell>
            </CarboTableRow>
          ) : (
            requests.map((rc) => (
              <CarboTableRow key={rc.id} interactive onClick={() => setSelectedRC(rc)}>
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
                    <span>{rc.motivo ? (MOTIVO_LABELS[rc.motivo] ?? PURCHASE_TYPE_LABELS[rc.purchase_type]) : PURCHASE_TYPE_LABELS[rc.purchase_type]}</span>
                    <CarboBadge variant={escopoOf(rc) === "setor" ? "info" : "secondary"} className="text-[10px]">
                      {escopoOf(rc) === "setor" ? "Setor" : "Individual"}
                    </CarboBadge>
                    {(rc.priority === "critica" || rc.priority === "alta") && (
                      <CarboBadge variant={rc.priority === "critica" ? "destructive" : "warning"} className="text-[10px]">
                        {PRIORITY_LABELS[rc.priority]}
                      </CarboBadge>
                    )}
                  </div>
                </CarboTableCell>
                <CarboTableCell className="font-mono">{formatCurrency(rc.estimated_value)}</CarboTableCell>
                <CarboTableCell className="text-sm text-muted-foreground">{dataBR(rc.needed_by)}</CarboTableCell>
                <CarboTableCell>
                  <CarboBadge variant={statusVariantMap[rc.status]} dot>
                    {REQUEST_STATUS_LABELS[rc.status]}
                  </CarboBadge>
                </CarboTableCell>
                <CarboTableCell className="text-muted-foreground text-sm">{dataBR(rc.created_at)}</CarboTableCell>
                <CarboTableCell onClick={(e) => e.stopPropagation()}>
                  {rc.status === "aprovada" && (
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setGerarOC(rc)}>
                      <PackagePlus className="h-4 w-4" /> Gerar OC
                    </Button>
                  )}
                </CarboTableCell>
              </CarboTableRow>
            ))
          )}
        </CarboTableBody>
      </CarboTable>

      {/* Detalhe */}
      <Dialog open={!!sel} onOpenChange={(o) => !o && setSelectedRC(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Requisição {sel?.rc_number}
              {sel && <CarboBadge variant={statusVariantMap[sel.status]} dot>{REQUEST_STATUS_LABELS[sel.status]}</CarboBadge>}
            </DialogTitle>
            <DialogDescription>
              {sel ? `Aberta em ${dataBR(sel.created_at)}` : "Detalhes da requisição de compra"}
            </DialogDescription>
          </DialogHeader>
          {sel && (
            <div className="space-y-4 min-w-0">
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">Solicitante:</span> <strong>{requesterName(sel)}</strong></div>
                {registradoPor(sel) && (
                  <div><span className="text-muted-foreground">Registrado por:</span> <strong>{registradoPor(sel)}</strong></div>
                )}
                <div><span className="text-muted-foreground">Setor:</span> <strong>{setorOf(sel) ? (deptLabel[setorOf(sel)!] ?? setorOf(sel)) : "—"}</strong></div>
                <div><span className="text-muted-foreground">Escopo:</span> <strong>{escopoOf(sel) === "setor" ? "Do setor" : "Individual"}</strong></div>
                {sel.motivo && (
                  <div><span className="text-muted-foreground">Motivo:</span> <strong>{MOTIVO_LABELS[sel.motivo] ?? sel.motivo}</strong></div>
                )}
                {sel.priority && sel.priority !== "normal" && (
                  <div><span className="text-muted-foreground">Prioridade:</span> <strong>{PRIORITY_LABELS[sel.priority]}</strong></div>
                )}
                {sel.needed_by && (
                  <div><span className="text-muted-foreground">Precisa até:</span> <strong>{dataBR(sel.needed_by)}</strong></div>
                )}
                <div><span className="text-muted-foreground">Centro de Custo:</span> <strong>{sel.cost_center}</strong></div>
                <div><span className="text-muted-foreground">Tipo:</span> <strong>{PURCHASE_TYPE_LABELS[sel.purchase_type]}</strong></div>
                <div><span className="text-muted-foreground">Fornecedor sugerido:</span> <strong>{sel.suggested_supplier || "—"}</strong></div>
                <div><span className="text-muted-foreground">Valor estimado:</span> <strong className="kpi-number">{formatCurrency(sel.estimated_value)}</strong></div>
                {sel.reference_url && (
                  <div className="sm:col-span-2"><span className="text-muted-foreground">Link:</span> <a href={sel.reference_url} target="_blank" rel="noopener" className="text-carbo-green underline break-all">{sel.reference_url}</a></div>
                )}
              </div>
              {sel.justification && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Justificativa</p>
                  <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{sel.justification}</p>
                </div>
              )}
              {sel.operational_impact && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Impacto Operacional</p>
                  <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{sel.operational_impact}</p>
                </div>
              )}
              {sel.items?.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Itens</p>
                  <div className="border border-border rounded-lg overflow-x-auto">
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
                        {sel.items.map((item, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="p-2">{item.descricao}</td>
                            <td className="p-2 text-right whitespace-nowrap">{item.quantidade} {item.unidade}</td>
                            <td className="p-2 text-right font-mono">{formatCurrency(item.valor_unitario)}</td>
                            <td className="p-2 text-right font-mono">{formatCurrency(item.quantidade * item.valor_unitario)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {sel.items?.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Cotações por item
                    {!editavel && <span className="ml-1 text-xs">(só leitura — a requisição já foi {REQUEST_STATUS_LABELS[sel.status].toLowerCase()})</span>}
                  </p>
                  <CotacoesPanel requestId={sel.id} items={sel.items as any} editable={editavel} />
                </div>
              )}
              {sel.rejection_reason && (
                <div className="bg-destructive/10 rounded-lg p-3">
                  <p className="text-sm font-medium text-destructive">Motivo da Rejeição</p>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{sel.rejection_reason}</p>
                </div>
              )}
            </div>
          )}

          {sel && (
            <DialogFooter className="flex-col gap-3 sm:flex-col sm:space-x-0">
              <div className="text-xs text-muted-foreground">
                {(sel.status === "aguardando_aprovacao" || sel.status === "aprovada") && (
                  <>
                    Estimado <strong>{formatCurrency(sel.estimated_value)}</strong>
                    {totalCotado > 0 && <> · Cotado <strong className="text-carbo-green">{formatCurrency(totalCotado)}</strong></>}
                    {itensSemCotacao > 0 && <> · <span className="text-warning-foreground">{itensSemCotacao} item(ns) sem cotação</span></>}
                  </>
                )}
                {gestor && sel.status === "aguardando_aprovacao" && aprovaPropria && (
                  <p className="mt-1 text-warning-foreground">
                    Esta requisição é sua — quem aprova é outro gestor.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {podeMexer && podeCancelarRequisicao(sel.status) && (
                  <Button variant="ghost" className="gap-1.5 text-destructive" disabled={ocupado} onClick={() => cancelarRC(sel)}>
                    <Ban className="h-4 w-4" /> Cancelar requisição
                  </Button>
                )}

                {sel.status === "rascunho" && podeMexer && (
                  <Button className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white" disabled={ocupado} onClick={() => enviarParaAprovacao(sel)}>
                    <Send className="h-4 w-4" /> Enviar para aprovação
                  </Button>
                )}

                {sel.status === "aguardando_aprovacao" && gestor && (
                  <>
                    <Button variant="outline" className="gap-1.5 text-destructive" disabled={ocupado || aprovaPropria} onClick={() => rejeitar(sel)}>
                      <XCircle className="h-4 w-4" /> Rejeitar
                    </Button>
                    <Button
                      className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white"
                      disabled={ocupado || aprovaPropria}
                      title={aprovaPropria ? "Você não pode aprovar a própria requisição" : undefined}
                      onClick={() => aprovar(sel)}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Aprovar
                    </Button>
                  </>
                )}

                {sel.status === "aprovada" && (
                  <Button
                    className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white"
                    onClick={() => { setGerarOC(sel); setSelectedRC(null); }}
                  >
                    <PackagePlus className="h-4 w-4" /> Gerar Ordem de Compra
                  </Button>
                )}
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <GerarOCDialog rc={gerarOC} onClose={() => setGerarOC(null)} />
    </div>
  );
}
