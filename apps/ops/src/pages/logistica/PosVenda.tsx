import { useMemo, useState } from "react";
import { ShoppingBag, Loader2, User, Calendar, MapPin, Phone, Mail, Package } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import {
  usePosVendaOrders, useUpdateFulfillmentStage, useHubRnStock, POSVENDA_STAGES,
  type FulfillmentStage, type PosVendaOrder,
} from "@/hooks/usePosVenda";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");
const stageLabel = (k: FulfillmentStage) => POSVENDA_STAGES.find((s) => s.key === k)?.label ?? k;

function VendedorTag({ name, avatar }: { name: string; avatar: string | null }) {
  return (
    <span className="flex items-center gap-1 truncate">
      {avatar
        ? <img src={avatar} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
        : <User className="h-3.5 w-3.5 shrink-0" />}
      {name}
    </span>
  );
}

export default function PosVenda() {
  const { data: orders = [], isLoading } = usePosVendaOrders();
  const updateStage = useUpdateFulfillmentStage();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<FulfillmentStage | null>(null);
  const [detail, setDetail] = useState<PosVendaOrder | null>(null);
  // Pedido aguardando a confirmação de estoque para ir a "Em Separação".
  const [pendingSep, setPendingSep] = useState<PosVendaOrder | null>(null);

  // Estoque HUB-RN dos itens do pedido em confirmação (checagem real).
  const pendingItems = useMemo(
    () => (Array.isArray(pendingSep?.items) ? pendingSep!.items : []),
    [pendingSep],
  );
  const pendingProductIds = useMemo(
    () => pendingItems.map((i) => i.product_id).filter(Boolean) as string[],
    [pendingItems],
  );
  const { data: stockMap = {}, isLoading: stockLoading } = useHubRnStock(pendingProductIds, !!pendingSep);
  const stockLines = pendingItems.map((it) => {
    const needed = Number(it.quantity) || 0;
    const pid = it.product_id ?? null;
    const available = pid ? (stockMap[pid] ?? 0) : null; // null = item sem vínculo de produto
    return { name: it.name ?? "Item", needed, available, linked: !!pid, ok: available != null && available >= needed };
  });
  const allInStock = stockLines.length > 0 && stockLines.every((l) => l.linked && l.ok);
  const anyUnlinked = stockLines.some((l) => !l.linked);

  const byStage = useMemo(() => {
    const map: Record<string, PosVendaOrder[]> = {};
    for (const s of POSVENDA_STAGES) map[s.key] = [];
    for (const o of orders) (map[o.fulfillment_stage] ??= []).push(o);
    return map;
  }, [orders]);

  // Portão: "Em Separação" exige estoque. Sem SKU vinculado no item não dá pra
  // checar automático, então pede confirmação — e oferece mandar pra produção.
  function requestStage(order: PosVendaOrder, stage: FulfillmentStage) {
    if (order.fulfillment_stage === stage) return;
    if (stage === "separando") { setPendingSep(order); return; }
    updateStage.mutate({ id: order.id, stage });
  }

  const drop = (stage: FulfillmentStage) => {
    if (dragId) {
      const cur = orders.find((o) => o.id === dragId);
      if (cur) requestStage(cur, stage);
    }
    setDragId(null);
    setOverStage(null);
  };

  return (
    <div className="p-4 md:p-6 h-[calc(100dvh-3.5rem)] flex flex-col overflow-hidden">
      <div className="max-w-[1700px] mx-auto w-full flex flex-col flex-1 min-h-0 gap-4">
        <CarboPageHeader
          title="Pós-venda"
          description="Jornada das vendas manuais (Carbo Sales) — operações controlam da Nova Venda à Entrega"
          icon={ShoppingBag}
        />

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto flex-1 min-h-0">
            {POSVENDA_STAGES.map((stage) => {
              const items = byStage[stage.key] ?? [];
              const isOver = overStage === stage.key;
              return (
                <div
                  key={stage.key}
                  onDragOver={(e) => { e.preventDefault(); setOverStage(stage.key); }}
                  onDragLeave={() => setOverStage((s) => (s === stage.key ? null : s))}
                  onDrop={() => drop(stage.key)}
                  className={`flex-1 min-w-[280px] h-full rounded-2xl border flex flex-col transition-colors ${
                    isOver ? "border-carbo-green bg-carbo-green/5" : "border-border bg-board-surface/40"
                  }`}
                >
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
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); setDragId(o.id); }}
                          onDragEnd={() => { setDragId(null); setOverStage(null); }}
                          onClick={() => setDetail(o)}
                          className={`rounded-xl border border-border bg-card p-4 space-y-3 cursor-pointer hover:border-carbo-green/40 transition ${
                            dragId === o.id ? "opacity-50" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-[15px] leading-snug line-clamp-2">{o.customer_name}</span>
                            <span className="text-sm font-semibold tabular-nums shrink-0">{brl(Number(o.total))}</span>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">{o.order_number || "—"}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {o.vendedor_name && <VendedorTag name={o.vendedor_name} avatar={o.vendedor_avatar} />}
                            <span className="flex items-center gap-1 shrink-0"><Calendar className="h-3.5 w-3.5" /> {fmtDate(o.created_at)}</span>
                          </div>
                          {/* Mudar etapa sem precisar arrastar (não abre o detalhe) */}
                          <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                            <Select
                              value={o.fulfillment_stage}
                              onValueChange={(v) => requestStage(o, v as FulfillmentStage)}
                            >
                              <SelectTrigger className="h-9 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {POSVENDA_STAGES.map((s) => (
                                  <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          <strong>Arraste</strong> o card entre as colunas ou use o seletor para mudar a etapa. <strong>Clique</strong> no card para ver os detalhes.
        </p>
      </div>

      {/* Portão de estoque para "Em Separação" */}
      <Dialog open={!!pendingSep} onOpenChange={(o) => !o && setPendingSep(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tem estoque para separar?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Pedido <span className="font-mono">{pendingSep?.order_number}</span> ·{" "}
              <strong>{pendingSep?.customer_name}</strong> · estoque conferido no <strong>HUB-RN (Natal)</strong>.
            </p>

            {/* Itens: quantidade pedida × disponível no estoque */}
            <div className="rounded-lg border border-border divide-y">
              {stockLoading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo estoque…
                </div>
              ) : stockLines.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">Pedido sem itens.</p>
              ) : (
                stockLines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="truncate">{l.name}</span>
                    <span className="flex items-center gap-2 shrink-0 tabular-nums">
                      <span className="text-muted-foreground">precisa {l.needed}</span>
                      {!l.linked ? (
                        <CarboBadge variant="warning">sem vínculo</CarboBadge>
                      ) : l.ok ? (
                        <CarboBadge variant="success">estoque {l.available} ✓</CarboBadge>
                      ) : (
                        <CarboBadge variant="destructive">estoque {l.available} ✗</CarboBadge>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>

            {!stockLoading && stockLines.length > 0 && (
              <p className={`text-xs ${allInStock ? "text-emerald-500" : "text-amber-500"}`}>
                {allInStock
                  ? "✓ Tem estoque para todos os itens — pode separar."
                  : anyUnlinked
                    ? "⚠ Há item sem produto vinculado (venda antiga). Confira o estoque manualmente."
                    : "✗ Falta estoque — recomendado Criar Ordem de Produção."}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="w-full"
                variant={allInStock ? "default" : "outline"}
                onClick={() => { if (pendingSep) updateStage.mutate({ id: pendingSep.id, stage: "separando" }); setPendingSep(null); }}
              >
                {allInStock ? "Tem estoque → Em Separação" : "Separar mesmo assim → Em Separação"}
              </Button>
              <Button
                className="w-full"
                variant={allInStock ? "outline" : "default"}
                onClick={() => { if (pendingSep) requestStage(pendingSep, "criar_op"); setPendingSep(null); }}
              >
                Sem estoque → Criar Ordem de Produção
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detalhes do pedido */}
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
                  {detail.vendedor_name && <VendedorTag name={detail.vendedor_name} avatar={detail.vendedor_avatar} />}
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
