import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Users as UsersIcon, ListTree } from "lucide-react";
import { TopBar } from "@/components/TopBar";

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <div className="min-h-screen bg-background">
      <TopBar appName="Carbo Admin" onMenu={() => setSidebarOpen((o) => !o)} />

      <div className="flex">
        {/* Sidebar (toggle pela barra) */}
        {sidebarOpen && (
          <aside className="w-56 shrink-0 border-r bg-card min-h-[calc(100vh-4rem)] p-3">
            <nav className="space-y-1">
              <NavLink to="/" end className={navCls}>
                <UsersIcon className="h-4 w-4" /> Usuários
              </NavLink>
              <NavLink to="/estrutura" className={navCls}>
                <ListTree className="h-4 w-4" /> Departamentos e funções
              </NavLink>
            </nav>
          </aside>
        )}

        {/* Conteúdo */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
