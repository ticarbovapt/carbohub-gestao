import { LayoutDashboard, Wallet, Package, ClipboardList, Link2, Receipt, Percent, Users, FileSpreadsheet, type LucideIcon } from "lucide-react";

export interface FinNavItem { path: string; label: string; icon: LucideIcon; }

// Navegação do Carbo Finanças — telas portadas 1:1 do Carbo Controle.
export const FIN_NAV: FinNavItem[] = [
  { path: "/", label: "Início", icon: LayoutDashboard },
  { path: "/compras", label: "Financeiro & Suprimentos", icon: Wallet },
  { path: "/suprimentos", label: "Suprimentos", icon: Package },
  { path: "/pedidos", label: "Pedidos de Venda", icon: ClipboardList },
  { path: "/faturamento", label: "Faturamento", icon: Receipt },
  { path: "/comissionamento", label: "Comissionamento", icon: Percent },
  { path: "/funcionarios", label: "Funcionários", icon: Users },
  { path: "/integracoes/bling", label: "Integração Bling", icon: Link2 },
  { path: "/integracoes/bling2", label: "Integração Bling 2", icon: Link2 },
  { path: "/integracoes/nfse", label: "NFS-e Nacional", icon: FileSpreadsheet },
];
