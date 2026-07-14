import { useEffect } from "react";
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
  cnpj: string | null;              // CNPJ/CPF do cliente (documento na venda)
  customer_ie: string | null;       // Inscrição Estadual (ou "Isento"/null)
  payment_terms: string | null;     // forma/condição de pagamento
  freight_type: string | null;      // CIF/FOB
  agreed_delivery_date: string | null; // entrega combinada na venda
  ppf_date: string | null;             // fabricar até (prazo de produção)
  ppe_date: string | null;             // expedir até
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
  updated_at: string | null;
  stage_changed_at: string | null; // troca de etapa → "parado há X dias" (não poluído)
  fulfillment_stage: FulfillmentStage;
  production_done: boolean;   // OP concluída → aguardando alguém mover p/ Em Separação
  linha: string | null;
  bling_nf_id: number | null;      // NF vinculada (Faturamento/Bling) → NF finalizada
  invoice_number: string | null;   // nº da NF-e, quando emitida
}

const SELECT_BASE =
  "id, order_number, customer_name, customer_email, customer_phone, cnpj, customer_ie, payment_terms, " +
  "freight_type, agreed_delivery_date, ppf_date, ppe_date, delivery_address, delivery_city, " +
  "delivery_state, delivery_zip, vendedor_name, vendedor_id, subtotal, shipping_cost, discount, total, " +
  "notes, items, created_at, updated_at, stage_changed_at, fulfillment_stage, linha, bling_nf_id, invoice_number, status";
const SELECT_COLS = SELECT_BASE + ", production_done";

// Etapas terminais do rastreio (colunas que só acumulam).
const TERMINAL_STAGES = ["entregue", "cancelado"];

export interface PosVendaData {
  orders: PosVendaOrder[];
  terminalShown: number;   // finalizados carregados (dentro da janela)
  terminalTotal: number;   // finalizados no total (para saber quantos ficaram fora)
}

/**
 * Vendas manuais para o rastreio. NUNCA trunca os ATIVOS (carrega todos); os
 * FINALIZADOS (entregue/cancelado) vêm por JANELA DE TEMPO (terminalDays), com
 * contagem real — assim o board fica leve sem esconder nada em silêncio.
 */
