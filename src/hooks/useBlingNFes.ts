import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type NFeMatchStatus = "pending" | "matched" | "no_code" | "invalid_code" | "manual" | "ignored";

export interface BlingNFe {
  id: string;
  bling_id: number;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  data_emissao: string | null;
  contato_nome: string | null;
  contato_cnpj: string | null;
  valor_total: number | null;
  situacao: string | null;
  informacoes_adicionais: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  order_id: string | null;
  matched_order_number: string | null;
  match_status: NFeMatchStatus;
  match_error: string | null;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface BlingNFeFilters {
  month?: string;         // YYYY-MM
  matchStatus?: NFeMatchStatus | "all";
  search?: string;
}

export const NF_MATCH_LABELS: Record<NFeMatchStatus, string> = {
  pending:      "Processando",
  matched:      "Vinculada",
  no_code:      "Sem pedido",
  invalid_code: "Código inválido",
  manual:       "Manual",
  ignored:      "Arquivada",
};

export const NF_MATCH_VARIANT: Record<NFeMatchStatus, "success" | "warning" | "destructive" | "secondary"> = {
  matched:      "success",
  manual:       "success",
  pending:      "secondary",
  no_code:      "secondary",   // neutro: NF avulsa, sem ação necessária
  invalid_code: "warning",     // único que realmente pede atenção (código existe mas inválido)
  ignored:      "secondary",
};

export function useBlingNFes(filters: BlingNFeFilters = {}) {
  return useQuery({
    queryKey: ["bling-nfes", filters],
    queryFn: async () => {
      let query = supabase
        .from("bling_nfe")
        .select("*")
        .order("data_emissao", { ascending: false })
        .order("created_at", { ascending: false });

      if (filters.month) {
        const [yr, mo] = filters.month.split("-").map(Number);
        const lastDay = new Date(yr, mo, 0).getDate();
        query = query
          .gte("data_emissao", `${filters.month}-01`)
          .lte("data_emissao", `${filters.month}-${String(lastDay).padStart(2, "0")}`);
      }

      // Filtro de status é aplicado no cliente (BlingNFsPage) para que os KPIs de
      // balanço do mês considerem TODAS as NFs (inclusive arquivadas), enquanto a
      // tabela mostra a visão filtrada. Aqui só filtramos se explicitamente pedido.
      if (filters.matchStatus && filters.matchStatus !== "all") {
        query = query.eq("match_status", filters.matchStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data || []) as BlingNFe[];

      if (filters.search) {
        const q = filters.search.toLowerCase();
        rows = rows.filter(nf =>
          nf.contato_nome?.toLowerCase().includes(q) ||
          nf.contato_cnpj?.includes(q) ||
          nf.numero?.includes(q) ||
          nf.matched_order_number?.toLowerCase().includes(q) ||
          nf.informacoes_adicionais?.toLowerCase().includes(q)
        );
      }

      return rows;
    },
  });
}

/** Pedidos confirmados que ainda NÃO têm NF vinculada — candidatos para vínculo manual. */
export interface LinkableOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  total: number | null;
  status: string;
  created_at: string;
}

export function useLinkableOrders(search: string, enabled = true) {
  return useQuery({
    queryKey: ["linkable-orders", search],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("carboze_orders")
        .select("id, order_number, customer_name, total, status, created_at")
        .is("bling_nf_id", null)
        .in("status", ["confirmed", "invoiced", "shipped", "delivered"])
        .order("created_at", { ascending: false })
        .limit(50);

      const term = search.trim();
      if (term) {
        q = q.or(`customer_name.ilike.%${term}%,order_number.ilike.%${term}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as LinkableOrder[];
    },
  });
}

export function useLinkNFeToOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ nfeId, orderNumber }: { nfeId: string; orderNumber: string }) => {
      // Validate order exists
      const { data: order, error: orderErr } = await supabase
        .from("carboze_orders")
        .select("id, order_number, bling_nf_id")
        .eq("order_number", orderNumber.toUpperCase().trim())
        .maybeSingle();

      if (orderErr) throw orderErr;
      if (!order) throw new Error(`Pedido ${orderNumber} não encontrado`);

      // Get NF data
      const { data: nf, error: nfErr } = await supabase
        .from("bling_nfe")
        .select("id, bling_id, chave_acesso, numero")
        .eq("id", nfeId)
        .single();

      if (nfErr) throw nfErr;

      // Update bling_nfe
      const { error: e1 } = await supabase.from("bling_nfe").update({
        order_id: order.id,
        matched_order_number: order.order_number,
        match_status: "manual" as NFeMatchStatus,
        match_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", nfeId);
      if (e1) throw e1;

      // Denormalize onto carboze_orders
      const { error: e2 } = await supabase.from("carboze_orders").update({
        bling_nf_id:    (nf as any).bling_id,
        nf_access_key:  (nf as any).chave_acesso || null,
        invoice_number: (nf as any).numero || null,
      }).eq("id", order.id);
      if (e2) throw e2;

      return { order, nf };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bling-nfes"] });
      queryClient.invalidateQueries({ queryKey: ["carboze-orders"] });
      queryClient.invalidateQueries({ queryKey: ["vendas"] });
      queryClient.invalidateQueries({ queryKey: ["faturamento"] });
      queryClient.invalidateQueries({ queryKey: ["nfe-link-suggestions"] });
      toast.success("NF vinculada ao pedido com sucesso!");
    },
    onError: (err: Error) => {
      toast.error("Erro ao vincular NF: " + err.message);
    },
  });
}

export function useUnlinkNFe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (nfeId: string) => {
      // Get current order_id before unlinking
      const { data: nf } = await supabase
        .from("bling_nfe")
        .select("order_id")
        .eq("id", nfeId)
        .single();

      // Unlink bling_nfe
      const { error: e1 } = await supabase.from("bling_nfe").update({
        order_id: null,
        matched_order_number: null,
        match_status: "no_code" as NFeMatchStatus,
        match_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", nfeId);
      if (e1) throw e1;

      // Clear NF fields on carboze_orders
      if ((nf as any)?.order_id) {
        await supabase.from("carboze_orders").update({
          bling_nf_id:    null,
          nf_access_key:  null,
          invoice_number: null,
        }).eq("id", (nf as any).order_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bling-nfes"] });
      queryClient.invalidateQueries({ queryKey: ["carboze-orders"] });
      queryClient.invalidateQueries({ queryKey: ["vendas"] });
      queryClient.invalidateQueries({ queryKey: ["faturamento"] });
      toast.success("Vínculo removido.");
    },
    onError: (err: Error) => {
      toast.error("Erro ao desvincular: " + err.message);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sugestões de vínculo NF ↔ pedido (para pedidos nascidos no Bling)
//
// O matcher automático "oficial" só casa pela observação (PED-AAAA-NNNNN), que
// pedidos nascidos no Bling (BLING-XXX) não têm. Aqui calculamos uma RECOMENDAÇÃO
// por cliente + valor + data. O sistema sugere; o humano confirma (nada é
// aplicado sozinho — assim a vinculação é uma decisão registrada de quem clicou).
// ─────────────────────────────────────────────────────────────────────────────
export type SuggestionConfidence = "alta" | "media" | "baixa";

export interface NfeLinkSuggestion {
  orderId: string;
  orderNumber: string;
  orderCustomer: string | null;
  orderTotal: number | null;
  orderDate: string | null;
  nfeId: string;
  nfeNumero: string | null;
  nfeContato: string | null;
  nfeValor: number | null;
  nfeData: string | null;
  confidence: SuggestionConfidence;
  reasons: string[];
}

function normalizeName(s: string | null): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function useNfeLinkSuggestions() {
  return useQuery({
    queryKey: ["nfe-link-suggestions"],
    staleTime: 30_000,
    queryFn: async (): Promise<NfeLinkSuggestion[]> => {
      // Pedidos nascidos no Bling, ainda sem NF vinculada
      const { data: ordersData, error: oErr } = await supabase
        .from("carboze_orders")
        .select("id, order_number, customer_name, total, created_at, sale_date")
        .is("bling_nf_id", null)
        .like("order_number", "BLING-%")
        .limit(500);
      if (oErr) throw oErr;

      // NFs do Bling ainda não vinculadas a nenhum pedido (e não arquivadas)
      const { data: nfData, error: nErr } = await supabase
        .from("bling_nfe")
        .select("id, numero, contato_nome, valor_total, data_emissao, order_id, match_status")
        .is("order_id", null)
        .neq("match_status", "ignored")
        .limit(1000);
      if (nErr) throw nErr;

      const orders = ordersData || [];
      const nfs = nfData || [];

      // Gera todos os pares candidatos com pontuação
      type Pair = { orderIdx: number; nfIdx: number; score: number; reasons: string[] };
      const pairs: Pair[] = [];

      orders.forEach((o, oi) => {
        const ov = Number(o.total) || 0;
        const on = normalizeName(o.customer_name);
        const od = (o.sale_date || o.created_at || "").slice(0, 10);

        nfs.forEach((nf, ni) => {
          const nv = Number(nf.valor_total) || 0;
          const nn = normalizeName(nf.contato_nome);
          const nd = (nf.data_emissao || "").slice(0, 10);
          const reasons: string[] = [];
          let score = 0;

          // Valor
          const diff = Math.abs(ov - nv);
          if (diff < 0.01) {
            score += 50;
            reasons.push(`mesmo valor (${brl(ov)})`);
          } else if (ov > 0 && diff / ov <= 0.02) {
            score += 25;
            reasons.push("valor muito próximo");
          }

          // Cliente
          if (on && nn) {
            if (on === nn) {
              score += 40;
              reasons.push("mesmo cliente");
            } else if (on.includes(nn) || nn.includes(on)) {
              score += 25;
              reasons.push("cliente semelhante");
            }
          }

          // Data
          if (od && nd) {
            const days = Math.abs((new Date(od).getTime() - new Date(nd).getTime()) / 86_400_000);
            if (days <= 3) {
              score += 10;
              reasons.push("datas próximas");
            } else if (days <= 10) {
              score += 5;
            }
          }

          // Só considera pares com sinal mínimo (evita ruído)
          if (score >= 25) pairs.push({ orderIdx: oi, nfIdx: ni, score, reasons });
        });
      });

      // Atribuição gulosa: maior pontuação primeiro, cada NF e cada pedido
      // entram em no máximo uma sugestão.
      pairs.sort((a, b) => b.score - a.score);
      const usedOrders = new Set<number>();
      const usedNfs = new Set<number>();
      const out: NfeLinkSuggestion[] = [];

      for (const p of pairs) {
        if (usedOrders.has(p.orderIdx) || usedNfs.has(p.nfIdx)) continue;
        usedOrders.add(p.orderIdx);
        usedNfs.add(p.nfIdx);
        const o = orders[p.orderIdx];
        const nf = nfs[p.nfIdx];
        const confidence: SuggestionConfidence =
          p.score >= 80 ? "alta" : p.score >= 50 ? "media" : "baixa";
        out.push({
          orderId: o.id,
          orderNumber: o.order_number,
          orderCustomer: o.customer_name,
          orderTotal: o.total,
          orderDate: (o.sale_date || o.created_at || "").slice(0, 10),
          nfeId: nf.id,
          nfeNumero: nf.numero,
          nfeContato: nf.contato_nome,
          nfeValor: nf.valor_total,
          nfeData: nf.data_emissao,
          confidence,
          reasons: p.reasons,
        });
      }

      // Ordena por confiança (alta → baixa) para revisão
      const rank: Record<SuggestionConfidence, number> = { alta: 0, media: 1, baixa: 2 };
      out.sort((a, b) => rank[a.confidence] - rank[b.confidence]);
      return out;
    },
  });
}

/** Arquiva (ignored) ou desarquiva uma NF — para dar baixa explícita em NFs sem ação. */
export function useArchiveNFe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ nfeId, archive }: { nfeId: string; archive: boolean }) => {
      // Ao desarquivar, volta para "no_code" (sem pedido) — estado neutro padrão.
      const { error } = await supabase.from("bling_nfe").update({
        match_status: (archive ? "ignored" : "no_code") as NFeMatchStatus,
        updated_at: new Date().toISOString(),
      }).eq("id", nfeId);
      if (error) throw error;
    },
    onSuccess: (_, { archive }) => {
      queryClient.invalidateQueries({ queryKey: ["bling-nfes"] });
      toast.success(archive ? "NF arquivada." : "NF desarquivada.");
    },
    onError: (err: Error) => {
      toast.error("Erro: " + err.message);
    },
  });
}
