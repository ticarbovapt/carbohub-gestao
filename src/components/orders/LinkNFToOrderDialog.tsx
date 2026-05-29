import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Link2, Search, CheckCircle2, FileText } from "lucide-react";
import { useBlingNFes, useLinkNFeToOrder } from "@/hooks/useBlingNFes";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderNumber: string;
  customerName: string;
}

function fmtBRL(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return format(parseISO(s + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

export function LinkNFToOrderDialog({ open, onOpenChange, orderNumber, customerName }: Props) {
  const [search, setSearch] = useState("");
  const { data: nfes = [], isLoading } = useBlingNFes({ search });
  const link = useLinkNFeToOrder();

  // Só NFs ainda não vinculadas a nenhum pedido
  const unlinked = nfes.filter(nf => nf.match_status !== "matched" && nf.match_status !== "manual");

  async function handleLink(nfeId: string) {
    await link.mutateAsync({ nfeId, orderNumber });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-carbo-green" />
            Vincular NF ao pedido
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
            Vinculando ao pedido <span className="font-mono font-bold">{orderNumber}</span>
            <span className="text-muted-foreground"> · {customerName}</span>
          </div>

          <p className="text-xs text-muted-foreground">
            Escolha uma NF que já está no sistema (puxada do Bling). Use isto quando a NF foi
            emitida no Bling <strong>sem</strong> o número do pedido na observação — o vínculo
            automático não pega esses casos.
          </p>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar NF por cliente, CNPJ ou número..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}
            </div>
          ) : unlinked.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              {search ? "Nenhuma NF não-vinculada encontrada." : "Nenhuma NF disponível para vincular."}
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
              {unlinked.map(nf => (
                <button
                  key={nf.id}
                  onClick={() => handleLink(nf.id)}
                  disabled={link.isPending}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left hover:border-carbo-green/50 hover:bg-carbo-green/5 transition-colors disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{nf.contato_nome || "—"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      NF {nf.numero || "?"}{nf.serie ? `/${nf.serie}` : ""} · {fmtDate(nf.data_emissao)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums">{fmtBRL(nf.valor_total)}</p>
                    <span className="text-[10px] text-carbo-green flex items-center gap-0.5 justify-end">
                      <CheckCircle2 className="h-3 w-3" /> vincular
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
