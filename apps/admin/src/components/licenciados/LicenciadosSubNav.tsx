import { NavLink } from "react-router-dom";
import { Building2, Brain, Target } from "lucide-react";
import { cn } from "@/lib/utils";

// Sub-navegação da área de Licenciados no Carbo Admin.
// Espelha as abas do controle que existem no Admin (só leitura).
const TABS = [
  { to: "/dashboards/franqueados", label: "Visão Geral", icon: Building2, end: true },
  { to: "/dashboards/licenciados/inteligencia", label: "Inteligência Territorial", icon: Brain, end: false },
  { to: "/dashboards/licenciados/expansao", label: "Expansão Territorial", icon: Target, end: false },
] as const;

export function LicenciadosSubNav() {
  return (
    <div className="flex items-stretch gap-1 bg-muted/40 border border-border rounded-2xl p-1 overflow-x-auto">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors",
              isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-card/50"
            )
          }
        >
          <tab.icon className="h-4 w-4" />
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
