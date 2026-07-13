import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Pós-venda: jornada das VENDAS MANUAIS (carboze_orders sem external_ref — as
// criadas no Carbo Sales/Ops). Pedidos de Bling/e-commerce têm fluxo próprio e
// não entram aqui. O Ops controla a etapa; o Sales só visualiza.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type FulfillmentStage =
  | "nova_venda" | "separacao_pendente" | "criar_op" | "separando" | "separado"
  | "gerar_nf" | "nf_finalizada"
  | "em_transporte" | "entregue" | "cancelado";

export const POSVENDA_STAGES: { key: FulfillmentStage; label: string; color: string }[] = [
  { key: "nova_venda",          label: "Nova Venda",              color: "#9333ea" },
  { key: "separacao_pendente",  label: "Pedido Recebido",         color: "#f59e0b" },
  { key: "criar_op",            label: "Criar Ordem de Produção", color: "#ec4899" },
  { key: "separando",           label: "Em Separação",            color: "#3b82f6" },
  { key: "separado",            label: "Separado",                color: "#8b5cf6" },
  { key: "gerar_nf",            label: "Gerar Nota Fiscal",       color: "#f43f5e" },
  { key: "nf_finalizada",       label: "NF Finalizada",           color: "#14b8a6" },
  { key: "em_transporte",       label: "Em Transporte",           color: "#06b6d4" },
  { key: "entregue",            label: "Entregue",                color: "#10b981" },
  { key: "cancelado",           label: "Cancelado",               color: "#ef4444" },
];

export interface PosVendaItem { name?: string; quantity?: number; unit_price?: number; total?: number; product_id?: string | null; product_code?: string | null; }

// Estoque do HUB-RN (Natal) por produto — fonte de verdade warehouse_stock.
// Usado no portão do pós-venda: compara a quantidade do item com o disponível.
export function useHubRnStock(productIds: string[], enabled: boolean) {
  const ids = [...new Set(productIds.filter(Boolean))] as string[];
  return useQuery({
    queryKey: ["ops", "hubrn-stock", [...ids].sort()],
    enabled: enabled && ids.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const wh = await db.from("warehouses").select("id").eq("code", "HUB-RN").maybeSingle();
      const whId = wh.data?.id;
      if (!whId) return {};
      const st = await db
        .from("warehouse_stock").select("product_id, quantity")
        .eq("warehouse_id", whId).in("product_id", ids);
      const map: Record<string, number> = {};
      for (const r of (st.data ?? [])) map[r.product_id] = Number(r.quantity) || 0;
      return map;
    },
  });
}

export interface PosVendaOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  vendedor_name: string | null;
  vendedor_id: string | null;
  vendedor_avatar: string | null;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  notes: string | null;
  items: PosVendaItem[];
  created_at: string;
  fulfillment_stage: FulfillmentStage;
  production_done: boolean;   // OP concluída → aguardando alguém mover p/ Em Separação
  linha: string | null;
  bling_nf_id: number | null;      // NF vinculada (Faturamento/Bling) → NF finalizada
  invoice_number: string | null;   // nº da NF-e, quando emitida
}

const SELECT_BASE =
  "id, order_number, customer_name, customer_email, customer_phone, delivery_address, delivery_city, " +
  "delivery_state, delivery_zip, vendedor_name, vendedor_id, subtotal, shipping_cost, discount, total, " +
  "notes, items, created_at, fulfillment_stage, linha, bling_nf_id, invoice_number, status";
const SELECT_COLS = SELECT_BASE + ", production_done";

