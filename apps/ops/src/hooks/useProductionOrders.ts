import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Ordens de Produção (production_orders) — ler / criar / editar / excluir.
//  • Tabela COMPARTILHADA com o controle. RLS já permite funcionário (is_employee)
//    via policy "Employees can manage production_orders" — não mexer em RLS aqui.
//  • op_number é gerado por trigger no banco; product_id é nullable; mantemos os
//    campos legados (product_code/quantity/status) por compat com o schema antigo.
//  • Confirmação aqui registra resultado (good/rejected + status) SEM baixa de
//    insumos/estoque — a explosão de BOM e movimentação ficam para fase futura.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type OpStatus =
  | "rascunho" | "planejada" | "aguardando_separacao" | "separada" | "aguardando_liberacao"
  | "liberada_producao" | "em_producao" | "envase" | "rotulagem" | "aguardando_confirmacao" | "confirmada"
  | "aguardando_qualidade" | "qualidade_aprovada" | "liberada" | "concluida" | "bloqueada" | "cancelada";

export interface OpRow {
  id: string;
  op_number: string;
  sku_id: string | null;
  product_id: string | null;
  sku_code: string;
  sku_name: string;
  planned_quantity: number;
  good_quantity: number | null;
  rejected_quantity: number | null;
  priority: number;
  op_status: OpStatus;
  demand_source: string;
  need_date: string | null;
}

export function useProductionOrders() {
  return useQuery({
    queryKey: ["ops", "production-orders"],
    queryFn: async (): Promise<OpRow[]> => {
      const res = await db
        .from("production_orders")
        .select("id, op_number, sku_id, product_id, planned_quantity, good_quantity, rejected_quantity, priority, op_status, demand_source, need_date, product_code, source_order_id")
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      const rows = res.data ?? [];

      // Produção é ancorada em mrp_products; mantemos o fallback de sku por compat
      // com OPs antigas. Resolve os dois catálogos para exibir código/nome no card.
      const skuIds = [...new Set(rows.map((r: any) => r.sku_id).filter(Boolean))];
      const prodIds = [...new Set(rows.map((r: any) => r.product_id).filter(Boolean))];
      const [skuRes, prodRes] = await Promise.all([
        skuIds.length ? db.from("sku").select("id, code, name").in("id", skuIds) : Promise.resolve({ data: [] }),
        prodIds.length ? db.from("mrp_products").select("id, product_code, name").in("id", prodIds) : Promise.resolve({ data: [] }),
      ]);
      const skuMap = new Map((skuRes.data ?? []).map((s: any) => [s.id, { code: s.code, name: s.name }]));
      const prodMap = new Map((prodRes.data ?? []).map((p: any) => [p.id, { code: p.product_code, name: p.name }]));

      return rows.map((r: any) => {
        const ref = prodMap.get(r.product_id) ?? skuMap.get(r.sku_id) as { code: string; name: string } | undefined;
        // Sem produto/SKU vinculado (ex.: OP legada), mostra o product_code
        // (nome do item / rótulo do pedido) para o card não ficar "—".
        return {
          id: r.id,
          op_number: r.op_number ?? "—",
          sku_id: r.sku_id ?? null,
          product_id: r.product_id ?? null,
          sku_code: ref?.code ?? (r.product_code || "—"),
          sku_name: ref?.name ?? (r.product_code || "—"),
          planned_quantity: Number(r.planned_quantity) || 0,
          good_quantity: r.good_quantity ?? null,
          rejected_quantity: r.rejected_quantity ?? null,
          priority: Number(r.priority) || 3,
          op_status: (r.op_status ?? "rascunho") as OpStatus,
          demand_source: r.demand_source ?? "",
          need_date: r.need_date ? String(r.need_date).slice(0, 10) : null,
        };
      });
    },
  });
}

export interface CreateOpInput {
  productId: string;
  productName: string;
  plannedQuantity: number;
  priority: number;
  demandSource: string;
  needDate: string;
  notes: string;
}

