import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { lerSemTeto, lerPorIdsSemTeto } from "@carbo/shell";

// ─────────────────────────────────────────────────────────────────────────────
// Comissionamento (Carbo Finanças). Base = vendas FATURADAS (com NF) do vendedor
// no período (RPC crm_comissao_agregado). O financeiro digita o % → gera um
// fechamento (commission_statements). O pagamento (total/parcial) fica em
// commission_payments; um trigger mantém amount_paid/status do fechamento.
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface ComissaoAgregado {
  vendedor_id: string;
  vendedor_name: string | null;
  total: number;   // vendas faturadas no período
  qtd: number;
}

/** Total faturado por vendedor no período (base pra calcular a comissão). */
export function useComissaoAgregado(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["comissao_agregado", from, to],
    enabled: enabled && !!from && !!to,
    queryFn: async (): Promise<ComissaoAgregado[]> => {
      const { data, error } = await db.rpc("crm_comissao_agregado", { p_from: from, p_to: to });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        vendedor_id: r.vendedor_id,
        vendedor_name: r.vendedor_name ?? null,
        total: Number(r.total || 0),
        qtd: Number(r.qtd || 0),
      }));
    },
  });
}

/** Total de DESCARBONIZAÇÃO por vendedor no período — base separada da de
 *  produto (RPC crm_comissao_descarb). Desde 30/10/2026 conta só a NFS-e
 *  AUTORIZADA em produção e não cancelada, pela data de emissão (`20261139`);
 *  antes contava a linha de serviço já na venda, sem nota. */
export function useComissaoDescarb(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["comissao_descarb", from, to],
    enabled: enabled && !!from && !!to,
    queryFn: async (): Promise<ComissaoAgregado[]> => {
      const { data, error } = await db.rpc("crm_comissao_descarb", { p_from: from, p_to: to });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        vendedor_id: r.vendedor_id,
        vendedor_name: r.vendedor_name ?? null,
        total: Number(r.total || 0),
        qtd: Number(r.qtd || 0),
      }));
    },
  });
}

export interface CommissionStatement {
  id: string;
  vendedor_id: string;
  vendedor_name: string | null;
  period_start: string;
  period_end: string;
  base_sales: number;        // total (produto + descarbonização)
  base_produto: number;
  base_descarb: number;
  sales_count: number;
  rate_pct: number;          // % do produto faturado
  rate_descarb_pct: number;  // % da descarbonização
  amount_produto: number;
  amount_descarb: number;
  amount_due: number;
  amount_paid: number;
  status: "aberto" | "parcial" | "pago";
  notes: string | null;
  created_at: string;
}

/** Fechamentos de comissão já gerados (todos, mais recentes primeiro). */
export function useCommissionStatements() {
  return useQuery({
    queryKey: ["commission_statements"],
    queryFn: async (): Promise<CommissionStatement[]> => {
      const data = await lerSemTeto<CommissionStatement>(() => db
        .from("commission_statements")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id"));
      return (data ?? []) as CommissionStatement[];
    },
  });
}

/** Gera um fechamento de comissão + snapshot da MEMÓRIA DE CÁLCULO (as NFs que
 *  compõem a base). Assim o fechamento fica auditável e reconciliável. */
export function useCreateStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: {
      vendedor_id: string; vendedor_name: string | null;
      period_start: string; period_end: string;
      base_produto: number; base_descarb: number; sales_count: number;
      rate_pct: number; rate_descarb_pct: number;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      // Cada base tem o SEU percentual — produto faturado e descarbonização
      // comissionam diferente.
      const cent = (n: number) => Math.round(n * 100) / 100;
      const amount_produto = cent(s.base_produto * (s.rate_pct / 100));
      const amount_descarb = cent(s.base_descarb * (s.rate_descarb_pct / 100));
      const { data: stmt, error } = await db.from("commission_statements").insert({
        vendedor_id: s.vendedor_id,
        vendedor_name: s.vendedor_name,
        period_start: s.period_start,
        period_end: s.period_end,
        base_sales: cent(s.base_produto + s.base_descarb),
        base_produto: s.base_produto,
        base_descarb: s.base_descarb,
        sales_count: s.sales_count,
        rate_pct: s.rate_pct,
        rate_descarb_pct: s.rate_descarb_pct,
        amount_produto,
        amount_descarb,
        amount_due: cent(amount_produto + amount_descarb),
        created_by: u?.user?.id ?? null,
      }).select("id").single();
      if (error) throw error;

      // Memória de cálculo: congela os pedidos faturados que formaram a base.
      const { data: det } = await db.rpc("crm_comissao_detalhe", {
        p_vendedor: s.vendedor_id, p_from: s.period_start, p_to: s.period_end,
      });
      // A descarbonização congela as NFS-e dela junto (mesma tabela: um pedido
      // é de UM tipo só, produto ou serviço, então não há linha em dobro).
      const { data: detDesc, error: errDesc } = s.base_descarb > 0
        ? await db.rpc("crm_comissao_descarb_detalhe", {
            p_vendedor: s.vendedor_id, p_from: s.period_start, p_to: s.period_end })
        : { data: [], error: null };
      if (errDesc) throw errDesc;
      const items = [...((det ?? []) as any[]), ...((detDesc ?? []) as any[])].map((o) => ({
        statement_id: stmt.id,
        order_id: o.order_id,
        order_number: o.order_number,
        customer_name: o.customer_name,
        total: o.total,
        sale_date: o.sale_date,
      }));
      if (items.length) await db.from("commission_statement_items").insert(items);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commission_statements"] });
      toast.success("Comissão gerada! Confira em Pagamentos.");
    },
    onError: (e: Error) => toast.error("Erro ao gerar comissão: " + e.message),
  });
}

