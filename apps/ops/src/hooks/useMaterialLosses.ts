import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Perdas de insumo na produção (op_material_loss), agregadas por insumo.
//  Base do acompanhamento de perdas — quais itens mais se perdem na fábrica.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface MaterialLoss {
  insumo_id: string;
  name: string;
  code: string;
  unit: string;
  total_loss: number;   // soma das perdas
  total_used: number;    // soma do usado (real)
  total_theoretical: number; // soma do previsto
  occurrences: number;   // nº de OPs que perderam esse insumo
  loss_pct: number;      // perda / previsto (%)
}

export function useMaterialLosses() {
  return useQuery({
    queryKey: ["ops", "material-loss"],
    queryFn: async (): Promise<MaterialLoss[]> => {
      const res = await db
        .from("op_material_loss")
        .select("insumo_id, loss_qty, actual_qty, theoretical_qty, unit, produto:mrp_products(name, product_code)");
      if (res.error) throw res.error;

      const byInsumo = new Map<string, MaterialLoss>();
      for (const r of res.data ?? []) {
        const loss = Number(r.loss_qty) || 0;
        const cur = byInsumo.get(r.insumo_id) ?? {
          insumo_id: r.insumo_id,
          name: r.produto?.name ?? "—",
          code: r.produto?.product_code ?? "",
          unit: r.unit ?? "un",
          total_loss: 0, total_used: 0, total_theoretical: 0, occurrences: 0, loss_pct: 0,
        };
        cur.total_loss += loss;
        cur.total_used += Number(r.actual_qty) || 0;
        cur.total_theoretical += Number(r.theoretical_qty) || 0;
        if (loss > 0) cur.occurrences += 1;
        byInsumo.set(r.insumo_id, cur);
      }
      const list = [...byInsumo.values()].map((m) => ({
        ...m,
        loss_pct: m.total_theoretical > 0 ? (m.total_loss / m.total_theoretical) * 100 : 0,
      }));
      return list.filter((m) => m.total_loss > 0).sort((a, b) => b.total_loss - a.total_loss);
    },
  });
}
