import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMrpProducts } from "@/hooks/useMrpProducts";
import { convertUnit } from "@/lib/units";
import type { ProductionRoute } from "@/hooks/useProductionOrders";

// ─────────────────────────────────────────────────────────────────────────────
// "Dá pra produzir agora?" por OP — lê a BOM (× qtd) contra o estoque do HUB-RN.
//  • Produto com semi-acabado na ficha: produzível se QUALQUER rota fecha
//    (só rotular = envasado+rótulo, OU do zero = garrafa+líquido+tampa+rótulo).
//  • Se a OP já tem rota definida, respeita ela.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };
const HUB_RN = "HUB-RN";

export type Producible = "ok" | "falta" | "sem_ficha";

interface BomLine { insumo_id: string; qpu: number; unit: string }

function useAllBoms() {
  return useQuery({
    queryKey: ["ops", "all-bom"],
    queryFn: async (): Promise<Map<string, BomLine[]>> => {
      const res = await db.from("mrp_bom").select("product_id, insumo_id, quantity_per_unit, unit");
      if (res.error) throw res.error;
      const map = new Map<string, BomLine[]>();
      for (const r of res.data ?? []) {
        const arr = map.get(r.product_id) ?? [];
        arr.push({ insumo_id: r.insumo_id, qpu: Number(r.quantity_per_unit) || 0, unit: r.unit || "un" });
        map.set(r.product_id, arr);
      }
      return map;
    },
  });
}

export function useProducibility() {
  const { data: products = [] } = useMrpProducts();
  const { data: bomByProduct } = useAllBoms();

  return useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const boms = bomByProduct ?? new Map<string, BomLine[]>();

    const hubStock = (insumoId: string) =>
      byId.get(insumoId)?.hubs.find((h) => h.warehouse_name === HUB_RN)?.quantity ?? 0;

    // Todas as linhas têm estoque suficiente? (converte unidade da BOM → estoque)
    const linesOk = (lines: { insumoId: string; qtyBom: number; unit: string }[]) =>
      lines.every((l) => {
        const stockUnit = byId.get(l.insumoId)?.stock_unit || l.unit || "un";
        const need = convertUnit(l.qtyBom, l.unit || stockUnit, stockUnit) ?? l.qtyBom;
        return hubStock(l.insumoId) >= need;
      });

    const directLines = (productId: string, qty: number) =>
      (boms.get(productId) ?? []).map((b) => ({ insumoId: b.insumo_id, qtyBom: b.qpu * qty, unit: b.unit }));

    // Explode o semi-acabado (rota "do zero").
    const zeroLines = (productId: string, qty: number) => {
      const bom = boms.get(productId) ?? [];
      const out: { insumoId: string; qtyBom: number; unit: string }[] = [];
      for (const b of bom) {
        if (byId.get(b.insumo_id)?.category === "Semi-acabado") {
          const semiQty = b.qpu * qty;
          for (const s of boms.get(b.insumo_id) ?? []) out.push({ insumoId: s.insumo_id, qtyBom: s.qpu * semiQty, unit: s.unit });
        } else {
          out.push({ insumoId: b.insumo_id, qtyBom: b.qpu * qty, unit: b.unit });
        }
      }
      return out;
    };

    const hasSemi = (productId: string) =>
      (boms.get(productId) ?? []).some((b) => byId.get(b.insumo_id)?.category === "Semi-acabado");

    const check = (productId: string | null, qty: number, route?: ProductionRoute): Producible => {
      if (!productId || !boms.get(productId)?.length) return "sem_ficha";
      if (route === "zero") return linesOk(zeroLines(productId, qty)) ? "ok" : "falta";
      if (route === "rotular") return linesOk(directLines(productId, qty)) ? "ok" : "falta";
      // Sem rota definida: produzível se qualquer caminho fecha.
      if (linesOk(directLines(productId, qty))) return "ok";
      if (hasSemi(productId) && linesOk(zeroLines(productId, qty))) return "ok";
      return "falta";
    };

    // id do semi-acabado (Envasado) que compõe o produto, ou null.
    const semiOf = (productId: string | null): string | null => {
      if (!productId) return null;
      const line = (boms.get(productId) ?? []).find((b) => byId.get(b.insumo_id)?.category === "Semi-acabado");
      return line?.insumo_id ?? null;
    };

    // LE: insumos-gargalo — sem estoque no HUB-RN e usados (explodindo semi) por
    // ≥2 produtos finais/semi. Um só em falta trava várias produções.
    const rawSetOf = (productId: string): Set<string> => {
      const out = new Set<string>();
      for (const b of boms.get(productId) ?? []) {
        if (byId.get(b.insumo_id)?.category === "Semi-acabado") {
          for (const s of boms.get(b.insumo_id) ?? []) out.add(s.insumo_id);
        } else out.add(b.insumo_id);
      }
      return out;
    };
    const reverse = new Map<string, number>();
    for (const p of products) {
      if (p.category !== "Produto Final" && p.category !== "Semi-acabado") continue;
      for (const ins of rawSetOf(p.id)) reverse.set(ins, (reverse.get(ins) ?? 0) + 1);
    }
    const bottlenecks = [...reverse.entries()]
      .filter(([ins, cnt]) => cnt >= 2 && hubStock(ins) <= 0)
      .map(([ins, cnt]) => ({ insumoId: ins, name: byId.get(ins)?.name ?? "—", affected: cnt }))
      .sort((a, b) => b.affected - a.affected);

    return { check, semiOf, bottlenecks };
  }, [products, bomByProduct]);
}
