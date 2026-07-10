import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Transferências entre hubs (Carbo Ops) — Envios RN→SP / RN→SP-Vendas.
//  Toda a MUTAÇÃO de estoque roda em RPCs ATÔMICAS no banco (migration
//  20260710310000_ops_transfer_atomic), uma função = uma transação:
//   • REGISTRAR  → ops_transfer_register: valida saldo (FOR UPDATE), DEBITA o RN
//     por delta, cria stock_transfers (approved, pre_debited) e grava o
//     stock_movements — tudo junto (A9: sem débito órfão; A10: sem lost update).
//   • CONFIRMAR  → ops_transfer_confirm: flip approved→executed (anti-duplo) +
//     crédito relativo no destino + movimento de entrada.
//   • ESTORNAR   → ops_transfer_estorno: flip approved→cancelled + devolução ao RN.
//  Transferências agora aparecem no histórico/KPIs (C10).
//  RLS: stock_transfers/warehouse_stock abertos a autenticado (migrations Ops).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export type TransferStatus = "em_transito" | "entregue" | "estornado";

export interface Transfer {
  id: string;
  product_id: string;
  produto: string;
  product_code: string;
  qtd: number;
  unidade: string;
  fromCode: string;
  toCode: string;
  enviado: string;       // created_at ISO
  nota: string | null;
  status: TransferStatus;
}

const RAW_TO_STATUS = (raw: string): TransferStatus =>
  raw === "executed" ? "entregue" : raw === "cancelled" || raw === "rejected" ? "estornado" : "em_transito";

export function useStockTransfers() {
  return useQuery({
    queryKey: ["ops", "stock-transfers"],
    queryFn: async (): Promise<Transfer[]> => {
      const [transfers, warehouses, products] = await Promise.all([
        db
          .from("stock_transfers")
          .select("id, product_id, product_code, quantity, status, notes, created_at, from_hub, to_hub")
          .order("created_at", { ascending: false }),
        db.from("warehouses").select("id, code"),
        db.from("mrp_products").select("id, name, stock_unit"),
      ]);
      if (transfers.error) throw transfers.error;
      if (warehouses.error) throw warehouses.error;
      if (products.error) throw products.error;

      const codeById = new Map<string, string>();
      for (const w of warehouses.data ?? []) codeById.set(w.id, w.code);
      const prodById = new Map<string, { name: string; unit: string }>();
      for (const p of products.data ?? []) prodById.set(p.id, { name: p.name ?? "", unit: p.stock_unit ?? "un" });

      return (transfers.data ?? []).map((t: Record<string, unknown>) => {
        const p = prodById.get(t.product_id as string);
        return {
          id: t.id as string,
          product_id: t.product_id as string,
          produto: p?.name ?? "—",
          product_code: (t.product_code as string) ?? "",
          qtd: Number(t.quantity) || 0,
          unidade: p?.unit ?? "un",
          fromCode: codeById.get(t.from_hub as string) ?? "",
          toCode: codeById.get(t.to_hub as string) ?? "",
          enviado: t.created_at as string,
          nota: (t.notes as string) ?? null,
          status: RAW_TO_STATUS((t.status as string) ?? "approved"),
        };
      });
    },
  });
}

export interface RegisterEnvioArgs {
  productId: string;
  productCode: string;
  toCode: string;          // HUB-SP | HUB-SP-VENDAS
  quantity: number;
  notes?: string;
}

export function useRegisterEnvio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, productCode, toCode, quantity, notes }: RegisterEnvioArgs) => {
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantidade inválida.");
      const { data: auth } = await db.auth.getUser();
      // Débito do RN + registro + movimento numa transação única no banco.
      const rr = await db.rpc("ops_transfer_register", {
        p_product_id: productId,
        p_product_code: productCode,
        p_to_code: toCode,
        p_qty: quantity,
        p_notes: notes || null,
        p_user: auth?.user?.id ?? null,
      });
      if (rr.error) throw rr.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
    },
  });
}

export function useConfirmChegada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: string) => {
      const { data: auth } = await db.auth.getUser();
      // Flip approved→executed + crédito no destino + movimento, atômico no banco.
      const rr = await db.rpc("ops_transfer_confirm", { p_transfer_id: transferId, p_user: auth?.user?.id ?? null });
      if (rr.error) throw rr.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
    },
  });
}

export function useEstornarEnvio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: string) => {
      const { data: auth } = await db.auth.getUser();
      // Flip approved→cancelled + devolução ao RN, atômico no banco.
      const rr = await db.rpc("ops_transfer_estorno", { p_transfer_id: transferId, p_user: auth?.user?.id ?? null });
      if (rr.error) throw rr.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
    },
  });
}
