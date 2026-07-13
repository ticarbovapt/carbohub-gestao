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
  product_code?: string | null;
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

export function useComercialDashboard(vendedor: string = "all") {
  return useQuery<ComercialData>({
    queryKey: ["ops", "comercial", vendedor],
    queryFn: async () => {
      // Agregação no servidor (RPC) — antes puxava todos os pedidos pro cliente.
      const { data, error } = await (db as any).rpc("ops_comercial_dashboard", { p_vendedor: vendedor });
      if (error) throw error;
      const d = (data ?? {}) as {
        vendedores?: string[];
        monthly?: { y: number; m: number; faturado: number; pedidos: number }[];
        totalVendas?: number; totalBRL?: number; maiorVenda?: number; maiorCliente?: string;
        topCliente?: string; topQtd?: number;
      };

      const vendedores = d.vendedores ?? [];
      const monthlyData: MonthlyRow[] = (d.monthly ?? []).map((r) => {
        const faturado = Number(r.faturado) || 0;
        const pedidos = Number(r.pedidos) || 0;
        return {
          mes: `${MES_ABBR[(Number(r.m) || 1) - 1]}/${String(r.y).slice(2)}`,
          faturado, pedidos, ticketMedio: pedidos ? Math.round(faturado / pedidos) : 0,
        };
      });
      if (monthlyData.length === 0 && (Number(d.totalVendas) || 0) === 0) return { ...EMPTY, vendedores };

      const totalVendas = Number(d.totalVendas) || 0;
      const totalBRL = Number(d.totalBRL) || 0;
      const kpis: ComercialKpis = {
        totalVendas, totalBRL,
        maiorVenda: Number(d.maiorVenda) || 0, maiorCliente: d.maiorCliente || "—",
        topCliente: d.topCliente || "—", topQtd: Number(d.topQtd) || 0,
        ticketMedio: totalVendas ? totalBRL / totalVendas : 0,
      };

      // Crescimento anual: real por mês vs projeção +15%/mês a partir do 1º mês.
      const base = monthlyData[0]?.faturado || 0;
      const annualGrowthData: AnnualRow[] = monthlyData.map((m, i) => ({
        label: m.mes, real: m.faturado,
        projecao: base > 0 ? Math.round(base * Math.pow(1.15, i)) : null,
      }));

      return { vendedores, monthlyData, kpis, annualGrowthData };
    },
  });
}
