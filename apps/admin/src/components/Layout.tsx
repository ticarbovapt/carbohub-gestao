import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Users as UsersIcon, ListTree, Globe, Target, Activity } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessPing } from "@/hooks/useAccessPing";

// Itens de topo (acesso/estrutura) + grupos recém-trazidos do Ops.
const NAV_TOP = [
  { to: "/", end: true, label: "Usuários", icon: UsersIcon },
  { to: "/estrutura", end: false, label: "Departamentos e funções", icon: ListTree },
];

const NAV_GROUPS = [
  {
    label: "Acessos",
    items: [
      { to: "/ultimo-acesso", label: "Último acesso", icon: Activity },
    ],
  },
  {
    label: "E-commerce",
    items: [
      { to: "/ecommerce/vendas-online", label: "Vendas Online", icon: Globe },
      { to: "/ecommerce/metas", label: "Acompanhamento de Metas", icon: Target },
    ],
  },
  {
    label: "Configuração de Metas",
    items: [
      { to: "/metas/configurar", label: "Configurar Metas", icon: Target },
    ],
  },
];

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1 p-3">
      {NAV_TOP.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={navCls} onClick={onNavigate}>
          <n.icon className="h-4 w-4" /> {n.label}
        </NavLink>
      ))}

      {NAV_GROUPS.map((g) => (
        <div key={g.label} className="pt-3">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{g.label}</p>
          <div className="space-y-1">
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} className={navCls} onClick={onNavigate}>
                <i.icon className="h-4 w-4" /> {i.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Layout() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(true);
  useAccessPing("carbo_admin");

  const handleMenu = () => {
    if (isMobile) setMobileOpen(true);
    else setDeskOpen((o) => !o);
  };

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <TopBar appName="Carbo Admin" onMenu={handleMenu} />

      <div className="flex flex-1 min-h-0">
        {/* Desktop: sidebar fixa (rola por dentro se for maior que a tela) */}
        {deskOpen && (
          <aside className="hidden md:block w-56 shrink-0 border-r bg-card overflow-y-auto">
            <Nav />
          </aside>
        )}

        {/* Mobile: gaveta sobreposta */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[260px] p-0">
            <Nav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
