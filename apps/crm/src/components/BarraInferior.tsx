import { NavLink } from "react-router-dom";
import { KanbanSquare, TrendingUp, ShoppingCart, CalendarCheck, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── A barra de baixo do Sales, só no celular ─────────────────────────────────
 * O app do vendedor em campo: as quatro telas do dia a dia a um toque, com
 * "Vender" no meio, e "Mais" abrindo o menu completo (a mesma gaveta do ☰).
 * Em FLUXO no fim do Layout (nunca `fixed`): o <main> encolhe sozinho e o
 * rodapé do /vender fica logo acima dela. A área da barra de gestos do iPhone
 * já vem do `pb-[env(safe-area-inset-bottom)]` da div raiz. */
const ITENS = [
  { to: "/funis", label: "Funis", icon: KanbanSquare },
  { to: "/vendas", label: "Vendas", icon: TrendingUp },
  { to: "/vender", label: "Vender", icon: ShoppingCart, destaque: true },
  { to: "/rtm/agenda", label: "Visitas", icon: CalendarCheck },
] as const;

export function BarraInferior({ onMais }: { onMais: () => void }) {
  return (
    <nav aria-label="Navegação principal"
      className="md:hidden shrink-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="grid grid-cols-5">
        {ITENS.slice(0, 2).map((i) => <Item key={i.to} {...i} />)}
        <Item {...ITENS[2]} />
        <Item {...ITENS[3]} />
        <button type="button" onClick={onMais}
          className="flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground">
          <Menu className="h-5 w-5" />
          Mais
        </button>
      </div>
    </nav>
  );
}

function Item({ to, label, icon: Icone, destaque }: { to: string; label: string; icon: typeof Menu; destaque?: boolean }) {
  return (
    <NavLink to={to}
      className={({ isActive }) => cn(
        "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
        isActive ? "text-carbo-green" : "text-muted-foreground",
      )}>
      {destaque ? (
        <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-carbo-green to-carbo-blue text-white shadow-lg ring-4 ring-background">
          <Icone className="h-5 w-5" />
        </span>
      ) : <Icone className="h-5 w-5" />}
      {label}
    </NavLink>
  );
}
