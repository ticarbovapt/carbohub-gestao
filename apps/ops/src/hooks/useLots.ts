import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Lotes de reagente (inventory_lot) — ler / criar / editar / excluir.
//  • Tabela COMPARTILHADA com o controle. RLS já permite funcionário via
//    "Employees can manage inventory_lot" — não mexer em RLS aqui.
//  • lot_code é gerado por trigger; available_volume_ml inicia = initial_volume_ml.
//  • product_id → mrp_products; supplier_id → suppliers (tabela legada, não mrp_suppliers).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export type LotStatus =
  | "criado" | "recebido" | "em_quarentena" | "amostrado"
  | "aprovado" | "bloqueado" | "reprovado" | "encerrado";

export interface LotRow {
  id: string;
  lot_code: string;
  product_id: string;
  product_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  initial_volume_ml: number;
  available_volume_ml: number;
  status: LotStatus;
  collected_samples: number;
  expected_samples: number;
  received_at: string | null;
  expired_at: string | null;
  notes: string | null;
}

export function useLots() {
  return useQuery({
    queryKey: ["ops", "inventory-lots"],
    queryFn: async (): Promise<LotRow[]> => {
      const res = await db
        .from("inventory_lot")
        .select("id, lot_code, product_id, supplier_id, initial_volume_ml, available_volume_ml, status, collected_samples, expected_samples, received_at, expired_at, notes")
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      const rows = res.data ?? [];

      const productIds = [...new Set(rows.map((l: any) => l.product_id).filter(Boolean))];
      const supplierIds = [...new Set(rows.map((l: any) => l.supplier_id).filter(Boolean))];
      const [prodRes, supRes] = await Promise.all([
        productIds.length ? db.from("mrp_products").select("id, name").in("id", productIds) : { data: [] },
        supplierIds.length ? db.from("suppliers").select("id, name").in("id", supplierIds) : { data: [] },
      ]);
      const prodMap = new Map((prodRes.data ?? []).map((p: any) => [p.id, p.name]));
      const supMap = new Map((supRes.data ?? []).map((s: any) => [s.id, s.name]));

      return rows.map((l: any) => ({
        id: l.id,
        lot_code: l.lot_code ?? "—",
        product_id: l.product_id,
        product_name: (prodMap.get(l.product_id) as string) ?? "—",
        supplier_id: l.supplier_id ?? null,
        supplier_name: l.supplier_id ? ((supMap.get(l.supplier_id) as string) ?? "—") : null,
        initial_volume_ml: Number(l.initial_volume_ml) || 0,
        available_volume_ml: Number(l.available_volume_ml) || 0,
        status: (l.status ?? "criado") as LotStatus,
        collected_samples: Number(l.collected_samples) || 0,
        expected_samples: Number(l.expected_samples) || 0,
        received_at: l.received_at ? String(l.received_at).slice(0, 10) : null,
        expired_at: l.expired_at ? String(l.expired_at).slice(0, 10) : null,
        notes: l.notes ?? null,
      }));
    },
  });
}

// Fornecedores da tabela legada `suppliers` (FK do lote).
export function useLotSuppliers() {
  return useQuery({
    queryKey: ["ops", "lot-suppliers"],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const res = await db.from("suppliers").select("id, name, is_active").order("name");
      if (res.error) throw res.error;
      return (res.data ?? []).filter((s: any) => s.is_active !== false).map((s: any) => ({ id: s.id, name: s.name }));
    },
  });
}

export interface CreateLotInput {
  productId: string;
  initialVolumeMl: number;
  supplierId: string;
  receivedAt: string;
  expiredAt: string;
  expectedSamples: number;
  notes: string;
}

export interface UpdateLotInput {
  id: string;
  expectedSamples?: number;
  receivedAt?: string | null;
  expiredAt?: string | null;
  notes?: string;
}

export function useLotMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ops", "inventory-lots"] });

  const create = useMutation({
    mutationFn: async (p: CreateLotInput) => {
      if (!p.productId) throw new Error("Selecione o produto.");
      const vol = Number(p.initialVolumeMl) || 0;
      if (vol <= 0) throw new Error("Volume inicial deve ser maior que zero.");
      const res = await db.from("inventory_lot").insert({
        product_id: p.productId,
        initial_volume_ml: vol,
        available_volume_ml: vol,
        status: "criado",
        supplier_id: p.supplierId || null,
        received_at: p.receivedAt || null,
        expired_at: p.expiredAt || null,
        expected_samples: p.expectedSamples ?? 3,
        notes: p.notes.trim() || null,
        lot_code: "", // gerado por trigger
      });
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (p: UpdateLotInput) => {
      const updates: Record<string, unknown> = {};
      if (p.expectedSamples != null) updates.expected_samples = p.expectedSamples;
      if (p.receivedAt !== undefined) updates.received_at = p.receivedAt || null;
      if (p.expiredAt !== undefined) updates.expired_at = p.expiredAt || null;
      if (p.notes !== undefined) updates.notes = p.notes.trim() || null;
      const res = await db.from("inventory_lot").update(updates).eq("id", p.id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("inventory_lot").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
