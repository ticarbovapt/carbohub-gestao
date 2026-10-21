import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { lerSemTeto } from "@carbo/shell";
import { diaBrasilia, hojeISO, instanteDoDia, somarDias } from "@/lib/datas";

const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

export type ReceivableStatus = "programado" | "recebido" | "atrasado" | "cancelado";

export interface Receivable {
  id: string;
  source: string;               // interno | bling
  bling_numero: string | null;
  customer_name: string | null;
  order_id: string | null;
  amount: number;
  currency: string;
  due_date: string;
  status: ReceivableStatus;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const RECEIVABLE_STATUS_LABELS: Record<ReceivableStatus, string> = {
  programado: "A receber",
  recebido: "Recebido",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

// Recebíveis EM ABERTO (aging) — poucas linhas, opcional filtro por origem.
export function useReceivablesOpen(source?: string) {
  return useQuery({
    queryKey: ["receivables-open", source ?? "all"],
    queryFn: async () => {
      const data = await lerSemTeto<any>(() => {
        let q = db.from("receivables").select("id, amount, due_date, status, source")
          .neq("status", "recebido").neq("status", "cancelado").order("id");
        if (source && source !== "all") q = q.eq("source", source);
        return q;
      });
      return (data || []) as any[];
    },
  });
}

export type FiltroStatusReceber = "fila" | "aberto" | "programado" | "atrasado" | "recebido" | "cancelado" | "all";

/** O texto da busca vai dentro de um `.or()` do PostgREST: vírgula, parêntese e curinga quebram a sintaxe. */
const limparBusca = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

/**
 * Lista paginada no servidor, ordem ESTÁVEL (vencimento, id).
 *
 * ⚠️ O recorte de data muda de coluna conforme o status: título RECEBIDO é
 * recortado por `received_at` (o dia de Brasília em que entrou o dinheiro);
 * os demais, por `due_date`. "Recebidos em outubro" filtrado por vencimento
 * trazia o que venceu em outubro, mesmo que tenha entrado em novembro.
 *
 * `fila` = em aberto vencendo até hoje + 7 dias (inclui todo o vencido) — a
 * visão padrão, sem recorte de mês.
 */
export function useReceivablesPaged(params: {
  source: string; status: FiltroStatusReceber; de: string; ate: string; busca: string; page: number; pageSize: number;
}) {
  return useQuery({
    queryKey: ["receivables-paged", params, hojeISO()],
    queryFn: async () => {
      const hoje = hojeISO();
      let q = db.from("receivables").select("*", { count: "exact" });
      if (params.source !== "all") q = q.eq("source", params.source);
      const aberto = () => q.neq("status", "recebido").neq("status", "cancelado");
      switch (params.status) {
        case "recebido": q = q.eq("status", "recebido"); break;
        case "cancelado": q = q.eq("status", "cancelado"); break;
        case "aberto": q = aberto(); break;
        case "atrasado": q = aberto().lt("due_date", hoje); break;
        case "programado": q = aberto().gte("due_date", hoje); break;
        case "fila": q = aberto().lte("due_date", somarDias(hoje, 7)); break;
        default: break;
      }
      if (params.status === "recebido") {
        // received_at é instante: o dia de Brasília vai de 00:00 a 00:00 do dia seguinte.
        if (params.de) q = q.gte("received_at", `${params.de}T00:00:00-03:00`);
        if (params.ate) q = q.lt("received_at", `${somarDias(params.ate, 1)}T00:00:00-03:00`);
      } else {
        if (params.de) q = q.gte("due_date", params.de);
        if (params.ate) q = q.lte("due_date", params.ate);
      }
      const b = limparBusca(params.busca);
      if (b) q = q.or(`customer_name.ilike.%${b}%,notes.ilike.%${b}%,bling_numero.ilike.%${b}%`);
      const fromIdx = params.page * params.pageSize;
      q = q.order("due_date", { ascending: true }).order("id", { ascending: true }).range(fromIdx, fromIdx + params.pageSize - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data || []) as Receivable[], count: count || 0 };
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["receivables-paged"] });
  qc.invalidateQueries({ queryKey: ["receivables-open"] });
  ["fin-rec-aging", "fin-cashflow", "fin-rec-customers", "fin-rec-ontime"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useUpdateReceivableStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, received_at }: { id: string; status: ReceivableStatus; received_at?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const updates: any = { status, updated_at: new Date().toISOString() };
      if (status === "recebido") {
        // A data do <input type="date"> vira meio-dia de Brasília: nenhum fuso a troca de dia.
        updates.received_at = instanteDoDia(received_at || hojeISO());
        updates.received_by = u?.user?.id ?? null;
      } else {
        updates.received_at = null; updates.received_by = null;
      }
      const { error } = await db.from("receivables").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(qc); toast({ title: "Recebível atualizado" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useCreateReceivable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<Receivable>) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("receivables").insert({
        source: "interno",
        customer_name: values.customer_name || null,
        amount: values.amount ?? 0,
        currency: values.currency || "BRL",
        due_date: values.due_date,
        status: "programado",
        notes: values.notes || null,
        order_id: values.order_id || null,
        created_by: u?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(qc); toast({ title: "Recebível criado" }); },
    onError: (e: any) => toast({ title: "Erro ao criar recebível", description: e.message, variant: "destructive" }),
  });
}

// ── Order-to-cash: gerar título a receber de pedido faturado ──────────────────
export interface InvoicedOrder {
  id: string; order_number: string | null; customer_name: string | null;
  total: number; payment_terms: string | null; status: string;
  /** Data-base das parcelas (`AAAA-MM-DD`): venda → faturamento → criação. */
  base: string;
}

/**
 * Pedidos faturados/enviados/entregues que ainda não têm NENHUM título a
 * receber ligado (`receivables.order_id`).
 *
 * ⚠️ Lê de `carboze_orders`, não da `carboze_orders_secure`: a view MASCARA o
 * nome do cliente para quem não é admin/CEO ("Jo***va") — e esse nome seria
 * gravado no título — e não expõe `payment_terms`, que é de onde saem as
 * parcelas. A RLS de `carboze_orders` já é a do time interno.
 * ⚠️ Fora a venda ON-LINE (`segmento = 'online'`): ela é paga na plataforma e
 * não gera título a receber da empresa com o cliente.
 * ⚠️ Sem teto, nos DOIS lados: com `.limit(300)` antes do filtro, a lista
 * parava de mostrar pedido assim que 300 recentes já tivessem título.
 */
export function useInvoicedOrdersNoReceivable(enabled = true) {
  return useQuery({
    queryKey: ["invoiced-no-receivable"],
    enabled,
    queryFn: async (): Promise<InvoicedOrder[]> => {
      const recs = await lerSemTeto<{ order_id: string }>(() =>
        db.from("receivables").select("order_id").not("order_id", "is", null).order("id"));
      const linked = new Set(recs.map((r) => r.order_id));
      const orders = await lerSemTeto<any>(() =>
        db.from("carboze_orders")
          .select("id, order_number, customer_name, total, sale_date, invoiced_at, created_at, payment_terms, status, segmento")
          .in("status", ["invoiced", "shipped", "delivered"])
          .or("segmento.is.null,segmento.neq.online")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true }));
      return orders
        .filter((o) => !linked.has(o.id) && (o.segmento ?? "") !== "online" && Number(o.total || 0) > 0)
        .map((o) => ({
          id: o.id, order_number: o.order_number ?? null, customer_name: o.customer_name ?? null,
          total: Number(o.total || 0), payment_terms: o.payment_terms ?? null, status: o.status,
          base: o.sale_date ? String(o.sale_date).slice(0, 10)
            : diaBrasilia(new Date(o.invoiced_at ?? o.created_at)),
        }))
        .sort((x, y) => (x.base < y.base ? 1 : x.base > y.base ? -1 : 0));
    },
  });
}

export interface TituloNovo { order_id: string; customer_name: string | null; amount: number; due_date: string; notes: string }

/**
 * Um `receivable` por PARCELA, num INSERT só.
 * ⚠️ Não dividir em lotes: um insert é uma transação. Em lotes, falhar no
 * segundo deixaria pedido com metade das parcelas — e, como ele já tem título,
 * sairia da lista de candidatos e a outra metade nunca seria gerada.
 */
export function useGenerateReceivablesFromOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: TituloNovo[]) => {
      const { data: u } = await supabase.auth.getUser();
      const rows = items.map((i) => ({
        source: "interno", customer_name: i.customer_name, order_id: i.order_id, notes: i.notes,
        amount: i.amount, currency: "BRL", due_date: i.due_date, status: "programado", created_by: u?.user?.id ?? null,
      }));
      if (rows.length) {
        const { error } = await db.from("receivables").insert(rows);
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (n) => { invalidate(qc); qc.invalidateQueries({ queryKey: ["invoiced-no-receivable"] }); toast({ title: `${n} título(s) a receber gerado(s)` }); },
    onError: (e: any) => toast({ title: "Erro ao gerar títulos", description: e.message, variant: "destructive" }),
  });
}

