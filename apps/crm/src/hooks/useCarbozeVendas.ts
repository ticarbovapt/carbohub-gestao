import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FILTRO_VENDA_DO_TIME, ehVendaDoTime } from "@/lib/vendaDoTime";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Vendas e Orçamentos do Carbo Sales — FONTE ÚNICA: carboze_orders.
// Espelha a query da VendasPage do Controle: janela por created_at (±1 mês) e
// refino client-side pela data efetiva (sale_date ?? created_at) dentro do
// período. Orçamento = status 'quote'; pedido = demais status.
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface VendaItem {
  name: string; quantity: number; unit_price: number; total: number;
  product_code?: string | null;
  bonus_quantity?: number;
  // Desconto POR ITEM (gravado no ato da venda).
  discount_type?: string;     // 'percent' | 'value' | 'none'
  discount_value?: number;    // número digitado (% ou R$)
  discount_amount?: number;   // R$ abatido na linha
}

export interface CarbozeVendaRow {
  id: string;
  order_number: string;
  created_at: string;
  sale_date: string | null;
  customer_name: string;
  customer_doc: string | null;
  customer_ie: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  billing_address: Record<string, unknown> | null;
  notes: string | null;
  items: VendaItem[];
  total: number;
  // Financeiro do pedido (carboze_orders).
  subtotal: number | null;
  discount: number | null;
  discount_percent: number | null;
  // Pagamento / frete.
  payment_terms: string | null;
  freight_type: string | null;
  shipping_cost: number | null;
  // Prazos.
  agreed_delivery_date: string | null;
  ppf_date: string | null;
  ppe_date: string | null;
  // Extras.
  po_number: string | null;
  buyer_notes: string | null;
  general_notes: string | null;
  // Notas internas + dados estratégicos (o que a tela Vender grava no bloco
  // "Notas Internas"). Nunca saiu na tela de Vendas — o vendedor escrevia e
  // não conseguia reler.
  internal_notes: string | null;
  /** A REGRA: esta venda conta como faturamento? Vem da carbo_vendas_metrica. */
  conta_metrica: boolean;
  /** Por que não conta: orcamento | cancelado | excluido_manualmente |
   *  nf_invalida | aguardando_nf. Null quando conta. */
  motivo_fora: string | null;
  status: string;             // quote | pending | confirmed | invoiced | shipped | delivered | cancelled
  fulfillment_stage: string | null; // etapa no kanban de rastreio (Pós-venda/Ops)
  vendedor_id: string | null;
  vendedor_name: string | null;
  invoice_number: string | null;
  bling_nf_id: number | null;
  external_ref: string | null;    // "bling-<id>" quando o pedido já foi enviado ao Bling
}

interface Params {
  month: Date;
  customFrom?: string;
  customTo?: string;
  vendedorFilter?: string;        // "__all__" | profile id
  isGestor: boolean;
  userId?: string;
  /** Busca global. Com termo, MANDA: varre todo o histórico e ignora mês e
   *  vendedor. Sem termo, o comportamento é o de sempre (mês + vendedor). */
  search?: string;
}

/** Lê carboze_orders no período. RLS já limita o colaborador ao próprio escopo;
 *  o filtro por vendedor só é aplicado para gestor. */
