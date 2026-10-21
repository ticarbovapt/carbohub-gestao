// Fixtures: /vender
import { U } from "./pessoas";

export const produtos = [
  { id: "p1", name: "CarboZé 100ml", product_code: "CZ100", stock_unit: "un", sale_price: 15.6, bonificacao_de: null, preco_de: null, faixa_preco: null, aparece_no_vender: true, is_active: true, category: "Produto Final" },
  { id: "p1pdv", name: "CarboZé 100ml - PDV", product_code: "CZ100-PDV", stock_unit: "un", sale_price: 13, bonificacao_de: null, preco_de: "p1", faixa_preco: "pdv", aparece_no_vender: true, is_active: true, category: "Produto Final" },
  { id: "p1md", name: "CarboZé 100ml - Microdistribuidor", product_code: "CZ100-MD", stock_unit: "un", sale_price: 11.5, bonificacao_de: null, preco_de: "p1", faixa_preco: "micro", aparece_no_vender: true, is_active: true, category: "Produto Final" },
  { id: "p1bon", name: "CarboZé 100ml - bonificação", product_code: "CZ100-BON", stock_unit: "un", sale_price: 15.6, bonificacao_de: "p1", preco_de: null, faixa_preco: null, aparece_no_vender: true, is_active: true, category: "Produto Final" },
  { id: "p2", name: "CarboZé 1 Litro", product_code: "CZ1L", stock_unit: "un", sale_price: 89.9, bonificacao_de: null, preco_de: null, faixa_preco: null, aparece_no_vender: true, is_active: true, category: "Produto Final" },
  { id: "p3", name: "CarboZé Sachê 10ml", product_code: "CARB-SACH-10ML", stock_unit: "un", sale_price: 4.9, bonificacao_de: null, preco_de: null, faixa_preco: null, aparece_no_vender: true, is_active: true, category: "Produto Final" },
];
export const faixas = [
  { codigo: "pdv", rotulo: "PDV", hint: "Ponto de venda que revende o nosso produto", ordem: 1, ativo: true },
  { codigo: "micro", rotulo: "Microdistribuidor", hint: "Compra em volume e revende ao preço que quiser", ordem: 2, ativo: true },
];
export const tiers = [
  { min_percent: 0, max_percent: 5, authority: "auto", label: "Até 5%" },
  { min_percent: 5, max_percent: 15, authority: "gestor", label: "5% a 15%" },
  { min_percent: 15, max_percent: 100, authority: "ceo", label: "Acima de 15%" },
];

const end = { logradouro: "Av. Boa Viagem, 1200", numero: "1200", bairro: "Boa Viagem", cidade: "Recife", uf: "PE", cep: "51011-000" };
const dataFutura = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };

export const snapCarboze = {
  mode: "carboze", doc: "12.345.678/0001-90", customerName: "Posto Boa Viagem Ltda", email: "compras@postoboaviagem.com.br",
  phone: "(81) 99812-3344", isLicenciado: false,
  rows: [
    { id: "r1", productId: "p1pdv", qty: 120, unitPrice: 13, unitPriceStr: "13", hasBonus: false, bonusQty: 0, discType: "percent", discValue: 5 },
    { id: "r2", productId: "p1bon", qty: 10, unitPrice: 15.6, unitPriceStr: "15.6", hasBonus: false, bonusQty: 0, discType: "percent", discValue: 100 },
  ],
  obsPublica: "Entrega em horário comercial.", notasInternas: "", tipoPonto: "Posto", classificacao: "Potencial", volumeMedio: "800",
  atuaDiesel: true, atuaFrotas: false, vendedorId: "", endereco: end, fatMesmo: true, fatEndereco: { ...end },
  ie: "", ieUf: "PE", pagModalidade: "boleto_faturado", pagParcelas: "1", pagFaturamento: "28", discReason: "Primeira compra da rede",
  deliveryDate: dataFutura(12), modalidade: "producao", serviceRows: [], executionDate: "", extras: [],
};
export const snapVapt = {
  ...snapCarboze, mode: "carbovapt", customerName: "Transportadora Litoral", doc: "23.456.789/0001-01",
  rows: [], serviceRows: [
    { id: "s1", modality: "G", qty: 2, hasBonus: false, bonusQty: 0, discType: "percent", discValue: 0, veiculos: "2 caminhões" },
    { id: "s2", modality: "M", qty: 1, hasBonus: true, bonusQty: 1, discType: "percent", discValue: 0 },
  ], extras: ["opacidade", "ruido"], executionDate: dataFutura(7), deliveryDate: "", discReason: "",
};
export const pedidosEdit: Record<string, unknown>[] = [
  { id: "orc1", order_number: "V2026100035", status: "quote", quote_form_snapshot: snapCarboze, descarb_os_id: null, invoice_number: null, bling_nf_id: null, vendedor_id: U.colab.id },
  { id: "orc2", order_number: "V2026100036", status: "quote", quote_form_snapshot: snapVapt, descarb_os_id: null, invoice_number: null, bling_nf_id: null, vendedor_id: U.colab.id },
];