// ── Regras de % de comissão (por vendedor / padrão) ───────────────────────────
export interface CommissionRule {
  id: string; vendedor_id: string | null; vendedor_name: string | null;
  rate_pct: number;          // produto faturado (com NF)
  rate_descarb_pct: number;  // descarbonização (NFS-e)
  active: boolean;
}
export function useCommissionRules() {
  return useQuery({
    queryKey: ["commission_rules"],
    queryFn: async (): Promise<CommissionRule[]> => {
      const { data, error } = await db.from("commission_rules").select("*").eq("active", true);
      if (error) throw error;
      return (data ?? []) as CommissionRule[];
    },
  });
}
export function useUpsertCommissionRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: {
      vendedor_id: string | null; vendedor_name?: string | null;
      rate_pct: number; rate_descarb_pct: number;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        vendedor_name: r.vendedor_name ?? null,
        rate_pct: r.rate_pct,
        rate_descarb_pct: r.rate_descarb_pct,
        active: true, updated_at: new Date().toISOString(),
      };
      if (r.vendedor_id) {
        const { error } = await db.from("commission_rules").upsert(
          { vendedor_id: r.vendedor_id, created_by: u?.user?.id ?? null, ...payload }, { onConflict: "vendedor_id" });
        if (error) throw error;
      } else {
        // Regra PADRÃO: atualiza se já existe, senão cria (evita onConflict por expressão).
        const { data: ex } = await db.from("commission_rules").select("id").is("vendedor_id", null).maybeSingle();
        if (ex?.id) {
          const { error } = await db.from("commission_rules").update(payload).eq("id", ex.id);
          if (error) throw error;
        } else {
          const { error } = await db.from("commission_rules").insert({ vendedor_id: null, created_by: u?.user?.id ?? null, ...payload });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["commission_rules"] }); toast.success("Regra salva."); },
    onError: (e: Error) => toast.error("Erro ao salvar regra: " + e.message),
  });
}

