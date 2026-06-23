import { LayoutDashboard, CreditCard, ClipboardList, type LucideIcon } from "lucide-react";

export interface FinNavItem { path: string; label: string; icon: LucideIcon; }

// Navegação do Carbo Finanças. Telas entram por levas.
export const FIN_NAV: FinNavItem[] = [
  { path: "/", label: "Início", icon: LayoutDashboard },
  { path: "/requisicoes", label: "Requisições", icon: ClipboardList },
  { path: "/contas-a-pagar", label: "Contas a Pagar", icon: CreditCard },
];
