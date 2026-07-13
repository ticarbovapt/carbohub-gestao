import { useEffect } from "react";
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

export type ProductionRoute = "rotular" | "zero" | null;

// Etapas "antes da separação" (ou cancelamento) → disparam estorno dos insumos.
const BACKWARD_STATUSES = new Set<OpStatus>(["rascunho", "planejada", "aguardando_separacao", "cancelada"]);

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
  production_route: ProductionRoute;
  created_at: string | null;
  updated_at: string | null; // última mudança (proxy de "recém-concluída/atualizada")
  stage_since: string | null; // quando entrou na etapa atual → "parado há X"
  customer_name: string | null; // cliente do pedido de venda (OP vinda do pós-venda)
  source_order_id: string | null; // pedido de origem (pós-venda) → trava a quantidade
}

export function useProductionOrders() {
  return useQuery({
    queryKey: ["ops", "production-orders"],
    queryFn: async (): Promise<OpRow[]> => {
      const res = await db
        .from("production_orders")
        .select("id, op_number, sku_id, product_id, planned_quantity, good_quantity, rejected_quantity, priority, op_status, demand_source, need_date, product_code, source_order_id, production_route, created_at, updated_at, stage_since, customer_name")
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      const rows = res.data ?? [];

      // Produção é ancorada em mrp_products; mantemos o fallback de sku por compat
      // com OPs antigas. Resolve os dois catálogos para exibir código/nome no card.
      const skuIds = [...new Set(rows.map((r: any) => r.sku_id).filter(Boolean))];
      const prodIds = [...new Set(rows.map((r: any) => r.product_id).filter(Boolean))];
      const orderIds = [...new Set(rows.map((r: any) => r.source_order_id).filter(Boolean))];
      const [skuRes, prodRes, orderRes] = await Promise.all([
        skuIds.length ? db.from("sku").select("id, code, name").in("id", skuIds) : Promise.resolve({ data: [] }),
        prodIds.length ? db.from("mrp_products").select("id, product_code, name").in("id", prodIds) : Promise.resolve({ data: [] }),
        orderIds.length ? db.from("carboze_orders").select("id, customer_name").in("id", orderIds) : Promise.resolve({ data: [] }),
      ]);
      const skuMap = new Map((skuRes.data ?? []).map((s: any) => [s.id, { code: s.code, name: s.name }]));
      const prodMap = new Map((prodRes.data ?? []).map((p: any) => [p.id, { code: p.product_code, name: p.name }]));
      const custMap = new Map((orderRes.data ?? []).map((o: any) => [o.id, o.customer_name as string | null]));

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
          production_route: (r.production_route ?? null) as ProductionRoute,
          created_at: r.created_at ?? null,
          updated_at: r.updated_at ?? null,
          stage_since: r.stage_since ?? null,
          customer_name: (r.customer_name || custMap.get(r.source_order_id) || null) as string | null,
          source_order_id: r.source_order_id ?? null,
        };
      });
    },
  });
}

// Tempo real do kanban de produção: mover card reflete na tela de todos os
// logados ao vivo (sistema compartilhado). Assina production_orders e invalida
// as queries do quadro + acompanhamentos.
export function useProductionRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const inval = () => {
      qc.invalidateQueries({ queryKey: ["ops", "production-orders"] });
      qc.invalidateQueries({ queryKey: ["ops", "op-by-order"] });
      qc.invalidateQueries({ queryKey: ["ops", "op-moves"] });
      qc.invalidateQueries({ queryKey: ["ops", "production-dashboard"] });
      qc.invalidateQueries({ queryKey: ["ops", "pos-venda"] });
    };
    const ch = supabase
      .channel("ops-production-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "production_orders" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "production_order_moves" }, inval)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
}

// Última movimentação de cada OP (quem moveu, quando) — para exibir no card.
export interface OpMove { movedByName: string | null; movedAt: string; }
export function useLastOpMoves(opIds: string[], enabled: boolean) {
  const ids = [...new Set(opIds.filter(Boolean))] as string[];
  return useQuery({
    queryKey: ["ops", "op-moves", [...ids].sort()],
    enabled: enabled && ids.length > 0,
    queryFn: async (): Promise<Record<string, OpMove>> => {
      const res = await db
        .from("production_order_moves")
        .select("op_id, moved_by, moved_at")
        .in("op_id", ids)
        .order("moved_at", { ascending: false });
      const latest: Record<string, { moved_by: string | null; moved_at: string }> = {};
      for (const r of (res.data ?? [])) if (!latest[r.op_id]) latest[r.op_id] = { moved_by: r.moved_by, moved_at: r.moved_at };
      const uids = [...new Set(Object.values(latest).map((r) => r.moved_by).filter(Boolean))] as string[];
      const nameMap = new Map<string, string>();
      if (uids.length) {
        const p = await db.from("profiles").select("id, full_name").in("id", uids);
        for (const x of (p.data ?? [])) nameMap.set(x.id, x.full_name);
      }
      const map: Record<string, OpMove> = {};
      for (const [oid, r] of Object.entries(latest)) map[oid] = { movedByName: (r.moved_by && nameMap.get(r.moved_by)) || null, movedAt: r.moved_at };
      return map;
    },
    refetchInterval: 60_000,
  });
}

