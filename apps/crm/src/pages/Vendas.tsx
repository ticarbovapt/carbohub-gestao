import { useState, useMemo, Fragment } from "react";
import { format, startOfMonth, addMonths, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Search, ShoppingBag, TrendingUp,
  Package, Users, ArrowRightCircle, CalendarDays, X, Trash2, Loader2, FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useVendedoresDir } from "@/hooks/useVendas";
import {
  useCarbozeVendas, useConvertQuote, useBulkAssignVendedor, useDeleteVenda,
  fetchNfFiles, type CarbozeVendaRow,
} from "@/hooks/useCarbozeVendas";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Vendas e Orçamentos — FONTE ÚNICA: carboze_orders (mesma da VendasPage do Controle).
// Traz Bling + legado + vendas nativas. Orçamento = status 'quote'.

const STATUS_LABEL: Record<string, string> = {
  quote: "Orçamento", pending: "Pendente", confirmed: "Confirmado", invoiced: "Faturado",
  shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado",
};
const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  quote: "secondary", delivered: "success", shipped: "warning", confirmed: "warning",
  invoiced: "warning", pending: "secondary", cancelled: "destructive",
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
// Valores do detalhe financeiro precisam dos centavos (desconto por item etc.).
const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const fmtDate = (s: string) => format(parseISO(s.length === 10 ? s + "T00:00:00" : s), "dd/MM/yyyy", { locale: ptBR });
const effectiveDate = (r: CarbozeVendaRow) => r.sale_date ?? r.created_at.substring(0, 10);

