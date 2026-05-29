import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CarboButton } from "@/components/ui/carbo-button";
import {
  CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight,
  User, Package, FileText, MapPin, Send,
} from "lucide-react";
import type { BlingPreview } from "@/hooks/useFaturamento";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preview: BlingPreview | null;
  loading: boolean;
  onConfirmSend?: () => void;   // opcional: enviar de verdade direto da pré-visualização
  sending?: boolean;
}

export function BlingPreviewDialog({ open, onOpenChange, preview, loading, onConfirmSend, sending }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-carbo-green" />
            Pré-visualização do envio ao Bling
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" />)}
          </div>
        ) : !preview ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum dado para mostrar.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Estes são os dados <strong>exatos</strong> que seriam enviados ao Bling para o pedido{" "}
              <span className="font-mono font-medium">{preview.order_number}</span>.{" "}
              <strong>Nada foi enviado ainda.</strong>
            </p>

            {/* Avisos */}
            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Avisos ({preview.warnings.length})
                </p>
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground leading-snug">• {w}</p>
                ))}
              </div>
            )}

            {/* Contato */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Cliente
              </p>
              <div className="flex items-center gap-2 text-sm">
                {preview.contact_found ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                )}
                <span className="font-medium">{preview.customer_name}</span>
              </div>
              {preview.contact_found ? (
                <p className="text-[11px] text-muted-foreground">
                  Vinculado ao contato Bling <span className="font-mono">#{preview.contact_id}</span>
                  {preview.contact_source ? ` (via ${preview.contact_source})` : ""}
                </p>
              ) : (
                <p className="text-[11px] text-red-400">
                  Cliente não encontrado no Bling — o envio real falharia. Cadastre o cliente no Bling primeiro.
                </p>
              )}
            </div>

            {/* Itens */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" /> Itens ({preview.items_summary.length})
              </p>
              <div className="rounded-lg bg-muted/30 divide-y">
                {preview.items_summary.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      {item.codigo && <p className="text-[10px] text-muted-foreground font-mono">{item.codigo}</p>}
                    </div>
                    {item.matched ? (
                      <span className="text-[10px] text-green-500 flex items-center gap-0.5 shrink-0">
                        <CheckCircle2 className="h-3 w-3" /> casou no catálogo
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-500 flex items-center gap-0.5 shrink-0">
                        <AlertTriangle className="h-3 w-3" /> descrição livre
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Observação (destaque do PED) */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Observação (vínculo da NF)
              </p>
              <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs font-mono break-words">
                {preview.payload.observacoes || "—"}
              </div>
              <p className="text-[11px] text-muted-foreground">
                O número <span className="font-mono font-medium">{preview.order_number}</span> aqui é o que vincula a NF a esta venda.
              </p>
            </div>

            {/* Campos extras */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {preview.payload.numeroPedidoCompra && (
                <div className="rounded-lg bg-muted/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Nº Pedido de Compra</p>
                  <p className="font-mono">{preview.payload.numeroPedidoCompra}</p>
                </div>
              )}
              {preview.payload.data && (
                <div className="rounded-lg bg-muted/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Data</p>
                  <p className="font-mono">{preview.payload.data}</p>
                </div>
              )}
              {preview.payload.transporte?.fretePorConta != null && (
                <div className="rounded-lg bg-muted/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Frete</p>
                  <p>{preview.payload.transporte.fretePorConta === 0 ? "CIF (vendedor)" : "FOB (comprador)"}</p>
                </div>
              )}
              {preview.payload.desconto?.valor != null && (
                <div className="rounded-lg bg-muted/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Desconto</p>
                  <p className="font-mono">R$ {Number(preview.payload.desconto.valor).toFixed(2)}</p>
                </div>
              )}
            </div>

            {/* Endereço de entrega */}
            {preview.payload.transporte?.etiqueta && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Endereço de Entrega
                </p>
                <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs">
                  <p>{preview.payload.transporte.etiqueta.endereco || "—"}</p>
                  <p className="text-muted-foreground">
                    {[preview.payload.transporte.etiqueta.municipio, preview.payload.transporte.etiqueta.uf]
                      .filter(Boolean).join("/")}
                    {preview.payload.transporte.etiqueta.cep ? ` — CEP ${preview.payload.transporte.etiqueta.cep}` : ""}
                  </p>
                </div>
              </div>
            )}

            {/* JSON cru (técnico, recolhível) */}
            <div>
              <button
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                onClick={() => setShowRaw(v => !v)}
              >
                {showRaw ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Ver JSON técnico (o que vai literalmente na API)
              </button>
              {showRaw && (
                <pre className="mt-2 rounded-lg bg-muted/50 p-3 text-[10px] overflow-x-auto font-mono">
                  {JSON.stringify(preview.payload, null, 2)}
                </pre>
              )}
            </div>

            {/* Ações */}
            <div className="flex gap-2 pt-1">
              <CarboButton variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Fechar
              </CarboButton>
              {onConfirmSend && (
                <CarboButton
                  className="flex-1 gap-1.5"
                  onClick={onConfirmSend}
                  disabled={!preview.contact_found || sending}
                  title={!preview.contact_found ? "Cliente não encontrado no Bling" : "Enviar de verdade"}
                >
                  <Send className="h-3.5 w-3.5" />
                  {sending ? "Enviando..." : "Enviar ao Bling agora"}
                </CarboButton>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
