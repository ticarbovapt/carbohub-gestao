// Dados/helpers compartilhados de estoque — usados por:
//  • Estoque (subpáginas por hub, somente leitura)
//  • Suprimentos (mesma visão, mas editável)
// A duplicação é proposital: gestores veem Suprimentos (editar); demais veem só Estoque.

export interface Hub { id: string; slug: string; label: string; city: string; state: string; }
export const HUBS: Hub[] = [
  { id: "rn", slug: "hub-natal", label: "Hub Natal", city: "Natal", state: "RN" },
  { id: "sp", slug: "cd-sp-loghouse", label: "CD SP LogHouse", city: "São Paulo", state: "SP" },
  { id: "spv", slug: "cd-sp-vendas", label: "CD SP Vendas", city: "São Paulo", state: "SP" },
  { id: "bling", slug: "cd-bling", label: "CD Bling", city: "—", state: "—" },
];
export const hubBySlug = (slug?: string) => HUBS.find((h) => h.slug === slug);

export interface ProdEstoque {
  id: string; product_code: string; name: string; category: string; stock_unit: string;
  safety_stock_qty: number; hubs: Record<string, number>;
}
export const MOCK_ESTOQUE: ProdEstoque[] = [];

export type StockVariant = "destructive" | "warning" | "success" | "secondary";
// Status pelo ESTOQUE MÍNIMO (segurança) — sem chute de giro/cobertura.
export function minStockStatus(qty: number, safety: number): { label: string; variant: StockVariant } {
  if (safety <= 0) return { label: "Sem mínimo", variant: "secondary" };
  if (qty <= 0) return { label: "Zerado", variant: "destructive" };
  if (qty < safety) return { label: "Abaixo do mínimo", variant: "destructive" };
  return { label: "OK", variant: "success" };
}