export function useCarbozeVendas({ month, customFrom, customTo, vendedorFilter, isGestor, userId, search }: Params) {
  const hasCustom = !!(customFrom || customTo);
  // NÃO usar trim(): o espaço no fim é significativo — é ele que pede a
  // palavra inteira ("a " = só onde "a" é palavra sozinha).
  const termo = search ?? "";
  // 1 caractere já vale: a busca casa por INÍCIO DE PALAVRA, então "a" traz
  // quem começa com "a", não todo mundo que tem "a" no meio.
  const buscando = termo.trim().length >= 1;

  return useQuery({
    queryKey: ["carboze_vendas", month.toISOString().slice(0, 7), customFrom, customTo, vendedorFilter, isGestor, userId, buscando ? termo : ""],
    enabled: !!userId,
    queryFn: async (): Promise<CarbozeVendaRow[]> => {
      // ── Busca global: manda em cima de mês e vendedor ──────────────────
      // A RPC é SECURITY INVOKER, então a RLS continua valendo: colaborador
      // segue vendo só as próprias vendas por mais amplo que seja o termo.
      if (buscando) {
        const { data, error } = await db.rpc("carbo_vendas_busca", { p_termo: termo, p_limit: 300 });
        if (error) throw error;
        // A RPC é compartilhada e não conhece esta regra: filtra aqui, senão a
        // busca traria o marketplace que a lista esconde — e o time acharia
        // que "sumiu da lista mas está na busca" é bug.
        return ((data ?? []) as any[]).filter(ehVendaDoTime).map(mapVenda);
      }

      let rangeStart: string, rangeEnd: string, qStart: string, qEnd: string;
      if (hasCustom) {
        rangeStart = customFrom || "2000-01-01";
        rangeEnd = customTo || "2099-12-31";
        qStart = rangeStart + "T00:00:00.000Z";
        qEnd = rangeEnd + "T23:59:59.999Z";
      } else {
        const yr = month.getFullYear(), mo = month.getMonth() + 1;
        const lastDay = new Date(yr, mo, 0).getDate();
        rangeStart = `${yr}-${String(mo).padStart(2, "0")}-01`;
        rangeEnd = `${yr}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        qStart = new Date(yr, mo - 2, 1).toISOString();
        qEnd = new Date(yr, mo + 1, 0, 23, 59, 59).toISOString();
      }

      let query = db
        // ⚠️ carbo_vendas_metrica, NÃO carboze_orders.
        //
        // A view devolve todas as colunas do pedido MAIS `conta_metrica` — a
        // regra única de "esta venda conta como faturamento". Antes esta tela
        // tinha regra própria (NF vinculada OU invoice_number OU status
        // entregue) que era mais frouxa que a do resto do sistema: contava
        // pedido com nota Pendente ou Rejeitada. Resultado: o Total Faturado
        // do Sales dava R$ 51.274 e o Dashboard do Admin, R$ 48 mil, no mesmo
        // mês. Duas telas, dois números, nenhum errado por bug — errado por
        // haver duas definições.
        //
        // A view é security_invoker: a RLS de carboze_orders continua valendo.
        .from("carbo_vendas_metrica")
        .select("*")
        // Marketplace do Bling 2 não é venda do time — ver lib/vendaDoTime.
        .or(FILTRO_VENDA_DO_TIME)
        .neq("excluir_metricas", true)
        .gte("created_at", qStart)
        .lte("created_at", qEnd)
        .order("created_at", { ascending: false });

      if (!isGestor) {
        query = query.eq("vendedor_id", userId);
      } else if (vendedorFilter && vendedorFilter !== "__all__") {
        query = query.eq("vendedor_id", vendedorFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      return ((data ?? []) as any[])
        .filter((row) => {
          const eff = (row.sale_date as string | null) ?? (row.created_at as string).substring(0, 10);
          return eff >= rangeStart && eff <= rangeEnd;
        })
        .map(mapVenda);
    },
  });
}

/** Linha crua de carboze_orders → CarbozeVendaRow. Uma só, para os dois
 *  caminhos (janela por mês e busca global) devolverem exatamente o mesmo
 *  formato — senão a tela renderiza diferente dependendo de como chegou. */
function mapVenda(row: any): CarbozeVendaRow {
  return ({
          id: row.id,
          order_number: row.order_number,
          created_at: row.created_at,
          sale_date: row.sale_date ?? null,
          customer_name: row.customer_name ?? "—",
          customer_doc: row.cnpj ?? null,
          customer_ie: row.customer_ie ?? null,
          customer_email: row.customer_email ?? null,
          customer_phone: row.customer_phone ?? null,
          delivery_address: row.delivery_address ?? null,
          delivery_city: row.delivery_city ?? null,
          delivery_state: row.delivery_state ?? null,
          delivery_zip: row.delivery_zip ?? null,
          billing_address: (row.billing_address ?? null) as Record<string, unknown> | null,
          notes: row.notes ?? null,
          items: Array.isArray(row.items) ? (row.items as VendaItem[]) : [],
          total: Number(row.total || 0),
          subtotal: row.subtotal != null ? Number(row.subtotal) : null,
          discount: row.discount != null ? Number(row.discount) : null,
          discount_percent: row.discount_percent != null ? Number(row.discount_percent) : null,
          payment_terms: row.payment_terms ?? null,
          freight_type: row.freight_type ?? null,
          shipping_cost: row.shipping_cost != null ? Number(row.shipping_cost) : null,
          agreed_delivery_date: row.agreed_delivery_date ?? null,
          ppf_date: row.ppf_date ?? null,
          ppe_date: row.ppe_date ?? null,
          po_number: row.po_number ?? null,
          buyer_notes: row.buyer_notes ?? null,
          general_notes: row.general_notes ?? null,
          internal_notes: row.internal_notes ?? null,
          conta_metrica: row.conta_metrica === true,
          motivo_fora: row.motivo_fora ?? null,
          status: row.status,
          fulfillment_stage: row.fulfillment_stage ?? null,
          vendedor_id: row.vendedor_id ?? null,
          vendedor_name: row.vendedor_name ?? null,
          invoice_number: row.invoice_number ?? null,
          bling_nf_id: row.bling_nf_id ?? null,
          external_ref: row.external_ref ?? null,
  });
}

/** Converte orçamento (status 'quote') em pedido ('pending'). Idempotente. */
export function useConvertQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await db
        .from("carboze_orders")
        .update({ status: "pending", confirmed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "quote")
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("Orçamento não encontrado ou já convertido.");
      try {
        await db.from("order_status_history").insert({
          order_id: id, status: "pending",
          notes: "Orçamento aprovado e convertido em venda", changed_by: u?.user?.id ?? null,
        });
      } catch { /* ignore */ }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carboze_vendas"] }),
  });
}

/** Exclui uma venda (só gestor — validado no banco). Grava log auditável
 *  (carboze_order_deletions) antes de apagar e libera o número da venda. */
export function useDeleteVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await db.rpc("carboze_order_delete", { p_id: id, p_reason: reason ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carboze_vendas"] });
      toast.success("Venda excluída.");
    },
    onError: (e: Error) => toast.error("Erro ao excluir venda: " + e.message),
  });
}

/**
 * Cancela uma venda sem apagá-la.
 *
 * A diferença que importa: EXCLUIR apaga a linha e libera o número — serve
 * para venda lançada errada, que nunca deveria ter existido. CANCELAR mantém
 * o registro, tira do faturamento e ESTORNA o estoque que já tinha sido
 * deduzido. É o caso comum: cliente desistiu, boleto não pagou, NF caiu.
 *
 * Toda a lógica vive na RPC `carboze_order_cancel` (permissão, estorno,
 * status + etapa, histórico) porque é a única forma de os cinco apps se
 * comportarem igual — e de o estorno e a mudança de status serem atômicos.
 */
export function useCancelVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await db.rpc("carboze_order_cancel", { p_id: id, p_reason: reason ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carboze_vendas"] });
      toast.success("Venda cancelada. Saiu do faturamento e o estoque foi estornado.");
    },
    onError: (e: Error) => toast.error("Erro ao cancelar venda: " + e.message),
  });
}

// Arquivos da NF já vinculada (o faturamento/emissão acontece no Finanças; aqui
// o Sales só BAIXA a NF que já casou com o pedido). O pedido guarda
// `bling_nf_id` (= bling_nfe.bling_id); a bling_nfe tem os links de PDF/XML.
export interface NfFiles {
  pdf_url: string | null;
  xml_url: string | null;
  chave_acesso: string | null;
  numero: string | null;
}

/**
 * Busca os arquivos (PDF/XML) da NF vinculada a um pedido, pelo bling_nf_id.
 *
 * A lista do Bling NÃO traz o link do DANFE — só o detalhe GET /nfe/{id}. Por
 * isso o `bling_nfe.pdf_url` do cache costuma vir null. Quando faltar, buscamos
 * o link AO VIVO na edge function `bling-sync` (entity `nfe_links`), que busca
 * no Bling e cacheia — mesmo caminho do Finanças (useNfeLinks). Assim o botão
 * "Baixar NF" do Sales funciona sem depender do cache estar preenchido.
 */
export async function fetchNfFiles(blingNfId: number): Promise<NfFiles | null> {
  const { data, error } = await db
    .from("bling_nfe")
    .select("pdf_url, xml_url, chave_acesso, numero")
    .eq("bling_id", blingNfId)
    .maybeSingle();
  if (error) throw error;

  const cached = (data as NfFiles) ?? null;
  if (cached?.pdf_url || cached?.xml_url) return cached;

  // Cache sem link — busca ao vivo no Bling (e cacheia pdf_url pra próxima vez).
  const res = await supabase.functions.invoke("bling-sync", {
    body: { entity: "nfe_links", bling_nf_id: blingNfId },
  });
  if (!res.data?.success) {
    // Deixa o cache (pode ter chave/numero) e sinaliza que não veio arquivo.
    return cached;
  }
  return {
    pdf_url: res.data.pdf ?? cached?.pdf_url ?? null,
    xml_url: res.data.xml ?? cached?.xml_url ?? null,
    chave_acesso: cached?.chave_acesso ?? null,
    numero: cached?.numero ?? null,
  };
}

/** Atribui vendedor (perfil) a vários pedidos de uma vez — grava vendedor_id/name. */
export function useBulkAssignVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderIds, vendedorId, vendedorName }: { orderIds: string[]; vendedorId: string; vendedorName: string }) => {
      const { error } = await db
        .from("carboze_orders")
        .update({ vendedor_id: vendedorId, vendedor_name: vendedorName, updated_at: new Date().toISOString() })
        .in("id", orderIds);
      if (error) throw error;
    },
    onSuccess: (_d, { orderIds }) => {
      qc.invalidateQueries({ queryKey: ["carboze_vendas"] });
      toast.success(`${orderIds.length} pedido(s) atribuído(s) com sucesso!`);
    },
    onError: (e: Error) => toast.error("Erro ao atribuir vendedor: " + e.message),
  });
}
