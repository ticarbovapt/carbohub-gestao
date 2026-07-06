import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { OrderItem } from "@/hooks/useCarbozeOrders";

// ─────────────────────────────────────────────────────────────────────────────
// Fila de Faturamento — pedidos registrados no Sales/Controle (carboze_orders)
// que ainda NÃO têm Nota Fiscal vinculada. O financeiro emite a NF no Bling a
// partir daqui. Mesma tabela e fluxo do Controle (apps compartilham o Supabase).
// ─────────────────────────────────────────────────────────────────────────────

export interface FaturamentoOrder {
  id: string;
  order_number: string;
  created_at: string;
  sale_date: string | null;
  customer_name: string;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  items: OrderItem[];
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  status: string;
  vendedor_name: string | null;
  external_ref: string | null;
  // Fiscal / PO
  ie: string | null;
  po_number: string | null;
  po_date: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  payment_terms: string | null;
  freight_type: "CIF" | "FOB" | null;
  buyer_notes: string | null;
  general_notes: string | null;
  // NF linkage
  bling_nf_id: number | null;
  nf_access_key: string | null;
  invoice_number: string | null;
}

export interface FaturamentoParams {
  month: Date;
  search?: string;
  showAll?: boolean;
}

export function useFaturamento({ month, search = "", showAll = false }: FaturamentoParams) {
  const monthKey = `${month.getFullYear()}-${month.getMonth() + 1}`;
  // Sanitiza o termo para não quebrar a sintaxe do filtro .or do PostgREST
  const term = search.trim().replace(/[,()]/g, " ").trim();

  return useQuery({
    queryKey: ["faturamento", monthKey, term, showAll],
    queryFn: async () => {
      let query = supabase
        .from("carboze_orders")
        .select("*")
        .in("status", ["pending", "confirmed", "invoiced", "shipped", "delivered"])
        .order("created_at", { ascending: false });

      if (!showAll) {
        query = query.is("bling_nf_id", null);
      }

      if (term) {
        // Busca global: ignora o mês e vasculha o banco inteiro (limitado por segurança)
        query = query
          .or(`customer_name.ilike.%${term}%,order_number.ilike.%${term}%`)
          .limit(300);
      } else {
        // Sem busca: limita ao mês selecionado (filtro no servidor)
        const yr = month.getFullYear();
        const mo = month.getMonth();
        const start = new Date(yr, mo, 1).toISOString();
        const end = new Date(yr, mo + 1, 0, 23, 59, 59).toISOString();
        query = query.gte("created_at", start).lte("created_at", end);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((row: any) => ({
        ...row,
        items: Array.isArray(row.items) ? (row.items as unknown as OrderItem[]) : [],
      })) as FaturamentoOrder[];
    },
    refetchInterval: 60_000,
  });
}

// O supabase-js, quando a Edge Function responde 4xx/5xx, empacota tudo num
// FunctionsHttpError genérico ("non-2xx status code") e NÃO expõe o corpo — que
// é onde a função devolve o motivo real ({ success:false, error:"..." }).
// Aqui abrimos o Response guardado em error.context e extraímos essa mensagem.
async function extractFnError(error: any, fallback: string): Promise<string> {
  const ctx = error?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
    } catch { /* corpo não-JSON — ignora */ }
  }
  return error?.message || fallback;
}

export interface BlingContactToCreate {
  nome: string;
  tipo: "F" | "J" | "E";
  numeroDocumento: string;
  ie?: string;
  email?: string;
  telefone?: string;
  endereco?: { geral?: Record<string, string> };
}

export interface BlingPreview {
  dry_run: true;
  order_number: string;
  customer_name: string;
  contact_found: boolean;
  contact_id: number | null;
  contact_source: string;
  // Quando o cliente não existe no Bling, o pré-cadastro que será criado ao confirmar.
  will_create_contact?: boolean;
  contact_to_create?: BlingContactToCreate | null;
  items_summary: Array<{ name: string; matched: boolean; codigo: string }>;
  warnings: string[];
  payload: Record<string, any>;
}

/** Cria o pedido de venda no Bling (com o nº do pedido na observação, p/ vínculo automático da NF). */
export function useCreateBlingPedido() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.functions.invoke("bling-sync", {
        body: { entity: "create_order", order_id: orderId },
      });
      if (error) throw new Error(await extractFnError(error, "Erro ao criar pedido no Bling"));
      if (data && data.success === false) throw new Error(data.error || "Erro ao criar pedido no Bling");
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["faturamento"] });
      queryClient.invalidateQueries({ queryKey: ["carboze-orders"] });
      const num = data?.data?.numero || data?.data?.id || "";
      toast.success(
        `Pedido criado no Bling${num ? ` (nº ${num})` : ""}! Abrindo o Bling — confira e emita a NF-e (o pedido está no topo da lista).`,
        {
          duration: 9000,
          // Aba já abre sozinha no clique de confirmar; este botão é só um reforço
          // caso o navegador tenha bloqueado a aba.
          action: { label: "Abrir Bling →", onClick: () => window.open("https://www.bling.com.br/vendas.php", "_blank", "noopener") },
        }
      );
    },
    onError: (err: Error) => toast.error(err.message, { duration: 12000 }),
  });
}

/** Pré-visualiza o payload (dry-run) antes de enviar ao Bling. */
export function usePreviewBlingPedido() {
  return useMutation({
    mutationFn: async (orderId: string): Promise<BlingPreview> => {
      const { data, error } = await supabase.functions.invoke("bling-sync", {
        body: { entity: "create_order", order_id: orderId, dry_run: true },
      });
      if (error) throw new Error(await extractFnError(error, "Erro ao gerar pré-visualização"));
      if (data && data.success === false) throw new Error(data.error || "Erro ao gerar pré-visualização");
      return data as BlingPreview;
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
