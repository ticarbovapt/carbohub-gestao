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
  Package, Pencil, Users, ArrowRightCircle, FileDown, CalendarDays, X,
} from "lucide-react";
import { toast } from "sonner";
import { useVendas, useVendedorNomes } from "@/hooks/useVendas";

// Vendas e Orçamentos — lê de crm_vendas (orçamentos + vendas salvas).

interface Item { name: string; quantity: number; unit_price: number; total: number; }
interface VendaRow {
  id: string; order_number: string; created_at: string; sale_date: string | null;
  customer_name: string; delivery_city: string | null; delivery_state: string | null;
  items: Item[]; total: number; status: string; vendedor_id: string; vendedor_name: string;
  invoice_number: string | null; has_nf: boolean; is_avulso?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  quote: "Orçamento", pending: "Pendente", confirmed: "Confirmado", invoiced: "Faturado",
  shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado",
};
const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  quote: "secondary", delivered: "success", shipped: "warning", confirmed: "warning",
  invoiced: "warning", pending: "secondary", cancelled: "destructive",
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (s: string) => format(parseISO(s.length === 10 ? s + "T00:00:00" : s), "dd/MM/yyyy", { locale: ptBR });
const effectiveDate = (r: VendaRow) => r.sale_date ?? r.created_at.substring(0, 10);

const toDisplayStatus = (s: string) => (s === "orcamento" ? "quote" : s === "cancelado" ? "cancelled" : "confirmed");

