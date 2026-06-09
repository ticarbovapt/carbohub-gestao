import { NavLink, Outlet } from "react-router-dom";
import { Users as UsersIcon, ListTree } from "lucide-react";
import { TopBar } from "@/components/TopBar";

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

export function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <TopBar appName="Carbo Admin" />

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
