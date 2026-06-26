import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Pedidos de venda (carboze_orders) no Carbo Ops.
//  • useCreateVenda  → registra venda (dialog "+ Nova Venda").
//  • useComercialDashboard → agrega dados reais para o Dashboard Comercial.
// Tabela compartilhada com Sales/Controle/Finanças (mesmo Supabase).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface VendaItemInput {
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface CreateVendaInput {
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  is_licensee?: boolean;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_state?: string | null;
  delivery_zip?: string | null;
  items: VendaItemInput[];
  subtotal: number;
  total: number;
  notes?: string | null;
  vendedor_id?: string | null;
  vendedor_name?: string | null;
  // Dados fiscais / estratégicos (opcionais)
  cnpj?: string | null;
  point_type?: string | null;
  internal_classification?: string | null;
  avg_monthly_vehicles?: number | null;
  works_with_diesel?: boolean | null;
  works_with_fleets?: boolean | null;
}

export function useCreateVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateVendaInput) => {
      const { data: result, error } = await db
        .from("carboze_orders")
        .insert({
          order_number: "", // gerado por trigger
          customer_name: data.customer_name,
          customer_email: data.customer_email || null,
          customer_phone: data.customer_phone || null,
          delivery_address: data.delivery_address || null,
          delivery_city: data.delivery_city || null,
          delivery_state: data.delivery_state || null,
          delivery_zip: data.delivery_zip || null,
          items: data.items,
          subtotal: data.subtotal,
          shipping_cost: 0,
          discount: 0,
          total: data.total,
          status: "pending",
          notes: data.notes || null,
          vendedor_id: data.vendedor_id || null,
          vendedor_name: data.vendedor_name || null,
          cnpj: data.cnpj || null,
          point_type: data.point_type || null,
          internal_classification: data.internal_classification || null,
          avg_monthly_vehicles: data.avg_monthly_vehicles ?? null,
          works_with_diesel: data.works_with_diesel ?? null,
          works_with_fleets: data.works_with_fleets ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Histórico de status (best-effort; não bloqueia a venda)
      try {
        const { data: u } = await supabase.auth.getUser();
        await db.from("order_status_history").insert({
          order_id: result.id,
          status: "pending",
          notes: "Pedido criado (Ops)",
          changed_by: u?.user?.id ?? null,
        });
      } catch { /* ignore */ }

      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "comercial"] });
      toast.success("Venda registrada com sucesso!");
    },
    onError: (e: Error) => toast.error("Erro ao registrar venda: " + e.message),
  });
}

// ── Dashboard Comercial ──────────────────────────────────────────────────────

const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (d: Date) => `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;

export interface MonthlyRow { mes: string; faturado: number; pedidos: number; ticketMedio: number; }
export interface ComercialKpis {
  totalVendas: number; totalBRL: number; maiorVenda: number; maiorCliente: string;
  topCliente: string; topQtd: number; ticketMedio: number;
}
export interface AnnualRow { label: string; projecao: number | null; real: number | null; }
export interface ComercialData {
  vendedores: string[];
  monthlyData: MonthlyRow[];
  kpis: ComercialKpis;
  annualGrowthData: AnnualRow[];
}

const EMPTY: ComercialData = {
  vendedores: [],
  monthlyData: [],
  kpis: { totalVendas: 0, totalBRL: 0, maiorVenda: 0, maiorCliente: "—", topCliente: "—", topQtd: 0, ticketMedio: 0 },
  annualGrowthData: [],
};

interface OrderRow {
  total: number | null;
  status: string;
  customer_name: string | null;
  vendedor_name: string | null;
  created_at: string;
  sale_date: string | null;
}

export function useComercialDashboard(vendedor: string = "all") {
  return useQuery<ComercialData>({
    queryKey: ["ops", "comercial", vendedor],
    queryFn: async () => {
      const { data, error } = await db
        .from("carboze_orders")
        .select("total, status, customer_name, vendedor_name, created_at, sale_date")
        .neq("status", "cancelled");
      if (error) throw error;

      let rows = (data || []) as OrderRow[];
      if (vendedor !== "all") rows = rows.filter((r) => (r.vendedor_name || "") === vendedor);
      if (rows.length === 0) return { ...EMPTY, vendedores: distinctVendedores((data || []) as OrderRow[]) };

      const vendedores = distinctVendedores((data || []) as OrderRow[]);

      // Agrega por mês (ordem cronológica)
      const byMonth = new Map<string, { d: Date; faturado: number; pedidos: number }>();
      for (const r of rows) {
        const d = new Date(r.sale_date || r.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
        const cur = byMonth.get(key) || { d: new Date(d.getFullYear(), d.getMonth(), 1), faturado: 0, pedidos: 0 };
        cur.faturado += Number(r.total || 0);
        cur.pedidos += 1;
        byMonth.set(key, cur);
      }
      const monthlyData: MonthlyRow[] = [...byMonth.entries()]
        .sort((a, b) => a[1].d.getTime() - b[1].d.getTime())
        .map(([, v]) => ({
          mes: monthLabel(v.d),
          faturado: Math.round(v.faturado),
          pedidos: v.pedidos,
          ticketMedio: v.pedidos ? Math.round(v.faturado / v.pedidos) : 0,
        }));

      // KPIs
      const totalBRL = rows.reduce((s, r) => s + Number(r.total || 0), 0);
      const totalVendas = rows.length;
      let maiorVenda = 0, maiorCliente = "—";
      const porCliente = new Map<string, number>();
      for (const r of rows) {
        const t = Number(r.total || 0);
        if (t > maiorVenda) { maiorVenda = t; maiorCliente = r.customer_name || "—"; }
        const c = r.customer_name || "—";
        porCliente.set(c, (porCliente.get(c) || 0) + 1);
      }
      let topCliente = "—", topQtd = 0;
      for (const [c, q] of porCliente) if (q > topQtd) { topQtd = q; topCliente = c; }

      const kpis: ComercialKpis = {
        totalVendas, totalBRL,
        maiorVenda, maiorCliente,
        topCliente, topQtd,
        ticketMedio: totalVendas ? totalBRL / totalVendas : 0,
      };

      // Crescimento anual: real por mês vs projeção +15%/mês a partir do 1º mês
      const base = monthlyData[0]?.faturado || 0;
      const annualGrowthData: AnnualRow[] = monthlyData.map((m, i) => ({
        label: m.mes,
        real: m.faturado,
        projecao: base > 0 ? Math.round(base * Math.pow(1.15, i)) : null,
      }));

      return { vendedores, monthlyData, kpis, annualGrowthData };
    },
  });
}

function distinctVendedores(rows: OrderRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) if (r.vendedor_name) set.add(r.vendedor_name);
  return [...set].sort();
}