export function usePosVendaOrders(terminalDays: number | "all" = 30) {
  return useQuery({
    queryKey: ["ops", "pos-venda", terminalDays],
    queryFn: async (): Promise<PosVendaData> => {
      const cutoff = terminalDays === "all" ? null : new Date(Date.now() - terminalDays * 86_400_000).toISOString();
      // Rastreio = vendas MANUAIS (Carbo Sales). Regra do external_ref:
      //  • sem external_ref → venda ainda no fluxo manual (aparece).
      //  • com external_ref (foi pro Bling p/ NF) → só aparece se for venda
      //    manual (order_number 'V…') E já tiver AVANÇADO além das etapas iniciais
      //    (nova_venda/separacao_pendente) — ou seja, está de fato no pipeline
      //    operacional (separação/NF/transporte). Assim a venda faturada segue
      //    até a entrega, mas as antigas travadas no início (faturadas por fora)
      //    não voltam. Pedidos nascidos no Bling (BLING-…) ficam de fora.
      const base = (cols: string) => db.from("carboze_orders").select(cols)
        .or("external_ref.is.null,and(order_number.like.V*,fulfillment_stage.not.in.(nova_venda,separacao_pendente))")
        .or("status.is.null,status.neq.quote");

      // Ativos: tudo que NÃO está finalizado — sem teto (limite de segurança alto).
      const runActive = (cols: string) => base(cols)
        .not("fulfillment_stage", "in", "(entregue,cancelado)")
        .order("created_at", { ascending: false }).limit(2000);
      // Finalizados: só dentro da janela, mais recentes primeiro.
      const runTerminal = (cols: string) => {
        let q = base(cols).in("fulfillment_stage", TERMINAL_STAGES)
          .order("updated_at", { ascending: false }).limit(500);
        if (cutoff) q = q.gte("updated_at", cutoff);
        return q;
      };

      let act = await runActive(SELECT_COLS);
      let term = await runTerminal(SELECT_COLS);
      // Resiliência: se production_done ainda não existir, tenta sem ela.
      if (act.error || term.error) {
        act = await runActive(SELECT_BASE);
        term = await runTerminal(SELECT_BASE);
        if (act.error) throw act.error;
        if (term.error) throw term.error;
        act.data = (act.data || []).map((r: any) => ({ ...r, production_done: false }));
        term.data = (term.data || []).map((r: any) => ({ ...r, production_done: false }));
      }

      // Total de finalizados (para o "há mais N ocultos"). Só quando há janela.
      let terminalTotal = (term.data || []).length;
      if (cutoff) {
        const cnt = await db.from("carboze_orders")
          .select("*", { count: "exact", head: true })
          .is("external_ref", null).or("status.is.null,status.neq.quote")
          .in("fulfillment_stage", TERMINAL_STAGES);
        terminalTotal = cnt.count ?? terminalTotal;
      }

      const list = [...(act.data || []), ...(term.data || [])] as PosVendaOrder[];

      // Enriquece com a foto do vendedor (profiles.avatar_url).
      const ids = [...new Set(list.map((o) => o.vendedor_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: profs } = await db.from("profiles").select("id, avatar_url").in("id", ids);
        const map = new Map((profs || []).map((p: any) => [p.id, p.avatar_url]));
        for (const o of list) o.vendedor_avatar = (o.vendedor_id && map.get(o.vendedor_id)) || null;
      }
      return { orders: list, terminalShown: (term.data || []).length, terminalTotal };
    },
    refetchInterval: 60_000,
  });
}

// Tempo real do Rastreio de venda: mover um card reflete na tela de todos os
// logados ao vivo (sistema compartilhado). Assina carboze_orders + ops_shipments.
export function usePosVendaRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const inval = () => {
      qc.invalidateQueries({ queryKey: ["ops", "pos-venda"] });
      qc.invalidateQueries({ queryKey: ["ops", "op-by-order"] });
      qc.invalidateQueries({ queryKey: ["ops", "shipments"] });
    };
    const ch = supabase
      .channel("ops-posvenda-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "carboze_orders" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "ops_shipments" }, inval)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
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

// Progresso das OPs de um pedido (multi-item): quantas concluíram e o setor da
// OP mais atrasada (a que ainda falta mais) — é o gargalo a acompanhar.
export interface OpBrief { total: number; done: number; sector: string; }

// Ordem do pipeline de produção (menor = mais no começo = mais atrasada).
const OP_RANK: Record<string, number> = {
  rascunho: 0, planejada: 1, aguardando_separacao: 2, separada: 3,
  aguardando_liberacao: 4, liberada_producao: 5, em_producao: 6, envase: 6,
  rotulagem: 7, aguardando_confirmacao: 8, confirmada: 8, aguardando_qualidade: 8,
  qualidade_aprovada: 9, liberada: 9,
};

/** OPs vinculadas a cada pedido (source_order_id) — progresso e setor gargalo. */
export function useOpsBySource(orderIds: string[], enabled: boolean) {
  const ids = [...new Set(orderIds.filter(Boolean))] as string[];
  return useQuery({
    queryKey: ["ops", "op-by-order", [...ids].sort()],
    enabled: enabled && ids.length > 0,
    queryFn: async (): Promise<Record<string, OpBrief>> => {
      const res = await db
        .from("production_orders").select("source_order_id, op_status")
        .in("source_order_id", ids);
      const agg: Record<string, { total: number; done: number; minRank: number; minStatus: string | null; blocked: boolean }> = {};
      for (const r of (res.data ?? [])) {
        const oid = r.source_order_id as string | null;
        if (!oid) continue;
        if (r.op_status === "cancelada") continue; // cancelada não conta
        const a = (agg[oid] ??= { total: 0, done: 0, minRank: Infinity, minStatus: null, blocked: false });
        a.total++;
        if (r.op_status === "concluida") { a.done++; continue; }
        if (r.op_status === "bloqueada") a.blocked = true;
        const rk = OP_RANK[r.op_status] ?? 5;
        if (rk < a.minRank) { a.minRank = rk; a.minStatus = r.op_status; }
      }
      const map: Record<string, OpBrief> = {};
      for (const [oid, a] of Object.entries(agg)) {
        if (a.total === 0) continue; // só OPs canceladas → sem badge de produção
        map[oid] = {
          total: a.total, done: a.done,
          sector: a.blocked ? "Bloqueada" : a.minStatus ? opSector(a.minStatus) : "Concluída",
        };
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
    .select("order_number, customer_name, items, ppf_date, next_delivery_date")
    .eq("id", orderId).single();
  if (ord.error || !ord.data) throw ord.error ?? new Error("Pedido não encontrado");

  const items: any[] = Array.isArray(ord.data.items) ? ord.data.items : [];
  // need_date = PPF (fabricar até) quando houver prazo definido na venda.
  const need = ord.data.ppf_date || ord.data.next_delivery_date || null;
  const baseNote = `Gerada do pós-venda · pedido ${ord.data.order_number ?? ""} · ${ord.data.customer_name ?? ""}`.trim();

  // UMA OP por item do pedido — cada uma com seu produto (BOM/checagem de material
  // funcionam) e sua quantidade. Pedido sem itens → uma OP genérica (sem vínculo).
  // O pedido só fica "produzido" quando TODAS as OPs concluírem (trigger op_conclude).
  const source: (any | null)[] = items.length ? items : [null];
  const rows = source.map((it) => {
    const qty = it ? (Number(it.quantity) || 1) : 1;
    const label = it ? String(it.name ?? "Produto") : `Pedido ${ord.data.order_number ?? ""}`.trim();
    return {
      sku_id: null,
      product_id: it ? (it.product_id || null) : null,
      planned_quantity: qty,
      need_date: need,                 // prazo herdado do pedido (KPI "Atrasadas")
      op_status: "rascunho",           // → coluna Backlog
      demand_source: "venda",
      priority: 3,
      quality_result: "pendente",
      source_order_id: orderId,
      deviation_notes: baseNote,
      product_code: label,
      quantity: qty,
      status: "pending",
    };
  });

  const ins = await db.from("production_orders").insert(rows);
  if (ins.error) throw ins.error;
  return true;
}

// Garante uma remessa (ops_shipments) para o pedido SEPARADO, ligada por order_id.
// Não duplica (índice único em order_id). Cliente, destino e nº de itens vêm do
// próprio pedido — acaba a redigitação manual do "Nova Remessa".
async function ensureShipmentForOrder(orderId: string): Promise<boolean> {
  const existing = await db
    .from("ops_shipments").select("id").eq("order_id", orderId).limit(1);
  if (existing.data && existing.data.length) return false; // já tem remessa → não duplica

  const ord = await db
    .from("carboze_orders")
    .select("order_number, customer_name, delivery_address, delivery_city, delivery_state, delivery_zip, items")
    .eq("id", orderId).single();
  if (ord.error || !ord.data) throw ord.error ?? new Error("Pedido não encontrado");

  const items: any[] = Array.isArray(ord.data.items) ? ord.data.items : [];
  const itemCount = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  // Destino completo (logradouro · cidade/UF · CEP) — pra gerar etiqueta/coleta
  // sem reabrir o pedido.
  const cidadeUf = [ord.data.delivery_city, ord.data.delivery_state].filter(Boolean).join("/");
  const destino = [ord.data.delivery_address, cidadeUf, ord.data.delivery_zip ? `CEP ${ord.data.delivery_zip}` : null]
    .filter(Boolean).join(" · ") || null;
  const { data: auth } = await db.auth.getUser();

  const ins = await db.from("ops_shipments").insert({
    order_id: orderId,
    order_number: ord.data.order_number ?? null,
    customer: ord.data.customer_name ?? null,
    destination: destino,
    items: itemCount,
    status: "separado",             // acabou de ser separado; pronto pra despachar
    created_by: auth?.user?.id ?? null,
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
      let shipmentCreated = false;
      let shipmentFailed = false;
      if (stage === "separado") {
        const rr = await db.rpc("pos_venda_deduct_stock", { p_order_id: id });
        if (rr.error) throw rr.error;
        deductedLines = typeof rr.data === "number" ? rr.data : null;
        // Cria a remessa já ligada ao pedido (não trava a separação se falhar,
        // mas AVISA — senão o pedido fica separado sem remessa e ninguém vê).
        try { shipmentCreated = await ensureShipmentForOrder(id); }
        catch (e) { shipmentFailed = true; console.error("[pos-venda] falha ao criar remessa:", e); }
      }
      // B9: voltar de "Separado" (ou cancelar) ESTORNA a dedução (idempotente).
      let restoredLines: number | null = null;
      if (PRE_SEPARADO_STAGES.has(stage)) {
        const rr = await db.rpc("pos_venda_restore_stock", { p_order_id: id });
        if (rr.error) throw rr.error;
        restoredLines = typeof rr.data === "number" ? rr.data : null;
      }
      // Espelha o status de expedição na remessa ligada (se houver). Não bloqueia.
      if (stage === "em_transporte" || stage === "entregue" || stage === "cancelado") {
        const su = await db.from("ops_shipments")
          .update({ status: stage, updated_at: new Date().toISOString() })
          .eq("order_id", id);
        if (su.error) console.error("[pos-venda] falha ao sincronizar remessa:", su.error);
      }
      return { stage, opCreated, opError, deductedLines, restoredLines, shipmentCreated, shipmentFailed };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["ops", "pos-venda"] });
      qc.invalidateQueries({ queryKey: ["ops", "production-orders"] });
      qc.invalidateQueries({ queryKey: ["ops", "hubrn-stock"] });
      qc.invalidateQueries({ queryKey: ["ops", "shipments"] });
      if (res?.opError) toast.error("Etapa mudou, mas falhou ao criar a OP: " + res.opError, { duration: 10000 });
      else if (res?.opCreated) toast.success("Etapa atualizada · OP(s) criada(s) no Backlog (uma por item).");
      else if (res?.stage === "separado") {
        if (res.shipmentFailed) {
          toast.error("Separado, mas FALHOU ao criar a remessa na Logística — crie manualmente ou volte e separe de novo.", { duration: 12000 });
          return;
        }
        const remessa = res.shipmentCreated ? " · remessa criada na Logística" : "";
        if (res.deductedLines === 0) toast.warning("Separado, mas nada foi deduzido agora (já deduzido antes, ou o pedido não tem produto vinculado)." + remessa, { duration: 8000 });
        else toast.success("Separado · estoque deduzido do HUB-RN" + remessa + ".");
      }
      else if (res?.restoredLines && res.restoredLines > 0) toast.success("Etapa atualizada · estoque estornado para o HUB-RN.");
      else toast.success("Etapa atualizada.");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar etapa: " + e.message),
  });
}
