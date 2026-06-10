import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { OPS_HOME, OPS_GROUPS } from "@/lib/opsNav";

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
const subCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
    isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  // Grupo que contém a rota atual começa aberto; os demais fechados.
  const activeGroup = OPS_GROUPS.find((g) => g.items.some((i) => pathname.startsWith(i.path) && i.path !== "/"))?.label;
  const [open, setOpen] = useState<Record<string, boolean>>(
    () => Object.fromEntries(OPS_GROUPS.map((g) => [g.label, g.label === activeGroup]))
  );
  const toggle = (label: string) => setOpen((o) => ({ ...o, [label]: !o[label] }));

  return (
    <nav className="p-3 space-y-1 overflow-y-auto">
      {/* Início */}
      <NavLink to={OPS_HOME.path} end className={navCls} onClick={onNavigate}>
        <OPS_HOME.icon className="h-4 w-4" /> {OPS_HOME.label}
      </NavLink>

      {OPS_GROUPS.map((group) => (
        <div key={group.label} className="pt-2">
          <button
            onClick={() => toggle(group.label)}
            className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground"
          >
            <span>{group.label}</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${open[group.label] ? "" : "-rotate-90"}`} />
          </button>
          {open[group.label] && (
            <div className="mt-1 space-y-1 border-l border-border ml-3 pl-1">
              {group.items.map((item) => (
                <NavLink key={item.path} to={item.path} className={subCls} onClick={onNavigate}>
                  <item.icon className="h-4 w-4 shrink-0" /> <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

export function Layout() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(true);

  const handleMenu = () => {
    if (isMobile) setMobileOpen(true);
    else setDeskOpen((o) => !o);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar appName="Carbo Ops" onMenu={handleMenu} />

      <div className="flex flex-1 min-h-0">
        {deskOpen && (
          <aside className="hidden md:block w-60 shrink-0 border-r bg-card overflow-y-auto">
            <Nav />
          </aside>
        )}

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[280px] p-0 overflow-y-auto">
            <Nav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
