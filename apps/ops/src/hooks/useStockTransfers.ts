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
  fromNome: string;
  toCode: string;
  toNome: string;
  /** 'hub' | 'vendedor' — a caixa do vendedor tem regra de aceite própria. */
  toKind: string;
  toDonoId: string | null;
  enviado: string;       // created_at ISO
  nota: string | null;
  status: TransferStatus;
  /** ⚠️ Quem registrou e quem ACEITOU. As duas colunas existiam no banco desde
   *  a 20260710310000 e nunca apareceram em tela nenhuma — envio sem autor é
   *  envio que ninguém responde por. */
  registradoPor: string | null;
  aceitoPor: string | null;
  aceitoEm: string | null;
}

const RAW_TO_STATUS = (raw: string): TransferStatus =>
  raw === "executed" ? "entregue" : raw === "cancelled" || raw === "rejected" ? "estornado" : "em_transito";

export function useStockTransfers() {
  return useQuery({
    queryKey: ["ops", "stock-transfers"],
    queryFn: async (): Promise<Transfer[]> => {
      // ⚠️ UMA consulta à view `carbo_transferencias`, não três tabelas + dois
      // `Map` no navegador. A junção mora no banco (migração 20260944) porque
      // ela precisa dos mesmos nomes na tela de envio e na de recebimento —
      // duas montagens da mesma junção divergem sem dar erro.
      const { data, error } = await db
        .from("carbo_transferencias")
        .select("*")
        .order("enviado_em", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        product_id: t.product_id as string,
        produto: (t.produto as string) ?? "—",
        product_code: (t.product_code as string) ?? "",
        qtd: Number(t.qtd) || 0,
        unidade: (t.unidade as string) ?? "un",
        fromCode: (t.origem_code as string) ?? "",
        fromNome: (t.origem_nome as string) ?? "",
        toCode: (t.destino_code as string) ?? "",
        toNome: (t.destino_nome as string) ?? "",
        toKind: (t.destino_kind as string) ?? "hub",
        toDonoId: (t.destino_dono_id as string) ?? null,
        enviado: t.enviado_em as string,
        nota: (t.notes as string) ?? null,
        status: RAW_TO_STATUS((t.status as string) ?? "approved"),
        registradoPor: (t.registrado_por_nome as string) ?? null,
        aceitoPor: (t.aceito_por_nome as string) ?? null,
        aceitoEm: (t.aceito_em as string) ?? null,
      }));
    },
  });
}

/** Os estoques que podem ser origem ou destino: hubs + caixas de vendedor. */
export interface EstoqueOpcao {
  id: string; code: string; name: string; kind: string;
  owner_id: string | null; dono_nome: string | null;
}

export function useEstoques() {
  return useQuery({
    queryKey: ["ops", "estoques"],
    queryFn: async (): Promise<EstoqueOpcao[]> => {
      const { data, error } = await db.from("carbo_estoques").select("*").order("kind").order("name");
      if (error) throw error;
      return (data ?? []) as EstoqueOpcao[];
    },
  });
}

export interface RegisterEnvioArgs {
  productId: string;
  productCode: string;
  /** ⚠️ Código do warehouse de ORIGEM. Era fixo em HUB-RN dentro da RPC até a
   *  migração 20260944 — a tela não podia escolher porque o banco não deixava. */
  fromCode: string;
  toCode: string;
  quantity: number;
  notes?: string;
}

export function useRegisterEnvio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, productCode, fromCode, toCode, quantity, notes }: RegisterEnvioArgs) => {
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantidade inválida.");
      if (fromCode === toCode) throw new Error("Origem e destino são o mesmo estoque.");
      const { data: auth } = await db.auth.getUser();
      // Débito da origem + registro + movimento numa transação única no banco.
      const rr = await db.rpc("ops_transfer_register", {
        p_product_id: productId,
        p_product_code: productCode,
        p_from_code: fromCode,
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
      qc.invalidateQueries({ queryKey: ["ops", "vendedor-estoque"] });
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
      qc.invalidateQueries({ queryKey: ["ops", "vendedor-estoque"] });
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
      qc.invalidateQueries({ queryKey: ["ops", "vendedor-estoque"] });
    },
  });
}
