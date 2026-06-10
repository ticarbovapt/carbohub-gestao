import { useNavigate } from "react-router-dom";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Factory, ArrowRight } from "lucide-react";
import { OPS_GROUPS } from "@/lib/opsNav";

const ACCENTS = ["#3b82f6", "#22c55e", "#f59e0b", "#a78bfa", "#06b6d4", "#f43f5e", "#10b981"];

export default function Home() {
  const navigate = useNavigate();
  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Carbo Ops"
          description="Operações — produção, estoque, compras, financeiro e logística"
          icon={Factory}
        />

        <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-5 text-center">
          <p className="text-sm font-medium">Estrutura pronta — telas em portabilidade 🛠️</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl mx-auto">
            Cada área já tem seu lugar. As telas estão sendo portadas fiéis ao Carbo
            Controle, por etapas. Os dashboards ficam dentro de cada área (sem "Dash" genérico).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {OPS_GROUPS.map((group, gi) => {
            const accent = ACCENTS[gi % ACCENTS.length];
            return (
              <div key={group.label} className="relative overflow-hidden rounded-2xl border border-border bg-board-surface p-4">
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">{group.label}</h3>
                  <span className="text-[10px] text-muted-foreground">{group.items.length} {group.items.length === 1 ? "tela" : "telas"}</span>
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors group"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <item.icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
