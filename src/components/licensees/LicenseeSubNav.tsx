import { Link, useLocation } from "react-router-dom";
import { Building2, Cpu, Globe, Trophy, Brain, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const LICENSEE_TABS = [
  {
    href: "/licensees",
    label: "Cadastro",
    icon: Building2,
    description: "Gestão de licenciados",
    match: (path: string) => path === "/licensees" || path.startsWith("/licensees/"),
  },
  {
    href: "/machines",
    label: "Máquinas",
    icon: Cpu,
    description: "Parque de equipamentos",
    match: (path: string) => path === "/machines" || path.startsWith("/machines/"),
  },
  {
    href: "/ops/network-map",
    label: "Mapa da Rede",
    icon: Globe,
    description: "Distribuição geográfica",
    match: (path: string) => path === "/ops/network-map",
  },
  {
    href: "/ops/licensee-ranking",
    label: "Ranking Licenciados",
    icon: Trophy,
    description: "Performance comparativa",
    match: (path: string) => path === "/ops/licensee-ranking",
  },
  {
    href: "/ops/territory-intelligence",
    label: "Inteligência Territorial",
    icon: Brain,
    description: "Análise de territórios",
    match: (path: string) => path === "/ops/territory-intelligence",
  },
  {
    href: "/ops/territory-expansion",
    label: "Expansão Territorial",
    icon: Target,
    description: "Oportunidades de crescimento",
    match: (path: string) => path === "/ops/territory-expansion",
  },
] as const;

export function LicenseeSubNav() {
  const location = useLocation();

  return (
    <div className="relative">
      {/* Tab bar */}
      <div className="flex items-stretch gap-0 bg-muted/40 border border-border rounded-2xl p-1 overflow-x-auto scrollbar-none">
        {LICENSEE_TABS.map((tab) => {
          const isActive = tab.match(location.pathname);
          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                "group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 select-none",
                isActive
                  ? "bg-white dark:bg-card text-carbo-green shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/60 dark:hover:bg-card/60"
              )}
              title={tab.description}
            >
              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-carbo-green" />
              )}

              <tab.icon
                className={cn(
                  "h-4 w-4 flex-shrink-0 transition-colors",
                  isActive ? "text-carbo-green" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
