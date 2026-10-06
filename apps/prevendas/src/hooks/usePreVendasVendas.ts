import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Vendas do PRÉ-VENDAS — as que nasceram de um card do SDR (f14) ou do closer
// (f15). Quem recorta é o BANCO (`carbo_prevendas_vendas`, migração 20261049):
// gestor vê todas, SDR as que repassou, closer as que fechou. A tela do Sales
// não muda e continua mostrando estas vendas como qualquer outra.
//
// ⚠️ Arquivo PRÓPRIO do Pré-Vendas, e não mais uma cópia do
// `useCarbozeVendas`: aquele tem oito cópias que já divergem por desenho, e o
// que este precisa (SDR, closer, recorte por origem) não existe em nenhuma.
// Os tipos e o `mapVenda` são os do `apps/crm` (fonte da verdade da tela de
// Vendas), copiados, para a tela portada receber exatamente o mesmo formato.
//
// ⚠️ A chave começa com "carboze_vendas" de propósito: é ela que as mutações
// do `useCarbozeVendas` (converter, excluir, cancelar, atribuir) invalidam. Com
// outra chave, a tela não se atualizaria depois de converter um orçamento.
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
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
  /** `service` quando a linha é descarbonização; ausente nas de produto.
   *  Já vinha no jsonb e no cast — só não estava tipado, então a tela não
   *  sabia que podia perguntar. É o campo que separa Produto de Serviço. */
  kind?: string | null;
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
  /** A SEGUNDA nota: a remessa de bonificação.
   *
   * ⚠️ Venda com brinde gera DUAS notas — a de venda, com valor cheio, e a de
   * remessa em bonificação, que não é receita. Elas moram em colunas separadas
   * (`20260903`) e a tela precisa das duas: quem confere quer ver o documento
   * do que foi dado, e a logística despacha com as duas em mãos.
   *
   * O `select("*")` sempre trouxe estas colunas; era este mapeamento que as
   * descartava — e campo descartado aqui some da tela sem erro nenhum. */
  invoice_bonificacao_number: string | null;
  bling_nf_bonificacao_id: number | null;
  /** Qual conta Bling faturou este pedido: 1 = matriz, 2 = filial SP. */
  bling_conta: number | null;
  /**
   * As notas da FILIAL, em colunas PRÓPRIAS.
   *
   * ⚠️ Nunca em `bling_nf_id`. As duas contas Bling numeram do zero, e
   * `carbo_vendas_metrica` junta `bling_nfe` por aquele id: um id da conta 2
   * ali casaria com uma nota REAL da conta 1 — nota cancelada de uma empresa
   * derrubando venda da outra. Já foi tentado e revertido.
   *
   * ⚠️ E o `select("*")` SEMPRE trouxe estas colunas. Quem as descartava era o
   * mapeamento abaixo — a mesma armadilha que já tinha sumido com a nota de
   * bonificação da matriz: campo que não atravessa o `map` some da tela sem
   * erro nenhum.
   */
  bling2_nf_id: number | null;
  invoice2_number: string | null;
  bling2_nf_bonificacao_id: number | null;
  invoice2_bonificacao_number: string | null;
  external_ref: string | null;    // "bling-<id>" quando o pedido já foi enviado ao Bling
  /** Unidade de negócio: `revenda` | `consumo` | `online`, ou null.
   *
   * ⚠️ O CHECK de `carboze_orders` só aceita estes três (mais null):
   * `microdistribuidor` NÃO é valor válido hoje — acrescentá-lo exige migração.
   * O `select("*")` já trazia a coluna; era este mapeamento que a descartava. */
  segmento: string | null;
  /** `spot` | `recorrente`. */
  order_type: string | null;
  /** Redundante com `order_type='recorrente'`, mas é a flag que a recorrência
   *  usa de fato. A marca da tela aceita as duas para não depender de qual
   *  delas o caminho de criação preencheu. */
  is_recurring: boolean;
}

/** O que só o Pré-Vendas tem: quem originou e quem fechou. */
export interface PreVendaRow extends CarbozeVendaRow {
  sdr_id: string | null;
  sdr_name: string | null;
  closer_name: string | null;
}

interface Params {
  month: Date;
  customFrom?: string;
  customTo?: string;
  vendedorFilter?: string;        // "__all__" | id do closer (só gestor)
  isGestor: boolean;
  userId?: string;
  search?: string;
}

export function usePreVendasVendas({ month, customFrom, customTo, vendedorFilter, isGestor, userId, search }: Params) {
  const termo = search ?? "";
  const buscando = termo.trim().length >= 1;
  const hasCustom = !!(customFrom || customTo);
  return useQuery({
    queryKey: ["carboze_vendas", "prevendas", month.toISOString().slice(0, 7), customFrom, customTo, vendedorFilter, isGestor, userId, buscando ? termo : ""],
    enabled: !!userId,
    queryFn: async (): Promise<PreVendaRow[]> => {
      let de: string, ate: string;
      if (hasCustom) {
        de = customFrom || "2000-01-01";
        ate = customTo || "2099-12-31";
      } else {
        const yr = month.getFullYear(), mo = month.getMonth() + 1;
        const ultimo = new Date(yr, mo, 0).getDate();
        de = `${yr}-${String(mo).padStart(2, "0")}-01`;
        ate = `${yr}-${String(mo).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
      }
      const { data, error } = await db.rpc("carbo_prevendas_vendas", {
        p_de: de, p_ate: ate, p_termo: buscando ? termo : null,
      });
      if (error) throw error;
      let linhas = ((data ?? []) as any[]).map((r) => ({
        ...mapVenda(r),
        sdr_id: r.sdr_id ?? null,
        sdr_name: r.sdr_name ?? null,
        closer_name: r.closer_name ?? null,
      }));
      // Filtro por closer: só o gestor escolhe. O recorte de quem pode ver o
      // quê já veio do banco — isto aqui só estreita, nunca alarga.
      if (isGestor && vendedorFilter && vendedorFilter !== "__all__") {
        linhas = linhas.filter((r) => r.vendedor_id === vendedorFilter);
      }
      return linhas;
    },
  });
}

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
          invoice_bonificacao_number: row.invoice_bonificacao_number ?? null,
          bling_nf_bonificacao_id: row.bling_nf_bonificacao_id ?? null,
          bling_conta: row.bling_conta ?? null,
          bling2_nf_id: row.bling2_nf_id ?? null,
          invoice2_number: row.invoice2_number ?? null,
          bling2_nf_bonificacao_id: row.bling2_nf_bonificacao_id ?? null,
          invoice2_bonificacao_number: row.invoice2_bonificacao_number ?? null,
          external_ref: row.external_ref ?? null,
          segmento: row.segmento ?? null,
          order_type: row.order_type ?? null,
          is_recurring: row.is_recurring === true,
  });
}

