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
  safety_stock_qty: number; hubs: Record<string, number>; giroMedio: number;
}
// TODO: ligar em warehouse_stock (Supabase)
export const MOCK_ESTOQUE: ProdEstoque[] = [];

export type CoverageVariant = "destructive" | "warning" | "success" | "info" | "secondary";
export function coverageStatus(days: number | null): { label: string; variant: CoverageVariant } {
  if (days === null) return { label: "Sem consumo", variant: "secondary" };
  if (days < 7) return { label: "Ruptura iminente", variant: "destructive" };
  if (days < 15) return { label: "Atenção", variant: "warning" };
  if (days < 30) return { label: "Estável", variant: "warning" };
  if (days < 60) return { label: "Saudável", variant: "success" };
  return { label: "Excedente", variant: "info" };
}
