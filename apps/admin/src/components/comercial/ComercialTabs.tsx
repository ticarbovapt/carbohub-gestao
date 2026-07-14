import { NavLink } from "react-router-dom";
import { BarChart3, Table2 } from "lucide-react";

// Agrupa as telas comerciais (Gráficos ↔ Dados/fonte) num seletor único.
const TABS = [
  { to: "/comercial/dashboard", label: "Gráficos", icon: BarChart3 },
  { to: "/comercial/dados", label: "Dados (fonte)", icon: Table2 },
];

export function ComercialTabs() {
  return (
    <div className="inline-flex gap-1 rounded-lg border p-1">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to}
          className={({ isActive }) => `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            isActive ? "bg-carbo-green/10 text-carbo-green" : "text-muted-foreground hover:bg-muted"}`}>
          <t.icon className="h-3.5 w-3.5" /> {t.label}
        </NavLink>
      ))}
    </div>
  );
}
