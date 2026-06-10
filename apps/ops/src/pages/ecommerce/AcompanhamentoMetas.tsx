import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Target, ChevronLeft, ChevronRight } from "lucide-react";
import { ECOM_PLATFORMS, brl } from "./platforms";

// ⚠️ PORT VISUAL — dados MOCK. Mostra faturamento/pedidos por plataforma + geral,
// e o andamento vs a meta (sem detalhes técnicos).

interface Linha { id: string; meta: number; realizado: number; pedidos: number; }
const DADOS: Record<string, Linha> = {
  mercadolivre: { id: "mercadolivre", meta: 90000, realizado: 86400, pedidos: 420 },
  amazon: { id: "amazon", meta: 65000, realizado: 61200, pedidos: 260 },
  nuvemshop: { id: "nuvemshop", meta: 40000, realizado: 39800, pedidos: 180 },
};

const pct = (real: number, meta: number) => (meta > 0 ? Math.round((real / meta) * 100) : 0);
const variant = (p: number): "success" | "warning" | "destructive" => (p >= 100 ? "success" : p >= 70 ? "warning" : "destructive");
const barColor = (p: number) => (p >= 100 ? "bg-success" : p >= 70 ? "bg-warning" : "bg-destructive");

export default function AcompanhamentoMetas() {
  const linhas = ECOM_PLATFORMS.map((p) => ({ plat: p, d: DADOS[p.id] }));
  const metaTotal = linhas.reduce((s, l) => s + l.d.meta, 0);
  const realTotal = linhas.reduce((s, l) => s + l.d.realizado, 0);
  const pedTotal = linhas.reduce((s, l) => s + l.d.pedidos, 0);
  const pctTotal = pct(realTotal, metaTotal);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CarboPageHeader title="Acompanhamento de Metas — E-commerce" description="Andamento do faturamento por plataforma vs meta" icon={Target} />
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
            <Button variant="ghost" size="icon" className="h-7 w-7"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-semibold w-28 text-center capitalize">junho de 2026</span>
            <Button variant="ghost" size="icon" className="h-7 w-7"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Total geral */}
        <CarboCard>
          <CarboCardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Geral</p>
                <div className="flex items-end gap-2 mt-0.5">
                  <p className="text-2xl font-bold tabular-nums">{brl(realTotal)}</p>
                  <p className="text-muted-foreground mb-0.5">/ {brl(metaTotal)}</p>
                </div>
              </div>
              <div className="text-right">
                <CarboBadge variant={variant(pctTotal)}>{pctTotal}%</CarboBadge>
                <p className="text-[11px] text-muted-foreground mt-1">{pedTotal.toLocaleString("pt-BR")} pedidos</p>
              </div>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barColor(pctTotal)}`} style={{ width: `${Math.min(pctTotal, 100)}%` }} />
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* Por plataforma */}
        <div className="space-y-3">
          {linhas.map(({ plat, d }) => {
            const p = pct(d.realizado, d.meta);
            return (
              <CarboCard key={plat.id}>
                <CarboCardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center text-lg shrink-0" style={{ background: plat.color + "20" }}>{plat.emoji}</div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{plat.label}</p>
                        <p className="text-[11px] text-muted-foreground">{d.pedidos.toLocaleString("pt-BR")} pedidos vendidos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold tabular-nums">{brl(d.realizado)}<span className="text-[10px] font-normal text-muted-foreground"> /{brl(d.meta)}</span></span>
                      <CarboBadge variant={variant(p)}>{p}%</CarboBadge>
                    </div>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor(p)}`} style={{ width: `${Math.min(p, 100)}%` }} />
                  </div>
                </CarboCardContent>
              </CarboCard>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. Faturamento real dos canais entra na fase de lógica.</p>
      </div>
    </div>
  );
}
