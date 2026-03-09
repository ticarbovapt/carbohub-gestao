import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { StockMovement } from "@/types/rcPurchasing";

export function useStockMovements(filters?: { product_id?: string; tipo?: string }) {
  return useQuery({
    queryKey: ["stock-movements", filters],
    queryFn: async () => {
      let query = supabase
        .from("stock_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filters?.product_id) query = query.eq("product_id", filters.product_id);
      if (filters?.tipo) query = query.eq("tipo", filters.tipo);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as StockMovement[];
    },
  });
}

export function useCreateStockMovement() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      product_id: string;
      tipo: 'entrada' | 'saida';
      quantidade: number;
      origem: 'PC' | 'OP' | 'ajuste';
      origem_id?: string;
      custo_unitario?: number;
      observacoes?: string;
    }) => {
      // Get current product stock
      const { data: product } = await supabase
        .from("mrp_products")
        .select("current_stock_qty")
        .eq("id", values.product_id)
        .single();

      const currentStock = product?.current_stock_qty || 0;
      const newStock = values.tipo === 'entrada'
        ? currentStock + values.quantidade
        : currentStock - values.quantidade;

      if (newStock < 0) throw new Error("Estoque insuficiente");

      // Create movement
      const { data, error } = await supabase.from("stock_movements").insert({
        product_id: values.product_id,
        tipo: values.tipo,
        quantidade: values.quantidade,
        origem: values.origem,
        origem_id: values.origem_id || null,
        custo_unitario: values.custo_unitario || 0,
        observacoes: values.observacoes || null,
        created_by: user!.id,
      } as any).select().single();
      if (error) throw error;

      // Update product stock
      await supabase.from("mrp_products").update({
        current_stock_qty: newStock,
        stock_updated_at: new Date().toISOString().split("T")[0],
      }).eq("id", values.product_id);

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["mrp-products"] });
      toast.success("Movimento de estoque registrado");
    },
    onError: (e: any) => toast.error("Erro no movimento", { description: e.message }),
  });
}

export function useSuprimentosKPIs() {
  return useQuery({
    queryKey: ["suprimentos-kpis"],
    queryFn: async () => {
      const [prodRes, movRes] = await Promise.all([
        supabase.from("mrp_products").select("id, current_stock_qty, min_order_qty, name"),
        supabase.from("stock_movements").select("id, tipo, quantidade, created_at").order("created_at", { ascending: false }).limit(100),
      ]);
      const products = (prodRes.data || []) as any[];
      const movements = (movRes.data || []) as any[];

      const lowStock = products.filter(p => p.current_stock_qty <= (p.min_order_qty || 5));
      const totalEntradas = movements.filter(m => m.tipo === 'entrada').reduce((s: number, m: any) => s + Number(m.quantidade), 0);
      const totalSaidas = movements.filter(m => m.tipo === 'saida').reduce((s: number, m: any) => s + Number(m.quantidade), 0);

      return {
        totalProdutos: products.length,
        produtosEmBaixa: lowStock.length,
        entradasRecentes: totalEntradas,
        saidasRecentes: totalSaidas,
        movimentosRecentes: movements.length,
      };
    },
  });
}
