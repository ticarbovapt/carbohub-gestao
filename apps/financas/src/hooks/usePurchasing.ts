import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { lerSemTeto } from "@carbo/shell";
import { hojeISO, somarDias, instanteDoDia } from "@/lib/datas";
import { COLUNAS_BAIXA_BLING, faltaColunaDaBaixa } from "@/lib/blingBaixa";
import type { QueryClient } from "@tanstack/react-query";
import type { ColunaOrdem, Ordem } from "@/components/financeiro/ContasUI";
import type {
  PurchaseRequest,
  PurchaseOrder,
  PurchaseReceiving,
  PurchaseInvoice,
  PurchasePayable,
  ApprovalConfig,
  PurchaseRequestItem,
  ReceivedItem,
} from "@/types/purchasing";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ As COMPRAS gravam pelo BANCO (migração 20261126): aprovar, gerar OC,
// registrar compra, receber e lançar NF são funções `fin_*` ATÔMICAS, e a regra
// (alçada, "não aprova a própria", transições, numeração) mora em gatilho — vale
// para qualquer caminho, não só para esta tela. O navegador só chama e mostra a
// recusa do banco, que já vem em português.
// ─────────────────────────────────────────────────────────────────────────────
export async function rpcCompras<T = unknown>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as any).rpc(nome, args);
  if (error) {
    if (error.code === "PGRST202") {
      throw new Error("O banco ainda não recebeu a atualização das compras (migração 20261126). Avise o TI.");
    }
    throw new Error(error.message || "Erro no banco");
  }
  return data as T;
}

// ---- Purchase Requests ----

export function usePurchaseRequests(filters?: { status?: string; costCenter?: string }) {
  return useQuery({
    queryKey: ["purchase-requests", filters],
    queryFn: async () => {
      const data = await lerSemTeto(() => {
        let query = supabase
          .from("purchase_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id");

        if (filters?.status) query = query.eq("status", filters.status as any);
        if (filters?.costCenter) query = query.eq("cost_center", filters.costCenter);
        return query;
      });
      return (data || []) as unknown as PurchaseRequest[];
    },
  });
}

export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (values: {
      service_order_id?: string;
      cost_center: string;
      purchase_type: string;
      suggested_supplier?: string;
      estimated_value: number;
      justification: string;
      operational_impact?: string;
      items: PurchaseRequestItem[];
      status?: string;
      /** Solicitante escolhido. Vazio/ausente = a RC é de quem está logado. */
      requested_by?: string;
    }) => {
      const { data, error } = await supabase
        .from("purchase_requests")
        .insert({
          rc_number: "TEMP",
          // De QUEM é a necessidade (pode ser um colega) …
          requested_by: values.requested_by || user!.id,
          // … e quem CLICOU, sempre. Sem esta linha, registrar em nome de outro
          // apagaria o autor do registro — o oposto de auditoria.
          created_by: user!.id,
          cost_center: values.cost_center,
          purchase_type: values.purchase_type as any,
          suggested_supplier: values.suggested_supplier || null,
          estimated_value: values.estimated_value,
          justification: values.justification,
          operational_impact: values.operational_impact || null,
          items: values.items as any,
          service_order_id: values.service_order_id || null,
          status: (values.status || "rascunho") as any,
          // Carimba o envio quando já nasce aguardando aprovação.
          submitted_at: values.status === "aguardando_aprovacao" ? new Date().toISOString() : null,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      toast({ title: "Requisição criada com sucesso" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar requisição", description: err.message, variant: "destructive" });
    },
  });
}

export function useApprovePurchaseRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, approved, rejection_reason }: { id: string; approved: boolean; rejection_reason?: string }) =>
      rpcCompras("fin_rc_decidir", { p_id: id, p_aprovar: approved, p_motivo: rejection_reason ?? null }),
    onSuccess: (_, variables) => {
      toast({ title: variables.approved ? "RC aprovada" : "RC rejeitada" });
    },
    onError: (err: any) => {
      toast({ title: "Erro na aprovação", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      queryClient.invalidateQueries({ queryKey: ["purchasing-badges"] });
    },
  });
}

// ---- Purchase Orders ----

