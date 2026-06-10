import { useMemo } from "react";
import { Target, DollarSign, TrendingUp, Trophy } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";

// ⚠️ PORT VISUAL — dados MOCK. TODO: ligar em useSalesTargetsWithProgress (Supabase).

interface MetaVendedor { vendedor: string; meta: number; realizado: number; }
const MOCK: MetaVendedor[] = [
  { vendedor: "Lucas Padilha", meta: 80000, realizado: 92000 },
  { vendedor: "Marcio Vannucci", meta: 120000, realizado: 86000 },
  { vendedor: "Marcius D'Ávila", meta: 60000, realizado: 61500 },
  { vendedor: "Equipe B2C", meta: 50000, realizado: 28000 },
];

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (real: number, meta: number) => (meta > 0 ? Math.round((real / meta) * 100) : 0);
const variant = (p: number): "success" | "info" | "warning" | "destructive" =>
  p >= 100 ? "success" : p >= 70 ? "info" : p >= 40 ? "warning" : "destructive";
const barColor = (p: number) =>
  p >= 100 ? "bg-success" : p >= 70 ? "bg-carbo-blue" : p >= 40 ? "bg-warning" : "bg-destructive";

const monthLabel = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export default function Metas() {
  const resumo = useMemo(() => {
    const meta = MOCK.reduce((s, m) => s + m.meta, 0);
    const real = MOCK.reduce((s, m) => s + m.realizado, 0);
    return {
      meta, real,
      overall: pct(real, meta),
      hitting: MOCK.filter((m) => pct(m.realizado, m.meta) >= 100).length,
    };
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <CarboPageHeader title="Metas de Vendas" description="Acompanhe e configure metas mensais por vendedor" icon={Target} />

      <h2 className="text-lg font-semibold capitalize">{monthLabel}</h2>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <CarboKPI title="Meta Total" value={brl(resumo.meta)} icon={Target} iconColor="blue" delay={50} />
        <CarboKPI title="Realizado" value={brl(resumo.real)} icon={DollarSign} iconColor={resumo.overall >= 100 ? "success" : "warning"} delay={100} />
        <CarboKPI title="% Atingimento" value={`${resumo.overall}%`} icon={TrendingUp} iconColor={resumo.overall >= 100 ? "success" : "warning"} delay={150} />
        <CarboKPI title="Batendo Meta" value={`${resumo.hitting}/${MOCK.length}`} icon={Trophy} iconColor="green" delay={200} />
      </div>

      {/* Progresso geral do time */}
      <CarboCard>
        <CarboCardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Progresso Geral do Time</span>
            <CarboBadge variant={variant(resumo.overall)}>{resumo.overall}%</CarboBadge>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor(resumo.overall)}`} style={{ width: `${Math.min(resumo.overall, 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{brl(resumo.real)} realizado</span>
            <span>{brl(resumo.meta)} meta</span>
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Por vendedor */}
      <div className="grid gap-3 md:grid-cols-2">
        {MOCK.map((m) => {
          const p = pct(m.realizado, m.meta);
          return (
            <CarboCard key={m.vendedor}>
              <CarboCardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{m.vendedor}</h3>
                  <CarboBadge variant={variant(p)}>{p}%</CarboBadge>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor(p)}`} style={{ width: `${Math.min(p, 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{brl(m.realizado)} realizado</span>
                  <span>Meta: {brl(m.meta)}</span>
                </div>
              </CarboCardContent>
            </CarboCard>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Tela em port visual — dados de exemplo. Configuração e dados reais de metas entram na fase de lógica.
      </p>
    </div>
  );
}
