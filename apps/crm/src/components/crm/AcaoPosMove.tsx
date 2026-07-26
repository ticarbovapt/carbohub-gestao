import { useNavigate } from "react-router-dom";
import { FileText, ShoppingCart, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import type { CRMLead } from "@/types/crm";
import { useOrcamentoVigente } from "@/hooks/useLeadOrcamento";

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);

/**
 * O que fazer DEPOIS de mover o card para Orçamento ou para Ganho.
 *
 * Antes a ação existia só dentro do card — quem arrastava não tinha como
 * adivinhar que precisava abrir o detalhe para montar o orçamento. Mover para
 * Orçamento passa a significar "precisa de orçamento", e a coluna vira fila de
 * trabalho de verdade: o próximo passo aparece no mesmo gesto.
 *
 * Aparece DEPOIS da mutation confirmar, nunca durante — ver a nota em
 * Pipelines.handleDragMove sobre navegar com a mutation em voo.
 */
export function AcaoPosMove({
  lead, tipo, onClose,
}: { lead: CRMLead; tipo: "orcamento" | "ganho"; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: orcamento, isLoading } = useOrcamentoVigente(lead.id);

  const nome = lead.trade_name || lead.legal_name || lead.contact_name || "este lead";

  function montarNovo() {
    navigate("/vender", { state: { fromLead: {
      id: lead.id,
      name: lead.legal_name || lead.trade_name || lead.contact_name || "",
      cnpj: lead.cnpj || "",
      phone: lead.contact_phone || "",
      email: lead.contact_email || "",
      city: lead.city || "", state: lead.state || "", address: "", bairro: "",
    } } });
    onClose();
  }

  function reabrir() {
    if (!orcamento) return;
    navigate(`/vender?edit=${orcamento.order_id}`, { state: { fromLead: { id: lead.id } } });
    onClose();
  }

  const ehGanho = tipo === "ganho";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {ehGanho ? <ShoppingCart className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            {ehGanho ? "Fechar a venda" : "Montar o orçamento"}
          </DialogTitle>
          <DialogDescription>
            {ehGanho
              ? <><strong>{nome}</strong> foi para Ganho. Falta transformar em pedido.</>
              : <><strong>{nome}</strong> está na fila de orçamento. O preço ainda não foi montado.</>}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Procurando orçamento deste card…
          </div>
        ) : orcamento ? (
          <div className="rounded-lg border border-carbo-green/40 bg-carbo-green/5 p-3 space-y-1">
            <p className="text-sm font-medium">
              {orcamento.order_number ?? "Orçamento"} · {brl(orcamento.total)}
            </p>
            <p className="text-xs text-muted-foreground">
              {ehGanho
                ? "Reabre preenchido com tudo — é só conferir e converter. Nada de redigitar."
                : "Já existe um orçamento neste card. Reabra para revisar ou mandar de novo."}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {ehGanho
              ? "Não há orçamento montado neste card. Dá para lançar a venda direto — o cliente já vem preenchido."
              : "Nenhum orçamento montado ainda. O cliente já vem preenchido no formulário."}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {/* "Depois" é opção legítima e explícita. Sem ela o usuário fecha no X
              e fica sem saber se o card foi movido. */}
          <Button variant="ghost" onClick={onClose}>Agora não</Button>
          <div className="flex gap-2">
            {orcamento && (
              <Button onClick={reabrir} className="gap-1.5">
                {ehGanho ? "Reabrir e gerar a venda" : "Abrir orçamento"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            {!orcamento && (
              <Button onClick={montarNovo} className="gap-1.5">
                {ehGanho ? "Lançar a venda" : "Montar orçamento"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
