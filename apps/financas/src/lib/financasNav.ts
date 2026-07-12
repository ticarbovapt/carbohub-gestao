import { LayoutDashboard, Wallet, Package, ShoppingCart, ClipboardList, BarChart3, Link2, Receipt, Percent, Users, HandCoins, Landmark, type LucideIcon } from "lucide-react";

export interface FinNavItem { path: string; label: string; icon: LucideIcon; }

// Navegação do Carbo Finanças — telas portadas 1:1 do Carbo Controle.
export const FIN_NAV: FinNavItem[] = [
  { path: "/", label: "Início", icon: LayoutDashboard },
  { path: "/financeiro", label: "Financeiro", icon: Wallet },
  { path: "/compras", label: "Compras & Suprimentos", icon: ShoppingCart },
  { path: "/recebiveis", label: "Contas a Receber", icon: HandCoins },
  { path: "/fluxo-caixa", label: "Fluxo de Caixa", icon: Landmark },
  { path: "/suprimentos", label: "Suprimentos", icon: Package },
  { path: "/pedidos", label: "Pedidos (RV)", icon: ClipboardList },
  { path: "/faturamento", label: "Faturamento", icon: Receipt },
  { path: "/comissionamento", label: "Comissionamento", icon: Percent },
  { path: "/funcionarios", label: "Funcionários", icon: Users },
  { path: "/dashboard-financeiro", label: "Dashboard Financeiro", icon: BarChart3 },
  { path: "/integracoes/bling", label: "Integração Bling", icon: Link2 },
];
