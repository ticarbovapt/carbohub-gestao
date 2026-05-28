import { useState, useMemo } from "react";
import { format, startOfMonth, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Search, ShoppingBag, TrendingUp, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import type { OrderItem } from "@/hooks/useCarbozeOrders";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface VendaRow {
  id: string;
  order_number: string;
  created_at: string;
  customer_name: string;
  delivery_city: string | null;
  delivery_state: string | null;
  items: OrderItem[];
  total: number;
  status: string;
  vendedor_id: string | null;
  vendedor_name: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending:   "Pendente",
  confirmed: "Confirmado",
  invoiced:  "Faturado",
  shipped:   "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
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
  return format(new Date(s), "dd/MM/yyyy", { locale: ptBR });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
function useVendas(month: Date, vendedorIdFilter: string | null) {
  const { user, profile } = useAuth();
  const isHead =
    profile?.funcao === "head" || profile?.secondary_funcao === "head" ||
    profile?.department === "command";

  return useQuery({
    queryKey: ["vendas", month.toISOString().slice(0, 7), vendedorIdFilter, isHead, user?.id],
    queryFn: async () => {
      const monthStart = startOfMonth(month).toISOString().split("T")[0];
      const monthEnd   = new Date(month.getFullYear(), month.getMonth() + 1, 0)
        .toISOString().split("T")[0];

      let query = supabase
        .from("carboze_orders")
        .select("id, order_number, created_at, customer_name, delivery_city, delivery_state, items, total, status, vendedor_id, vendedor_name")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd + "T23:59:59Z")
        .order("created_at", { ascending: false });

      if (!isHead) {
        // Vendedor só vê seus próprios pedidos
        query = query.eq("vendedor_id", user!.id);
      } else if (vendedorIdFilter && vendedorIdFilter !== "__all__") {
        query = query.eq("vendedor_id", vendedorIdFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((row): VendaRow => ({
        ...row,
        items: Array.isArray(row.items) ? (row.items as unknown as OrderItem[]) : [],
        total: Number(row.total || 0),
      }));
    },
    enabled: !!user,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function VendasPage() {
  const [month, setMonth]           = useState(() => startOfMonth(new Date()));
  const [search, setSearch]         = useState("");
  const [vendedorFilter, setVendedor] = useState("__all__");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { profile } = useAuth();
  const isHead =
    profile?.funcao === "head" || profile?.secondary_funcao === "head" ||
    profile?.department === "command";

  const { data: teamMembers = [] } = useTeamMembers();
  const vendedores = teamMembers.filter(m =>
    m.status === "approved" && (
      m.department === "cgc" || m.department === "expansao" ||
      m.secondary_department === "cgc" || m.secondary_department === "expansao"
    )
  );

  const { data: vendas = [], isLoading } = useVendas(month, vendedorFilter);

  const today = new Date();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth();

  // Filter by search
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return vendas;
    return vendas.filter(v =>
      v.customer_name?.toLowerCase().includes(q) ||
      v.order_number?.toLowerCase().includes(q)
    );
  }, [vendas, search]);

  // Summary — vendas ativas (exceto canceladas)
  const active       = filtered.filter(v => v.status !== "cancelled");
  const totalRevenue = active.reduce((s, v) => s + v.total, 0);
  const cancelled    = filtered.filter(v => v.status === "cancelled").length;

  return (
    <BoardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 text-carbo-green" /> Vendas
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Acompanhamento de pedidos por vendedor</p>
          </div>
          {/* Month selector */}
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
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-3 gap-3">
          <CarboCard>
            <CarboCardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-carbo-green tabular-nums">{active.length}</p>
              <p className="text-xs text-muted-foreground">Vendas registradas</p>
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
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todos os vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os vendedores</SelectItem>
                {vendedores.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || m.username || m.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
              <p className="text-muted-foreground">Nenhuma venda encontrada neste período.</p>
            </CarboCardContent>
          </CarboCard>
        ) : (
          <CarboCard padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Pedido</th>
                    <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Data</th>
                    <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Cliente</th>
                    <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Cidade/UF</th>
                    {isHead && <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Vendedor</th>}
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(venda => (
                    <>
                      <tr
                        key={venda.id}
                        className={`border-b transition-colors cursor-pointer hover:bg-muted/20 ${
                          venda.status === "delivered" ? "" :
                          venda.status === "cancelled" ? "opacity-50" : "bg-amber-500/3"
                        } ${expandedId === venda.id ? "bg-muted/20" : ""}`}
                        onClick={() => setExpandedId(expandedId === venda.id ? null : venda.id)}
                      >
                        <td className="p-3">
                          <CarboBadge variant={STATUS_VARIANT[venda.status] ?? "secondary"} size="sm">
                            {STATUS_LABEL[venda.status] ?? venda.status}
                          </CarboBadge>
                        </td>
                        <td className="p-3 font-mono text-xs font-medium">{venda.order_number}</td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{fmtDate(venda.created_at)}</td>
                        <td className="p-3 font-medium max-w-[180px] truncate">{venda.customer_name}</td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {[venda.delivery_city, venda.delivery_state].filter(Boolean).join("/") || "—"}
                        </td>
                        {isHead && <td className="p-3 text-muted-foreground">{venda.vendedor_name || "—"}</td>}
                        <td className="p-3 text-right font-bold tabular-nums">{fmtBRL(venda.total)}</td>
                      </tr>

                      {/* Expandable products row */}
                      {expandedId === venda.id && venda.items.length > 0 && (
                        <tr key={`${venda.id}-items`} className="border-b bg-muted/10">
                          <td colSpan={isHead ? 7 : 6} className="px-6 py-3">
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
                  ))}
                </tbody>
              </table>
            </div>
          </CarboCard>
        )}

        {!isHead && (
          <p className="text-xs text-center text-muted-foreground">
            Você está vendo apenas suas próprias vendas.
          </p>
        )}
      </div>
    </BoardLayout>
  );
}