// ── Dashboards ────────────────────────────────────────────────────────────────
export function useFinReceivablesAging(source: string) {
  return useQuery({
    queryKey: ["fin-rec-aging", source],
    queryFn: async () => {
      const { data, error } = await db.rpc("fin_receivables_aging", { p_source: source });
      if (error) throw error;
      return (data ?? []) as { bucket: string; qtd: number; total: number }[];
    },
  });
}

export function useFinCashflow(source: string, weeks = 8) {
  return useQuery({
    queryKey: ["fin-cashflow", source, weeks],
    queryFn: async () => {
      const { data, error } = await db.rpc("fin_cashflow_weekly", { p_source: source, p_weeks: weeks });
      if (error) throw error;
      return (data ?? []) as { semana: string; entrada: number; saida: number }[];
    },
  });
}

export function useFinTopCustomers(source: string, from?: string, to?: string, limit = 8) {
  return useQuery({
    queryKey: ["fin-rec-customers", source, from, to, limit],
    queryFn: async () => {
      const { data, error } = await db.rpc("fin_receivables_top_customers", { p_source: source, p_from: from ?? null, p_to: to ?? null, p_limit: limit });
      if (error) throw error;
      return (data ?? []) as { customer_name: string; total: number; qtd: number }[];
    },
  });
}

export function useFinReceivablesOnTime(source: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ["fin-rec-ontime", source, from, to],
    queryFn: async () => {
      const { data, error } = await db.rpc("fin_receivables_on_time", { p_source: source, p_from: from ?? null, p_to: to ?? null });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as { recebidos: number; no_prazo: number; atrasados: number; pct_no_prazo: number | null } | null;
    },
  });
}
