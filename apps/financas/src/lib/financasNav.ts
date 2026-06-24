import { LayoutDashboard, Wallet, Package, ShoppingCart, ClipboardList, BarChart3, Link2, type LucideIcon } from "lucide-react";

export interface FinNavItem { path: string; label: string; icon: LucideIcon; }

// Navegação do Carbo Finanças — telas portadas 1:1 do Carbo Controle.
export const FIN_NAV: FinNavItem[] = [
  { path: "/", label: "Início", icon: LayoutDashboard },
  { path: "/financeiro", label: "Financeiro", icon: Wallet },
  { path: "/compras", label: "Compras & Suprimentos", icon: ShoppingCart },
  { path: "/suprimentos", label: "Suprimentos", icon: Package },
  { path: "/pedidos", label: "Pedidos (RV)", icon: ClipboardList },
  { path: "/dashboard-financeiro", label: "Dashboard Financeiro", icon: BarChart3 },
  { path: "/integracoes/bling", label: "Integração Bling", icon: Link2 },
];
