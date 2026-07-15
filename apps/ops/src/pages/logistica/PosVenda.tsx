import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShoppingBag, Loader2, User, Calendar, MapPin, Phone, Mail, Package, FileText, CreditCard, Truck, Boxes, Weight, Tag, Pencil, CheckCircle2 } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CarboBadge } from "@/components/ui/carbo-badge";
import {
  usePosVendaOrders, usePosVendaRealtime, useUpdateFulfillmentStage, useUpdateShipmentInfo,
  useHubRnStock, useOpsBySource, fetchNfFiles,
  POSVENDA_STAGES, type FulfillmentStage, type PosVendaOrder,
} from "@/hooks/usePosVenda";
import { useDragScroll } from "@/hooks/useDragScroll";
import { gerarEtiquetaPDF, type EtiquetaData } from "@/lib/etiquetaPdf";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");
// Data-only (yyyy-mm-dd) sem shift de fuso.
const fmtDay = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");
// Formata CNPJ (14 díg.) ou CPF (11 díg.); mantém como veio se não bater.
const fmtDoc = (v: string | null) => {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v?.trim() || "—";
};
const stageLabel = (k: FulfillmentStage) => POSVENDA_STAGES.find((s) => s.key === k)?.label ?? k;
// Normaliza volumes (≥1) e peso (aceita vírgula) dos campos de expedição.
const parseVolumes = (v: string): number => { const n = Math.round(Number(v.trim())); return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : 1; };
const parsePesoKg = (p: string): number | null => { const s = p.trim().replace(",", "."); if (s === "") return null; const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : null; };

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
  usePosVendaRealtime(); // move card → reflete na tela de todos ao vivo
  const orders = data?.orders ?? [];
  const terminalHidden = Math.max(0, (data?.terminalTotal ?? 0) - (data?.terminalShown ?? 0));
  const updateStage = useUpdateFulfillmentStage();
  const updateShipInfo = useUpdateShipmentInfo();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<FulfillmentStage | null>(null);
  const scrollRef = useDragScroll<HTMLDivElement>();
  const [detail, setDetail] = useState<PosVendaOrder | null>(null);
  // Edição RÁPIDA de expedição no detalhe — só operacional (volumes/peso/
  // transportadora). Fiscal (CNPJ/IE/pagamento/faturamento) NÃO é editável aqui.
  const [editShip, setEditShip] = useState(false);
  const [edVolumes, setEdVolumes] = useState("");
  const [edPeso, setEdPeso] = useState("");
  const [edCarrier, setEdCarrier] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  useEffect(() => { setEditShip(false); }, [detail?.id]);
  const startEditShip = () => {
    if (!detail) return;
    setEdVolumes(detail.shipment_volumes != null ? String(detail.shipment_volumes) : "");
    setEdPeso(detail.shipment_weight_kg != null ? String(detail.shipment_weight_kg).replace(".", ",") : "");
    setEdCarrier(detail.shipment_carrier ?? "");
    setEditShip(true);
  };
  async function saveEditShip() {
    if (!detail) return;
    setSavingEdit(true);
    try {
      const volumes = edVolumes.trim() === "" ? null : parseVolumes(edVolumes);
      const weightKg = parsePesoKg(edPeso);
      const carrier = edCarrier.trim() || null;
      await updateShipInfo.mutateAsync({ id: detail.id, volumes, weightKg, carrier });
      setDetail((d) => (d ? { ...d, shipment_volumes: volumes, shipment_weight_kg: weightKg, shipment_carrier: carrier } : d));
      setEditShip(false);
    } finally {
      setSavingEdit(false);
    }
  }
  // Pedido + destino aguardando confirmação (Em Separação OU Criar Ordem de Produção).
  const [pending, setPending] = useState<{ order: PosVendaOrder; target: FulfillmentStage } | null>(null);
  // ── Dados de expedição ao ir p/ "Gerar Nota Fiscal" (Separado → Gerar NF) ──
  // Volumes, peso bruto e TRANSPORTADORA — salvos no card e usados na etiqueta.
  const [gnfOrder, setGnfOrder] = useState<PosVendaOrder | null>(null);
  const [gnfVolumes, setGnfVolumes] = useState("");
  const [gnfPeso, setGnfPeso] = useState("");
  const [gnfCarrier, setGnfCarrier] = useState("");
  const [gnfSaving, setGnfSaving] = useState(false);
  useEffect(() => {
    if (gnfOrder) {
      setGnfVolumes(gnfOrder.shipment_volumes != null ? String(gnfOrder.shipment_volumes) : "1");
      setGnfPeso(gnfOrder.shipment_weight_kg != null ? String(gnfOrder.shipment_weight_kg).replace(".", ",") : "");
      setGnfCarrier(gnfOrder.shipment_carrier ?? "");
    }
  }, [gnfOrder]);

  // ── Emitir etiqueta ──
  const [etiquetaOrder, setEtiquetaOrder] = useState<PosVendaOrder | null>(null);
  const [etqVolumes, setEtqVolumes] = useState("");
  const [etqPeso, setEtqPeso] = useState("");
  const [etqCarrier, setEtqCarrier] = useState("");
  const [etqChave, setEtqChave] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  useEffect(() => {
    if (etiquetaOrder) {
      setEtqVolumes(etiquetaOrder.shipment_volumes != null ? String(etiquetaOrder.shipment_volumes) : "1");
      setEtqPeso(etiquetaOrder.shipment_weight_kg != null ? String(etiquetaOrder.shipment_weight_kg).replace(".", ",") : "");
      setEtqCarrier(etiquetaOrder.shipment_carrier ?? "");
      setEtqChave(null);
      // Busca best-effort a chave de acesso da NF (código de barras). Não bloqueia.
      if (etiquetaOrder.bling_nf_id) {
        fetchNfFiles(etiquetaOrder.bling_nf_id).then((nf) => setEtqChave(nf?.chave_acesso ?? null)).catch(() => {});
      }
    }
  }, [etiquetaOrder]);

  // Volumes/peso normalizados do diálogo (usados no PDF e persistidos).
  const parsedEtqVolumes = parseVolumes(etqVolumes);
  const parsedEtqPeso = parsePesoKg(etqPeso);

  // Gera a etiqueta: persiste volumes/peso/transportadora ajustados no card e monta o PDF.
  // moveToTransporte=true → depois move o card p/ Em Transporte (respeita portão NF).
  async function emitirEtiqueta(order: PosVendaOrder, moveToTransporte: boolean) {
    setGerando(true);
    try {
      const volumes = parsedEtqVolumes;
      const weightKg = parsedEtqPeso;
      const carrier = etqCarrier.trim() || null;
      // Persiste no card quando mudou (não quebra a dedução do "separado").
      if (volumes !== order.shipment_volumes || weightKg !== order.shipment_weight_kg || carrier !== order.shipment_carrier) {
        await updateShipInfo.mutateAsync({ id: order.id, volumes, weightKg, carrier });
      }
      const payload: EtiquetaData = {
        order_number: order.order_number,
        invoice_number: order.invoice_number ?? (order.bling_nf_id ? `#${order.bling_nf_id}` : null),
        cnpj: order.cnpj,
        customer_name: order.customer_name,
        delivery_address: order.delivery_address,
        delivery_city: order.delivery_city,
        delivery_state: order.delivery_state,
        delivery_zip: order.delivery_zip,
        volumes,
        weightKg,
        transportadora: carrier,
        chaveAcesso: etqChave,
      };
      await gerarEtiquetaPDF(payload);
      if (moveToTransporte) {
        requestStage(order, "em_transporte");
      }
      setEtiquetaOrder(null);
    } finally {
      setGerando(false);
    }
  }

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
    if ((stage === "emitir_etiqueta" || stage === "em_transporte" || stage === "entregue") && !hasNF(order)) {
      toast.error("Emita a NF antes de gerar etiqueta/enviar", {
        description: "Este pedido ainda não tem nota fiscal finalizada. A etiqueta mostra o nº da NF — passe por “Gerar Nota Fiscal” → “NF Finalizada” antes de emitir a etiqueta ou mover para Transporte/Entrega.",
      });
      return;
    }
    // Ao ir para "Gerar Nota Fiscal": abre a caixa de expedição (volumes/peso/
    // transportadora) — é onde operações informa esses dados p/ a etiqueta.
    if (stage === "gerar_nf") { setGnfOrder(order); return; }
    if (stage === "separando" || stage === "criar_op" || stage === "separado") { setPending({ order, target: stage }); return; }
    updateStage.mutate({ id: order.id, stage });
  }

  // Aplica a etapa escolhida na caixa de conferência de estoque e fecha.
  function commitStage(stage: FulfillmentStage) {
    if (pending) updateStage.mutate({ id: pending.order.id, stage });
    setPending(null);
  }

  // Confirma a expedição: salva volumes/peso/transportadora no card e move p/ Gerar NF.
  async function confirmGerarNf() {
    if (!gnfOrder) return;
    setGnfSaving(true);
    try {
      await updateShipInfo.mutateAsync({
        id: gnfOrder.id,
        volumes: parseVolumes(gnfVolumes),
        weightKg: parsePesoKg(gnfPeso),
        carrier: gnfCarrier.trim() || null,
      });
      updateStage.mutate({ id: gnfOrder.id, stage: "gerar_nf" });
      setGnfOrder(null);
    } finally {
      setGnfSaving(false);
    }
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
          <div ref={scrollRef} className="flex flex-col md:flex-row gap-3 overflow-y-auto md:overflow-x-auto flex-1 min-h-0">
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
                              <CarboBadge variant="default" className="gap-1">
                                🏭 {opByOrder[o.id].done}/{opByOrder[o.id].total} produzidas · {opByOrder[o.id].sector}
                              </CarboBadge>
                            ) : (
                              <CarboBadge variant="warning" className="gap-1">⚠️ Sem OP — recriar (mover p/ Pedido Recebido e voltar)</CarboBadge>
                            )
                          )}
                          {o.fulfillment_stage === "gerar_nf" && (
                            <CarboBadge variant="warning" className="gap-1">🧾 Liberado no Faturamento — aguardando NF</CarboBadge>
                          )}
                          {o.fulfillment_stage === "nf_finalizada" && (
                            <CarboBadge variant="success" className="gap-1">🧾 NF {o.invoice_number || o.bling_nf_id || "emitida"}</CarboBadge>
                          )}
                          {o.fulfillment_stage === "emitir_etiqueta" && (
                            <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                              <CarboBadge variant="info" className="gap-1 mb-2">🧾 NF {o.invoice_number || o.bling_nf_id || "emitida"}</CarboBadge>
                              <Button size="sm" variant="outline" className="w-full h-9 text-xs gap-1.5"
                                onClick={() => setEtiquetaOrder(o)}>
                                <Tag className="h-3.5 w-3.5" /> Emitir etiqueta
                              </Button>
                            </div>
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

      {/* Emitir etiqueta de transporte (PDF 10×15) */}
      <Dialog open={!!etiquetaOrder} onOpenChange={(o) => !o && setEtiquetaOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-carbo-blue" /> Emitir etiqueta</DialogTitle>
          </DialogHeader>
          {etiquetaOrder && (
            <div className="space-y-4 text-sm">
              {/* Resumo do pedido */}
              <div className="rounded-lg border border-border p-3 space-y-1.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-sm">{etiquetaOrder.customer_name}</span>
                  <span className="font-mono text-muted-foreground shrink-0">{etiquetaOrder.order_number}</span>
                </div>
                {(etiquetaOrder.delivery_city || etiquetaOrder.delivery_state) && (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {[etiquetaOrder.delivery_city, etiquetaOrder.delivery_state].filter(Boolean).join(" / ")}
                    {etiquetaOrder.delivery_zip ? ` · CEP ${etiquetaOrder.delivery_zip}` : ""}
                  </p>
                )}
                <p className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  NF: <span className="font-medium">{etiquetaOrder.invoice_number || (etiquetaOrder.bling_nf_id ? `#${etiquetaOrder.bling_nf_id}` : "—")}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Código de barras: {etqChave ? "chave de acesso da NF" : "nº do pedido (chave da NF indisponível)"}
                </p>
              </div>

              {/* Volumes + peso (editáveis; persistem no card ao gerar) */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5 text-muted-foreground" /> Volumes</Label>
                  <Input type="number" min={1} inputMode="numeric" value={etqVolumes}
                    onChange={(e) => setEtqVolumes(e.target.value)} placeholder="1" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5"><Weight className="h-3.5 w-3.5 text-muted-foreground" /> Peso bruto (kg)</Label>
                  <Input type="text" inputMode="decimal" value={etqPeso}
                    onChange={(e) => setEtqPeso(e.target.value)} placeholder="ex.: 12,5" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-muted-foreground" /> Transportadora</Label>
                  <Input type="text" value={etqCarrier}
                    onChange={(e) => setEtqCarrier(e.target.value)} placeholder="Nome da transportadora" />
                </div>
                <p className="col-span-2 text-[11px] text-muted-foreground">
                  Serão gerada(s) <strong>{parsedEtqVolumes}</strong> etiqueta(s) (uma por volume). Ajustes ficam salvos no card.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <Button className="w-full gap-1.5" disabled={gerando}
                  onClick={() => emitirEtiqueta(etiquetaOrder, false)}>
                  {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />} Gerar PDF (10×15)
                </Button>
                <Button className="w-full" variant="outline" disabled={gerando}
                  onClick={() => emitirEtiqueta(etiquetaOrder, true)}>
                  Gerar e enviar → Em Transporte
                </Button>
                <Button className="w-full" variant="ghost" disabled={gerando}
                  onClick={() => setEtiquetaOrder(null)}>Fechar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Expedição: volumes/peso/transportadora ao ir p/ Gerar Nota Fiscal */}
      <Dialog open={!!gnfOrder} onOpenChange={(o) => !o && setGnfOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck className="h-4 w-4 text-carbo-blue" /> Dados de expedição</DialogTitle>
          </DialogHeader>
          {gnfOrder && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">{gnfOrder.customer_name}</span>
                  <span className="font-mono text-xs text-muted-foreground shrink-0">{gnfOrder.order_number}</span>
                </div>
                <p className="text-xs text-muted-foreground">Informe os dados do envio — vão para a etiqueta. Ao confirmar, o card segue para <strong>Gerar Nota Fiscal</strong>.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5 text-muted-foreground" /> Volumes</Label>
                  <Input type="number" min={1} inputMode="numeric" value={gnfVolumes}
                    onChange={(e) => setGnfVolumes(e.target.value)} placeholder="1" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5"><Weight className="h-3.5 w-3.5 text-muted-foreground" /> Peso bruto (kg)</Label>
                  <Input type="text" inputMode="decimal" value={gnfPeso}
                    onChange={(e) => setGnfPeso(e.target.value)} placeholder="ex.: 12,5" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-muted-foreground" /> Transportadora</Label>
                  <Input type="text" value={gnfCarrier}
                    onChange={(e) => setGnfCarrier(e.target.value)} placeholder="Nome da transportadora" />
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <Button className="w-full gap-1.5" disabled={gnfSaving} onClick={confirmGerarNf}>
                  {gnfSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirmar → Gerar Nota Fiscal
                </Button>
                <Button className="w-full" variant="ghost" disabled={gnfSaving} onClick={() => setGnfOrder(null)}>Cancelar</Button>
              </div>
            </div>
          )}
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

                {/* Dados fiscais e de pagamento preenchidos no ato da venda. */}
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
                    <p className="font-medium">{detail.payment_terms?.trim() || "—"}</p>
                  </div>
                  {detail.freight_type && (
                    <div>
                      <p className="flex items-center gap-1.5 text-muted-foreground mb-0.5"><Truck className="h-3.5 w-3.5" /> Frete</p>
                      <p className="font-medium">{detail.freight_type === "CIF" ? "CIF (por conta do vendedor)" : detail.freight_type === "FOB" ? "FOB (por conta do comprador)" : detail.freight_type}</p>
                    </div>
                  )}
                </div>

                {/* Expedição — EDITÁVEL (só operacional: volumes/peso/transportadora). */}
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Expedição</p>
                    {!editShip ? (
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={startEditShip}>
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                    ) : (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={savingEdit} onClick={() => setEditShip(false)}>Cancelar</Button>
                        <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={savingEdit} onClick={saveEditShip}>
                          {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Salvar
                        </Button>
                      </div>
                    )}
                  </div>
                  {!editShip ? (
                    <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
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
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] flex items-center gap-1"><Boxes className="h-3 w-3" /> Volumes</Label>
                        <Input type="number" min={1} inputMode="numeric" value={edVolumes} onChange={(e) => setEdVolumes(e.target.value)} placeholder="1" className="h-8" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] flex items-center gap-1"><Weight className="h-3 w-3" /> Peso (kg)</Label>
                        <Input type="text" inputMode="decimal" value={edPeso} onChange={(e) => setEdPeso(e.target.value)} placeholder="ex.: 12,5" className="h-8" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] flex items-center gap-1"><Truck className="h-3 w-3" /> Transportadora</Label>
                        <Input type="text" value={edCarrier} onChange={(e) => setEdCarrier(e.target.value)} placeholder="Nome" className="h-8" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Prazos de fábrica definidos na venda (PPF/PPE). */}
                {detail.agreed_delivery_date && (
                  <div className="grid grid-cols-3 gap-x-4 text-xs rounded-lg border border-border p-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-muted-foreground mb-0.5"><Calendar className="h-3.5 w-3.5" /> Entrega combinada</p>
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
