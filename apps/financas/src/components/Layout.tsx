import { NavLink, Outlet } from "react-router-dom";
import { Wallet, LogOut, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { HUB_URL } from "@/lib/sso";
import { FIN_NAV } from "@/lib/financasNav";

export function Layout() {
  const { profile, signOut } = useAuth();
  const nome = profile?.full_name ?? "";

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border">
        <div className="h-14 flex items-center gap-2 px-4 font-bold border-b border-border">
          <Wallet className="h-5 w-5 text-carbo-green" /> Carbo Finanças
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {FIN_NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) => cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive ? "bg-carbo-green/10 text-carbo-green font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border text-xs text-muted-foreground truncate">{nome}</div>
      </aside>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-border flex items-center justify-between px-4">
          <div className="md:hidden flex items-center gap-2 font-bold">
            <Wallet className="h-5 w-5 text-carbo-green" /> Finanças
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => { window.location.href = `${HUB_URL}/home`; }}>
              <ExternalLink className="h-4 w-4 mr-1" /> Hub
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          </div>
        </header>
        {/* Nav mobile */}
        <nav className="md:hidden flex gap-1 overflow-x-auto border-b border-border px-2 py-2">
          {FIN_NAV.map((item) => (
            <NavLink key={item.path} to={item.path} end={item.path === "/"}
              className={({ isActive }) => cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs whitespace-nowrap",
                isActive ? "bg-carbo-green/10 text-carbo-green font-semibold" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <item.icon className="h-3.5 w-3.5" /> {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
