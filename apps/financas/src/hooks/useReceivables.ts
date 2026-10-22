import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { lerSemTeto } from "@carbo/shell";
import { diaBrasilia, hojeISO, instanteDoDia, somarDias } from "@/lib/datas";
import { COLUNAS_BAIXA_BLING, faltaColunaDaBaixa } from "@/lib/blingBaixa";
import type { ColunaOrdem, Ordem } from "@/components/financeiro/ContasUI";

const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

export type ReceivableStatus = "programado" | "recebido" | "atrasado" | "cancelado";

export interface Receivable {
  id: string;
  source: string;               // interno | bling | nf
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
  // ── Colunas da automação "título nasce da NF" (migração de 21/10/2026). ──
  // ⚠️ OPCIONAIS de propósito: o front pode subir antes do SQL, e aí elas não
  // existem — `select("*")` simplesmente não as traz (undefined), nunca erro.
  parcela?: number | null;
  parcelas_total?: number | null;
  empresa?: string | null;          // matriz | filial
  nf_numero?: string | null;
  documento?: string | null;        // CNPJ/CPF
  order_number?: string | null;
  nosso_numero?: string | null;
  linha_digitavel?: string | null;
  txid?: string | null;
  valor_recebido?: number | null;
  recebido_via?: string | null;     // manual | banco
  bling_id?: number | string | null;
  /** Quem deu a baixa AQUI. Nulo num título recebido = baixado no Bling (veio pelo espelho). */
  received_by?: string | null;
  // ── A baixa feita aqui enviada ao Bling 1 (`bling-contas-baixar`). Opcionais pelo mesmo motivo. ──
  bling_baixa_em?: string | null;
  bling_baixa_bordero?: number | null;
  bling_baixa_erro?: string | null;
}

export const RECEIVABLE_SOURCE_LABELS: Record<string, string> = {
  interno: "Sistema",
  bling: "Bling",
  nf: "NF",
};

/**
 * Coluna que ainda não existe no banco (front no ar antes da migração):
 * 42703 = coluna inexistente no Postgres (filtro), PGRST204 = coluna fora do
 * cache de esquema do PostgREST (insert/update). É o ÚNICO erro que autoriza
 * repetir sem as colunas novas — qualquer outro sobe.
 */
export const ehColunaAusente = (e: any) =>
  !!e && (e.code === "42703" || e.code === "PGRST204");

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
      const ler = (colunas: string) => lerSemTeto<any>(() => {
        let q = db.from("receivables").select(colunas)
          .neq("status", "recebido").neq("status", "cancelado").order("id");
        if (source && source !== "all") q = q.eq("source", source);
        return q;
      });
      const antigas = "id, amount, due_date, status, source";
      // ⚠️ As colunas da baixa no Bling podem ainda não existir (front antes do
      // SQL): aí repete com as antigas, em vez de o resumo sumir.
      try {
        return ((await ler(`${antigas}, bling_id, received_by, ${COLUNAS_BAIXA_BLING}`)) || []) as any[];
      } catch (e) {
        if (!faltaColunaDaBaixa(e)) throw e;
        return ((await ler(antigas)) || []) as any[];
      }
    },
  });
}

export type FiltroStatusReceber = "fila" | "aberto" | "programado" | "atrasado" | "recebido" | "cancelado" | "all";

/** O texto da busca vai dentro de um `.or()` do PostgREST: vírgula, parêntese e curinga quebram a sintaxe. */
const limparBusca = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