// ── Memória de cálculo de um fechamento ───────────────────────────────────────
export interface StatementItem { id: string; order_id: string | null; order_number: string | null; customer_name: string | null; total: number; sale_date: string | null; }
export function useStatementItems(statementId: string | null) {
  return useQuery({
    queryKey: ["commission_items", statementId],
    enabled: !!statementId,
    queryFn: async (): Promise<StatementItem[]> => {
      const { data, error } = await db.from("commission_statement_items").select("*").eq("statement_id", statementId).order("sale_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StatementItem[];
    },
  });
}

export interface CommissionPayment {
  id: string;
  statement_id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  notes: string | null;
}

/** Pagamentos de um fechamento (histórico). */
export function useStatementPayments(statementId: string | null) {
  return useQuery({
    queryKey: ["commission_payments", statementId],
    enabled: !!statementId,
    queryFn: async (): Promise<CommissionPayment[]> => {
      const { data, error } = await db
        .from("commission_payments")
        .select("*")
        .eq("statement_id", statementId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommissionPayment[];
    },
  });
}

/** Registra um pagamento (total ou parcial) — o trigger atualiza saldo/status. */
export function useAddPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { statement_id: string; amount: number; method?: string; notes?: string; paid_at?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("commission_payments").insert({
        statement_id: p.statement_id,
        amount: p.amount,
        method: p.method?.trim() || null,
        notes: p.notes?.trim() || null,
        // Data informada na tela. Sem ela o banco usa now(), o que datava
        // errado todo pagamento lançado depois do dia em que aconteceu.
        // Meio-dia para a conversão de fuso não jogar o registro para o dia
        // anterior — a coluna é timestamptz e o Brasil está atrás de UTC.
        paid_at: p.paid_at ? new Date(`${p.paid_at}T12:00:00`).toISOString() : new Date().toISOString(),
        paid_by: u?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["commission_statements"] });
      qc.invalidateQueries({ queryKey: ["commission_payments", vars.statement_id] });
      toast.success("Pagamento registrado!");
    },
    onError: (e: Error) => toast.error("Erro ao registrar pagamento: " + e.message),
  });
}

// ─── Números das NFs que formam a base ───────────────────────────────────────
// A comissão chama de "faturado" o pedido com `bling_nf_id` (conta 1 — ver
// `crm_comissao_detalhe`), então o número sai de `bling_nfe` por esse id. A
// tela mostrava "2 NF(s)" sem dizer QUAIS — e conferir comissão é bater NF.

const LOTE = 200;
const fatias = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / LOTE) }, (_, i) => xs.slice(i * LOTE, (i + 1) * LOTE));

/** Uma NF da base de comissão, com o pedido que ela fatura. */
export interface NfDaBase {
  order_id: string;
  order_number: string | null;
  customer_name: string | null;
  bling_nf_id: number;
  numero: string | null;
  valor: number | null;
  emissao: string | null;
  pdf_url: string | null;
  xml_url: string | null;
}

/** order_id → a NF dele (conta 1). Pedido sem `bling_nf_id` fica de fora; nota
 *  que ainda não chegou ao espelho volta com `numero` nulo — e APARECE assim,
 *  em vez de sumir da lista. */
async function nfsDosPedidos(orderIds: string[]): Promise<Map<string, NfDaBase>> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  const out = new Map<string, NfDaBase>();
  if (!ids.length) return out;
  const pedidos: any[] = [];
  for (const f of fatias(ids)) {
    const { data, error } = await db.from("carboze_orders")
      .select("id, order_number, customer_name, bling_nf_id").in("id", f);
    if (error) throw error;
    pedidos.push(...((data ?? []) as any[]).filter((o) => o.bling_nf_id != null));
  }
  const nfIds = [...new Set(pedidos.map((o) => Number(o.bling_nf_id)))];
  const nota = new Map<number, any>();
  for (const f of fatias(nfIds)) {
    const { data, error } = await db.from("bling_nfe")
      .select("bling_id, numero, valor_total, data_emissao, pdf_url, xml_url").in("bling_id", f);
    if (error) throw error;
    for (const n of (data ?? []) as any[]) nota.set(Number(n.bling_id), n);
  }
  for (const o of pedidos) {
    const n = nota.get(Number(o.bling_nf_id));
    out.set(o.id, {
      order_id: o.id, order_number: o.order_number ?? null, customer_name: o.customer_name ?? null,
      bling_nf_id: Number(o.bling_nf_id), numero: n?.numero ?? null,
      valor: n?.valor_total != null ? Number(n.valor_total) : null,
      emissao: n?.data_emissao ?? null, pdf_url: n?.pdf_url ?? null, xml_url: n?.xml_url ?? null,
    });
  }
  return out;
}

const ordenarNfs = (xs: NfDaBase[]) => {
  const unicas = new Map<number, NfDaBase>();
  for (const x of xs) if (!unicas.has(x.bling_nf_id)) unicas.set(x.bling_nf_id, x);
  return [...unicas.values()].sort((a, b) =>
    (a.numero ?? "").localeCompare(b.numero ?? "", "pt-BR", { numeric: true }));
};

