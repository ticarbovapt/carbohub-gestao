// Fixtures: /vendas (carbo_vendas_metrica e carboze_orders)
import { U } from "./pessoas";

const hoje = new Date();
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const MES = ym(hoje);
const MES_ANT = ym(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 10));
const dia = (m: string, d: number, h = 14) => `${m}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:10:00.000Z`;

const base = {
  customer_ie: null, billing_address: null, discount_type: "none",
  payment_terms: "Boleto 28 dias", freight_type: "CIF", shipping_cost: 0,
  agreed_delivery_date: null, ppf_date: null, ppe_date: null, po_number: null,
  notes: null, buyer_notes: null, general_notes: null, internal_notes: null,
  invoice_bonificacao_number: null, bling_nf_bonificacao_id: null, bling_conta: null,
  bling2_nf_id: null, invoice2_number: null, bling2_nf_bonificacao_id: null, invoice2_bonificacao_number: null,
  external_ref: null, segmento: "revenda", order_type: "spot", is_recurring: false, excluir_metricas: false,
  discount: 0, discount_percent: 0,
};
const item = (name: string, code: string, q: number, p: number) => ({ name, product_code: code, quantity: q, unit_price: p, total: q * p, discount_type: "none", discount_amount: 0, bonus_quantity: 0, kind: null });

export const vendas = (papel: string) => {
  const linhas = [
    { ...base, id: "v1", order_number: "V2026100031", created_at: dia(MES, 14), sale_date: `${MES}-14`, status: "invoiced", fulfillment_stage: "em_transporte", conta_metrica: true, motivo_fora: null,
      customer_name: "Posto Boa Viagem Ltda", cnpj: "12.345.678/0001-90", customer_email: "compras@postoboaviagem.com.br", customer_phone: "(81) 99812-3344",
      delivery_address: "Av. Boa Viagem, 1200", delivery_city: "Recife", delivery_state: "PE", delivery_zip: "51011-000",
      items: [item("CarboZé 100ml - PDV", "CZ100-PDV", 120, 13)], total: 1560, subtotal: 1560,
      vendedor_id: U.colab.id, vendedor_name: U.colab.full_name, invoice_number: "000412", bling_nf_id: 1 },
    { ...base, id: "v2", order_number: "V2026100027", created_at: dia(MES, 9), sale_date: `${MES}-09`, status: "pending", fulfillment_stage: "separando", conta_metrica: false, motivo_fora: "aguardando_nf",
      customer_name: "Rede Litoral Combustíveis", cnpj: "23.456.789/0001-01", customer_email: "financeiro@redelitoral.com.br", customer_phone: "(84) 99654-1020",
      delivery_address: "Rua das Dunas, 55", delivery_city: "Natal", delivery_state: "RN", delivery_zip: "59000-000",
      items: [item("CarboZé 100ml - PDV", "CZ100-PDV", 200, 13), item("CarboZé Sachê 10ml", "CARB-SACH-10ML", 100, 4.9)], total: 3090, subtotal: 3090, internal_notes: "Cliente pediu entrega antes das 10h. Rede com 4 postos — potencial de recompra mensal.",
      vendedor_id: U.colab.id, vendedor_name: U.colab.full_name, invoice_number: null, bling_nf_id: null },
    { ...base, id: "v3", order_number: "V2026100035", created_at: dia(MES, 15), sale_date: null, status: "quote", fulfillment_stage: null, conta_metrica: false, motivo_fora: "orcamento",
      customer_name: "Auto Posto Estrela", cnpj: "34.567.890/0001-12", customer_email: null, customer_phone: "(83) 98877-6655",
      delivery_address: "BR-230, km 12", delivery_city: "João Pessoa", delivery_state: "PB", delivery_zip: "58000-000",
      items: [item("CarboZé 100ml - PDV", "CZ100-PDV", 60, 13)], total: 780, subtotal: 780,
      vendedor_id: U.colab.id, vendedor_name: U.colab.full_name, invoice_number: null, bling_nf_id: null },
    { ...base, id: "v4", order_number: "V2026090088", created_at: dia(MES_ANT, 28), sale_date: `${MES}-02`, status: "delivered", fulfillment_stage: "entregue", conta_metrica: true, motivo_fora: null,
      customer_name: "Posto Caminho do Sol", cnpj: "45.678.901/0001-23", customer_email: "gerencia@caminhodosol.com.br", customer_phone: "(81) 99123-4567",
      delivery_address: "Rod. PE-60, 300", delivery_city: "Ipojuca", delivery_state: "PE", delivery_zip: "55590-000",
      items: [item("CarboZé 1 Litro", "CZ1L", 24, 89.9)], total: 2157.6, subtotal: 2157.6,
      vendedor_id: U.vend2.id, vendedor_name: U.vend2.full_name, invoice_number: "000398", bling_nf_id: 2 },
    { ...base, id: "v5", order_number: "V2026100019", created_at: dia(MES, 6), sale_date: `${MES}-06`, status: "cancelled", fulfillment_stage: "cancelado", conta_metrica: false, motivo_fora: "cancelado",
      customer_name: "Posto Serra Verde", cnpj: "56.789.012/0001-34", customer_email: null, customer_phone: null,
      delivery_address: "Av. Central, 10", delivery_city: "Caruaru", delivery_state: "PE", delivery_zip: "55000-000",
      items: [item("CarboZé 100ml - PDV", "CZ100-PDV", 40, 13)], total: 520, subtotal: 520,
      vendedor_id: U.vend2.id, vendedor_name: U.vend2.full_name, invoice_number: null, bling_nf_id: null },
  ];
  const comData = linhas.map((l) => ({ ...l, data_efetiva: l.sale_date ?? l.created_at.slice(0, 10), created_by: l.vendedor_id }));
  return papel === "gestor" ? comData : comData.filter((l) => l.vendedor_id === U.colab.id);
};

