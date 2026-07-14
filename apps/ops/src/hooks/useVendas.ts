import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Nova Venda (tela /vender) — FONTE ÚNICA DE VERDADE: carboze_orders.
// O PEDIDO é gravado no pedido real do ecossistema (o mesmo que alimenta NF,
// Faturamento, Pós-venda e metas). Orçamento NÃO vira pedido: só devolve um
// número de cotação para o PDF. Vendedor = usuário logado (auth.uid()).
// A ilha crm_vendas foi aposentada aqui (ops/admin/financas).
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as { from: (t: string) => any };

export type VendaStatus = "orcamento" | "pedido" | "cancelado";
export type VendaTipo = "venda" | "promo";

export interface VendaItemInput {
  produto: string;
  quantidade: number;
  preco_unitario: number;
  bonificacao?: number;
  product_id?: string | null;
  product_code?: string | null;
}

export interface NovaVendaInput {
  tipo: VendaTipo;
  status: VendaStatus;
  customer_name?: string;
  customer_doc?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_ie?: string;
  is_licenciado?: boolean;
  endereco?: Record<string, unknown> | null;
  endereco_faturamento?: Record<string, unknown> | null;
  payment_terms?: string;
  freight_type?: string;
  subtotal_bruto?: number;      // subtotal antes do desconto
  desconto_tipo?: string;       // 'value' | 'percent'
  desconto_valor?: number;      // R$ de desconto
  desconto_percent?: number;    // % efetivo
  desconto_motivo?: string;
  agreed_delivery_date?: string;  // data de entrega combinada; banco calcula PPF/PPE
  total: number;                // total líquido (já com desconto)
  notes?: string;
  internal_notes?: string;
  vendedor_id?: string;
  vendedor_name?: string;
  itens: VendaItemInput[];
}

/** Cria a venda em carboze_orders. Orçamento persiste como 'quote'; pedido como 'pending'. */
export function useCreateVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovaVendaInput): Promise<{ id: string | null; numero: string | null }> => {
      const e = (input.endereco ?? {}) as Record<string, string>;
      const deliveryAddr = (
        [e.logradouro, e.numero].filter(Boolean).join(", ") + (e.bairro ? ` - ${e.bairro}` : "")
      ).trim();

      const items = (input.itens ?? [])
        .filter((i) => i.produto && i.quantidade > 0)
        .map((i) => ({
          name: i.produto,
          quantity: i.quantidade,
          unit_price: i.preco_unitario,
          bonificacao: i.bonificacao ?? 0,
          total: i.quantidade * i.preco_unitario,
          // Vínculo com o catálogo (mrp_products) → habilita checagem de estoque
          // no pós-venda e casamento de produto no Bling.
          product_id: i.product_id ?? null,
          product_code: i.product_code ?? null,
        }));

      const { data: u } = await supabase.auth.getUser();
      // Vendedor: usa o override (gestor pode lançar por outro); senão o logado.
      const vendedorId = input.vendedor_id || u?.user?.id || null;
      let vendedorName: string | null = input.vendedor_name || null;
      if (!vendedorName && vendedorId) {
        const { data: prof } = await db.from("profiles").select("full_name").eq("id", vendedorId).maybeSingle();
        vendedorName = (prof as { full_name?: string } | null)?.full_name ?? null;
      }

      const { data: result, error } = await db
        .from("carboze_orders")
        .insert({
          order_number: "", // gerado por trigger
          customer_name: input.customer_name || "",
          customer_email: input.customer_email || null,
          customer_phone: input.customer_phone || null,
          cnpj: input.customer_doc || null,
          customer_ie: input.customer_ie || null,
          delivery_address: deliveryAddr || null,
          delivery_city: e.cidade || null,
          delivery_state: e.uf || e.estado || null,
          delivery_zip: e.cep || null,
          billing_address: input.endereco_faturamento ?? null,
          payment_terms: input.payment_terms || null,
          freight_type: input.freight_type || null,
          items,
          subtotal: input.subtotal_bruto ?? input.total,
          shipping_cost: 0,
          discount: input.desconto_valor ?? 0,
          total: input.total,
          // Intenção do desconto; o trigger define o status/alçada de forma autoritativa.
          discount_type: input.desconto_tipo ?? "none",
          discount_percent: input.desconto_percent ?? 0,
          discount_reason: input.desconto_motivo ?? null,
          discount_requested_by: vendedorId,
          // Prazo: só a data combinada; PPF/PPE/status são calculados pelo trigger.
          agreed_delivery_date: input.agreed_delivery_date ?? null,
          status: input.status === "orcamento" ? "quote" : "pending",
          notes: input.notes || null,
          internal_notes: input.internal_notes || null,
          vendedor_id: vendedorId,
          vendedor_name: vendedorName,
        })
        .select("id, order_number")
        .single();
      if (error) throw error;

      // Histórico de status (best-effort; não bloqueia a venda).
      try {
        await db.from("order_status_history").insert({
          order_id: result.id,
          status: "pending",
          notes: "Pedido criado (Nova Venda)",
          changed_by: u?.user?.id ?? null,
        });
      } catch { /* ignore */ }

      return { id: result.id, numero: result.order_number ?? null };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carboze_orders"] });
    },
  });
}
