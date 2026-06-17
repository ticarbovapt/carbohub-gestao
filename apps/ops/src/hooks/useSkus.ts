import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// SKUs (Carbo Ops) — LEITURA do banco compartilhado.
//  • Lista = tabela `sku` (produtos acabados / reagentes).
//  • bom_version = maior versão ATIVA em `sku_bom` daquele SKU (ficha técnica).
//  RLS: sku/sku_bom liberam SELECT p/ admin/gestor/operador.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface Sku {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  packaging_ml: number | null;
  safety_stock_qty: number;
  is_active: boolean;
  bom_version: number | null;
}

export function useSkus() {
  return useQuery({
    queryKey: ["ops", "skus"],
    queryFn: async (): Promise<Sku[]> => {
      const [skus, boms] = await Promise.all([
        db
          .from("sku")
          .select("id, code, name, description, category, packaging_ml, safety_stock_qty, is_active")
          .order("code"),
        db.from("sku_bom").select("sku_id, version, is_active").eq("is_active", true),
      ]);

      if (skus.error) throw skus.error;
      if (boms.error) throw boms.error;

      // sku_id → maior versão ativa da BOM
      const versionBySku = new Map<string, number>();
      for (const b of boms.data ?? []) {
        const v = Number(b.version) || 0;
        if (v > (versionBySku.get(b.sku_id) ?? 0)) versionBySku.set(b.sku_id, v);
      }

      return (skus.data ?? []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        code: (s.code as string) ?? "",
        name: (s.name as string) ?? "",
        description: (s.description as string) ?? null,
        category: (s.category as string) ?? "",
        packaging_ml: s.packaging_ml == null ? null : Number(s.packaging_ml),
        safety_stock_qty: Number(s.safety_stock_qty) || 0,
        is_active: s.is_active !== false,
        bom_version: versionBySku.get(s.id as string) ?? null,
      }));
    },
  });
}