export function usePurchaseOrders(filters?: { status?: string }) {
  return useQuery({
    queryKey: ["purchase-orders", filters],
    queryFn: async () => {
      const data = await lerSemTeto(() => {
        let query = supabase
          .from("purchase_orders")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id");

        if (filters?.status) query = query.eq("status", filters.status as any);
        return query;
      });
      return (data || []) as unknown as PurchaseOrder[];
    },
  });
}

export interface GrupoDeOC {
  supplier_name: string;
  supplier_id?: string | null;
  itens: { descricao: string; quantidade: number; unidade: string; valor_unitario: number }[];
}

/** Gera TODAS as OCs da RC numa transação: ou todas nascem, ou nenhuma (o total é calculado no banco). */
export function useGerarOCs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rcId, grupos }: { rcId: string; grupos: GrupoDeOC[] }) =>
      rpcCompras<{ id: string; oc_number: string; total: number }[]>("fin_oc_gerar", { p_rc_id: rcId, p_grupos: grupos }),
    onSuccess: (ocs) => {
      toast({ title: ocs.length > 1 ? `${ocs.length} ordens de compra geradas` : `Ordem de compra ${ocs[0]?.oc_number ?? ""} gerada` });
    },
    onError: (err: any) => {
      toast({ title: "Nenhuma OC foi gerada", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      queryClient.invalidateQueries({ queryKey: ["purchasing-badges"] });
    },
  });
}

// Registra a COMPRA da OC: forma de pagamento usada e se já foi paga. Move a OC
// de 'gerada' pra 'comprada' (fica pronta pra receber).
export function useRegisterOCPurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: {
      id: string;
      payment_method_id?: string | null;
      payment_type?: string | null;
      is_paid: boolean;
      payment_due_date?: string | null;
      paid_on?: string | null;
    }) => rpcCompras("fin_oc_registrar_compra", {
      p_oc_id: values.id,
      p_payment_method_id: values.payment_method_id || null,
      p_payment_type: values.payment_type || null,
      p_pago: values.is_paid,
      p_vencimento: values.is_paid ? null : (values.payment_due_date || null),
      p_pago_em: values.is_paid ? (values.paid_on || null) : null,
    }),
    onSuccess: (_, v) => {
      // Paga na compra ⇒ o banco já lançou a SAÍDA como conta paga.
      if (v.is_paid) invalidarContasAPagar(queryClient);
      toast({ title: v.is_paid ? "Compra registrada — pagamento lançado em Contas a pagar" : "Compra registrada" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao registrar compra", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchasing-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["purchasing-badges"] });
    },
  });
}

export function useCancelarOC() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => rpcCompras("fin_oc_cancelar", { p_oc_id: id }),
    onSuccess: () => toast({ title: "OC cancelada" }),
    onError: (err: any) => {
      toast({ title: "Não foi possível cancelar a OC", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchasing-badges"] });
      invalidarContasAPagar(queryClient);
    },
  });
}

// ---- Receivings ----

export function usePurchaseReceivings(purchaseOrderId?: string) {
  return useQuery({
    queryKey: ["purchase-receivings", purchaseOrderId],
    queryFn: async () => {
      const data = await lerSemTeto(() => {
        let query = supabase
          .from("purchase_receivings")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id");

        if (purchaseOrderId) query = query.eq("purchase_order_id", purchaseOrderId);
        return query;
      });
      return (data || []) as unknown as PurchaseReceiving[];
    },
  });
}

/** Recebe contra a OC. O SALDO, a divergência e o novo status da OC são calculados no banco. */
export function useCreateReceiving() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: {
      purchase_order_id: string;
      itens: { qtd_recebida: number; status_qualidade: string }[];
      observacao?: string;
    }) => rpcCompras<string>("fin_recebimento_registrar", {
      p_oc_id: values.purchase_order_id, p_itens: values.itens, p_observacao: values.observacao || null,
    }),
    onSuccess: () => toast({ title: "Recebimento registrado" }),
    onError: (err: any) => {
      toast({ title: "Erro ao registrar recebimento", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-receivings"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchasing-badges"] });
    },
  });
}

// ---- Invoices ----

