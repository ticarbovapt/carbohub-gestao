import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Transferências entre hubs (Carbo Ops) — Envios RN→SP / RN→SP-Vendas.
//  Lógica NOVA, toda em warehouse_stock (sem mrp_products.current_stock_qty nem
//  o trigger de sugestão do controle):
//   • REGISTRAR: valida saldo no RN, DEBITA o RN na hora, cria stock_transfers
//     status='approved' (pre_debited=true).
//   • CONFIRMAR CHEGADA: status approved→executed (condicional = anti-duplo) e
//     CREDITA o destino.
//   • ESTORNAR: status approved→cancelled e devolve a qtd ao RN.
//  RLS: stock_transfers/warehouse_stock abertos a autenticado (migrations Ops).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
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

async function resolveWarehouseId(code: string): Promise<string> {
  const wh = await db.from("warehouses").select("id").eq("code", code).maybeSingle();
  if (wh.error) throw wh.error;
  if (!wh.data?.id) throw new Error(`Centro de distribuição não encontrado (${code}).`);
  return wh.data.id as string;
}

async function getQty(warehouseId: string, productId: string): Promise<number> {
  const row = await db
    .from("warehouse_stock")
    .select("quantity")
    .eq("warehouse_id", warehouseId)
    .eq("product_id", productId)
    .maybeSingle();
  if (row.error) throw row.error;
  return Number(row.data?.quantity) || 0;
}

async function setQty(warehouseId: string, productId: string, quantity: number) {
  const up = await db.from("warehouse_stock").upsert(
    { warehouse_id: warehouseId, product_id: productId, quantity, updated_at: new Date().toISOString() },
    { onConflict: "warehouse_id,product_id" },
  );
  if (up.error) throw up.error;
}

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

const FROM_CODE = "HUB-RN"; // origem dos envios = Hub Natal

export function useRegisterEnvio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, productCode, toCode, quantity, notes }: RegisterEnvioArgs) => {
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantidade inválida.");
      const [fromId, toId] = await Promise.all([resolveWarehouseId(FROM_CODE), resolveWarehouseId(toCode)]);

      // Valida e debita o RN na hora (pre_debited).
      const current = await getQty(fromId, productId);
      if (quantity > current) throw new Error(`Saldo insuficiente no Hub Natal (disponível: ${current}).`);
      await setQty(fromId, productId, current - quantity);

      const { data: auth } = await db.auth.getUser();
      const ins = await db.from("stock_transfers").insert({
        product_id: productId,
        product_code: productCode,
        from_hub: fromId,
        to_hub: toId,
        quantity,
        status: "approved",
        pre_debited: true,
        approved_by: auth?.user?.id ?? null,
        approved_at: new Date().toISOString(),
        notes: notes || null,
      });
      if (ins.error) throw ins.error;
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
      // Condicional a status='approved' → anti-duplo-crédito.
      const upd = await db
        .from("stock_transfers")
        .update({ status: "executed", executed_by: auth?.user?.id ?? null, executed_at: new Date().toISOString() })
        .eq("id", transferId)
        .eq("status", "approved")
        .select("to_hub, product_id, quantity");
      if (upd.error) throw upd.error;
      const row = upd.data?.[0];
      if (!row) throw new Error("Envio já confirmado ou cancelado.");
      // Credita o destino.
      const current = await getQty(row.to_hub, row.product_id);
      await setQty(row.to_hub, row.product_id, current + (Number(row.quantity) || 0));
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
      const upd = await db
        .from("stock_transfers")
        .update({ status: "cancelled" })
        .eq("id", transferId)
        .eq("status", "approved")
        .select("from_hub, product_id, quantity, pre_debited");
      if (upd.error) throw upd.error;
      const row = upd.data?.[0];
      if (!row) throw new Error("Envio já confirmado ou cancelado.");
      // Devolve ao RN se o saldo foi debitado na criação.
      if (row.pre_debited) {
        const current = await getQty(row.from_hub, row.product_id);
        await setQty(row.from_hub, row.product_id, current + (Number(row.quantity) || 0));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
    },
  });
}
