import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, PackageX, Plus } from "lucide-react";
import { toast } from "sonner";
import { passoDe } from "@/lib/posvendaCasos";
import { usePosVendaDoCliente, type PedidoDoCliente } from "@/hooks/usePosVendaCasos";
import { AbrirCaso, ChipDesfecho, ChipTipo } from "@/components/posvenda/CasoPosVenda";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─────────────────────────────────────────────────────────────────────────────
// O cartão "Pós-venda" da conversa (Conversas, painel do contato): os pedidos
// do MESMO telefone (`carbo_posvenda_do_cliente`, 20261174) e o caso de cada
// um, com o atalho para tratar no Pós-venda. Liga a conversa ao caso sem
// depender de a mensagem ter vindo de um aviso de pedido.
//
// Desde 23/11/2026 o caso também NASCE daqui ("Abrir caso" no pedido sem caso
// aberto): o mesmo `AbrirCaso` do Pós-venda, e o caso aparece lá na hora.
// ─────────────────────────────────────────────────────────────────────────────

const dia = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${a.slice(2)}`; };

export default function PosVendaDoCliente({ waId }: { waId: string }) {
  const q = usePosVendaDoCliente(waId);
  const [abrindo, setAbrindo] = useState<PedidoDoCliente | null>(null);
  const navigate = useNavigate();
  const pedidos = q.data ?? [];
  if (q.isLoading || (!q.error && !pedidos.length)) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <PackageX className="h-4 w-4 shrink-0 text-carbo-green" />
        <span className="text-[13px] font-semibold">Pós-venda</span>
      </div>
      {q.error ? (
        <p className="px-3 py-2 text-[11px] text-red-500">Não consegui ler os pedidos: {(q.error as Error).message}</p>
      ) : (
        <ul className="divide-y divide-border">
          {pedidos.slice(0, 5).map((p) => {
            const aberto = p.caso?.status === "aberto";
            return (
              <li key={p.bling_id}>
                <Link to={`/pos-venda?pedido=${p.bling_id}`}
                  className="flex items-start gap-2 px-3 py-2 transition-colors hover:bg-carbo-green/5">
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate text-[12px]">
                      <span className="font-mono font-semibold">{p.pedido_codigo ?? p.pedido_numero ?? `#${Math.abs(p.bling_id)}`}</span>
                      <span className="text-muted-foreground"> · {dia(p.data_pedido)} · {p.canal}</span>
                    </span>
                    {p.caso ? (
                      <span className="flex flex-wrap items-center gap-1">
                        <ChipTipo tipo={p.caso.tipo} className="text-[11px]" />
                        {aberto
                          ? <span className="truncate text-[11px] text-muted-foreground">{passoDe(p.caso.tipo, p.caso.passo)?.titulo ?? p.caso.passo}</span>
                          : p.caso.desfecho && <ChipDesfecho desfecho={p.caso.desfecho} />}
                      </span>
                    ) : (
                      <span className="block text-[11px] text-muted-foreground">sem caso</span>
                    )}
                  </span>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
                {!aberto && (
                  <Button type="button" variant="outline" size="sm" className="mx-3 -mt-1 mb-2 h-7 px-2 text-[11px]"
                    onClick={() => setAbrindo(p)}>
                    <Plus className="mr-1 h-3 w-3" />Abrir caso
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {abrindo && (
        <Dialog open onOpenChange={(o) => !o && setAbrindo(null)}>
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {abrindo.pedido_codigo ?? abrindo.pedido_numero ?? `#${Math.abs(abrindo.bling_id)}`}
                <span className="ml-2 text-sm font-normal text-muted-foreground">{dia(abrindo.data_pedido)} · {abrindo.canal}</span>
              </DialogTitle>
            </DialogHeader>
            <AbrirCaso blingId={abrindo.bling_id} onAberto={() => {
              const id = abrindo.bling_id;
              setAbrindo(null);
              toast.success("Caso aberto", {
                action: { label: "Ver no pós-venda", onClick: () => navigate(`/pos-venda?pedido=${id}`) },
              });
            }} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
