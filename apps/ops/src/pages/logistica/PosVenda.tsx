import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ShoppingBag, Loader2, User, Calendar, MapPin, Phone, Mail, Package } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import {
  usePosVendaOrders, useUpdateFulfillmentStage, useHubRnStock, useOpsBySource, opSector,
  POSVENDA_STAGES, type FulfillmentStage, type PosVendaOrder,
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
  // Janela dos FINALIZADOS (entregue/cancelado). Ativos sempre carregam 100%.
  const [terminalDays, setTerminalDays] = useState<number | "all">(30);
  const { data, isLoading } = usePosVendaOrders(terminalDays);
  const orders = data?.orders ?? [];
  const terminalHidden = Math.max(0, (data?.terminalTotal ?? 0) - (data?.terminalShown ?? 0));
  const updateStage = useUpdateFulfillmentStage();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<FulfillmentStage | null>(null);
  const [detail, setDetail] = useState<PosVendaOrder | null>(null);
  // Pedido + destino aguardando confirmação (Em Separação OU Criar Ordem de Produção).
  const [pending, setPending] = useState<{ order: PosVendaOrder; target: FulfillmentStage } | null>(null);

  // Estoque HUB-RN dos itens do pedido em confirmação (checagem real).
  const pendingItems = useMemo(
    () => (Array.isArray(pending?.order.items) ? pending!.order.items : []),
    [pending],
  );
  const pendingProductIds = useMemo(
    () => pendingItems.map((i) => i.product_id).filter(Boolean) as string[],
    [pendingItems],
  );
  const { data: stockMap = {}, isLoading: stockLoading } = useHubRnStock(pendingProductIds, !!pending);
  const stockLines = pendingItems.map((it) => {
    const needed = Number(it.quantity) || 0;
    const pid = it.product_id ?? null;
    const available = pid ? (stockMap[pid] ?? 0) : null; // null = item sem vínculo de produto
    return { name: it.name ?? "Item", needed, available, linked: !!pid, ok: available != null && available >= needed };
  });
  const allInStock = stockLines.length > 0 && stockLines.every((l) => l.linked && l.ok);
  const anyUnlinked = stockLines.some((l) => !l.linked);
  const stockKnown = stockLines.length > 0 && !anyUnlinked;
  const hasStock = stockKnown && allInStock;
  // Alvo de separação da caixa: se o operador mandou direto pra "Separado",
  // confirma pra "Separado" (deduz o estoque); senão, "Em Separação".
  const sepTarget: FulfillmentStage = pending?.target === "separado" ? "separado" : "separando";
  const sepLabel = sepTarget === "separado" ? "Separado" : "Em Separação";

  // Acompanhamento: em que setor da produção está cada pedido de "Criar OP".
  const criarOpIds = useMemo(
    () => orders.filter((o) => o.fulfillment_stage === "criar_op").map((o) => o.id),
    [orders],
  );
  const { data: opByOrder = {} } = useOpsBySource(criarOpIds, criarOpIds.length > 0);

  const byStage = useMemo(() => {
    const map: Record<string, PosVendaOrder[]> = {};
    for (const s of POSVENDA_STAGES) map[s.key] = [];
    for (const o of orders) (map[o.fulfillment_stage] ??= []).push(o);
    return map;
  }, [orders]);

  // Portão: mover para "Em Separação", "Separado" ou "Criar Ordem de Produção" abre
  // a caixa de confirmação ciente do estoque (a decisão final é do operador).
  // "Separado" é o ponto em que o estoque é REALMENTE deduzido — por isso também
  // passa pelo portão (B10: mover direto pra Separado não pode pular a conferência).
  // Portão fiscal: não deixa o pedido ir pra Transporte/Entregue sem NF emitida.
  // Considera "com NF" quem já tem bling_nf_id/nº ou já passou de "NF Finalizada".
  const STAGE_ORDER = POSVENDA_STAGES.map((s) => s.key);
  const hasNF = (o: PosVendaOrder) =>
    !!o.bling_nf_id || !!o.invoice_number ||
    STAGE_ORDER.indexOf(o.fulfillment_stage) >= STAGE_ORDER.indexOf("nf_finalizada");

  function requestStage(order: PosVendaOrder, stage: FulfillmentStage) {
    if (order.fulfillment_stage === stage) return;
    if ((stage === "em_transporte" || stage === "entregue") && !hasNF(order)) {
      toast.error("Emita a NF antes de enviar", {
        description: "Este pedido ainda não tem nota fiscal finalizada. Passe por “Gerar Nota Fiscal” → “NF Finalizada” antes de mover para Transporte/Entrega.",
      });
      return;
    }
    if (stage === "separando" || stage === "criar_op" || stage === "separado") { setPending({ order, target: stage }); return; }
    updateStage.mutate({ id: order.id, stage });
  }

  // Aplica a etapa escolhida na caixa e fecha.
  function commitStage(stage: FulfillmentStage) {
    if (pending) updateStage.mutate({ id: pending.order.id, stage });
    setPending(null);
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
          title="Rastreio de venda"
          description="Jornada das vendas manuais (Carbo Sales) — operações controlam da Nova Venda à Entrega"
          icon={ShoppingBag}
        />

        {/* Janela dos finalizados — os ativos sempre aparecem 100%. */}
        <div className="flex items-center justify-end gap-2 shrink-0 -mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground">Finalizados:</span>
          <Select value={String(terminalDays)} onValueChange={(v) => setTerminalDays(v === "all" ? "all" : Number(v))}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
          {terminalDays !== "all" && terminalHidden > 0 && (
            <button onClick={() => setTerminalDays("all")} className="text-xs text-primary hover:underline">
              +{terminalHidden} finalizado{terminalHidden > 1 ? "s" : ""} oculto{terminalHidden > 1 ? "s" : ""} · ver tudo
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-3 overflow-y-auto md:overflow-x-auto flex-1 min-h-0">
            {POSVENDA_STAGES.map((stage) => {
              const items = byStage[stage.key] ?? [];
              const isOver = overStage === stage.key;
              return (
                <div
                  key={stage.key}
                  onDragOver={(e) => { e.preventDefault(); setOverStage(stage.key); }}
                  onDragLeave={() => setOverStage((s) => (s === stage.key ? null : s))}
                  onDrop={() => drop(stage.key)}
                  className={`w-full md:flex-1 md:min-w-[280px] md:h-full rounded-2xl border flex flex-col transition-colors ${
                    isOver ? "border-carbo-green bg-carbo-green/5" : "border-border bg-board-surface/40"
                  }`}
                >
                  <div className="px-3 py-2.5 border-b border-border flex items-center justify-between gap-2 shrink-0">
                    <span className="flex items-center gap-2 text-sm font-semibold min-w-0">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: stage.color }} />
                      <span className="truncate">{stage.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {stage.key === "criar_op" && items.some((i) => i.production_done) && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" title="Produzidos aguardando mover para Em Separação">
                          🏭 {items.filter((i) => i.production_done).length} pronto{items.filter((i) => i.production_done).length > 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                    </span>
                  </div>
                  <div className="p-2 space-y-2 md:overflow-y-auto md:flex-1 md:min-h-0">
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
                          {o.fulfillment_stage === "criar_op" && (
                            o.production_done ? (
                              <CarboBadge variant="success" className="gap-1">✅ Produzido — mover p/ Em Separação</CarboBadge>
                            ) : opByOrder[o.id] ? (
                              <CarboBadge variant="default" className="gap-1">🏭 Produção: {opSector(opByOrder[o.id].op_status)}</CarboBadge>
                            ) : null
                          )}
                          {o.fulfillment_stage === "gerar_nf" && (
                            <CarboBadge variant="warning" className="gap-1">🧾 Liberado no Faturamento — aguardando NF</CarboBadge>
                          )}
                          {o.fulfillment_stage === "nf_finalizada" && (
                            <CarboBadge variant="success" className="gap-1">🧾 NF {o.invoice_number || o.bling_nf_id || "emitida"}</CarboBadge>
                          )}
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

      {/* Portão de estoque — vale para Em Separação e Criar Ordem de Produção */}
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {stockLoading ? "Conferindo estoque…" : hasStock ? "Produto em estoque" : "Sem estoque"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {/* Itens: quantidade pedida × disponível no HUB-RN */}
            <div className="rounded-lg border border-border divide-y">
              {stockLoading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo estoque no HUB-RN…
                </div>
              ) : stockLines.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">Pedido sem itens.</p>
              ) : (
                stockLines.map((l, i) => (
                  <div key={i} className="px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium truncate">{l.name}</span>
                      {!l.linked ? (
                        <CarboBadge variant="warning">Sem vínculo</CarboBadge>
                      ) : l.ok ? (
                        <CarboBadge variant="success">Em estoque</CarboBadge>
                      ) : (
                        <CarboBadge variant="destructive">Sem estoque</CarboBadge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-baseline gap-1.5 rounded-md bg-muted/50 px-2 py-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Pedido</span>
                        <span className="text-sm font-semibold tabular-nums">{l.needed}</span>
                      </span>
                      <span className="inline-flex items-baseline gap-1.5 rounded-md bg-muted/50 px-2 py-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Estoque</span>
                        <span className={`text-sm font-semibold tabular-nums ${
                          !l.linked ? "text-muted-foreground" : l.ok ? "text-emerald-500" : "text-destructive"
                        }`}>
                          {l.linked ? l.available : "—"}
                        </span>
                      </span>
                      {l.linked && (
                        <span className="inline-flex items-baseline gap-1.5 rounded-md bg-muted/50 px-2 py-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Sobra</span>
                          <span className={`text-sm font-semibold tabular-nums ${
                            (l.available! - l.needed) < 0 ? "text-destructive" : "text-foreground"
                          }`}>
                            {l.available! - l.needed}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {!stockLoading && (
              <>
                {/* Mensagem curta + ações, por caso */}
                {!stockKnown ? (
                  /* Não deu para conferir (item sem vínculo de produto). */
                  <>
                    <p className="text-xs text-amber-500">Não deu para conferir o estoque (item sem produto vinculado). Escolha:</p>
                    <div className="flex flex-col gap-2 pt-1">
                      <Button className="w-full" onClick={() => commitStage("criar_op")}>Produzir → Criar Ordem de Produção</Button>
                      <Button className="w-full" variant="outline" onClick={() => commitStage(sepTarget)}>Tem estoque → {sepLabel}</Button>
                    </div>
                  </>
                ) : hasStock ? (
                  pending?.target === "criar_op" ? (
                    /* Tem estoque, mas o operador mandou produzir. */
                    <>
                      <p className="text-xs text-muted-foreground">Este produto <strong>tem estoque</strong>. Deseja produzir mesmo assim?</p>
                      <div className="flex flex-col gap-2 pt-1">
                        <Button className="w-full" onClick={() => commitStage("criar_op")}>Sim, produzir</Button>
                        <Button className="w-full" variant="outline" onClick={() => commitStage(sepTarget)}>Não, usar o estoque → {sepLabel}</Button>
                      </div>
                    </>
                  ) : (
                    /* Tem estoque e vai separar. */
                    <>
                      <p className="text-xs text-emerald-500">Tem estoque para separar.</p>
                      <div className="flex flex-col gap-2 pt-1">
                        <Button className="w-full" onClick={() => commitStage(sepTarget)}>Confirmar → {sepLabel}</Button>
                      </div>
                    </>
                  )
                ) : (
                  /* Sem estoque → obrigatório produzir. */
                  <>
                    <p className="text-xs text-amber-500">Produto sem estoque — é necessário produzir.</p>
                    <div className="flex flex-col gap-2 pt-1">
                      <Button className="w-full" onClick={() => commitStage("criar_op")}>OK, produzir → Criar Ordem de Produção</Button>
                    </div>
                  </>
                )}
              </>
            )}
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
