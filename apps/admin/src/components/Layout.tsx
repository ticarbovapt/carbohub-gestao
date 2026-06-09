import { NavLink, Outlet } from "react-router-dom";
import { ShieldCheck, LogOut, Users as UsersIcon, ListTree } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

export function Layout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar */}
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl carbo-gradient flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold leading-none">Carbo Admin</p>
              <p className="text-xs text-muted-foreground">Identidades e acessos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {profile?.full_name ?? profile?.username}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r bg-card min-h-[calc(100vh-4rem)] p-3 hidden md:block">
          <nav className="space-y-1">
            <NavLink to="/" end className={navCls}>
              <UsersIcon className="h-4 w-4" /> Usuários
            </NavLink>
            <NavLink to="/estrutura" className={navCls}>
              <ListTree className="h-4 w-4" /> Departamentos e funções
            </NavLink>
          </nav>
        </aside>

        {/* Conteúdo */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
