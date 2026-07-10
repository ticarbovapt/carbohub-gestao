import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// BOM (ficha técnica) de um Produto Final — mrp_bom (product_id → insumo_id).
//  RLS: mrp_bom aberto a autenticado (migration do Ops).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export interface BomItem {
  id: string;
  insumo_id: string;
  insumo: string;
  code: string;
  qty: number;
  unit: string;
  is_critical: boolean;
}

export function useBom(productId: string | null) {
  return useQuery({
    queryKey: ["ops", "bom", productId],
    enabled: !!productId,
    queryFn: async (): Promise<BomItem[]> => {
      const [bom, products] = await Promise.all([
        db.from("mrp_bom").select("id, insumo_id, quantity_per_unit, unit, is_critical").eq("product_id", productId).order("created_at"),
        db.from("mrp_products").select("id, name, product_code"),
      ]);
      if (bom.error) throw bom.error;
      if (products.error) throw products.error;
      const byId = new Map<string, { name: string; code: string }>();
      for (const p of products.data ?? []) byId.set(p.id, { name: p.name ?? "", code: p.product_code ?? "" });
      return (bom.data ?? []).map((b: Record<string, unknown>) => {
        const p = byId.get(b.insumo_id as string);
        return {
          id: b.id as string,
          insumo_id: b.insumo_id as string,
          insumo: p?.name ?? "—",
          code: p?.code ?? "",
          qty: Number(b.quantity_per_unit) || 0,
          unit: (b.unit as string) ?? "un",
          is_critical: !!b.is_critical,
        };
      });
    },
  });
}

export interface BomItemInput {
  productId: string;
  insumoId: string;
  quantity: number;
  unit: string;
  isCritical: boolean;
}

export function useBomMutations() {
  const qc = useQueryClient();
  const invalidate = (productId: string) => qc.invalidateQueries({ queryKey: ["ops", "bom", productId] });

  const add = useMutation({
    mutationFn: async (p: BomItemInput) => {
      if (!p.insumoId) throw new Error("Selecione um insumo.");
      if (p.insumoId === p.productId) throw new Error("O insumo não pode ser o próprio produto.");
      if (!Number.isFinite(p.quantity) || p.quantity <= 0) throw new Error("Quantidade inválida.");
      const { data: auth } = await db.auth.getUser();
      const res = await db.from("mrp_bom").insert({
        product_id: p.productId,
        insumo_id: p.insumoId,
        quantity_per_unit: p.quantity,
        unit: p.unit || "un",
        is_critical: p.isCritical,
        created_by: auth?.user?.id ?? null,
      });
      if (res.error) {
        if (String(res.error.message || "").includes("mrp_bom_unique")) throw new Error("Esse insumo já está na ficha.");
        throw res.error;
      }
    },
    onSuccess: (_d, p) => invalidate(p.productId),
  });

  const update = useMutation({
    mutationFn: async (p: { id: string; productId: string; quantity: number; unit: string; isCritical: boolean }) => {
      if (!Number.isFinite(p.quantity) || p.quantity <= 0) throw new Error("Quantidade inválida.");
      const res = await db.from("mrp_bom").update({
        quantity_per_unit: p.quantity,
        unit: p.unit || "un",
        is_critical: p.isCritical,
        updated_at: new Date().toISOString(),
      }).eq("id", p.id);
      if (res.error) throw res.error;
    },
    onSuccess: (_d, p) => invalidate(p.productId),
  });

  const remove = useMutation({
    mutationFn: async ({ id }: { id: string; productId: string }) => {
      const res = await db.from("mrp_bom").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: (_d, v) => invalidate(v.productId),
  });

  return { add, update, remove };
}
