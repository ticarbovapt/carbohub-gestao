import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboButton } from "@/components/ui/carbo-button";
import { Input } from "@/components/ui/input";
import {
  Receipt, Search, CheckCircle2, Clock, Copy, Send,
  ChevronDown, ChevronRight, ExternalLink, AlertCircle,
  MapPin, CreditCard, Truck, FileText, Building2,
} from "lucide-react";
import { useFaturamento, useCreateBlingPedido, type FaturamentoOrder } from "@/hooks/useFaturamento";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return format(parseISO(s.length === 10 ? s + "T00:00:00" : s), "dd/MM/yyyy", { locale: ptBR });
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmado",
  invoiced:  "Faturado",
  shipped:   "Enviado",
  delivered: "Entregue",
};
const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  confirmed: "warning",
  invoiced:  "warning",
  shipped:   "warning",
  delivered: "success",
};

// ─────────────────────────────────────────────────────────────────────────────
// Gera o bloco de texto formatado para copiar e colar no Bling
// ─────────────────────────────────────────────────────────────────────────────
function buildCopyText(order: FaturamentoOrder): string {
  const lines: string[] = [];
  lines.push("=== DADOS PARA EMISSÃO DE NOTA FISCAL ===");
  lines.push(`Pedido: ${order.order_number}`);
  lines.push(`Data:   ${fmtDate(order.sale_date ?? order.created_at)}`);
  lines.push(`Cliente: ${order.customer_name}`);
  if (order.ie)                    lines.push(`Inscrição Estadual: ${order.ie}`);
  if (order.billing_contact_name)  lines.push(`Responsável pela Compra: ${order.billing_contact_name}`);
  if (order.billing_contact_email) lines.push(`E-mail: ${order.billing_contact_email}`);

  // Endereço de faturamento (se diferente da entrega)
  const billAddr = [
    order.billing_address,
    order.billing_city && order.billing_state
      ? `${order.billing_city}/${order.billing_state}`
      : (order.billing_city || order.billing_state || ""),
    order.billing_zip ? `CEP ${order.billing_zip}` : "",
  ].filter(Boolean).join(" — ");
  if (billAddr.trim()) lines.push(`Endereço de Faturamento: ${billAddr}`);

  if (order.po_number)      lines.push(`Nº Pedido de Compra: ${order.po_number}${order.po_date ? ` (${fmtDate(order.po_date)})` : ""}`);
  if (order.payment_terms)  lines.push(`Condição de Pagamento: ${order.payment_terms}`);
  if (order.freight_type)   lines.push(`Frete: ${order.freight_type === "CIF" ? "CIF — por conta do vendedor" : "FOB — por conta do comprador"}`);

  lines.push("");
  lines.push("ITENS:");
  order.items.forEach((item, i) => {
    lines.push(`  ${i + 1}. ${item.name} | Qtd: ${item.quantity} | Unit: ${fmtBRL(item.unit_price)} | Total: ${fmtBRL(item.total)}`);
  });

  lines.push("");
  if (order.subtotal !== order.total) {
    lines.push(`Subtotal: ${fmtBRL(order.subtotal)}`);
    if (order.shipping_cost) lines.push(`Frete:    ${fmtBRL(order.shipping_cost)}`);
    if (order.discount)      lines.push(`Desconto: -${fmtBRL(order.discount)}`);
  }
  lines.push(`Total:    ${fmtBRL(order.total)}`);

  if (order.buyer_notes || order.general_notes) {
    lines.push("");
    lines.push("OBSERVAÇÕES:");
    if (order.buyer_notes)  lines.push(order.buyer_notes);
    if (order.general_notes) lines.push(order.general_notes);
  }

  lines.push("");
  lines.push("─────────────────────────────────────────");
  lines.push(`Incluir na observação da NF: ${order.order_number}`);
  lines.push("(necessário para vínculo automático no sistema)");

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail accordion para um pedido
// ─────────────────────────────────────────────────────────────────────────────
function OrderDetail({ order }: { order: FaturamentoOrder }) {
  const hasBilling =
    order.billing_address || order.billing_city || order.billing_contact_name ||
    order.ie || order.payment_terms || order.freight_type || order.po_number;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      {/* Itens */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Itens do Pedido
        </p>
        <div className="rounded-lg bg-muted/30 divide-y">
          {order.items.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-2">Sem itens registrados.</p>
          ) : order.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2">
              <div>
                <p className="font-medium text-xs">{item.name}</p>
                {(item as any).product_code && (
                  <p className="text-[10px] text-muted-foreground font-mono">{(item as any).product_code}</p>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{item.quantity}× {fmtBRL(item.unit_price)}</p>
                <p className="font-bold text-foreground">{fmtBRL(item.total)}</p>
              </div>
            </div>
          ))}
        </div>
        {(order.shipping_cost > 0 || order.discount > 0) && (
          <div className="text-xs text-right space-y-0.5 pr-1">
            {order.shipping_cost > 0 && <p className="text-muted-foreground">Frete: {fmtBRL(order.shipping_cost)}</p>}
            {order.discount > 0 && <p className="text-muted-foreground">Desconto: −{fmtBRL(order.discount)}</p>}
            <p className="font-bold">Total: {fmtBRL(order.total)}</p>
          </div>
        )}
      </div>

      {/* Dados fiscais */}
      <div className="space-y-3">
        {hasBilling ? (
          <>
            {(order.ie || order.billing_contact_name || order.billing_contact_email) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Dados de Faturamento
                </p>
                {order.ie && <p className="text-xs"><span className="text-muted-foreground">IE:</span> {order.ie}</p>}
                {order.billing_contact_name && <p className="text-xs"><span className="text-muted-foreground">Responsável:</span> {order.billing_contact_name}</p>}
                {order.billing_contact_email && <p className="text-xs"><span className="text-muted-foreground">E-mail:</span> {order.billing_contact_email}</p>}
              </div>
            )}
            {(order.billing_address || order.billing_city) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Endereço de Faturamento
                </p>
                {order.billing_address && <p className="text-xs">{order.billing_address}</p>}
                {(order.billing_city || order.billing_state) && (
                  <p className="text-xs text-muted-foreground">
                    {[order.billing_city, order.billing_state].filter(Boolean).join("/")}
                    {order.billing_zip ? ` — CEP ${order.billing_zip}` : ""}
                  </p>
                )}
              </div>
            )}
            {(order.payment_terms || order.freight_type) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" /> Condições Comerciais
                </p>
                {order.payment_terms && <p className="text-xs"><span className="text-muted-foreground">Pagamento:</span> {order.payment_terms}</p>}
                {order.freight_type && (
                  <p className="text-xs flex items-center gap-1">
                    <Truck className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Frete:</span>{" "}
                    {order.freight_type === "CIF" ? "CIF — por conta do vendedor" : "FOB — por conta do comprador"}
                  </p>
                )}
              </div>
            )}
            {order.po_number && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Pedido de Compra
                </p>
                <p className="text-xs font-mono">{order.po_number}{order.po_date ? ` — ${fmtDate(order.po_date)}` : ""}</p>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500 inline mr-1" />
            Dados de faturamento não preenchidos. Edite o pedido em <strong>Vendas → lápis → aba "Compra e Nota Fiscal"</strong>.
          </div>
        )}
        {(order.buyer_notes || order.general_notes) && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observações</p>
            {order.buyer_notes && <p className="text-xs text-muted-foreground">{order.buyer_notes}</p>}
            {order.general_notes && <p className="text-xs text-muted-foreground">{order.general_notes}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function FaturamentoPage() {
  const [showAll, setShowAll]     = useState(false);
  const [search, setSearch]       = useState("");
  const [expandedId, setExpanded] = useState<string | null>(null);
  const [creatingId, setCreating] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useFaturamento(showAll);
  const createBlingPedido = useCreateBlingPedido();

  const filtered = search
    ? orders.filter(o =>
        o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        o.order_number?.toLowerCase().includes(search.toLowerCase())
      )
    : orders;

  // KPIs
  const total      = filtered.length;
  const semDados   = filtered.filter(o => !o.ie && !o.billing_address && !o.payment_terms).length;
  const valorTotal = filtered.reduce((s, o) => s + o.total, 0);

  async function handleCopy(order: FaturamentoOrder) {
    const text = buildCopyText(order);
    await navigator.clipboard.writeText(text);
    toast.success("Dados copiados! Cole na observação da NF no Bling.");
  }

  async function handleCreateBling(order: FaturamentoOrder) {
    setCreating(order.id);
    try {
      await createBlingPedido.mutateAsync(order.id);
    } finally {
      setCreating(null);
    }
  }

  return (
    <BoardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Receipt className="h-6 w-6 text-carbo-green" /> Fila de Faturamento
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pedidos confirmados aguardando emissão de Nota Fiscal no Bling
            </p>
          </div>
          <button
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${showAll ? "bg-carbo-green/20 border-carbo-green/40 text-carbo-green font-semibold" : "border-border text-muted-foreground hover:border-foreground/30"}`}
            onClick={() => setShowAll(v => !v)}
          >
            {showAll ? "Mostrando todos" : "Só sem NF"}
          </button>
        </div>

        {/* Instrução */}
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground leading-relaxed space-y-1">
          <p>
            <strong className="text-foreground">Como funciona:</strong> Para cada pedido abaixo, o financeiro deve emitir a NF no Bling com o número do pedido na observação (ex: <span className="font-mono font-medium">PED-2026-00140</span>). O sistema vincula a NF ao pedido automaticamente a cada 15 min.
          </p>
          <p>
            Use <strong>📋 Copiar dados</strong> para ter todas as informações do pedido prontas para preencher no Bling, ou <strong>🔗 Criar no Bling</strong> para criar o rascunho do pedido diretamente via API.
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-amber-400 tabular-nums">{total}</p>
              <p className="text-xs text-muted-foreground">Aguardando NF</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-xl font-bold tabular-nums">{fmtBRL(valorTotal)}</p>
              <p className="text-xs text-muted-foreground">Valor pendente</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-red-400 tabular-nums">{semDados}</p>
              <p className="text-xs text-muted-foreground">Sem dados fiscais</p>
            </CarboCardContent>
          </CarboCard>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou nº pedido..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <CarboCard>
            <CarboCardContent className="py-16 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500/40" />
              <p className="text-muted-foreground">
                {showAll ? "Nenhum pedido encontrado." : "Nenhum pedido aguardando NF. Tudo em dia! ✅"}
              </p>
            </CarboCardContent>
          </CarboCard>
        ) : (
          <div className="space-y-2">
            {filtered.map(order => {
              const isExpanded = expandedId === order.id;
              const isCreating = creatingId === order.id;
              const fromBling = order.external_ref?.startsWith("bling-");
              const hasNF = !!order.bling_nf_id;

              return (
                <CarboCard key={order.id} className={hasNF ? "opacity-60" : ""}>
                  <CarboCardContent className="p-0">
                    {/* Main row */}
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/10 transition-colors rounded-xl"
                      onClick={() => setExpanded(isExpanded ? null : order.id)}
                    >
                      {/* Expand icon */}
                      <div className="text-muted-foreground shrink-0">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>

                      {/* Status */}
                      <CarboBadge variant={STATUS_VARIANT[order.status] ?? "secondary"} size="sm" className="shrink-0">
                        {STATUS_LABEL[order.status] ?? order.status}
                      </CarboBadge>

                      {/* Order info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold">{order.order_number}</span>
                          {fromBling && (
                            <span className="text-[10px] text-muted-foreground border border-border rounded px-1">Bling</span>
                          )}
                          {hasNF && (
                            <span className="text-[10px] text-green-500 border border-green-500/30 rounded px-1 flex items-center gap-0.5">
                              <CheckCircle2 className="h-2.5 w-2.5" /> NF {order.invoice_number}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{order.customer_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(order.sale_date ?? order.created_at.substring(0, 10))}
                          {order.vendedor_name && ` · ${order.vendedor_name}`}
                        </p>
                      </div>

                      {/* Fiscal data chips */}
                      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                        {order.ie && (
                          <span className="text-[10px] bg-muted/60 rounded px-1.5 py-0.5 font-mono"
                            title="Inscrição Estadual">IE: {order.ie}</span>
                        )}
                        {order.payment_terms && (
                          <span className="text-[10px] bg-muted/60 rounded px-1.5 py-0.5 max-w-[100px] truncate"
                            title={order.payment_terms}>
                            <CreditCard className="h-2.5 w-2.5 inline mr-0.5" />
                            {order.payment_terms}
                          </span>
                        )}
                        {order.freight_type && (
                          <span className="text-[10px] bg-muted/60 rounded px-1.5 py-0.5"
                            title={order.freight_type === "CIF" ? "Frete por conta do vendedor" : "Frete por conta do comprador"}>
                            <Truck className="h-2.5 w-2.5 inline mr-0.5" />{order.freight_type}
                          </span>
                        )}
                      </div>

                      {/* Total */}
                      <p className="font-bold tabular-nums text-sm shrink-0">{fmtBRL(order.total)}</p>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <CarboButton
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => handleCopy(order)}
                          title="Copiar todos os dados para criar a NF no Bling"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">Copiar</span>
                        </CarboButton>

                        {!hasNF && (
                          <CarboButton
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => handleCreateBling(order)}
                            disabled={isCreating || createBlingPedido.isPending}
                            title="Criar pedido de venda no Bling via API (o financeiro converte em NF no Bling)"
                          >
                            {isCreating ? (
                              <Clock className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            <span className="hidden md:inline">
                              {isCreating ? "Enviando..." : "Criar no Bling"}
                            </span>
                          </CarboButton>
                        )}

                        {hasNF && (
                          <a
                            href={`https://www.bling.com.br/b/notas.fiscais.php`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-8 px-2 inline-flex items-center gap-1.5 text-xs rounded-lg border border-green-500/30 text-green-500 hover:bg-green-500/10 transition-colors"
                            title="NF já emitida — ver no Bling"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span className="hidden md:inline">Ver NF</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-border/40 px-4 pb-4 pt-3">
                        <OrderDetail order={order} />
                      </div>
                    )}
                  </CarboCardContent>
                </CarboCard>
              );
            })}
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground">
          {total} pedido(s) aguardando NF · Vinculação automática a cada 15 min
        </p>
      </div>
    </BoardLayout>
  );
}