export function usePurchaseInvoices(purchaseOrderId?: string) {
  return useQuery({
    queryKey: ["purchase-invoices", purchaseOrderId],
    queryFn: async () => {
      const data = await lerSemTeto(() => {
        let query = supabase
          .from("purchase_invoices")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id");

        if (purchaseOrderId) query = query.eq("purchase_order_id", purchaseOrderId);
        return query;
      });
      return (data || []) as unknown as PurchaseInvoice[];
    },
  });
}

/** Lança a NF e as PARCELAS da conta a pagar numa transação (as parcelas têm de fechar com a NF). */
export function useLancarNF() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: {
      purchase_order_id: string;
      invoice_number: string;
      invoice_date: string;
      invoice_value: number;
      file_url?: string;
      notes?: string;
      parcelas: { vencimento: string; valor: number }[];
    }) => rpcCompras<string>("fin_nf_lancar", {
      p_oc_id: values.purchase_order_id, p_numero: values.invoice_number, p_data: values.invoice_date,
      p_valor: values.invoice_value, p_file_url: values.file_url || null, p_notas: values.notes || null,
      p_parcelas: values.parcelas,
    }),
    onSuccess: (_, v) => toast({ title: v.parcelas.length ? `NF lançada + ${v.parcelas.length} parcela(s) a pagar` : "NF lançada" }),
    onError: (err: any) => {
      toast({ title: "A NF não foi lançada", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      invalidarContasAPagar(queryClient);
    },
  });
}

// ---- Payables ----

