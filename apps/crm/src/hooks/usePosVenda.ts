import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Pós-venda (Sales) — SOMENTE LEITURA, espelho do Rastreio do Carbo Ops.
//
// ⚠️ ESTE ARQUIVO ESPELHA apps/ops/src/hooks/usePosVenda.ts.
// Se lá mudar a lista de etapas, o filtro de quais pedidos entram, ou as
// colunas lidas — MUDE AQUI JUNTO. A divergência não dá erro; ela ESCONDE.
//
// Foi o que aconteceu: o Ops tinha 11 etapas e aqui havia 7. As quatro que
// faltavam (criar_op, gerar_nf, nf_finalizada, emitir_etiqueta) não viravam
// coluna vazia — o pedido parado numa delas SUMIA do quadro. O vendedor não
// via a coluna nem o pedido, e o dado seguia existindo no banco. Informação
// suprimida é pior que informação ausente, porque ninguém vai procurar o que
// não sabe que existe.
//
// Quem controla a etapa é o time de operações, no Carbo Ops. Aqui nada move.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export type FulfillmentStage =
  | "nova_venda" | "separacao_pendente" | "criar_op" | "separando" | "separado"
  | "gerar_nf" | "nf_finalizada" | "emitir_etiqueta"
  | "em_transporte" | "entregue" | "cancelado";

// Mesma lista, mesma ordem e mesmos rótulos do Ops. O vendedor e a operação
// falando de colunas diferentes com o mesmo nome seria pior que não ter tela.
export const POSVENDA_STAGES: { key: FulfillmentStage; label: string; color: string }[] = [
  { key: "nova_venda",          label: "Nova Venda",              color: "#9333ea" },
  { key: "separacao_pendente",  label: "Pedido Recebido",         color: "#f59e0b" },
  { key: "criar_op",            label: "Criar Ordem de Produção", color: "#ec4899" },
  { key: "separando",           label: "Em Separação",            color: "#3b82f6" },
  { key: "separado",            label: "Separado",                color: "#8b5cf6" },
  { key: "gerar_nf",            label: "Gerar Nota Fiscal",       color: "#f43f5e" },
  { key: "nf_finalizada",       label: "NF Finalizada",           color: "#14b8a6" },
  { key: "emitir_etiqueta",     label: "Emitir Etiqueta",         color: "#0ea5e9" },
  { key: "em_transporte",       label: "Em Transporte",           color: "#06b6d4" },
  { key: "entregue",            label: "Entregue",                color: "#10b981" },
  { key: "cancelado",           label: "Cancelado",               color: "#ef4444" },
];

export interface PosVendaItem {
  name?: string; quantity?: number; unit_price?: number; total?: number;
  product_code?: string | null;
}

export interface PosVendaOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  cnpj: string | null;
  customer_ie: string | null;
  payment_terms: string | null;
  freight_type: string | null;
  agreed_delivery_date: string | null;
  ppf_date: string | null;
  ppe_date: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  vendedor_id: string | null;
  vendedor_name: string | null;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  notes: string | null;
  items: PosVendaItem[];
  created_at: string;
  updated_at: string | null;
  stage_changed_at: string | null;
  fulfillment_stage: FulfillmentStage;
  status: string;
  linha: string | null;
  bling_nf_id: number | null;
  invoice_number: string | null;
  shipment_volumes: number | null;
  shipment_weight_kg: number | null;
  shipment_carrier: string | null;
  shipment_quote_value: number | null;
}

// Mesmas colunas do SELECT_BASE do Ops (menos production_done, que é da
// operação). Faltar coluna aqui é o mesmo tipo de supressão silenciosa.
const SELECT_COLS =
  "id, order_number, customer_name, customer_email, customer_phone, cnpj, customer_ie, payment_terms, " +
  "freight_type, agreed_delivery_date, ppf_date, ppe_date, delivery_address, delivery_city, " +
  "delivery_state, delivery_zip, vendedor_id, vendedor_name, subtotal, shipping_cost, discount, total, " +
  "notes, items, created_at, updated_at, stage_changed_at, fulfillment_stage, status, linha, " +
  "bling_nf_id, invoice_number, shipment_volumes, shipment_weight_kg, shipment_carrier, shipment_quote_value";

interface Params {
  /** Gestor vê todos; vendedor vê os próprios (a RLS já garante isso no banco). */
  isGestor: boolean;
  userId?: string;
  /** "__all__" ou o id do vendedor. Só tem efeito para gestor. */
  vendedorFilter?: string;
}

export function usePosVendaOrders({ isGestor, userId, vendedorFilter }: Params) {
  return useQuery({
    queryKey: ["crm", "pos-venda", isGestor, userId, vendedorFilter ?? "__all__"],
    enabled: !!userId,
    queryFn: async (): Promise<PosVendaOrder[]> => {
      let q = db
        .from("carboze_orders")
        .select(SELECT_COLS)
        // MESMA regra do Ops. O filtro anterior era só `external_ref is null`,
        // e escondia toda venda manual que já tinha ido ao Bling emitir NF —
        // justamente as que estão na reta final e o vendedor mais quer ver.
        //  • sem external_ref → ainda no fluxo manual (aparece).
        //  • com external_ref → só se for venda manual ('V…') E já tiver
        //    avançado além das etapas iniciais.
        .or("external_ref.is.null,and(order_number.like.V*,fulfillment_stage.not.in.(nova_venda,separacao_pendente))")
        .order("created_at", { ascending: false })
        .limit(500);

      // Vendedor só vê o que é dele. Não é só a tela: a RLS de carboze_orders
      // já limita — isto aqui é para a interface não prometer o que não vem.
      if (!isGestor) {
        q = q.eq("vendedor_id", userId);
      } else if (vendedorFilter && vendedorFilter !== "__all__") {
        q = q.eq("vendedor_id", vendedorFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as PosVendaOrder[];
    },
    refetchInterval: 60_000,
  });
}
