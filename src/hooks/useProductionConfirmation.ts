import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================================
// Types
// ============================================================

export interface ConfirmationItem {
  product_id: string;
  product_name: string;
  theoretical_quantity: number;
  actual_quantity: number;
  loss_quantity: number;
  loss_reason: string;
  lot_id?: string | null;
  unit: string;
}

export interface ConfirmationPayload {
  production_order_id: string;
  sku_id: string;
  planned_quantity: number;
  good_quantity: number;
  rejected_quantity: number;
  rejection_reason?: string;
  deviation_notes?: string;
  destination_warehouse_id?: string | null;
  items: ConfirmationItem[];
}

export interface ProductionConfirmation {
  id: string;
  production_order_id: string;
  good_quantity: number;
  rejected_quantity: number;
  rejection_reason: string | null;
  deviation_notes: string | null;
  bom_adherence_pct: number | null;
  yield_pct: number | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface ProductionConfirmationItem {
  id: string;
  confirmation_id: string;
  product_id: string;
  theoretical_quantity: number;
  actual_quantity: number;
  loss_quantity: number;
  loss_reason: string | null;
  lot_id: string | null;
  created_at: string;
  // Joined
  product_name?: string;
}

// ============================================================
// Queries
// ============================================================

export function useConfirmation(opId: string | undefined) {
  return useQuery({
    queryKey: ["production_confirmation", opId],
    enabled: !!opId,
    queryFn: async (): Promise<{
      confirmation: ProductionConfirmation;
      items: ProductionConfirmationItem[];
    } | null> => {
      if (!opId) return null;

      const { data: conf, error } = await (supabase as any)
        .from("production_confirmation")
        .select("*")
        .eq("production_order_id", opId)
        .maybeSingle();

      if (error) throw error;
      if (!conf) return null;

      // Fetch items
      const { data: items, error: itemsError } = await (supabase as any)
        .from("production_confirmation_item")
        .select("*")
        .eq("confirmation_id", conf.id)
        .order("created_at", { ascending: true });

      if (itemsError) throw itemsError;

      // Fetch product names
      const productIds = [...new Set((items || []).map((i: any) => i.product_id))];
      const prodRes = productIds.length > 0
        ? await (supabase as any).from("mrp_products").select("id, name").in("id", productIds)
        : { data: [] };
      const prodMap = new Map((prodRes.data || []).map((p: any) => [p.id, p.name]));

      const enrichedItems: ProductionConfirmationItem[] = (items || []).map((i: any) => ({
        ...i,
        product_name: prodMap.get(i.product_id) || "—",
      }));

      return { confirmation: conf, items: enrichedItems };
    },
  });
}

// ============================================================
// KPIs
// ============================================================

export function useConfirmationKPIs() {
  return useQuery({
    queryKey: ["confirmation_kpis"],
    queryFn: async () => {
      // Fetch all confirmations (last 30 days for averages)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: confirmations, error } = await (supabase as any)
        .from("production_confirmation")
        .select("id, good_quantity, rejected_quantity, yield_pct, bom_adherence_pct, confirmed_at")
        .gte("confirmed_at", thirtyDaysAgo);

      if (error) throw error;

      const confs = confirmations || [];
      const count = confs.length;

      if (count === 0) {
        return {
          avgYield: 0,
          avgAdherence: 0,
          totalConfirmed: 0,
          totalRejected: 0,
        };
      }

      const yields = confs.filter((c: any) => c.yield_pct != null).map((c: any) => Number(c.yield_pct));
      const adherences = confs.filter((c: any) => c.bom_adherence_pct != null).map((c: any) => Number(c.bom_adherence_pct));
      const totalRejected = confs.reduce((sum: number, c: any) => sum + (c.rejected_quantity || 0), 0);

      return {
        avgYield: yields.length > 0 ? yields.reduce((a: number, b: number) => a + b, 0) / yields.length : 0,
        avgAdherence: adherences.length > 0 ? adherences.reduce((a: number, b: number) => a + b, 0) / adherences.length : 0,
        totalConfirmed: count,
        totalRejected,
      };
    },
  });
}

// ============================================================
// Submit Confirmation Mutation
// ============================================================

export function useSubmitConfirmation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ConfirmationPayload) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      if (!userId) throw new Error("Usuário não autenticado");

      // 1. Calculate KPIs
      const yieldPct = payload.planned_quantity > 0
        ? Math.min(100, Math.max(0, (payload.good_quantity / payload.planned_quantity) * 100))
        : 0;

      const itemAdherences = payload.items
        .filter((i) => i.theoretical_quantity > 0)
        .map((i) => (i.actual_quantity / i.theoretical_quantity) * 100);

      const bomAdherencePct = itemAdherences.length > 0
        ? itemAdherences.reduce((a, b) => a + b, 0) / itemAdherences.length
        : 100;

      // 2. INSERT production_confirmation
      const { data: confirmation, error: confError } = await (supabase as any)
        .from("production_confirmation")
        .insert({
          production_order_id: payload.production_order_id,
          good_quantity: payload.good_quantity,
          rejected_quantity: payload.rejected_quantity,
          rejection_reason: payload.rejection_reason || null,
          deviation_notes: payload.deviation_notes || null,
          bom_adherence_pct: Math.round(bomAdherencePct * 100) / 100,
          yield_pct: Math.round(yieldPct * 100) / 100,
          confirmed_by: userId,
          confirmed_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (confError) throw new Error("Erro ao criar confirmação: " + confError.message);

      // 3. INSERT confirmation items
      const confirmationItems = payload.items.map((item) => ({
        confirmation_id: confirmation.id,
        product_id: item.product_id,
        theoretical_quantity: item.theoretical_quantity,
        actual_quantity: item.actual_quantity,
        loss_quantity: item.loss_quantity,
        loss_reason: item.loss_reason || null,
        lot_id: item.lot_id || null,
      }));

      if (confirmationItems.length > 0) {
        const { error: itemsError } = await (supabase as any)
          .from("production_confirmation_item")
          .insert(confirmationItems);

        if (itemsError) throw new Error("Erro ao registrar itens: " + itemsError.message);
      }

      // 4. Stock movements: debit consumed materials
      for (const item of payload.items) {
        if (item.actual_quantity <= 0) continue;

        // Create saida movement
        const { error: movError } = await supabase.from("stock_movements").insert({
          product_id: item.product_id,
          tipo: "saida",
          quantidade: item.actual_quantity,
          origem: "OP",
          origem_id: payload.production_order_id,
          observacoes: `Consumo OP - ${item.product_name}`,
          created_by: userId,
        } as any);

        if (movError) {
          console.error("[confirmation] Stock movement error:", movError);
        }

        // Update mrp_products stock
        const { data: product } = await supabase
          .from("mrp_products")
          .select("current_stock_qty")
          .eq("id", item.product_id)
          .single();

        const currentStock = (product as any)?.current_stock_qty || 0;
        const newStock = Math.max(0, currentStock - item.actual_quantity);

        await supabase.from("mrp_products").update({
          current_stock_qty: newStock,
          stock_updated_at: new Date().toISOString().split("T")[0],
        }).eq("id", item.product_id);

        // 5. Update lot consumption if lot_id provided
        if (item.lot_id) {
          await (supabase as any).from("inventory_lot_consumption").insert({
            lot_id: item.lot_id,
            production_order_id: payload.production_order_id,
            volume_consumed_ml: item.actual_quantity,
            consumed_by: userId,
          });

          // Decrement lot available volume
          const { data: lot } = await (supabase as any)
            .from("inventory_lot")
            .select("available_volume_ml")
            .eq("id", item.lot_id)
            .single();

          if (lot) {
            const newVolume = Math.max(0, (lot.available_volume_ml || 0) - item.actual_quantity);
            await (supabase as any)
              .from("inventory_lot")
              .update({ available_volume_ml: newVolume })
              .eq("id", item.lot_id);
          }
        }
      }

      // 6. Credit finished goods (entrada for SKU product)
      // We need to find or create the MRP product for the SKU
      // For now, we skip this step since SKUs may not have a corresponding mrp_products entry

      // 7. UPDATE production order
      const { error: opError } = await (supabase as any)
        .from("production_orders")
        .update({
          good_quantity: payload.good_quantity,
          rejected_quantity: payload.rejected_quantity,
          finished_at: new Date().toISOString(),
          op_status: "confirmada",
        })
        .eq("id", payload.production_order_id);

      if (opError) throw new Error("Erro ao atualizar OP: " + opError.message);

      return {
        confirmationId: confirmation.id,
        yieldPct,
        bomAdherencePct,
      };
    },
    onSuccess: (result, payload) => {
      qc.invalidateQueries({ queryKey: ["production_orders_op"] });
      qc.invalidateQueries({ queryKey: ["production_order_op", payload.production_order_id] });
      qc.invalidateQueries({ queryKey: ["production_confirmation", payload.production_order_id] });
      qc.invalidateQueries({ queryKey: ["confirmation_kpis"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["mrp-products"] });
      qc.invalidateQueries({ queryKey: ["inventory_lots"] });
      toast.success(
        `OP confirmada! Rendimento: ${result.yieldPct.toFixed(1)}% | Aderência BOM: ${result.bomAdherencePct.toFixed(1)}%`
      );
    },
    onError: (e: Error) => toast.error("Erro ao confirmar OP: " + e.message),
  });
}