/**
 * Lista paginada no servidor, ordem ESTÁVEL (vencimento, id).
 *
 * `select("*")`: traz `bling_id`, `received_by` e as colunas `bling_baixa_*`
 * quando existem — e, antes do SQL, simplesmente não as traz, sem erro.
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
  ordem?: Ordem;
}) {
  return useQuery({
    queryKey: ["receivables-paged", params, hojeISO()],
    queryFn: async () => {
      // ⚠️ A busca passou a olhar pedido, NF e documento — colunas da migração
      // de 21/10. Antes dela o PostgREST recusa o filtro com 42703; aí a
      // consulta é refeita só com as colunas antigas, em vez de a lista sumir.
      const comNovas = await montarPaginaReceber(params, true);
      if (!comNovas.error) return comNovas.resultado;
      if (!ehColunaAusente(comNovas.error) || !limparBusca(params.busca)) throw comNovas.error;
      const semNovas = await montarPaginaReceber(params, false);
      if (semNovas.error) throw semNovas.error;
      return semNovas.resultado;
    },
  });
}

const COLUNA_ORDEM_RECEBER: Record<ColunaOrdem, string> = {
  nome: "customer_name", vencimento: "due_date", valor: "amount", quitado: "received_at",
};

async function montarPaginaReceber(params: {
  source: string; status: FiltroStatusReceber; de: string; ate: string; busca: string; page: number; pageSize: number;
  ordem?: Ordem;
}, colunasNovas: boolean): Promise<{ error: any; resultado: { rows: Receivable[]; count: number } }> {
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
  if (b) {
    const campos = ["customer_name", "notes", "bling_numero"];
    if (colunasNovas) campos.push("order_number", "nf_numero", "documento");
    // Documento digitado com pontuação também acha o gravado só com dígitos.
    const digitos = b.replace(/\D/g, "");
    const termos = campos.map((c) => `${c}.ilike.%${b}%`);
    if (colunasNovas && digitos.length >= 5 && digitos !== b) termos.push(`documento.ilike.%${digitos}%`);
    q = q.or(termos.join(","));
  }
  const fromIdx = params.page * params.pageSize;
  // Ordem escolhida na tela; nula = vencimento mais antigo primeiro (a de sempre).
  const asc = params.ordem ? params.ordem.asc : true;
  const coluna = params.ordem ? COLUNA_ORDEM_RECEBER[params.ordem.col] : "due_date";
  q = q.order(coluna, { ascending: asc, nullsFirst: false }).order("id", { ascending: asc }).range(fromIdx, fromIdx + params.pageSize - 1);
  const { data, error, count } = await q;
  return { error, resultado: { rows: (data || []) as Receivable[], count: count || 0 } };
}

/** Tudo o que lê `receivables` — a lista, o resumo e os painéis. */
export function invalidarContasAReceber(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["receivables-paged"] });
  qc.invalidateQueries({ queryKey: ["receivables-open"] });
  ["fin-rec-aging", "fin-cashflow", "fin-rec-customers", "fin-rec-ontime"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useUpdateReceivableStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, received_at, amount }: { id: string; status: ReceivableStatus; received_at?: string; amount?: number }) => {
      const { data: u } = await supabase.auth.getUser();
      const updates: any = { status, updated_at: new Date().toISOString() };
      // Colunas da migração de 21/10: a baixa da TELA é sempre `manual` e
      // recebe o valor cheio do título; a do banco (retorno/extrato) grava
      // `banco` por outro caminho. Estorno/cancelamento limpa as duas.
      const novas: any = {};
      if (status === "recebido") {
        // A data do <input type="date"> vira meio-dia de Brasília: nenhum fuso a troca de dia.
        updates.received_at = instanteDoDia(received_at || hojeISO());
        updates.received_by = u?.user?.id ?? null;
        novas.recebido_via = "manual";
        novas.valor_recebido = amount ?? null;
      } else {
        updates.received_at = null; updates.received_by = null;
        novas.recebido_via = null;
        novas.valor_recebido = null;
      }
      const { error } = await db.from("receivables").update({ ...updates, ...novas }).eq("id", id);
      if (!error) return;
      // ⚠️ Antes da migração as colunas não existem (PGRST204): repete só com
      // as antigas, senão ninguém daria baixa até o SQL rodar.
      if (!ehColunaAusente(error)) throw error;
      const { error: e2 } = await db.from("receivables").update(updates).eq("id", id);
      if (e2) throw e2;
    },
    onSuccess: () => { invalidarContasAReceber(qc); toast({ title: "Recebível atualizado" }); },
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
    onSuccess: () => { invalidarContasAReceber(qc); toast({ title: "Recebível criado" }); },
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
    onSuccess: (n) => { invalidarContasAReceber(qc); qc.invalidateQueries({ queryKey: ["invoiced-no-receivable"] }); toast({ title: `${n} título(s) a receber gerado(s)` }); },
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
