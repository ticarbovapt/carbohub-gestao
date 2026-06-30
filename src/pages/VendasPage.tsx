import { useState, useMemo } from "react";
import { format, startOfMonth, addMonths, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Search, ShoppingBag, TrendingUp,
  Package, Pencil, Users, FileText, ArrowRightCircle, Loader2, FileDown,
  CalendarDays, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import type { OrderItem, CarbozeOrder } from "@/hooks/useCarbozeOrders";
import { useConvertQuoteToOrder } from "@/hooks/useCarbozeOrders";
import { useFetchNfeLinks } from "@/hooks/useBlingNFes";
import { EditOrderDialog } from "@/components/orders/EditOrderDialog";
import { BulkVendorAssignDialog } from "@/components/orders/BulkVendorAssignDialog";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface VendaRow {
  id: string;
  order_number: string;
  created_at: string;
  sale_date: string | null;
  customer_name: string;
  delivery_city: string | null;
  delivery_state: string | null;
  items: OrderItem[];
  total: number;
  status: string;
  vendedor_id: string | null;
  vendedor_name: string | null;
  invoice_number: string | null;
  nf_pdf_url: string | null;
  bling_nf_id: number | null;
  segmento: "consumo" | "revenda" | "online" | null;
  _raw?: CarbozeOrder;
}

const STATUS_LABEL: Record<string, string> = {
  quote:     "Orçamento",
  pending:   "Pendente",
  confirmed: "Confirmado",
  invoiced:  "Faturado",
  shipped:   "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  quote:     "secondary",
  delivered: "success",
  shipped:   "warning",
  confirmed: "warning",
  invoiced:  "warning",
  pending:   "secondary",
  cancelled: "destructive",
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(s: string) {
  return format(parseISO(s.length === 10 ? s + "T00:00:00" : s), "dd/MM/yyyy", { locale: ptBR });
}

function effectiveDate(row: VendaRow): string {
  return row.sale_date ?? row.created_at.substring(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
function useVendas(
  month: Date,
  vendedorIdFilter: string | null,
  customFrom?: string,
  customTo?: string,
) {
  const { user, profile } = useAuth();
  const isHead =
    profile?.funcao === "head" || profile?.secondary_funcao === "head" ||
    profile?.department === "command";

  const hasCustomRange = !!(customFrom || customTo);

  return useQuery({
    queryKey: ["vendas", month.toISOString().slice(0, 7), vendedorIdFilter, isHead, user?.id, customFrom, customTo],
    queryFn: async () => {
      let rangeStartStr: string;
      let rangeEndStr:   string;
      let queryStart:    string;
      let queryEnd:      string;

      if (hasCustomRange) {
        rangeStartStr = customFrom ?? "2000-01-01";
        rangeEndStr   = customTo   ?? "2099-12-31";
        queryStart    = rangeStartStr + "T00:00:00.000Z";
        queryEnd      = rangeEndStr   + "T23:59:59.999Z";
      } else {
        const yr = month.getFullYear();
        const mo = month.getMonth() + 1;
        const lastDay = new Date(yr, mo, 0).getDate();
        rangeStartStr = `${yr}-${String(mo).padStart(2, "0")}-01`;
        rangeEndStr   = `${yr}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        queryStart    = new Date(yr, mo - 2, 1).toISOString();
        queryEnd      = new Date(yr, mo + 1, 0, 23, 59, 59).toISOString();
      }

      let query = supabase
        .from("carboze_orders")
        .select("*")
        .gte("created_at", queryStart)
        .lte("created_at", queryEnd)
        .order("created_at", { ascending: false });

      if (!isHead) {
        query = query.eq("vendedor_id", user!.id);
      } else if (vendedorIdFilter && vendedorIdFilter !== "__all__") {
        query = query.eq("vendedor_id", vendedorIdFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = ((data || []) as any[]).filter(row => {
        const eff = (row.sale_date as string | null) ?? (row.created_at as string).substring(0, 10);
        return eff >= rangeStartStr && eff <= rangeEndStr;
      });

      // Busca o PDF/XML das NFs vinculadas (pdf_url vive em bling_nfe, não no pedido)
      const nfIds = Array.from(
        new Set(rows.map(r => r.bling_nf_id).filter((x): x is number => x != null)),
      );
      const pdfByBlingId: Record<number, string | null> = {};
      if (nfIds.length > 0) {
        const { data: nfRows } = await supabase
          .from("bling_nfe")
          .select("bling_id, pdf_url")
          .in("bling_id", nfIds);
        (nfRows || []).forEach((nf: any) => {
          pdfByBlingId[nf.bling_id] = nf.pdf_url ?? null;
        });
      }

      return rows.map((row): VendaRow => ({
        id: row.id,
        order_number: row.order_number,
        created_at: row.created_at,
        sale_date: (row.sale_date as string | null) ?? null,
        customer_name: row.customer_name,
        delivery_city: row.delivery_city ?? null,
        delivery_state: row.delivery_state ?? null,
        items: Array.isArray(row.items) ? (row.items as unknown as OrderItem[]) : [],
        total: Number(row.total || 0),
        status: row.status,
        vendedor_id: row.vendedor_id ?? null,
        vendedor_name: row.vendedor_name ?? null,
        invoice_number: row.invoice_number ?? null,
        nf_pdf_url: row.bling_nf_id != null ? (pdfByBlingId[row.bling_nf_id] ?? null) : null,
        bling_nf_id: row.bling_nf_id ?? null,
        segmento: row.segmento ?? null,
        _raw: row as unknown as CarbozeOrder,
      }));
    },
    enabled: !!user,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function VendasPage() {
  const [month, setMonth]             = useState(() => startOfMonth(new Date()));
  const [customFrom, setCustomFrom]   = useState("");
  const [customTo, setCustomTo]       = useState("");
  const [search, setSearch]           = useState("");
  const [vendedorFilter, setVendedor] = useState("__all__");
  const [segmentoFilter, setSegmentoFilter] = useState<"all" | "consumo" | "revenda" | "online" | "none">("all");

  const hasCustomRange = !!(customFrom || customTo);
  const clearCustomRange = () => { setCustomFrom(""); setCustomTo(""); };
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [editOrder, setEditOrder]     = useState<CarbozeOrder | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssign] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [nfLoadingId, setNfLoadingId] = useState<string | null>(null);
  const fetchNfLinks = useFetchNfeLinks();

  // Abre o PDF da NF. Se ainda não temos o link salvo, busca no Bling na hora.
  async function handleDownloadNF(venda: VendaRow) {
    if (venda.nf_pdf_url) {
      window.open(venda.nf_pdf_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (venda.bling_nf_id == null) return;
    setNfLoadingId(venda.id);
    try {
      const { pdf } = await fetchNfLinks.mutateAsync(venda.bling_nf_id);
      if (pdf) {
        window.open(pdf, "_blank", "noopener,noreferrer");
      } else {
        toast.error("O Bling não retornou o PDF desta NF. Verifique se ela está autorizada.");
      }
    } catch (e: any) {
      toast.error("Erro ao buscar a NF: " + (e?.message ?? ""));
    } finally {
      setNfLoadingId(null);
    }
  }

  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const isHead =
    profile?.funcao === "head" || profile?.secondary_funcao === "head" ||
    profile?.funcao === "ceo" ||
    profile?.department === "command";

  const convertQuote = useConvertQuoteToOrder();

  const { data: teamMembers = [] } = useTeamMembers();
  // Todos os membros aprovados — inclui "avulsos" (não-vendedores que criaram pedidos)
  const allMembers = teamMembers.filter(m => m.status === "approved");
  const vendedorSet = new Set(allMembers.filter(m => m.is_vendedor).map(m => m.id));

  const { data: vendas = [], isLoading } = useVendas(month, vendedorFilter, customFrom || undefined, customTo || undefined);

  const today = new Date();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return vendas.filter(v => {
      // Segmentação
      if (segmentoFilter !== "all") {
        if (segmentoFilter === "none") { if (v.segmento) return false; }
        else if (v.segmento !== segmentoFilter) return false;
      }
      // Busca
      if (!q) return true;
      return (
        v.customer_name?.toLowerCase().includes(q) ||
        v.order_number?.toLowerCase().includes(q)
      );
    });
  }, [vendas, search, segmentoFilter]);

  // KPIs separados: orçamentos vs vendas confirmadas
  const quotes     = filtered.filter(v => v.status === "quote");
  const active     = filtered.filter(v => v.status !== "cancelled" && v.status !== "quote");
  const totalRevenue = active.reduce((s, v) => s + v.total, 0);
  const cancelled  = filtered.filter(v => v.status === "cancelled").length;

  async function handleConvert(id: string) {
    setConvertingId(id);
    try {
      await convertQuote.mutateAsync(id);
      qc.invalidateQueries({ queryKey: ["vendas"] });
      toast.success("Orçamento convertido em venda!");
    } catch (e: any) {
      toast.error("Erro ao converter: " + e.message);
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <BoardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 text-carbo-green" /> Vendas e Orçamentos
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Acompanhamento de pedidos e orçamentos por vendedor</p>
          </div>

          {/* Controles de período */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {/* Navegação por mês — some quando há range customizado */}
            {!hasCustomRange && (
              <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => setMonth(m => startOfMonth(subMonths(m, 1)))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold w-32 text-center capitalize">
                  {format(month, "MMM 'de' yyyy", { locale: ptBR })}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => setMonth(m => startOfMonth(addMonths(m, 1)))}
                  disabled={isCurrentMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Filtro de período livre */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Período:
              </div>
              <Input
                type="date"
                className="h-8 w-36 text-xs"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                title="Data início"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="date"
                className="h-8 w-36 text-xs"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                title="Data fim"
              />
              {hasCustomRange && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground px-2"
                  onClick={clearCustomRange}>
                  <X className="h-3 w-3 mr-1" /> Limpar
                </Button>
              )}
            </div>

            {/* Indicador de modo ativo */}
            {hasCustomRange && (
              <p className="text-[11px] text-primary font-medium">
                Exibindo período personalizado
              </p>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-amber-400 tabular-nums">{quotes.length}</p>
              <p className="text-xs text-muted-foreground">Orçamentos</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-carbo-green tabular-nums">{active.length}</p>
              <p className="text-xs text-muted-foreground">Vendas</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-xl font-bold tabular-nums">{fmtBRL(totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">Total de vendas</p>
            </CarboCardContent>
          </CarboCard>
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-red-400 tabular-nums">{cancelled}</p>
              <p className="text-xs text-muted-foreground">Canceladas</p>
            </CarboCardContent>
          </CarboCard>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente ou nº pedido..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {isHead && (
            <Select value={vendedorFilter} onValueChange={setVendedor}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Todos os vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os vendedores</SelectItem>
                {allMembers.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      {m.full_name || m.username || m.id}
                      {!vendedorSet.has(m.id) && (
                        <span className="text-[10px] font-semibold text-amber-500 border border-amber-500/30 rounded px-1 ml-1">
                          Avulso
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Segmentação */}
          <Select value={segmentoFilter} onValueChange={(v) => setSegmentoFilter(v as typeof segmentoFilter)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Canal de Venda" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo Canal</SelectItem>
              <SelectItem value="consumo">Consumo (B2B)</SelectItem>
              <SelectItem value="revenda">Revenda (PDV)</SelectItem>
              <SelectItem value="online">On-line</SelectItem>
              <SelectItem value="none">Não classificado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <CarboCard>
            <CarboCardContent className="py-16 text-center space-y-3">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground">Nenhum registro encontrado neste período.</p>
            </CarboCardContent>
          </CarboCard>
        ) : (
          <CarboCard padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {isHead && (
                      <th className="w-10 p-3">
                        <Checkbox
                          checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          onCheckedChange={checked => {
                            if (checked) setSelectedIds(new Set(filtered.map(v => v.id)));
                            else setSelectedIds(new Set());
                          }}
                          aria-label="Selecionar todos"
                        />
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
                  {filtered.map(venda => {
                    const isQuote = venda.status === "quote";
                    const isConverting = convertingId === venda.id;
                    const canConvert = isQuote && (isHead || venda.vendedor_id === user?.id);

                    return (
                      <>
                        <tr
                          key={venda.id}
                          className={`border-b transition-colors cursor-pointer hover:bg-muted/20 ${
                            isQuote ? "bg-amber-500/3 border-l-2 border-l-amber-500/30" :
                            venda.status === "delivered" ? "" :
                            venda.status === "cancelled" ? "opacity-50" : ""
                          } ${expandedId === venda.id ? "bg-muted/20" : ""} ${selectedIds.has(venda.id) ? "bg-carbo-green/5" : ""}`}
                          onClick={() => setExpandedId(expandedId === venda.id ? null : venda.id)}
                        >
                          {isHead && (
                            <td className="p-3" onClick={e => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.has(venda.id)}
                                onCheckedChange={checked => {
                                  setSelectedIds(prev => {
                                    const next = new Set(prev);
                                    checked ? next.add(venda.id) : next.delete(venda.id);
                                    return next;
                                  });
                                }}
                                aria-label={`Selecionar ${venda.order_number}`}
                              />
                            </td>
                          )}
                          <td className="p-3">
                            <CarboBadge variant={STATUS_VARIANT[venda.status] ?? "secondary"} size="sm">
                              {STATUS_LABEL[venda.status] ?? venda.status}
                            </CarboBadge>
                          </td>
                          <td className="p-3 font-mono text-xs font-medium">{venda.order_number}</td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            <span title={venda.sale_date ? `Registrado: ${fmtDate(venda.created_at)}` : undefined}>
                              {fmtDate(effectiveDate(venda))}
                            </span>
                            {venda.sale_date && venda.sale_date !== venda.created_at.substring(0, 10) && (
                              <span className="ml-1 text-[10px] text-amber-500 font-medium">✱</span>
                            )}
                          </td>
                          <td className="p-3 font-medium max-w-[180px] truncate">{venda.customer_name}</td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            {[venda.delivery_city, venda.delivery_state].filter(Boolean).join("/") || "—"}
                          </td>
                          {isHead && (
                            <td className="p-3 text-muted-foreground">
                              <span>{venda.vendedor_name || "—"}</span>
                              {venda.vendedor_id && !vendedorSet.has(venda.vendedor_id) && (
                                <span className="ml-1.5 text-[9px] font-semibold text-amber-500 border border-amber-500/30 rounded px-1">
                                  Avulso
                                </span>
                              )}
                            </td>
                          )}
                          <td className="p-3 text-right font-bold tabular-nums">{fmtBRL(venda.total)}</td>
                          <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {venda.bling_nf_id != null && (
                                <button
                                  onClick={() => handleDownloadNF(venda)}
                                  disabled={nfLoadingId === venda.id}
                                  className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs font-medium bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-500/30 transition-colors disabled:opacity-50 whitespace-nowrap"
                                  title={venda.invoice_number ? `Baixar PDF da NF ${venda.invoice_number}` : "Baixar PDF da NF"}
                                >
                                  {nfLoadingId === venda.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <FileDown className="h-3 w-3" />}
                                  <span className="hidden sm:inline">Baixar NF</span>
                                </button>
                              )}
                              {canConvert && (
                                <button
                                  onClick={() => handleConvert(venda.id)}
                                  disabled={isConverting}
                                  className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs font-medium bg-carbo-green/10 text-carbo-green hover:bg-carbo-green/20 border border-carbo-green/30 transition-colors disabled:opacity-50"
                                  title="Converter orçamento em venda"
                                >
                                  {isConverting
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <ArrowRightCircle className="h-3 w-3" />}
                                  <span className="hidden sm:inline">Converter</span>
                                </button>
                              )}
                              {isHead && !isQuote && (
                                <button
                                  onClick={() => setEditOrder(venda._raw ?? null)}
                                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                  title="Editar pedido"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable products row */}
                        {expandedId === venda.id && venda.items.length > 0 && (
                          <tr key={`${venda.id}-items`} className="border-b bg-muted/10">
                            <td colSpan={isHead ? 9 : 7} className="px-6 py-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produtos</p>
                              </div>
                              <div className="grid gap-1">
                                {venda.items.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-xs">
                                    <span className="font-medium">{item.name}</span>
                                    <div className="flex items-center gap-4 text-muted-foreground">
                                      <span>{item.quantity}x</span>
                                      <span>{fmtBRL(item.unit_price)}/un</span>
                                      <span className="font-semibold text-foreground">{fmtBRL(item.total)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CarboCard>
        )}

        {!isHead && (
          <p className="text-xs text-center text-muted-foreground">
            Você está vendo apenas seus próprios pedidos e orçamentos.
          </p>
        )}
      </div>

      {/* Barra de ação em massa */}
      {isHead && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-border bg-background/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className="text-sm font-semibold">
            <span className="text-carbo-green">{selectedIds.size}</span> pedido(s) selecionado(s)
          </span>
          <button
            className="h-8 px-3 rounded-lg text-sm font-medium bg-carbo-green text-background hover:bg-carbo-green/90 transition-colors flex items-center gap-1.5"
            onClick={() => setBulkAssign(true)}
          >
            <Users className="h-3.5 w-3.5" />
            Atribuir vendedor
          </button>
          <button
            className="h-8 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border transition-colors"
            onClick={() => setSelectedIds(new Set())}
          >
            Cancelar
          </button>
        </div>
      )}

      <EditOrderDialog
        open={!!editOrder}
        onOpenChange={open => { if (!open) setEditOrder(null); }}
        order={editOrder}
        canEditSensitive={isHead}
      />

      <BulkVendorAssignDialog
        open={bulkAssignOpen}
        onOpenChange={setBulkAssign}
        selectedIds={Array.from(selectedIds)}
        onSuccess={() => setSelectedIds(new Set())}
      />
    </BoardLayout>
  );
}
