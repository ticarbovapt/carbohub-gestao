import { useMemo, useState } from "react";
import { ShoppingBag, Loader2, Calendar, Eye, MapPin, Phone, Mail, Package, User, Users, FileText, CreditCard, Truck, Boxes, Weight } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { useAuth } from "@/contexts/AuthContext";
import { useVendedoresDir } from "@/hooks/useVendas";
import { usePosVendaOrders, POSVENDA_STAGES, type FulfillmentStage, type PosVendaOrder } from "@/hooks/usePosVenda";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");
// Data-only (yyyy-mm-dd) sem shift de fuso.
const fmtDay = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const stageLabel = (k: FulfillmentStage) => POSVENDA_STAGES.find((s) => s.key === k)?.label ?? k;
// Mesma formatação do Ops: o vendedor confere o documento contra o pedido.
const fmtDoc = (v: string | null) => {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v?.trim() || "—";
};

export default function PosVenda() {
  const { user, isGestor } = useAuth();
  const [vendedorFilter, setVendedorFilter] = useState("__all__");
  const { data: orders = [], isLoading } = usePosVendaOrders({
    isGestor, userId: user?.id, vendedorFilter,
  });
  const { data: dir = [] } = useVendedoresDir();
  const [detail, setDetail] = useState<PosVendaOrder | null>(null);

  const byStage = useMemo(() => {
    const map: Record<string, PosVendaOrder[]> = {};
    for (const s of POSVENDA_STAGES) map[s.key] = [];
    for (const o of orders) (map[o.fulfillment_stage] ??= []).push(o);
    return map;
  }, [orders]);

  return (
    <div className="p-4 md:p-6 h-[calc(100dvh-3.5rem)] flex flex-col overflow-hidden">
      <div className="max-w-[1700px] mx-auto w-full flex flex-col flex-1 min-h-0 gap-4">
        <CarboPageHeader
          title={isGestor ? "Pós-venda — Rastreio de venda" : "Pós-venda — Meus Pedidos"}
          description="Acompanhe a jornada dos pedidos (somente leitura — quem controla é a operação)"
          icon={ShoppingBag}
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-500 flex-1 min-w-[280px]">
            <Eye className="h-4 w-4 shrink-0" />
            <span>Visualização. As etapas são atualizadas pelo time de operações no Carbo Ops. Clique no card para ver os detalhes.</span>
          </div>
          {/* Filtro só para gestor: o vendedor já vê apenas o que é dele, pela
              RLS. Oferecer o seletor a ele prometeria dado que não vem. */}
          {isGestor && (
            <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
              <SelectTrigger className="h-9 w-[230px] text-sm">
                <span className="flex items-center gap-1.5 truncate">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <SelectValue placeholder="Todos os vendedores" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os vendedores</SelectItem>
                {dir.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.full_name || "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : orders.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {isGestor && vendedorFilter !== "__all__"
              ? "Este vendedor não tem pedidos em acompanhamento."
              : "Nenhum pedido manual em acompanhamento."}
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto flex-1 min-h-0">
            {POSVENDA_STAGES.map((stage) => {
              const items = byStage[stage.key] ?? [];
              return (
                <div key={stage.key} className="flex-1 min-w-[230px] h-full rounded-2xl border border-border bg-board-surface/40 flex flex-col">
                  <div className="px-3 py-2.5 border-b border-border flex items-center justify-between shrink-0">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                      {stage.label}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                  </div>
                  <div className="p-2 space-y-2 overflow-y-auto flex-1 min-h-0">
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
                          {/* Com o quadro de todos, sem o nome o card fica anônimo. */}
                          {isGestor && o.vendedor_name && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                              <User className="h-3 w-3 shrink-0" /> {o.vendedor_name}
                            </p>
                          )}
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
                  {detail.vendedor_name && (
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {detail.vendedor_name}</span>
                  )}
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

                {/* Dados fiscais e de pagamento — existiam no pedido e nunca
                    chegavam ao vendedor. É ele quem o cliente liga a cobrar. */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs rounded-lg border border-border p-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-muted-foreground mb-0.5"><FileText className="h-3.5 w-3.5" /> CNPJ / CPF</p>
                    <p className="font-medium">{fmtDoc(detail.cnpj)}</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-muted-foreground mb-0.5"><FileText className="h-3.5 w-3.5" /> Inscrição Estadual</p>
                    <p className="font-medium">{detail.customer_ie?.trim() || "Isento / não informado"}</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-muted-foreground mb-0.5"><CreditCard className="h-3.5 w-3.5" /> Forma de pagamento</p>
                    <p className="font-medium">{detail.payment_terms || "—"}</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-muted-foreground mb-0.5"><Truck className="h-3.5 w-3.5" /> Frete</p>
                    <p className="font-medium">{detail.freight_type || "—"}</p>
                  </div>
                  {detail.invoice_number && (
                    <div>
                      <p className="flex items-center gap-1.5 text-muted-foreground mb-0.5"><FileText className="h-3.5 w-3.5" /> Nota fiscal</p>
                      <p className="font-medium">{detail.invoice_number}</p>
                    </div>
                  )}
                </div>

                {/* Prazos combinados na venda. O vendedor prometeu a data; ele
                    precisa ver se ela ainda está de pé. */}
                {(detail.agreed_delivery_date || detail.ppf_date || detail.ppe_date) && (
                  <div className="grid grid-cols-3 gap-x-4 text-xs rounded-lg border border-border p-3">
                    <div>
                      <p className="text-muted-foreground mb-0.5">Entrega combinada</p>
                      <p className="font-medium">{fmtDay(detail.agreed_delivery_date)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Fabricar até (PPF)</p>
                      <p className="font-medium">{fmtDay(detail.ppf_date)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Expedir até (PPE)</p>
                      <p className="font-medium">{fmtDay(detail.ppe_date)}</p>
                    </div>
                  </div>
                )}

                {/* Expedição. Só aparece quando a operação já preencheu — bloco
                    vazio em todo pedido novo seria ruído. */}
                {(detail.shipment_volumes != null || detail.shipment_weight_kg != null || detail.shipment_carrier) && (
                  <div className="grid grid-cols-3 gap-x-4 text-xs rounded-lg border border-border p-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-muted-foreground mb-0.5"><Boxes className="h-3.5 w-3.5" /> Volumes</p>
                      <p className="font-medium">{detail.shipment_volumes ?? "—"}</p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1.5 text-muted-foreground mb-0.5"><Weight className="h-3.5 w-3.5" /> Peso bruto</p>
                      <p className="font-medium">{detail.shipment_weight_kg != null ? `${String(detail.shipment_weight_kg).replace(".", ",")} kg` : "—"}</p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1.5 text-muted-foreground mb-0.5"><Truck className="h-3.5 w-3.5" /> Transportadora</p>
                      <p className="font-medium">{detail.shipment_carrier || "—"}</p>
                    </div>
                  </div>
                )}

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