// ── NFS-e de descarbonização (Portal Nacional) ──────────────────────────────
/** Uma NFS-e da base de comissão de descarbonização. */
export interface NfseDaBase {
  order_id: string;
  order_number: string | null;
  customer_name: string | null;
  emissao_id: string;
  numero: string | null;
  chave_acesso: string | null;
  valor: number | null;
  emissao: string | null;
}

const ordenarNfses = (xs: NfseDaBase[]) => {
  const unicas = new Map<string, NfseDaBase>();
  for (const x of xs) if (!unicas.has(x.emissao_id)) unicas.set(x.emissao_id, x);
  return [...unicas.values()].sort((a, b) =>
    (a.numero ?? "").localeCompare(b.numero ?? "", "pt-BR", { numeric: true }));
};

/** order_id → a NFS-e AUTORIZADA em produção dele (a mesma régua do Faturamento). */
async function nfsesDosPedidos(orderIds: string[]): Promise<Map<string, NfseDaBase>> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  const out = new Map<string, NfseDaBase>();
  if (!ids.length) return out;
  const pedidos = new Map<string, any>();
  for (const f of fatias(ids)) {
    const { data: em, error } = await db.from("carbo_nfse_emissoes")
      .select("id, order_id, n_nfse, chave_acesso, valor, concluido_em, enviado_em")
      .in("order_id", f).eq("ambiente", 1).eq("status", "autorizada");
    if (error) throw error;
    const comNota = ((em ?? []) as any[]);
    if (!comNota.length) continue;
    const { data: ps, error: e2 } = await db.from("carboze_orders")
      .select("id, order_number, customer_name").in("id", comNota.map((r) => r.order_id));
    if (e2) throw e2;
    for (const p of (ps ?? []) as any[]) pedidos.set(p.id, p);
    for (const r of comNota) {
      const p = pedidos.get(r.order_id);
      out.set(r.order_id, {
        order_id: r.order_id, order_number: p?.order_number ?? null, customer_name: p?.customer_name ?? null,
        emissao_id: r.id, numero: r.n_nfse ?? null, chave_acesso: r.chave_acesso ?? null,
        valor: r.valor != null ? Number(r.valor) : null,
        emissao: (r.concluido_em ?? r.enviado_em ?? "").slice(0, 10) || null,
      });
    }
  }
  return out;
}

/** Aba Calcular: as NFS-e de descarbonização de cada vendedor no período — a
 *  MESMA lista que vira memória ao gerar a comissão (`crm_comissao_descarb_detalhe`). */
export function useNfsesDaComissao(from: string, to: string, vendedorIds: string[]) {
  const chave = [...vendedorIds].sort().join(",");
  return useQuery({
    queryKey: ["comissao_nfses", from, to, chave],
    enabled: !!from && !!to && vendedorIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, NfseDaBase[]>> => {
      const porVendedor = new Map<string, NfseDaBase[]>();
      await Promise.all(vendedorIds.map(async (vid) => {
        const { data, error } = await db.rpc("crm_comissao_descarb_detalhe", { p_vendedor: vid, p_from: from, p_to: to });
        if (error) throw error;
        porVendedor.set(vid, ordenarNfses(((data ?? []) as any[]).map((r) => ({
          order_id: r.order_id, order_number: r.order_number ?? null, customer_name: r.customer_name ?? null,
          emissao_id: r.emissao_id, numero: r.n_nfse ?? null, chave_acesso: r.chave_acesso ?? null,
          valor: r.total != null ? Number(r.total) : null, emissao: r.sale_date ?? null,
        }))));
      }));
      return porVendedor;
    },
  });
}

/** PDF da NFS-e: a representação do CarboHub (`lib/nfsePdf.ts`) a partir do XML
 *  que o ADN devolveu. ⚠️ A nota chega ao espelho pela ingestão de hora em hora:
 *  recém-emitida ainda não está lá, e isso é DITO, nunca vira PDF vazio. */