export function usePurchasePayables(filters?: { status?: string }) {
  return useQuery({
    queryKey: ["purchase-payables", filters],
    queryFn: async () => {
      const data = await lerSemTeto(() => {
        let query = supabase
          .from("purchase_payables")
          .select("*")
          .order("due_date", { ascending: true })
          .order("id");

        if (filters?.status) query = query.eq("status", filters.status as any);
        return query;
      });
      return (data || []) as unknown as PurchasePayable[];
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ "Vencido" tem UMA regra: em aberto (programado OU atrasado) e vencimento
// ANTES de hoje em Brasília — nunca o status gravado. O espelho do Bling só
// marca `atrasado` em parte dos títulos (medido: 170 `programado` com
// vencimento já passado), então olhar o status fazia a lista, o resumo, o
// badge e os KPIs contarem conjuntos diferentes. É a mesma regra do
// `estaVencido` (`lib/datas.ts`), aqui escrita como filtro do PostgREST.
// ─────────────────────────────────────────────────────────────────────────────
export const STATUS_EM_ABERTO = ["programado", "atrasado"] as const;

/** Toda consulta cujo primeiro item da chave começa com "purchase-payables",
 *  mais os badges, os KPIs e os painéis do financeiro que leem a tabela. */
const CHAVES_LIGADAS_AO_PAGAR = new Set([
  "purchasing-badges", "purchasing-kpis",
  "fin-aging", "fin-forecast", "fin-status", "fin-monthly", "fin-suppliers", "fin-ontime",
]);
export function invalidarContasAPagar(qc: QueryClient) {
  return qc.invalidateQueries({
    predicate: (q) => {
      const [k0, k1] = q.queryKey as unknown[];
      if (typeof k0 !== "string") return false;
      return k0.startsWith("purchase-payables") || CHAVES_LIGADAS_AO_PAGAR.has(k0) || (k0 === "ops" && k1 === "payables");
    },
  });
}

// Contas EM ABERTO (pra o resumo de aging) — poucas linhas, opcionalmente
// filtradas por origem. Separado da lista paginada pra o aging refletir o total.
export function usePurchasePayablesOpen(source?: string) {
  return useQuery({
    queryKey: ["purchase-payables-open", source ?? "all"],
    queryFn: async () => {
      const ler = (colunas: string) => lerSemTeto(() => {
        let q = (supabase.from("purchase_payables") as any)
          .select(colunas)
          .in("status", STATUS_EM_ABERTO as any)
          .order("due_date")
          .order("id");
        if (source && source !== "all") q = q.eq("source", source as any);
        return q;
      });
      const antigas = "id, amount, due_date, status, source, currency";
      // ⚠️ As colunas da baixa no Bling podem ainda não existir (front antes do
      // SQL): aí repete com as antigas, em vez de o resumo sumir.
      try {
        return ((await ler(`${antigas}, bling_id, paid_by, ${COLUNAS_BAIXA_BLING}`)) || []) as any[];
      } catch (e) {
        if (!faltaColunaDaBaixa(e)) throw e;
        return ((await ler(antigas)) || []) as any[];
      }
    },
  });
}

/**
 * Filtros de status da lista (valor da URL `?status=`):
 *   fila      (padrão) vencidos + vence hoje + próximos 7 dias
 *   vencido   em aberto, vencimento < hoje            (= "atrasado", nome antigo)
 *   hoje      em aberto, vencimento = hoje
 *   7dias     em aberto, vencimento de amanhã a hoje+7
 *   a_vencer  em aberto, vencimento >= hoje           (= "programado", nome antigo)
 *   aberto    todo em aberto
 *   pago · cancelado · all
 */
export type FiltroPagar = "fila" | "vencido" | "hoje" | "7dias" | "a_vencer" | "aberto" | "pago" | "cancelado" | "all";

// Lista PAGINADA no servidor com filtros (origem, status efetivo, período, busca).
// Evita carregar todo o histórico do Bling de uma vez.
// `select("*")`: traz `bling_id`, `paid_by` e as colunas `bling_baixa_*` quando
// existem — e, antes do SQL, simplesmente não as traz, sem erro.
const COLUNA_ORDEM_PAGAR: Record<ColunaOrdem, string> = {
  nome: "supplier_name", vencimento: "due_date", valor: "amount", quitado: "paid_at",
};

export function usePurchasePayablesPaged(params: {
  source: string; status: string; from: string; to: string; page: number; pageSize: number; busca?: string;
  /** Escolhida na tela; nula = a ordem padrão abaixo. */
  ordem?: Ordem;
}) {
  return useQuery({
    queryKey: ["purchase-payables-paged", params],
    queryFn: async () => {
      const hoje = hojeISO();
      let q = supabase.from("purchase_payables").select("*", { count: "exact" });
      if (params.source !== "all") q = q.eq("source", params.source as any);
      const aberto = () => { q = q.in("status", STATUS_EM_ABERTO as any); };
      switch (params.status) {
        case "pago": q = q.eq("status", "pago" as any); break;
        case "cancelado": q = q.eq("status", "cancelado" as any); break;
        case "vencido":
        case "atrasado": aberto(); q = q.lt("due_date", hoje); break;
        case "a_vencer":
        case "programado": aberto(); q = q.gte("due_date", hoje); break;
        case "hoje": aberto(); q = q.eq("due_date", hoje); break;
        case "7dias": aberto(); q = q.gt("due_date", hoje).lte("due_date", somarDias(hoje, 7)); break;
        case "fila": aberto(); q = q.lte("due_date", somarDias(hoje, 7)); break;
        case "aberto": aberto(); break;
        default: break; // "all"
      }
      if (params.from) q = q.gte("due_date", params.from);
      if (params.to) q = q.lte("due_date", params.to);
      // Busca no servidor: fornecedor ou nº do documento. Vírgula, parênteses e
      // curinga quebram a sintaxe do `or()` do PostgREST — saem do termo.
      const termo = (params.busca ?? "").replace(/[,()*%\\]/g, " ").trim();
      if (termo) q = q.or(`supplier_name.ilike.%${termo}%,bling_numero.ilike.%${termo}%`);
      const fromIdx = params.page * params.pageSize;
      // Fila de trabalho: vencimento mais antigo primeiro. Histórico (pago,
      // cancelado, todos) sem período: o mais recente primeiro. ⚠️ `id` desempata — sem ele
      // a mesma linha aparece em duas páginas e outra em nenhuma.
      // Com período escolhido, a leitura é cronológica dentro dele.
      const crescente = params.ordem ? params.ordem.asc
        : !!(params.from || params.to) || !["pago", "cancelado", "all"].includes(params.status);
      const coluna = params.ordem ? COLUNA_ORDEM_PAGAR[params.ordem.col] : "due_date";
      q = q
        .order(coluna, { ascending: crescente, nullsFirst: false })
        .order("id", { ascending: crescente })
        .range(fromIdx, fromIdx + params.pageSize - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data || []) as unknown as PurchasePayable[], count: count || 0 };
    },
  });
}

export function useUpdatePayableStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status, payment_proof_url, paid_at }: { id: string; status: string; payment_proof_url?: string; paid_at?: string }) => {
      const updates: any = { status };
      if (status === "pago") {
        // Data efetiva do pagamento (default hoje) — importante pro DPO/realizado.
        // Meio-dia de Brasília: nenhum fuso troca o dia escolhido.
        updates.paid_at = paid_at ? instanteDoDia(paid_at) : new Date().toISOString();
        updates.paid_by = user!.id;
      } else {
        // Estorno / cancelamento: limpa o registro de pagamento.
        updates.paid_at = null;
        updates.paid_by = null;
      }
      if (payment_proof_url) updates.payment_proof_url = payment_proof_url;

      const { error } = await supabase.from("purchase_payables").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      invalidarContasAPagar(queryClient);
      toast({ title: v.status === "pago" ? "Baixa registrada" : v.status === "cancelado" ? "Conta cancelada" : "Pagamento estornado" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar a conta", description: err.message, variant: "destructive" });
    },
  });
}