// Endereço de entrega (colunas texto) → linha legível.
function fmtEntrega(r: CarbozeVendaRow): string | null {
  const cityUf = [r.delivery_city, r.delivery_state].filter(Boolean).join("/");
  const cep = r.delivery_zip ? `CEP ${r.delivery_zip}` : "";
  return [r.delivery_address, cityUf, cep].filter(Boolean).join(" — ") || null;
}
// Endereço de faturamento (jsonb) → linha legível.
function fmtFaturamento(e: Record<string, unknown> | null): string | null {
  if (!e) return null;
  const s = (k: string) => (e[k] != null ? String(e[k]) : "");
  const l1 = [s("logradouro"), s("numero")].filter(Boolean).join(", ");
  const l2 = [s("bairro"), [s("cidade"), s("uf")].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  const cep = s("cep") ? `CEP ${s("cep")}` : "";
  return [l1, l2, cep].filter(Boolean).join(" — ") || null;
}

export default function Vendas() {
  const { user, isGestor } = useAuth();
  const isHead = isGestor;

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [vendedorFilter, setVendedor] = useState("__all__");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Filtro por KPI (clicar no card): mostra na tabela só o que alimenta o card.
  const [kpiFilter, setKpiFilter] = useState<"faturado" | "aguardando" | "orcamento" | "cancelado" | null>(null);

  const hasCustomRange = !!(customFrom || customTo);
  const clearCustomRange = () => { setCustomFrom(""); setCustomTo(""); };
  const today = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  // Dados reais — carboze_orders no período (o hook já aplica o filtro de data).
  const { data: rows = [], isLoading } = useCarbozeVendas({
    month, customFrom, customTo, vendedorFilter, isGestor, userId: user?.id,
  });
  const { data: dir = [] } = useVendedoresDir();
  const convert = useConvertQuote();
  const bulkAssign = useBulkAssignVendedor();
  const deleteVenda = useDeleteVenda();
  const [assigning, setAssigning] = useState(false);
  const [toDelete, setToDelete] = useState<CarbozeVendaRow | null>(null);
  const [nfLoadingId, setNfLoadingId] = useState<string | null>(null);

  // Baixa a NF já vinculada (o faturamento/emissão é no Finanças). Abre o PDF;
  // se só houver XML, abre o XML; se ainda não sincronizou, avisa.
  async function baixarNF(venda: CarbozeVendaRow) {
    if (!venda.bling_nf_id) return;
    setNfLoadingId(venda.id);
    try {
      const f = await fetchNfFiles(venda.bling_nf_id);
      if (f?.pdf_url) {
        window.open(f.pdf_url, "_blank", "noopener");
      } else if (f?.xml_url) {
        window.open(f.xml_url, "_blank", "noopener");
        toast.message("NF sem PDF sincronizado — abrindo o XML.");
      } else {
        toast.error(
          `NF ${venda.invoice_number ?? venda.bling_nf_id} vinculada, mas o arquivo ainda não sincronizou do Bling.`,
        );
      }
    } catch (e) {
      toast.error("Erro ao buscar a NF: " + (e instanceof Error ? e.message : "tente de novo"));
    } finally {
      setNfLoadingId(null);
    }
  }

  async function excluirVenda() {
    if (!toDelete) return;
    try {
      await deleteVenda.mutateAsync({ id: toDelete.id });
      if (expandedId === toDelete.id) setExpandedId(null);
      setToDelete(null);
    } catch { /* toast no hook */ }
  }

  const VENDEDORES = useMemo(
    () => dir.map((v) => ({ id: v.id, name: v.full_name || "—", avulso: !v.is_vendedor })),
    [dir],
  );
  // Nome do vendedor: resolve pelo diretório (vendedor_id) e cai no vendedor_name gravado.
  const nomeById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const v of dir) m[v.id] = v.full_name || "—";
    return m;
  }, [dir]);

  async function atribuirVendedor(vendedorId: string) {
    if (!vendedorId) return;
    setAssigning(true);
    try {
      const vendedorName = dir.find((d) => d.id === vendedorId)?.full_name ?? "vendedor";
      await bulkAssign.mutateAsync({ orderIds: Array.from(selectedIds), vendedorId, vendedorName });
      setSelectedIds(new Set());
    } catch { /* toast no hook */ } finally {
      setAssigning(false);
    }
  }

  async function converterEmVenda(id: string) {
    try {
      await convert.mutateAsync(id);
      toast.success("Orçamento convertido em venda!");
    } catch (e) {
      toast.error("Erro ao converter: " + (e instanceof Error ? e.message : "tente de novo"));
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((v) => {
      if (vendedorFilter !== "__all__" && v.vendedor_id !== vendedorFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return v.customer_name.toLowerCase().includes(q) || (v.order_number ?? "").toLowerCase().includes(q);
    });
  }, [rows, search, vendedorFilter]);

  const sum = (list: CarbozeVendaRow[]) => list.reduce((s, v) => s + v.total, 0);
  // "Faturado" = já tem NF vinculada OU o pedido já saiu (invoiced/shipped/
  // delivered) — quem foi enviado/entregue necessariamente já tem NF (só não
  // linkada aqui). Assim um pedido ENTREGUE não cai em "aguardando faturamento".
  const isActive = (v: CarbozeVendaRow) => v.status !== "cancelled" && v.status !== "quote";
  const FATURADO_STATUS = new Set(["invoiced", "shipped", "delivered"]);
  const isFaturada = (v: CarbozeVendaRow) => isActive(v) && (!!v.bling_nf_id || !!v.invoice_number || FATURADO_STATUS.has(v.status));
  const isAguardando = (v: CarbozeVendaRow) => isActive(v) && !isFaturada(v);

  const quotes = filtered.filter((v) => v.status === "quote");
  const active = filtered.filter(isActive);
  const faturadas = active.filter(isFaturada);
  const aguardando = active.filter(isAguardando);
  const totalFaturado = sum(faturadas);
  const totalAguardando = sum(aguardando);
  const totalOrcamento = sum(quotes);
  const cancelled = filtered.filter((v) => v.status === "cancelled").length;

  // Filtro do card clicado — só sobre a TABELA (os totais dos KPIs seguem no total).
  const tableRows = filtered.filter((v) => {
    if (!kpiFilter) return true;
    if (kpiFilter === "faturado") return isFaturada(v);
    if (kpiFilter === "aguardando") return isAguardando(v);
    if (kpiFilter === "orcamento") return v.status === "quote";
    return v.status === "cancelled";
  });
  const toggleKpi = (k: NonNullable<typeof kpiFilter>) => setKpiFilter((cur) => (cur === k ? null : k));
  const KPI_LABEL: Record<NonNullable<typeof kpiFilter>, string> = {
    faturado: "Total faturado", aguardando: "Aguardando faturamento", orcamento: "Em orçamento", cancelado: "Canceladas",
  };

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingBag className="h-6 w-6 text-carbo-green" /> Vendas e Orçamentos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Acompanhamento de pedidos e orçamentos por vendedor</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {!hasCustomRange && (
              <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm font-semibold w-32 text-center capitalize">{format(month, "MMM 'de' yyyy", { locale: ptBR })}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))} disabled={isCurrentMonth}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Período:</div>
              <Input type="date" className="h-8 w-36 text-xs" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} title="Data início" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" className="h-8 w-36 text-xs" value={customTo} onChange={(e) => setCustomTo(e.target.value)} title="Data fim" />
              {hasCustomRange && <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground px-2" onClick={clearCustomRange}><X className="h-3 w-3 mr-1" /> Limpar</Button>}
            </div>
            {hasCustomRange && <p className="text-[11px] text-primary font-medium">Exibindo período personalizado</p>}
          </div>
        </div>

        {/* KPIs — totais em R$ por situação de faturamento (+ orçamentos e canceladas).
            Para colaborador (vê só o próprio), a query já limita ao vendedor logado. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CarboCard onClick={() => toggleKpi("faturado")}
            className={`cursor-pointer transition ${kpiFilter === "faturado" ? "ring-2 ring-carbo-green/60" : "hover:bg-muted/20"}`}>
            <CarboCardContent className="p-3 text-center">
              <p className="text-xl font-bold text-carbo-green tabular-nums">{fmtBRL(totalFaturado)}</p>
              <p className="text-xs text-muted-foreground">Total faturado</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{faturadas.length} venda(s) faturada(s)</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard onClick={() => toggleKpi("aguardando")}
            className={`cursor-pointer transition ${kpiFilter === "aguardando" ? "ring-2 ring-amber-400/60" : "hover:bg-muted/20"}`}>
            <CarboCardContent className="p-3 text-center">
              <p className="text-xl font-bold text-amber-400 tabular-nums">{fmtBRL(totalAguardando)}</p>
              <p className="text-xs text-muted-foreground">Aguardando faturamento</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{aguardando.length} venda(s) a faturar</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard onClick={() => toggleKpi("orcamento")}
            className={`cursor-pointer transition ${kpiFilter === "orcamento" ? "ring-2 ring-sky-400/60" : "hover:bg-muted/20"}`}>
            <CarboCardContent className="p-3 text-center">
              <p className="text-xl font-bold text-sky-400 tabular-nums">{fmtBRL(totalOrcamento)}</p>
              <p className="text-xs text-muted-foreground">Em orçamento</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{quotes.length} orçamento(s)</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard onClick={() => toggleKpi("cancelado")}
            className={`cursor-pointer transition ${kpiFilter === "cancelado" ? "ring-2 ring-red-400/60" : "hover:bg-muted/20"}`}>
            <CarboCardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-red-400 tabular-nums">{cancelled}</p>
              <p className="text-xs text-muted-foreground">Canceladas</p>
            </CarboCardContent>
          </CarboCard>
        </div>
        {kpiFilter && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground -mt-2">
            <span>Filtrando por <strong className="text-foreground">{KPI_LABEL[kpiFilter]}</strong> ({tableRows.length})</span>
            <button className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => setKpiFilter(null)}>
              <X className="h-3 w-3" /> limpar
            </button>
          </div>
        )}

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por cliente ou nº pedido..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          {isHead && (
            <Select value={vendedorFilter} onValueChange={setVendedor}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todos os vendedores" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os vendedores</SelectItem>
                {VENDEDORES.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      {m.name}
                      {m.avulso
                        ? <span className="text-[10px] font-semibold text-amber-500 border border-amber-500/30 rounded px-1">Avulso</span>
                        : <span className="text-[10px] font-semibold text-carbo-green border border-carbo-green/30 rounded px-1">Vendedor</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Tabela */}
        {isLoading ? (
          <CarboCard><CarboCardContent className="py-16 text-center text-muted-foreground">Carregando…</CarboCardContent></CarboCard>
        ) : tableRows.length === 0 ? (
          <CarboCard><CarboCardContent className="py-16 text-center space-y-3"><TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/30" /><p className="text-muted-foreground">Nenhum registro encontrado neste período.</p></CarboCardContent></CarboCard>
        ) : (
          <CarboCard padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {isHead && (
                      <th className="w-10 p-3">
                        <Checkbox checked={tableRows.length > 0 && selectedIds.size === tableRows.length}
                          onCheckedChange={(c) => { if (c) setSelectedIds(new Set(tableRows.map((v) => v.id))); else setSelectedIds(new Set()); }}
                          aria-label="Selecionar todos" />
                      </th>
                    )}
                    <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Pedido</th>
                    <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Data</th>
                    <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Cliente</th>
                    <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Cidade/UF</th>
                    {isHead && <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Vendedor</th>}
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Total</th>
                    <th className="w-10 p-3" />
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((venda) => {
                    const isQuote = venda.status === "quote";
                    // Financeiro defensivo: pedidos antigos podem não ter subtotal/discount.
                    const itemsBruto = venda.items.reduce((s, it) => s + num(it.quantity) * num(it.unit_price), 0);
                    const itemsDesc = venda.items.reduce((s, it) => s + num(it.discount_amount), 0);
                    const subtotalDet = venda.subtotal != null ? num(venda.subtotal) : (itemsBruto || null);
                    const descontoDet = venda.discount != null ? num(venda.discount) : itemsDesc;
                    const percentDet = venda.discount_percent != null
                      ? num(venda.discount_percent)
                      : (subtotalDet && subtotalDet > 0 ? Math.round((descontoDet / subtotalDet) * 10000) / 100 : 0);
                    const vendedorNome = (venda.vendedor_id && nomeById[venda.vendedor_id]) || venda.vendedor_name || null;
                    const buyerNotes = venda.buyer_notes && venda.buyer_notes !== venda.notes ? venda.buyer_notes : null;
                    const generalNotes = venda.general_notes && venda.general_notes !== venda.notes && venda.general_notes !== venda.buyer_notes ? venda.general_notes : null;
                    return (
                      <Fragment key={venda.id}>
                        <tr
                          className={`border-b transition-colors cursor-pointer hover:bg-muted/20 ${isQuote ? "bg-amber-500/3 border-l-2 border-l-amber-500/30" : venda.status === "cancelled" ? "opacity-50" : ""} ${expandedId === venda.id ? "bg-muted/20" : ""} ${selectedIds.has(venda.id) ? "bg-carbo-green/5" : ""}`}
                          onClick={() => setExpandedId(expandedId === venda.id ? null : venda.id)}
                        >
                          {isHead && (
                            <td className="p-3" onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={selectedIds.has(venda.id)}
                                onCheckedChange={(c) => setSelectedIds((prev) => { const next = new Set(prev); if (c) next.add(venda.id); else next.delete(venda.id); return next; })}
                                aria-label={`Selecionar ${venda.order_number}`} />
                            </td>
                          )}
                          <td className="p-3"><CarboBadge variant={STATUS_VARIANT[venda.status] ?? "secondary"} size="sm">{STATUS_LABEL[venda.status] ?? venda.status}</CarboBadge></td>
                          <td className="p-3 font-mono text-xs font-medium">{venda.order_number}</td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">{fmtDate(effectiveDate(venda))}{venda.sale_date && venda.sale_date !== venda.created_at.substring(0, 10) && <span className="ml-1 text-[10px] text-amber-500 font-medium">✱</span>}</td>
                          <td className="p-3 font-medium max-w-[180px] truncate">{venda.customer_name}</td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">{[venda.delivery_city, venda.delivery_state].filter(Boolean).join("/") || "—"}</td>
                          {isHead && (
                            <td className="p-3 text-muted-foreground">
                              <span>{(venda.vendedor_id && nomeById[venda.vendedor_id]) || venda.vendedor_name || "—"}</span>
                            </td>
                          )}
                          <td className="p-3 text-right font-bold tabular-nums">{fmtBRL(venda.total)}</td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {isQuote ? (
                                <button onClick={() => converterEmVenda(venda.id)} className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs font-medium bg-carbo-green/10 text-carbo-green hover:bg-carbo-green/20 border border-carbo-green/30 transition-colors" title="Converter orçamento em venda">
                                  <ArrowRightCircle className="h-3 w-3" /><span className="hidden sm:inline">Converter</span>
                                </button>
                              ) : venda.bling_nf_id ? (
                                <button
                                  onClick={() => baixarNF(venda)}
                                  disabled={nfLoadingId === venda.id}
                                  className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs font-medium bg-carbo-green/10 text-carbo-green hover:bg-carbo-green/20 border border-carbo-green/30 transition-colors disabled:opacity-50"
                                  title={`Baixar NF ${venda.invoice_number ?? venda.bling_nf_id}`}
                                >
                                  {nfLoadingId === venda.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                                  <span className="hidden sm:inline">Baixar NF</span>
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {expandedId === venda.id && (
                          <tr className="border-b bg-muted/10">
                            <td colSpan={isHead ? 9 : 7} className="px-6 py-4 space-y-4">
                              {/* Cliente */}
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Cliente</p>
                                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 text-xs">
                                  <div><span className="text-muted-foreground">Nome:</span> <span className="font-medium">{venda.customer_name}</span></div>
                                  <div><span className="text-muted-foreground">CNPJ/CPF:</span> <span className="font-medium">{venda.customer_doc || "—"}</span></div>
                                  <div><span className="text-muted-foreground">Inscr. Estadual:</span> <span className="font-medium">{venda.customer_ie || "—"}</span></div>
                                  <div><span className="text-muted-foreground">Contato:</span> <span className="font-medium">{[venda.customer_email, venda.customer_phone].filter(Boolean).join(" · ") || "—"}</span></div>
                                </div>
                              </div>

                              {/* Endereços */}
                              <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Endereço de Entrega</p>
                                  <p className="text-xs">{fmtEntrega(venda) || <span className="text-muted-foreground">—</span>}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Endereço de Faturamento (NF)</p>
                                  <p className="text-xs">{venda.billing_address ? fmtFaturamento(venda.billing_address) : <span className="text-muted-foreground">Mesmo da entrega</span>}</p>
                                </div>
                              </div>

                              {/* NF */}
                              {(venda.invoice_number || venda.bling_nf_id) && (
                                <div className="text-xs">
                                  <span className="text-muted-foreground">Nota Fiscal: </span>
                                  <span className="font-medium">{venda.invoice_number || `#${venda.bling_nf_id}`}</span>
                                </div>
                              )}

                              {/* Produtos */}
                              <div>
                                <div className="flex items-center gap-2 mb-2"><Package className="h-3.5 w-3.5 text-muted-foreground" /><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produtos</p></div>
                                {venda.items.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Sem itens.</p>
                                ) : (
                                  <div className="grid gap-1.5">
                                    {venda.items.map((item, idx) => {
                                      const bruto = num(item.quantity) * num(item.unit_price);
                                      const desc = num(item.discount_amount);
                                      const liquido = item.total != null ? num(item.total) : bruto - desc;
                                      const descLabel = desc > 0
                                        ? (item.discount_type === "percent" && bruto > 0
                                            ? `− ${(Math.round((desc / bruto) * 10000) / 100)}%`
                                            : `− ${fmtMoney(desc)}`)
                                        : null;
                                      return (
                                        <div key={idx} className="flex items-start justify-between gap-3 text-xs">
                                          <div className="min-w-0">
                                            <span className="font-medium">{item.name}</span>
                                            {num(item.bonus_quantity) > 0 && (
                                              <span className="ml-1.5 text-[10px] font-semibold text-carbo-green border border-carbo-green/30 rounded px-1">+{num(item.bonus_quantity)} bonif.</span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3 text-muted-foreground whitespace-nowrap">
                                            <span>{num(item.quantity)} × {fmtMoney(num(item.unit_price))}</span>
                                            {descLabel && <span className="text-destructive">{descLabel}</span>}
                                            <span className="font-semibold text-foreground">{fmtMoney(liquido)}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Resumo financeiro */}
                              <div className="flex justify-end">
                                <div className="w-full sm:w-64 space-y-0.5 text-xs">
                                  {subtotalDet != null && (
                                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtMoney(subtotalDet)}</span></div>
                                  )}
                                  {descontoDet > 0 && (
                                    <div className="flex justify-between text-destructive"><span>Desconto{percentDet > 0 ? ` (${percentDet}%)` : ""}</span><span className="tabular-nums">− {fmtMoney(descontoDet)}</span></div>
                                  )}
                                  <div className="flex justify-between border-t pt-0.5 font-bold text-sm"><span>Total</span><span className="tabular-nums">{fmtMoney(num(venda.total))}</span></div>
                                </div>
                              </div>

                              {/* Pagamento e frete */}
                              {(venda.payment_terms || venda.freight_type || (venda.shipping_cost ?? 0) > 0) && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Pagamento</p>
                                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                    {venda.payment_terms && <div><span className="text-muted-foreground">Forma/condição:</span> <span className="font-medium">{venda.payment_terms}</span></div>}
                                    {(venda.freight_type || (venda.shipping_cost ?? 0) > 0) && (
                                      <div><span className="text-muted-foreground">Frete:</span> <span className="font-medium">{[venda.freight_type, (venda.shipping_cost ?? 0) > 0 ? fmtMoney(num(venda.shipping_cost)) : null].filter(Boolean).join(" · ") || "—"}</span></div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Prazo de entrega */}
                              {(venda.agreed_delivery_date || venda.ppf_date || venda.ppe_date) && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Prazo de Entrega</p>
                                  <div className="grid sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
                                    {venda.agreed_delivery_date && <div><span className="text-muted-foreground">Combinada:</span> <span className="font-medium">{fmtDate(venda.agreed_delivery_date)}</span></div>}
                                    {venda.ppf_date && <div><span className="text-muted-foreground">Fabricar até (PPF):</span> <span className="font-medium">{fmtDate(venda.ppf_date)}</span></div>}
                                    {venda.ppe_date && <div><span className="text-muted-foreground">Expedir até (PPE):</span> <span className="font-medium">{fmtDate(venda.ppe_date)}</span></div>}
                                  </div>
                                </div>
                              )}

                              {/* Vendedor / Nº pedido de compra do cliente */}
                              {(vendedorNome || venda.po_number) && (
                                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                  {vendedorNome && <div><span className="text-muted-foreground">Vendedor:</span> <span className="font-medium">{vendedorNome}</span></div>}
                                  {venda.po_number && <div><span className="text-muted-foreground">Nº pedido de compra (cliente):</span> <span className="font-medium">{venda.po_number}</span></div>}
                                </div>
                              )}

                              {(venda.notes || buyerNotes || generalNotes) && (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Observações</p>
                                  {venda.notes && <p className="text-xs">{venda.notes}</p>}
                                  {buyerNotes && <p className="text-xs"><span className="text-muted-foreground">Comprador:</span> {buyerNotes}</p>}
                                  {generalNotes && <p className="text-xs"><span className="text-muted-foreground">Gerais:</span> {generalNotes}</p>}
                                </div>
                              )}

                              {/* Exclusão — só gestor. Registra log auditável e libera o número. */}
                              {isHead && (
                                <div className="flex justify-end pt-2 border-t border-border/60">
                                  <Button
                                    variant="ghost" size="sm"
                                    className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setToDelete(venda)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir venda
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CarboCard>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Vendas e orçamentos de <code>carboze_orders</code> (Bling + legado + nativas). Selecione pedidos para atribuir vendedor em massa.
        </p>
      </div>

      {/* Barra de ação em massa */}
      {isHead && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-border bg-background/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className="text-sm font-semibold"><span className="text-carbo-green">{selectedIds.size}</span> pedido(s) selecionado(s)</span>
          <Select value="" onValueChange={atribuirVendedor}>
            <SelectTrigger className="h-8 w-[210px] text-sm"><span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {assigning ? "Atribuindo..." : "Atribuir vendedor"}</span></SelectTrigger>
            <SelectContent>
              {dir.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="flex items-center gap-2">{v.full_name || "—"}{!v.is_vendedor && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">Avulso</span>}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button className="h-8 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border transition-colors" onClick={() => setSelectedIds(new Set())}>Cancelar</button>
        </div>
      )}

      {/* Confirmação de exclusão (gestor) */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta venda?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A venda <strong className="font-mono">{toDelete?.order_number}</strong> de{" "}
                  <strong>{toDelete?.customer_name}</strong> ({toDelete ? fmtBRL(toDelete.total) : ""}) será
                  removida do sistema. O número volta a ficar livre e as próximas vendas seguem a sequência.
                </p>
                <p className="text-muted-foreground">Esta ação não pode ser desfeita.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteVenda.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); excluirVenda(); }}
              disabled={deleteVenda.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteVenda.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Excluindo…</> : <><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