export default function Vendas() {
  const isHead = true; // gestor vê tudo (camada de acesso fina entra depois)

  // ── Dados reais (crm_vendas: orçamentos + vendas) ──
  const { data: vendasRaw = [] } = useVendas("all");
  const { data: nomes = {} } = useVendedorNomes();

  const rows: VendaRow[] = useMemo(() => vendasRaw.map((v) => {
    const items: Item[] = (v.itens ?? []).map((i) => ({
      name: i.produto ?? "—",
      quantity: i.quantidade || 0,
      unit_price: Number(i.preco_unitario) || 0,
      total: (i.quantidade || 0) * (Number(i.preco_unitario) || 0),
    }));
    return {
      id: v.id,
      order_number: `${v.status === "orcamento" ? "ORC" : "VND"}-${v.id.slice(0, 8).toUpperCase()}`,
      created_at: v.created_at,
      sale_date: null,
      customer_name: v.customer_name ?? "—",
      delivery_city: null,
      delivery_state: null,
      items,
      total: Number(v.total) || 0,
      status: toDisplayStatus(v.status),
      vendedor_id: v.vendedor_id,
      vendedor_name: nomes[v.vendedor_id] ?? "—",
      invoice_number: null,
      has_nf: false,
    };
  }), [vendasRaw, nomes]);

  // Lista de vendedores para o filtro (distintos a partir dos dados).
  const VENDEDORES = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((r) => { if (!seen.has(r.vendedor_id)) seen.set(r.vendedor_id, r.vendedor_name); });
    return Array.from(seen, ([id, name]) => ({ id, name, avulso: false }));
  }, [rows]);

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [vendedorFilter, setVendedor] = useState("__all__");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const hasCustomRange = !!(customFrom || customTo);
  const clearCustomRange = () => { setCustomFrom(""); setCustomTo(""); };
  const today = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  const filtered = useMemo(() => {
    return rows.filter((v) => {
      if (vendedorFilter !== "__all__" && v.vendedor_id !== vendedorFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return v.customer_name.toLowerCase().includes(q) || v.order_number.toLowerCase().includes(q);
    });
  }, [rows, search, vendedorFilter]);

  const quotes = filtered.filter((v) => v.status === "quote");
  const active = filtered.filter((v) => v.status !== "cancelled" && v.status !== "quote");
  const totalRevenue = active.reduce((s, v) => s + v.total, 0);
  const cancelled = filtered.filter((v) => v.status === "cancelled").length;

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

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          <CarboCard><CarboCardContent className="p-3 text-center"><p className="text-2xl font-bold text-amber-400 tabular-nums">{quotes.length}</p><p className="text-xs text-muted-foreground">Orçamentos</p></CarboCardContent></CarboCard>
          <CarboCard><CarboCardContent className="p-3 text-center"><p className="text-2xl font-bold text-carbo-green tabular-nums">{active.length}</p><p className="text-xs text-muted-foreground">Vendas</p></CarboCardContent></CarboCard>
          <CarboCard><CarboCardContent className="p-3 text-center"><p className="text-xl font-bold tabular-nums">{fmtBRL(totalRevenue)}</p><p className="text-xs text-muted-foreground">Total de vendas</p></CarboCardContent></CarboCard>
          <CarboCard><CarboCardContent className="p-3 text-center"><p className="text-2xl font-bold text-red-400 tabular-nums">{cancelled}</p><p className="text-xs text-muted-foreground">Canceladas</p></CarboCardContent></CarboCard>
        </div>

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
                    <span className="flex items-center gap-2">{m.name}{m.avulso && <span className="text-[10px] font-semibold text-amber-500 border border-amber-500/30 rounded px-1 ml-1">Avulso</span>}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Tabela */}
        {filtered.length === 0 ? (
          <CarboCard><CarboCardContent className="py-16 text-center space-y-3"><TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/30" /><p className="text-muted-foreground">Nenhum registro encontrado neste período.</p></CarboCardContent></CarboCard>
        ) : (
          <CarboCard padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {isHead && (
                      <th className="w-10 p-3">
                        <Checkbox checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          onCheckedChange={(c) => { if (c) setSelectedIds(new Set(filtered.map((v) => v.id))); else setSelectedIds(new Set()); }}
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
                  {filtered.map((venda) => {
                    const isQuote = venda.status === "quote";
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
                              <span>{venda.vendedor_name || "—"}</span>
                              {venda.is_avulso && <span className="ml-1.5 text-[9px] font-semibold text-amber-500 border border-amber-500/30 rounded px-1">Avulso</span>}
                            </td>
                          )}
                          <td className="p-3 text-right font-bold tabular-nums">{fmtBRL(venda.total)}</td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {venda.has_nf && (
                                <button onClick={() => toast.success(`Baixando NF ${venda.invoice_number} (mock)`)} className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs font-medium bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-500/30 transition-colors whitespace-nowrap" title="Baixar PDF da NF">
                                  <FileDown className="h-3 w-3" /><span className="hidden sm:inline">Baixar NF</span>
                                </button>
                              )}
                              {isQuote && (
                                <button onClick={() => toast.success("Orçamento convertido em venda! (mock)")} className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs font-medium bg-carbo-green/10 text-carbo-green hover:bg-carbo-green/20 border border-carbo-green/30 transition-colors" title="Converter orçamento em venda">
                                  <ArrowRightCircle className="h-3 w-3" /><span className="hidden sm:inline">Converter</span>
                                </button>
                              )}
                              {isHead && !isQuote && (
                                <button onClick={() => toast("Editar pedido (mock)")} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Editar pedido">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expandedId === venda.id && venda.items.length > 0 && (
                          <tr className="border-b bg-muted/10">
                            <td colSpan={isHead ? 9 : 7} className="px-6 py-3">
                              <div className="flex items-center gap-2 mb-2"><Package className="h-3.5 w-3.5 text-muted-foreground" /><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produtos</p></div>
                              <div className="grid gap-1">
                                {venda.items.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-xs">
                                    <span className="font-medium">{item.name}</span>
                                    <div className="flex items-center gap-4 text-muted-foreground">
                                      <span>{item.quantity}x</span><span>{fmtBRL(item.unit_price)}/un</span><span className="font-semibold text-foreground">{fmtBRL(item.total)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
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
          Vendas e orçamentos salvos. Conversão de orçamento, NF-e e atribuição em massa entram nas próximas etapas.
        </p>
      </div>

      {/* Barra de ação em massa */}
      {isHead && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-border bg-background/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className="text-sm font-semibold"><span className="text-carbo-green">{selectedIds.size}</span> pedido(s) selecionado(s)</span>
          <button className="h-8 px-3 rounded-lg text-sm font-medium bg-carbo-green text-background hover:bg-carbo-green/90 transition-colors flex items-center gap-1.5" onClick={() => toast.success("Atribuir vendedor (mock)")}><Users className="h-3.5 w-3.5" /> Atribuir vendedor</button>
          <button className="h-8 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border transition-colors" onClick={() => setSelectedIds(new Set())}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
