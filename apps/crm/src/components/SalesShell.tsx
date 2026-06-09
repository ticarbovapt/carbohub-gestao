import { NavLink, Outlet } from "react-router-dom";
import {
  KanbanSquare, ShoppingCart, ClipboardList, TrendingUp, Target, BarChart3, Globe,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";

const NAV = [
  { to: "/", end: true, label: "CRM", icon: KanbanSquare },
  { to: "/vender", label: "Vender", icon: ShoppingCart },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/vendas", label: "Vendas", icon: TrendingUp },
  { to: "/metas", label: "Metas", icon: Target },
  { to: "/dashboard-comercial", label: "Dashboard comercial", icon: BarChart3 },
  { to: "/ecommerce", label: "E-commerce", icon: Globe },
];

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

export function SalesShell() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopBar appName="Carbo Sales" />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 border-r bg-card p-3 hidden md:block">
          <nav className="space-y-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={navCls}>
                <n.icon className="h-4 w-4" /> {n.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Conteúdo */}
        <main className="flex-1 min-w-0 flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