/** Todas as vendas manuais (visão de operações). */
export function usePosVendaOrders() {
  return useQuery({
    queryKey: ["ops", "pos-venda"],
    queryFn: async (): Promise<PosVendaOrder[]> => {
      const run = (cols: string) => db
        .from("carboze_orders")
        .select(cols)
        .is("external_ref", null)
        // Orçamento (status='quote') ainda não é venda — só entra no rastreio
        // quando vira venda de verdade lá no Sales/CRM. Mantém status nulo.
        .or("status.is.null,status.neq.quote")
        .order("created_at", { ascending: false })
        .limit(500);

      let { data, error } = await run(SELECT_COLS);
      // Resiliência: se a coluna production_done ainda não existir no banco
      // (migração não rodada), não quebra o quadro — tenta sem ela.
      if (error) {
        const fb = await run(SELECT_BASE);
        if (fb.error) throw fb.error;
        data = (fb.data || []).map((r: any) => ({ ...r, production_done: false }));
      }
      const list = (data || []) as PosVendaOrder[];

      // Enriquece com a foto do vendedor (profiles.avatar_url).
      const ids = [...new Set(list.map((o) => o.vendedor_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: profs } = await db.from("profiles").select("id, avatar_url").in("id", ids);
        const map = new Map((profs || []).map((p: any) => [p.id, p.avatar_url]));
        for (const o of list) o.vendedor_avatar = (o.vendedor_id && map.get(o.vendedor_id)) || null;
      }
      return list;
    },
    refetchInterval: 60_000,
  });
}

// Setor atual da OP no kanban de produção (para acompanhar no pós-venda).
const OP_SECTOR: Record<string, string> = {
  rascunho: "Pedidos", planejada: "Planejada",
  aguardando_separacao: "Separação", separada: "Separação",
  aguardando_liberacao: "Envase", liberada_producao: "Envase",
  em_producao: "Envase", envase: "Envase", rotulagem: "Rotulagem",
  aguardando_confirmacao: "Qualidade", confirmada: "Qualidade",
  aguardando_qualidade: "Qualidade", qualidade_aprovada: "Qualidade",
  liberada: "Qualidade", concluida: "Concluída",
  bloqueada: "Bloqueada", cancelada: "Cancelada",
};
export const opSector = (status?: string | null) => (status && OP_SECTOR[status]) || "Pedidos";

export interface OpBrief { op_status: string; op_number: string | null; }

/** OP vinculada a cada pedido (source_order_id) — para mostrar em que setor da
 *  produção o pedido está enquanto não é concluído. */
export function useOpsBySource(orderIds: string[], enabled: boolean) {
  const ids = [...new Set(orderIds.filter(Boolean))] as string[];
  return useQuery({
    queryKey: ["ops", "op-by-order", [...ids].sort()],
    enabled: enabled && ids.length > 0,
    queryFn: async (): Promise<Record<string, OpBrief>> => {
      const res = await db
        .from("production_orders").select("source_order_id, op_status, op_number")
        .in("source_order_id", ids);
      const map: Record<string, OpBrief> = {};
      for (const r of (res.data ?? [])) {
        if (r.source_order_id && !map[r.source_order_id]) {
          map[r.source_order_id] = { op_status: r.op_status, op_number: r.op_number };
        }
      }
      return map;
    },
    refetchInterval: 30_000,
  });
}

// Garante uma OP (production_orders) para o pedido que entrou em "Criar Ordem de
// Produção". Não duplica: se já existe OP vinculada ao pedido, não cria de novo.
// A OP nasce em "rascunho" (coluna Backlog do kanban de produção), vinculada ao
// pedido via source_order_id. sku_id fica nulo (o item da venda é texto livre; o
// PCP escolhe o SKU/BOM depois). Os campos legados (product_code/quantity/status)
// são exigidos pelo schema antigo.
async function ensureProductionOrderForOrder(orderId: string): Promise<boolean> {
  const existing = await db
    .from("production_orders").select("id").eq("source_order_id", orderId).limit(1);
  if (existing.data && existing.data.length) return false; // já tem OP → não duplica

  const ord = await db
    .from("carboze_orders")
    .select("order_number, customer_name, items")
    .eq("id", orderId).single();
  if (ord.error || !ord.data) throw ord.error ?? new Error("Pedido não encontrado");

  const items: any[] = Array.isArray(ord.data.items) ? ord.data.items : [];
  const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0) || 1;
  const label = items.length === 0
    ? `Pedido ${ord.data.order_number ?? ""}`.trim()
    : items.length === 1
      ? String(items[0].name ?? "Produto")
      : `${items.length} itens · pedido ${ord.data.order_number ?? ""}`.trim();

  // Pedido de um produto só → vincula o product_id (Produto Final do MRP) para o
  // check de materiais achar a BOM. Pedido com vários produtos fica sem vínculo
  // (uma OP não representa uma cesta de produtos distintos).
  const singleProductId = items.length === 1 ? (items[0].product_id || null) : null;

  const ins = await db.from("production_orders").insert({
    sku_id: null,
    product_id: singleProductId,
    planned_quantity: totalQty,
    op_status: "rascunho",           // → coluna Backlog
    demand_source: "venda",          // enum fixo; a origem pós-venda fica em deviation_notes + source_order_id
    priority: 3,
    quality_result: "pendente",
    source_order_id: orderId,
    deviation_notes: `Gerada do pós-venda · pedido ${ord.data.order_number ?? ""} · ${ord.data.customer_name ?? ""}`.trim(),
    // legados exigidos pelo schema original
    product_code: label,
    quantity: totalQty,
    status: "pending",
  });
  if (ins.error) throw ins.error;
  return true;
}

