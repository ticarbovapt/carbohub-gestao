import { useMemo, useState } from "react";
import { ShoppingBag, Loader2, Calendar, Eye, MapPin, Phone, Mail, Package } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { useMyPosVenda, POSVENDA_STAGES, type FulfillmentStage, type PosVendaOrder } from "@/hooks/usePosVenda";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");
const stageLabel = (k: FulfillmentStage) => POSVENDA_STAGES.find((s) => s.key === k)?.label ?? k;

export default function PosVenda() {
  const { data: orders = [], isLoading } = useMyPosVenda();
  const [detail, setDetail] = useState<PosVendaOrder | null>(null);

  const byStage = useMemo(() => {
    const map: Record<string, PosVendaOrder[]> = {};
    for (const s of POSVENDA_STAGES) map[s.key] = [];
    for (const o of orders) (map[o.fulfillment_stage] ??= []).push(o);
    return map;
  }, [orders]);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-4 max-w-[1700px] mx-auto">
        <CarboPageHeader
          title="Pós-venda — Meus Pedidos"
          description="Acompanhe a jornada dos seus pedidos (somente leitura — quem controla é a operação)"
          icon={ShoppingBag}
        />

        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-500">
          <Eye className="h-4 w-4 shrink-0" />
          <span>Visualização. As etapas são atualizadas pelo time de operações no Carbo Ops. Clique no card para ver os detalhes.</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : orders.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Você ainda não tem pedidos manuais em acompanhamento.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {POSVENDA_STAGES.map((stage) => {
              const items = byStage[stage.key] ?? [];
              return (
                <div key={stage.key} className="flex-1 min-w-[230px] rounded-2xl border border-border bg-board-surface/40 flex flex-col">
                  <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                      {stage.label}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                  </div>
                  <div className="p-2 space-y-2 min-h-[120px]">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 text-center py-6">Vazio</p>
                    ) : (
                      items.map((o) => (
                        <div
                          key={o.id}
                          onClick={() => setDetail(o)}
                          className="rounded-xl border border-border bg-card p-3 space-y-1.5 cursor-pointer hover:border-carbo-green/40 transition"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium text-sm truncate">{o.customer_name}</span>
                            <span className="text-xs font-semibold tabular-nums shrink-0">{brl(Number(o.total))}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono">{o.order_number || "—"}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(o.created_at)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3">
                  <span>{detail.customer_name}</span>
                  <CarboBadge variant="default">{stageLabel(detail.fulfillment_stage)}</CarboBadge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono">{detail.order_number || "—"}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(detail.created_at)}</span>
                </div>

                {(detail.customer_phone || detail.customer_email) && (
                  <div className="space-y-1">
                    {detail.customer_phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {detail.customer_phone}</p>}
                    {detail.customer_email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {detail.customer_email}</p>}
                  </div>
                )}

                {(detail.delivery_address || detail.delivery_city) && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <span>
                      {detail.delivery_address}
                      {detail.delivery_city && <>{detail.delivery_address ? " · " : ""}{detail.delivery_city}{detail.delivery_state ? `/${detail.delivery_state}` : ""}</>}
                      {detail.delivery_zip && <> · CEP {detail.delivery_zip}</>}
                    </span>
                  </div>
                )}

                <div>
                  <p className="flex items-center gap-2 font-medium mb-1.5"><Package className="h-4 w-4 text-carbo-green" /> Itens</p>
                  <div className="rounded-lg border border-border divide-y">
                    {(Array.isArray(detail.items) ? detail.items : []).map((it, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="truncate">{it.name ?? "Item"} <span className="text-muted-foreground">× {it.quantity ?? 1}</span></span>
                        <span className="tabular-nums">{brl(Number(it.total ?? (it.quantity ?? 0) * (it.unit_price ?? 0)))}</span>
                      </div>
                    ))}
                    {(!Array.isArray(detail.items) || detail.items.length === 0) && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Sem itens.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1 text-xs border-t border-border pt-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{brl(Number(detail.subtotal))}</span></div>
                  {Number(detail.shipping_cost) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span className="tabular-nums">{brl(Number(detail.shipping_cost))}</span></div>}
                  {Number(detail.discount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="tabular-nums">- {brl(Number(detail.discount))}</span></div>}
                  <div className="flex justify-between font-semibold text-sm pt-1"><span>Total</span><span className="tabular-nums">{brl(Number(detail.total))}</span></div>
                </div>

                {detail.notes && (
                  <div className="text-xs"><span className="text-muted-foreground">Observações: </span>{detail.notes}</div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