export interface UpdateOpInput {
  id: string;
  productId?: string;
  productName?: string;
  plannedQuantity?: number;
  priority?: number;
  demandSource?: string;
  needDate?: string | null;
  notes?: string;
}

export function useProductionOrderMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ops", "production-orders"] });

  const create = useMutation({
    mutationFn: async (p: CreateOpInput) => {
      if (!p.productId) throw new Error("Selecione o produto.");
      const qty = Number(p.plannedQuantity) || 0;
      if (qty <= 0) throw new Error("Quantidade planejada deve ser maior que zero.");
      const res = await db.from("production_orders").insert({
        // Ancoragem em mrp_products (sku_id fica nulo — ver CLAUDE.md/produção).
        product_id: p.productId,
        sku_id: null,
        planned_quantity: qty,
        op_status: "planejada",
        demand_source: p.demandSource || "pcp_manual",
        need_date: p.needDate || null,
        priority: p.priority ?? 3,
        deviation_notes: p.notes.trim() || null,
        quality_result: "pendente",
        // campos legados exigidos pelo schema original
        product_code: p.productName,
        quantity: qty,
        status: "pending",
      });
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (p: UpdateOpInput) => {
      const updates: Record<string, unknown> = {};
      if (p.productId) { updates.product_id = p.productId; updates.sku_id = null; if (p.productName) updates.product_code = p.productName; }
      if (p.plannedQuantity != null) { updates.planned_quantity = p.plannedQuantity; updates.quantity = p.plannedQuantity; }
      if (p.priority != null) updates.priority = p.priority;
      if (p.demandSource != null) updates.demand_source = p.demandSource || null;
      if (p.needDate !== undefined) updates.need_date = p.needDate || null;
      if (p.notes !== undefined) updates.deviation_notes = p.notes.trim() || null;
      const res = await db.from("production_orders").update(updates).eq("id", p.id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  // Registra o resultado da produção (sem baixa de estoque). NÃO mexe no pós-venda
  // aqui — a sinalização acontece quando a OP é CONCLUÍDA (setStatus abaixo).
  const confirm = useMutation({
    mutationFn: async (p: { id: string; goodQuantity: number; rejectedQuantity: number; deviationNotes: string }) => {
      const res = await db.from("production_orders").update({
        good_quantity: p.goodQuantity,
        rejected_quantity: p.rejectedQuantity,
        op_status: "confirmada",
        deviation_notes: p.deviationNotes.trim() || null,
        finished_at: new Date().toISOString(),
      }).eq("id", p.id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  // Muda o status da OP (mover no kanban) e dispara a movimentação de estoque:
  //   • "separada"  → DEDUZ os insumos do HUB-RN (mrp_bom × qtd). Idempotente.
  //   • "concluida" → CREDITA o produto: se veio do pós-venda (source_order_id),
  //     credita pelos itens do pedido + marca PRODUZIDO; senão credita o Produto
  //     Final da OP. O card do pós-venda não se move sozinho — alguém confere.
  const setStatus = useMutation({
    mutationFn: async (p: { id: string; op_status: OpStatus }) => {
      const res = await db.from("production_orders").update({ op_status: p.op_status }).eq("id", p.id);
      if (res.error) throw res.error;
      try {
        if (p.op_status === "separada") {
          await db.rpc("op_deduct_materials", { p_op_id: p.id });
        } else if (p.op_status === "concluida") {
          const op = await db.from("production_orders").select("source_order_id").eq("id", p.id).single();
          const orderId = op.data?.source_order_id;
          if (orderId) {
            await db.rpc("pos_venda_credit_stock", { p_order_id: orderId });
          } else {
            await db.rpc("op_credit_product", { p_op_id: p.id });
          }
        }
      } catch (e) { console.error("[op-status] falha na movimentação de estoque:", e); }
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["ops", "pos-venda"] });
      qc.invalidateQueries({ queryKey: ["ops", "hubrn-stock"] });
      qc.invalidateQueries({ queryKey: ["ops", "mrp-products"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("production_orders").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, update, confirm, setStatus, remove };
}
