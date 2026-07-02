import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccessPing } from "@/hooks/useAccessPing";
import { FIN_NAV } from "@/lib/financasNav";

const navCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
    isActive
      ? "bg-carbo-green/10 text-carbo-green font-semibold"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  );

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 p-2 space-y-1">
      {FIN_NAV.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === "/"}
          className={navCls}
          onClick={onNavigate}
        >
          <item.icon className="h-4 w-4" /> {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(true);
  useAccessPing("carbo_financas");

  const handleMenu = () => {
    if (isMobile) setMobileOpen(true);
    else setDeskOpen((o) => !o);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar appName="Carbo Finanças" onMenu={handleMenu} />

      <div className="flex flex-1 min-h-0">
        {/* Desktop: sidebar fixa (toggle pelo botão do TopBar) */}
        {deskOpen && (
          <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-card">
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
