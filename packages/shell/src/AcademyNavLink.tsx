import { ArrowUpRight } from "lucide-react";
import { cn } from "./cn";
import { ACADEMY_APP } from "./apps";

/**
 * A porta do Carbo Academy no MENU LATERAL dos apps internos.
 *
 * O seletor de apps (atrás do logo) já listava o Academy desde a #666, e
 * mesmo assim "no Sales não tem nada" (08/10/2026): ninguém procura curso
 * num seletor de SISTEMAS. No Portal, no md e no Licenciados a porta está
 * no menu — aqui tem de estar no mesmo lugar.
 *
 * ⚠️ Mora no `Sidebar`/`MobileDrawer` COMPARTILHADOS, não nas `sections` de
 * cada app: assim é UM arquivo para os oito apps, em vez de oito listas de
 * menu para lembrar (e uma delas esquecer).
 *
 * Sai na MESMA aba, para o Academy receber o `referrer` e oferecer "Voltar".
 */
export function AcademyNavLink({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = ACADEMY_APP.icon;
  return (
    <div className={cn(collapsed ? "flex justify-center border-t border-border/60 pt-1" : "pt-2")}>
      {!collapsed && (
        <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {ACADEMY_APP.name}
        </div>
      )}
      <a
        href={ACADEMY_APP.href}
        onClick={onNavigate}
        title={collapsed ? ACADEMY_APP.name : "Abre o Carbo Academy"}
        className={cn(
          "flex items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          collapsed ? "h-9 w-9 justify-center" : "gap-2.5 px-3 py-2",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color: ACADEMY_APP.accent }} />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{ACADEMY_APP.name}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </>
        )}
      </a>
    </div>
  );
}