// Histórico completo de movimentações de UMA OP (timeline no detalhe).
export interface OpMoveRow { id: string; from_status: string | null; to_status: string | null; movedByName: string | null; movedAt: string; }
export function useOpMoveHistory(opId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["ops", "op-history", opId],
    enabled: enabled && !!opId,
    queryFn: async (): Promise<OpMoveRow[]> => {
      const res = await db
        .from("production_order_moves")
        .select("id, from_status, to_status, moved_by, moved_at")
        .eq("op_id", opId).order("moved_at", { ascending: false });
      const rows = res.data ?? [];
      const uids = [...new Set(rows.map((r: any) => r.moved_by).filter(Boolean))] as string[];
      const nameMap = new Map<string, string>();
      if (uids.length) {
        const p = await db.from("profiles").select("id, full_name").in("id", uids);
        for (const x of (p.data ?? [])) nameMap.set(x.id, x.full_name);
      }
      return rows.map((r: any) => ({
        id: r.id, from_status: r.from_status, to_status: r.to_status,
        movedByName: (r.moved_by && nameMap.get(r.moved_by)) || null, movedAt: r.moved_at,
      }));
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
  customerName?: string;
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
  customerName?: string;
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
        customer_name: p.customerName?.trim() || null,
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
      if (p.plannedQuantity != null) {
        if (!Number.isFinite(p.plannedQuantity) || p.plannedQuantity <= 0) throw new Error("Quantidade planejada deve ser maior que zero.");
        updates.planned_quantity = p.plannedQuantity; updates.quantity = p.plannedQuantity;
      }
      if (p.priority != null) updates.priority = p.priority;
      if (p.demandSource != null) updates.demand_source = p.demandSource || null;
      if (p.needDate !== undefined) updates.need_date = p.needDate || null;
      if (p.notes !== undefined) updates.deviation_notes = p.notes.trim() || null;
      if (p.customerName !== undefined) updates.customer_name = p.customerName.trim() || null;
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
    mutationFn: async (p: { id: string; op_status: OpStatus; route?: ProductionRoute }) => {
      const patch: Record<string, unknown> = { op_status: p.op_status };
      // Grava a rota escolhida (só rotular / do zero) ANTES da baixa — a função de
      // dedução no banco lê production_route pra saber se explode o semi-acabado.
      if (p.route !== undefined) patch.production_route = p.route;
      const res = await db.from("production_orders").update(patch).eq("id", p.id);
      if (res.error) throw res.error;
      // Movimentação de estoque — erros PROPAGAM (nada de toast de sucesso falso).
      // Conclusão NÃO passa por aqui (vai pela mutation `conclude` → op_conclude).
      if (p.op_status === "separada") {
        const rr = await db.rpc("op_deduct_materials", { p_op_id: p.id });
        if (rr.error) throw rr.error;
      } else if (BACKWARD_STATUSES.has(p.op_status)) {
        // Voltou/cancelou → estorna EXATAMENTE o que foi movido (ledger).
        const rr = await db.rpc("op_reverse_all", { p_op_id: p.id });
        if (rr.error) throw rr.error;
      }
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["ops", "pos-venda"] });
      qc.invalidateQueries({ queryKey: ["ops", "hubrn-stock"] });
      qc.invalidateQueries({ queryKey: ["ops", "mrp-products"] });
    },
  });

  // Conclui a OP com consumo real dos insumos → registra perdas + reconcilia estoque
  // + credita o produto (via RPC op_conclude, idempotente).
  const conclude = useMutation({
    mutationFn: async (p: {
      id: string; good: number; rejected: number;
      consumption: { insumo_id: string; actual_qty: number; theoretical_qty: number; deducted_qty: number; unit: string }[];
    }) => {
      const res = await db.rpc("op_conclude", {
        p_op_id: p.id, p_good: p.good, p_rejected: p.rejected, p_consumption: p.consumption,
      });
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["ops", "pos-venda"] });
      qc.invalidateQueries({ queryKey: ["ops", "hubrn-stock"] });
      qc.invalidateQueries({ queryKey: ["ops", "mrp-products"] });
      qc.invalidateQueries({ queryKey: ["ops", "material-loss"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Estorna o estoque movido pela OP ANTES de excluir (senão os insumos
      // deduzidos na separação sumiriam do HUB-RN pra sempre).
      const rr = await db.rpc("op_reverse_all", { p_op_id: id });
      if (rr.error) throw rr.error;
      const res = await db.from("production_orders").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["ops", "hubrn-stock"] });
      qc.invalidateQueries({ queryKey: ["ops", "mrp-products"] });
    },
  });

  return { create, update, confirm, setStatus, conclude, remove };
}
