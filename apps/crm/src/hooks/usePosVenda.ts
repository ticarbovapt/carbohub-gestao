import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Pós-venda (Sales) — SOMENTE LEITURA, espelho do Rastreio do Carbo Ops.
//
// As ETAPAS vêm de @carbo/posvenda — as mesmas que o Ops usa, num arquivo só.
// Antes cada app declarava a sua: o Ops tinha 11 e este aqui, 7. As quatro que
// faltavam (criar_op, gerar_nf, nf_finalizada, emitir_etiqueta) não viravam
// coluna vazia — o pedido parado numa delas SUMIA do quadro. Informação
// suprimida é pior que ausente: ninguém procura o que não sabe que existe.
//
// ⚠️ O QUE AINDA PRECISA DE ATENÇÃO MANUAL: o filtro de quais pedidos entram
// (o .or abaixo) e as colunas lidas. Se mudarem no Ops, mude aqui junto.
//
// Quem controla a etapa é o time de operações, no Carbo Ops. Aqui nada move.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

// Etapas: fonte única em @carbo/posvenda, compartilhada com o Ops. Reexporta
// para as telas seguirem importando daqui e nada mais precisar mudar.
export { POSVENDA_STAGES, stageLabel, stageIndex } from "@carbo/posvenda";
export type { FulfillmentStage, PosVendaStage } from "@carbo/posvenda";
import type { FulfillmentStage } from "@carbo/posvenda";

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
