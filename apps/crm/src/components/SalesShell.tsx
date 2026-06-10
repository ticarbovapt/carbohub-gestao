import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  KanbanSquare, ShoppingCart, ClipboardList, TrendingUp, Target, BarChart3, LayoutDashboard,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

// CRM é uma seção com sub-itens (Funis de Venda = dashboard, Pipelines = kanban).
const CRM_SUB = [
  { to: "/", end: true, label: "Funis de Venda", icon: LayoutDashboard },
  { to: "/crm/pipelines", label: "Pipelines", icon: KanbanSquare },
];
const NAV = [
  { to: "/vender", label: "Vender", icon: ShoppingCart },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/vendas", label: "Vendas", icon: TrendingUp },
  { to: "/metas", label: "Metas de Vendedores", icon: Target },
  { to: "/comercial", label: "Dashboard Comercial", icon: BarChart3 },
];

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
const subCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
    isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1 p-3">
      {/* Seção CRM */}
      <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">CRM</p>
      <div className="space-y-1 border-l border-border ml-3 pl-1">
        {CRM_SUB.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={subCls} onClick={onNavigate}>
            <n.icon className="h-4 w-4" /> {n.label}
          </NavLink>
        ))}
      </div>

      <div className="pt-2 space-y-1">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={navCls} onClick={onNavigate}>
            <n.icon className="h-4 w-4" /> {n.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function SalesShell() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(true);

  const handleMenu = () => {
    if (isMobile) setMobileOpen(true);
    else setDeskOpen((o) => !o);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopBar appName="Carbo Sales" onMenu={handleMenu} />

      <div className="flex flex-1 min-h-0">
        {/* Desktop: sidebar fixa (toggle pelo botão) */}
        {deskOpen && (
          <aside className="hidden md:block w-52 shrink-0 border-r bg-card">
            <Nav />
          </aside>
        )}

        {/* Mobile: gaveta sobreposta */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[260px] p-0">
            <Nav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="flex-1 min-w-0 flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