export async function baixarPdfNfse(chave: string | null) {
  const d = (chave ?? "").replace(/\D/g, "");
  if (!d) throw new Error("Esta NFS-e não tem chave de acesso gravada.");
  const { data, error } = await db.from("carbo_nfse_visao").select("*")
    .eq("chave_acesso", chave).limit(1);
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) throw new Error("A nota ainda não chegou do Portal Nacional (a leitura roda de hora em hora). Use o XML por enquanto.");
  const { gerarPdfNfse } = await import("@/lib/nfsePdf");
  gerarPdfNfse(row);
}

/** XML oficial devolvido pelo SEFIN na emissão (`carbo_nfse_emissoes.nfse_xml`). */
export async function baixarXmlEmissaoNfse(emissaoId: string, numero: string | null) {
  const { data, error } = await db.from("carbo_nfse_emissoes").select("nfse_xml").eq("id", emissaoId).maybeSingle();
  if (error) throw error;
  if (!data?.nfse_xml) throw new Error("Esta NFS-e não tem XML guardado.");
  const url = URL.createObjectURL(new Blob([data.nfse_xml], { type: "application/xml" }));
  const a = document.createElement("a");
  a.href = url; a.download = `NFSe-${numero ?? emissaoId}.xml`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Aba Calcular: as NFs de cada vendedor no período — a MESMA lista que vira
 *  memória de cálculo ao gerar a comissão (`crm_comissao_detalhe`). */
export function useNfsDaComissao(from: string, to: string, vendedorIds: string[]) {
  const chave = [...vendedorIds].sort().join(",");
  return useQuery({
    queryKey: ["comissao_nfs", from, to, chave],
    enabled: !!from && !!to && vendedorIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, NfDaBase[]>> => {
      const detalhes = await Promise.all(vendedorIds.map(async (vid) => {
        const { data, error } = await db.rpc("crm_comissao_detalhe", { p_vendedor: vid, p_from: from, p_to: to });
        if (error) throw error;
        return [vid, ((data ?? []) as any[]).map((o) => String(o.order_id))] as const;
      }));
      const nfs = await nfsDosPedidos(detalhes.flatMap(([, ids]) => ids));
      const porVendedor = new Map<string, NfDaBase[]>();
      for (const [vid, ids] of detalhes) {
        porVendedor.set(vid, ordenarNfs(ids.map((i) => nfs.get(i)).filter(Boolean) as NfDaBase[]));
      }
      return porVendedor;
    },
  });
}

/** Aba Pagamentos: as NFs CONGELADAS em cada fechamento (`commission_statement_items`).
 *  Devolve também o mapa por pedido, para a memória de cálculo. */
export function useNfsDosFechamentos(statementIds: string[]) {
  const chave = [...statementIds].sort().join(",");
  return useQuery({
    queryKey: ["fechamento_nfs", chave],
    enabled: statementIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      // ⚠️ Lote de fechamentos NÃO é lote de linhas: cada fechamento tem N
      // itens, e o PostgREST corta em 1.000 calado.
      const itens = await lerPorIdsSemTeto<{ statement_id: string; order_id: string }>(statementIds, (f) =>
        db.from("commission_statement_items")
          .select("statement_id, order_id").in("statement_id", f).order("id"));
      const [porPedido, nfsePorPedido] = await Promise.all([
        nfsDosPedidos(itens.map((i) => i.order_id)),
        nfsesDosPedidos(itens.map((i) => i.order_id)),
      ]);
      const juntas = new Map<string, NfDaBase[]>();
      const juntasNfse = new Map<string, NfseDaBase[]>();
      for (const i of itens) {
        const n = porPedido.get(i.order_id);
        if (n) (juntas.get(i.statement_id) ?? juntas.set(i.statement_id, []).get(i.statement_id)!).push(n);
        const ns = nfsePorPedido.get(i.order_id);
        if (ns) (juntasNfse.get(i.statement_id) ?? juntasNfse.set(i.statement_id, []).get(i.statement_id)!).push(ns);
      }
      const porFechamento = new Map<string, NfDaBase[]>();
      for (const [k, v] of juntas) porFechamento.set(k, ordenarNfs(v));
      const nfsePorFechamento = new Map<string, NfseDaBase[]>();
      for (const [k, v] of juntasNfse) nfsePorFechamento.set(k, ordenarNfses(v));
      return { porFechamento, porPedido, nfsePorFechamento, nfsePorPedido };
    },
  });
}
