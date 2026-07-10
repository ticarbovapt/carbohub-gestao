import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Vínculo NF ↔ pedido assistido (Finanças). O matcher automático "oficial" casa
// pela observação (V…/PED-AAAA-NNNNN) durante o sync — cobre as vendas do sistema
// cuja observação chegou na NF. Este flow é a REDE DE SEGURANÇA para o resto:
//   • pedidos nativos do Bling (BLING-*), que nunca têm esse código;
//   • vendas do sistema (V…) cuja observação o Bling não copiou pra NF.
// A recomendação é por cliente + valor + data. O sistema SUGERE; o humano CONFIRMA
// (nada é aplicado sozinho — o vínculo é uma decisão registrada de quem clicou).
// Portado de src/hooks/useBlingNFes.ts (Controle), ampliado p/ incluir os V….
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

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function useNfeLinkSuggestions() {
  return useQuery({
    queryKey: ["nfe-link-suggestions"],
    staleTime: 30_000,
    queryFn: async (): Promise<NfeLinkSuggestion[]> => {
      // Pedidos ainda SEM NF vinculada — inclui nativos do Bling (BLING-*) E vendas
      // do sistema (V…) que não casaram por observação. Filtra por status que
      // plausivelmente já têm NF pra não trazer rascunho/novo à toa.
      const { data: ordersData, error: oErr } = await supabase
        .from("carboze_orders")
        .select("id, order_number, customer_name, total, created_at, sale_date")
        .is("bling_nf_id", null)
        .in("status", ["confirmed", "invoiced", "shipped", "delivered"])
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

      type Pair = { orderIdx: number; nfIdx: number; score: number; reasons: string[] };
      const pairs: Pair[] = [];

      orders.forEach((o: any, oi: number) => {
        const ov = Number(o.total) || 0;
        const on = normalizeName(o.customer_name);
        const od = (o.sale_date || o.created_at || "").slice(0, 10);

        nfs.forEach((nf: any, ni: number) => {
          const nv = Number(nf.valor_total) || 0;
          const nn = normalizeName(nf.contato_nome);
          const nd = (nf.data_emissao || "").slice(0, 10);
          const reasons: string[] = [];
          let score = 0;

          // Valor
          const diff = Math.abs(ov - nv);
          if (diff < 0.01) { score += 50; reasons.push(`mesmo valor (${brl(ov)})`); }
          else if (ov > 0 && diff / ov <= 0.02) { score += 25; reasons.push("valor muito próximo"); }

          // Cliente
          if (on && nn) {
            if (on === nn) { score += 40; reasons.push("mesmo cliente"); }
            else if (on.includes(nn) || nn.includes(on)) { score += 25; reasons.push("cliente semelhante"); }
          }

          // Data
          if (od && nd) {
            const days = Math.abs((new Date(od).getTime() - new Date(nd).getTime()) / 86_400_000);
            if (days <= 3) { score += 10; reasons.push("datas próximas"); }
            else if (days <= 10) { score += 5; }
          }

          if (score >= 25) pairs.push({ orderIdx: oi, nfIdx: ni, score, reasons });
        });
      });

      // Atribuição gulosa: maior pontuação primeiro; cada NF e cada pedido em no
      // máximo uma sugestão.
      pairs.sort((a, b) => b.score - a.score);
      const usedOrders = new Set<number>();
      const usedNfs = new Set<number>();
      const out: NfeLinkSuggestion[] = [];

      for (const p of pairs) {
        if (usedOrders.has(p.orderIdx) || usedNfs.has(p.nfIdx)) continue;
        usedOrders.add(p.orderIdx);
        usedNfs.add(p.nfIdx);
        const o: any = orders[p.orderIdx];
        const nf: any = nfs[p.nfIdx];
        const confidence: SuggestionConfidence = p.score >= 80 ? "alta" : p.score >= 50 ? "media" : "baixa";
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

      const rank: Record<SuggestionConfidence, number> = { alta: 0, media: 1, baixa: 2 };
      out.sort((a, b) => rank[a.confidence] - rank[b.confidence]);
      return out;
    },
  });
}

/** Vincula manualmente a NF ao pedido (o humano confirmou a sugestão). */
export function useLinkNFeToOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nfeId, orderNumber }: { nfeId: string; orderNumber: string }) => {
      const { data: order, error: orderErr } = await supabase
        .from("carboze_orders")
        .select("id, order_number")
        .eq("order_number", orderNumber.toUpperCase().trim())
        .maybeSingle();
      if (orderErr) throw orderErr;
      if (!order) throw new Error(`Pedido ${orderNumber} não encontrado`);

      const { data: nf, error: nfErr } = await supabase
        .from("bling_nfe")
        .select("id, bling_id, chave_acesso, numero")
        .eq("id", nfeId)
        .single();
      if (nfErr) throw nfErr;

      const { error: e1 } = await supabase.from("bling_nfe").update({
        order_id: (order as any).id,
        matched_order_number: (order as any).order_number,
        match_status: "manual",
        match_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", nfeId);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("carboze_orders").update({
        bling_nf_id: (nf as any).bling_id,
        nf_access_key: (nf as any).chave_acesso || null,
        invoice_number: (nf as any).numero || null,
      }).eq("id", (order as any).id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faturamento"] });
      qc.invalidateQueries({ queryKey: ["nfe-link-suggestions"] });
      toast.success("NF vinculada ao pedido!");
    },
    onError: (err: Error) => toast.error("Erro ao vincular NF: " + err.message),
  });
}
