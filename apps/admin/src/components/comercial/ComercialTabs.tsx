import { NavLink, useLocation } from "react-router-dom";
import { BarChart3, Table2 } from "lucide-react";
import { queryDoRecorte } from "@/hooks/useFiltrosComerciaisUrl";

// Agrupa as telas comerciais (Gráficos ↔ Dados/fonte) num seletor único.
// ⚠️ O link LEVA o recorte (`?de=&ate=&vendedor=&canal=`): as duas telas são a
// mesma base com os mesmos filtros, e trocar de visão não pode zerar o período
// que a pessoa acabou de escolher. Só o recorte vai — busca e ordem são da lista.
const TABS = [
  { to: "/painel-comercial", label: "Gráficos", icon: BarChart3 },
  { to: "/dados-comerciais", label: "Dados (fonte)", icon: Table2 },
];

export function ComercialTabs() {
  const { search } = useLocation();
  const recorte = queryDoRecorte(search);
  return (
    <div className="inline-flex gap-1 rounded-lg border p-1">
      {TABS.map((t) => (
        <NavLink key={t.to} to={`${t.to}${recorte}`}
          className={({ isActive }) => `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            isActive ? "bg-carbo-green/10 text-carbo-green" : "text-muted-foreground hover:bg-muted"}`}>
          <t.icon className="h-3.5 w-3.5" /> {t.label}
        </NavLink>
      ))}
    </div>
  );
}
