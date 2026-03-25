import { useNavigate, useLocation } from "react-router-dom";
import { Building2, Cpu, Globe, Trophy, Brain, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const LICENSEE_TABS = [
  { href: "/licensees", label: "Cadastro", icon: Building2 },
  { href: "/machines", label: "Máquinas", icon: Cpu },
  { href: "/ops/network-map", label: "Mapa da Rede", icon: Globe },
  { href: "/ops/licensee-ranking", label: "Ranking", icon: Trophy },
  { href: "/ops/territory-intelligence", label: "Inteligência", icon: Brain },
  { href: "/ops/territory-expansion", label: "Expansão", icon: Target },
] as const;

export function LicenseeSubNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border overflow-x-auto">
      {LICENSEE_TABS.map((tab) => {
        const isActive = location.pathname === tab.href;
        return (
          <button
            key={tab.href}
            onClick={() => navigate(tab.href)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
              isActive
                ? "bg-white dark:bg-card text-carbo-green shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-card/50"
            )}
          >
            <tab.icon className="h-4 w-4 flex-shrink-0" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
