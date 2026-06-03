import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Link2, Search, CheckCircle2, FileText, Lock } from "lucide-react";
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
function fmtCNPJ(s: string | null) {
  if (!s) return null;
  const n = s.replace(/\D/g, "");
  if (n.length === 14)
    return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`;
  return s;
}

export function LinkNFToOrderDialog({ open, onOpenChange, orderNumber, customerName }: Props) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const { data: nfes = [], isLoading } = useBlingNFes({ search });
  const link = useLinkNFeToOrder();

  const available  = nfes.filter(nf => nf.match_status !== "matched" && nf.match_status !== "manual");
  const alreadyLinked = nfes.filter(nf => nf.match_status === "matched" || nf.match_status === "manual");

  const displayed = showAll ? nfes : available;

  async function handleLink(nfeId: string) {
    await link.mutateAsync({ nfeId, orderNumber });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-carbo-green" />
            Vincular NF ao pedido
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Pedido alvo */}
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
            Vinculando ao pedido{" "}
            <span className="font-mono font-bold">{orderNumber}</span>
            <span className="text-muted-foreground"> · {customerName}</span>
          </div>

          <p className="text-xs text-muted-foreground">
            Escolha uma NF que já está no sistema (puxada do Bling). Use isto quando a NF foi
            emitida no Bling <strong>sem</strong> o número do pedido na observação — o vínculo
            automático não pega esses casos.
          </p>

          {/* Busca */}
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

          {/* Toggle mostrar vinculadas */}
          {alreadyLinked.length > 0 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAll
                ? `Ocultar NFs já vinculadas (${alreadyLinked.length})`
                : `Mostrar NFs já vinculadas (${alreadyLinked.length})`}
            </button>
          )}

          {/* Lista */}
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-0.5">
            {isLoading ? (
              [1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)
            ) : displayed.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                {search ? "Nenhuma NF encontrada." : "Nenhuma NF disponível para vincular."}
              </div>
            ) : (
              displayed.map(nf => {
                const isLinked = nf.match_status === "matched" || nf.match_status === "manual";
                const cnpj = fmtCNPJ(nf.contato_cnpj);

                return (
                  <button
                    key={nf.id}
                    onClick={() => !isLinked && handleLink(nf.id)}
                    disabled={isLinked || link.isPending}
                    className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      isLinked
                        ? "border-border/40 bg-muted/20 opacity-60 cursor-not-allowed"
                        : "border-border hover:border-carbo-green/50 hover:bg-carbo-green/5 disabled:opacity-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{nf.contato_nome || "—"}</p>
                      {cnpj && (
                        <p className="text-[10px] text-muted-foreground font-mono">{cnpj}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        NF {nf.numero || "?"}{nf.serie ? `/${nf.serie}` : ""} · {fmtDate(nf.data_emissao)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums">{fmtBRL(nf.valor_total)}</p>
                      {isLinked ? (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-end">
                          <Lock className="h-2.5 w-2.5" />
                          {nf.matched_order_number ? `Pedido ${nf.matched_order_number}` : "Vinculada"}
                        </span>
                      ) : (
                        <span className="text-[10px] text-carbo-green flex items-center gap-0.5 justify-end">
                          <CheckCircle2 className="h-3 w-3" /> vincular
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