// Etapas ANTERIORES à separação (estoque ainda não deveria estar deduzido).
// Voltar o card para uma delas — ou cancelar — precisa ESTORNAR a dedução.
const PRE_SEPARADO_STAGES = new Set<FulfillmentStage>([
  "nova_venda", "separacao_pendente", "criar_op", "separando", "cancelado",
]);

export function useUpdateFulfillmentStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: FulfillmentStage }) => {
      const { error } = await db
        .from("carboze_orders")
        .update({ fulfillment_stage: stage, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      // Ao entrar em "Criar Ordem de Produção", nasce a OP no Backlog (sem duplicar).
      let opCreated = false;
      let opError: string | null = null;
      if (stage === "criar_op") {
        try { opCreated = await ensureProductionOrderForOrder(id); }
        catch (e) { opError = e instanceof Error ? e.message : String(e); console.error("[pos-venda] falha ao criar OP:", e); }
      }
      // Ao SEPARAR, deduz o estoque real do HUB-RN (idempotente no banco).
      // B8: o erro NÃO é mais engolido — propaga e mostra toast de falha; e a RPC
      // retorna quantas linhas deduziu, para avisar quando deduz ZERO (pedido sem
      // produto vinculado) em vez de mentir "estoque deduzido".
      let deductedLines: number | null = null;
      if (stage === "separado") {
        const rr = await db.rpc("pos_venda_deduct_stock", { p_order_id: id });
        if (rr.error) throw rr.error;
        deductedLines = typeof rr.data === "number" ? rr.data : null;
      }
      // B9: voltar de "Separado" (ou cancelar) ESTORNA a dedução (idempotente).
      let restoredLines: number | null = null;
      if (PRE_SEPARADO_STAGES.has(stage)) {
        const rr = await db.rpc("pos_venda_restore_stock", { p_order_id: id });
        if (rr.error) throw rr.error;
        restoredLines = typeof rr.data === "number" ? rr.data : null;
      }
      return { stage, opCreated, opError, deductedLines, restoredLines };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["ops", "pos-venda"] });
      qc.invalidateQueries({ queryKey: ["ops", "production-orders"] });
      qc.invalidateQueries({ queryKey: ["ops", "hubrn-stock"] });
      if (res?.opError) toast.error("Etapa mudou, mas falhou ao criar a OP: " + res.opError, { duration: 10000 });
      else if (res?.opCreated) toast.success("Etapa atualizada · OP criada no Backlog.");
      else if (res?.stage === "separado") {
        if (res.deductedLines === 0) toast.warning("Separado, mas NADA foi deduzido do estoque — o pedido não tem produto vinculado.", { duration: 8000 });
        else toast.success("Separado · estoque deduzido do HUB-RN.");
      }
      else if (res?.restoredLines && res.restoredLines > 0) toast.success("Etapa atualizada · estoque estornado para o HUB-RN.");
      else toast.success("Etapa atualizada.");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar etapa: " + e.message),
  });
}
