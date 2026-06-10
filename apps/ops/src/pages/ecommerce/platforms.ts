// Plataformas de e-commerce em uso (mesmas da tela de Vendas Online).
export interface EcomPlatform { id: string; label: string; emoji: string; color: string; }

export const ECOM_PLATFORMS: EcomPlatform[] = [
  { id: "mercadolivre", label: "Mercado Livre", emoji: "🛒", color: "#FFD700" },
  { id: "amazon", label: "Amazon", emoji: "📦", color: "#FF9900" },
  { id: "nuvemshop", label: "Nuvemshop", emoji: "🏪", color: "#2D7FF9" },
];

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
