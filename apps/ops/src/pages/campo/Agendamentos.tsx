import { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Loader2, Eye } from "lucide-react";
import { useOS, type OSRow } from "@/hooks/useOS";

// Espelho/acompanhamento dos agendamentos de descarbonização (crm_os.data_prevista).
// No Ops é SOMENTE LEITURA — o agendamento é feito no Carbo Sales.

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TIPO_LABEL: Record<string, string> = { b2c: "B2C", b2b: "B2B", frota: "Frota" };
const TIPO_COLOR: Record<string, string> = { b2c: "#10b981", b2b: "#3b82f6", frota: "#f59e0b" };

const osLabel = (o: OSRow) => o.titulo?.trim() || o.cliente_nome?.trim() || `OS-${o.id.slice(0, 8)}`;

export default function Agendamentos() {
  const [ref, setRef] = useState(() => new Date());
  const { data, isLoading } = useOS();

  const agendadas = useMemo(() => (data ?? []).filter((o) => !!o.data_prevista), [data]);

  const year = ref.getFullYear();
  const month = ref.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const eventsByDay = useMemo(() => {
    const map: Record<number, { label: string; color: string }[]> = {};
    for (const o of agendadas) {
      const d = new Date(o.data_prevista!);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      (map[d.getDate()] ??= []).push({ label: osLabel(o), color: TIPO_COLOR[o.tipo] ?? "#8b5cf6" });
    }
    return map;
  }, [agendadas, year, month]);

  const monthLabel = ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const upcoming = useMemo(() => {
    const now = Date.now();
    return agendadas
      .filter((o) => new Date(o.data_prevista!).getTime() >= now)
      .sort((a, b) => new Date(a.data_prevista!).getTime() - new Date(b.data_prevista!).getTime())
      .slice(0, 6);
  }, [agendadas]);

  const goMonth = (delta: number) => setRef(new Date(year, month + delta, 1));

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        <CarboPageHeader title="Agendamentos" description="Acompanhe os agendamentos de descarbonização" icon={CalendarIcon} />

        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-500">
          <Eye className="h-4 w-4 shrink-0" />
          <span>Acompanhamento (somente leitura). O agendamento é feito no <strong>Carbo Sales</strong>.</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Carregando agendamentos...</div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <CarboCard className="lg:col-span-3">
            <CarboCardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm font-semibold capitalize">{monthLabel}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {WEEK.map((w) => <div key={w} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{w}</div>)}
                {cells.map((d, i) => (
                  <div key={i} className={`min-h-[72px] rounded-lg border p-1 ${d ? "bg-card" : "bg-transparent border-transparent"}`}>
                    {d && (
                      <>
                        <p className="text-xs text-muted-foreground mb-1">{d}</p>
                        <div className="space-y-0.5">
                          {(eventsByDay[d] ?? []).map((e, j) => (
                            <div key={j} className="text-[9px] truncate rounded px-1 py-0.5 font-medium" style={{ background: e.color + "20", color: e.color }} title={e.label}>{e.label}</div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CarboCardContent>
          </CarboCard>

          <CarboCard>
            <CarboCardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Próximos eventos</h3>
              {upcoming.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Nenhum agendamento futuro.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((o) => {
                    const d = new Date(o.data_prevista!);
                    return (
                      <div key={o.id} className="rounded-lg border p-2.5">
                        <p className="text-xs font-semibold text-muted-foreground">{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>
                        <p className="text-sm font-medium leading-tight mt-0.5">{osLabel(o)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Descarbonização · {TIPO_LABEL[o.tipo] ?? o.tipo}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CarboCardContent>
          </CarboCard>
        </div>
        )}
        <p className="text-xs text-muted-foreground text-center">{agendadas.length} agendamento(s) · espelho do Carbo Sales (crm_os).</p>
      </div>
    </div>
  );
}