// ---- Approval Config ----

export function useApprovalConfig() {
  return useQuery({
    queryKey: ["purchase-approval-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_approval_config")
        .select("*")
        .order("max_value", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ApprovalConfig[];
    },
  });
}

// ---- Badges por aba (pendências) ----

export function usePurchasingBadges() {
  return useQuery({
    queryKey: ["purchasing-badges"],
    queryFn: async () => {
      const today = hojeISO();
      const head = { count: "exact" as const, head: true };
      const [rc, ocGerada, ocReceber, payAtras, recAtras] = await Promise.all([
        supabase.from("purchase_requests").select("*", head).eq("status", "aguardando_aprovacao" as any),
        supabase.from("purchase_orders").select("*", head).eq("status", "gerada" as any),
        supabase.from("purchase_orders").select("*", head).in("status", ["comprada", "enviada_fornecedor", "parcialmente_recebida"] as any),
        // Mesma regra de "vencido" da lista (STATUS_EM_ABERTO + vencimento < hoje).
        supabase.from("purchase_payables").select("id", head).in("status", STATUS_EM_ABERTO as any).lt("due_date", today),
        supabase.from("receivables").select("id", head).neq("status", "recebido").neq("status", "cancelado").lt("due_date", today),
      ]);
      return {
        requisicoes: rc.count ?? 0,
        ordens: ocGerada.count ?? 0,
        recebimento: ocReceber.count ?? 0,
        pagar: payAtras.count ?? 0,
        recebiveis: recAtras.count ?? 0,
      } as Record<string, number>;
    },
    refetchInterval: 60000,
  });
}

// ---- KPIs ----

export function usePurchasingKPIs() {
  return useQuery({
    queryKey: ["purchasing-kpis"],
    queryFn: async () => {
      const [requests, orders, payables] = await Promise.all([
        lerSemTeto<any>(() => supabase.from("purchase_requests").select("id, status, estimated_value").order("id")),
        lerSemTeto<any>(() => supabase.from("purchase_orders").select("id, status, total_value").order("id")),
        // Só em aberto e só em real, como as RPCs fin_* — somar USD com BRL dá número sem moeda.
        lerSemTeto<any>(() => (supabase.from("purchase_payables") as any).select("id, status, amount, due_date")
          .in("status", STATUS_EM_ABERTO).eq("currency", "BRL").order("id")),
      ]);

      const today = hojeISO();

      return {
        rcPendentes: requests.filter((r) => r.status === "aguardando_aprovacao").length,
        ocAbertas: orders.filter((o) => !["recebida", "cancelada"].includes(o.status)).length,
        pagamentosAtrasados: payables.filter((p) => p.due_date && String(p.due_date).slice(0, 10) < today).length,
        totalComprometido: orders
          .filter((o) => o.status !== "cancelada")
          .reduce((sum: number, o: any) => sum + (Number(o.total_value) || 0), 0),
        totalAPagar: payables
          .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0),
      };
    },
  });
}
