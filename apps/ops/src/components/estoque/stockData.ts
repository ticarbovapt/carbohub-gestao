// Dados/é helpers compartilhados de estoque (mock) — usados por:
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
export const MOCK_ESTOQUE: ProdEstoque[] = [
  { id: "1", product_code: "ESTA-100ML", name: "CarboZé 100ml", category: "Produto Final", stock_unit: "un", safety_stock_qty: 500, hubs: { rn: 3200, sp: 900, spv: 400, bling: 1200 }, giroMedio: 140 },
  { id: "2", product_code: "ESTA-1L", name: "CarboZé 1L", category: "Produto Final", stock_unit: "un", safety_stock_qty: 200, hubs: { rn: 140, sp: 60, spv: 0, bling: 320 }, giroMedio: 30 },
  { id: "3", product_code: "GARR-1L", name: "Garrafa PET 1L", category: "Embalagem", stock_unit: "un", safety_stock_qty: 800, hubs: { rn: 320, sp: 0, spv: 0, bling: 0 }, giroMedio: 50 },
  { id: "4", product_code: "REAG-BASE", name: "Reagente base", category: "Carbonatação", stock_unit: "L", safety_stock_qty: 400, hubs: { rn: 1500, sp: 0, spv: 0, bling: 0 }, giroMedio: 12 },
  { id: "5", product_code: "PRO-500", name: "CarboPRO", category: "Produto Final", stock_unit: "un", safety_stock_qty: 150, hubs: { rn: 280, sp: 120, spv: 80, bling: 240 }, giroMedio: 0 },
  { id: "6", product_code: "ROT-PRO", name: "Rótulo CarboPRO", category: "Insumo", stock_unit: "un", safety_stock_qty: 2000, hubs: { rn: 4000, sp: 2000, spv: 0, bling: 0 }, giroMedio: 90 },
];

export type CoverageVariant = "destructive" | "warning" | "success" | "info" | "secondary";
export function coverageStatus(days: number | null): { label: string; variant: CoverageVariant } {
  if (days === null) return { label: "Sem consumo", variant: "secondary" };
  if (days < 7) return { label: "Ruptura iminente", variant: "destructive" };
  if (days < 15) return { label: "Atenção", variant: "warning" };
  if (days < 30) return { label: "Estável", variant: "warning" };
  if (days < 60) return { label: "Saudável", variant: "success" };
  return { label: "Excedente", variant: "info" };
}
