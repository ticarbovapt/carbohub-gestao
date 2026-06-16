import { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { NovaDescarbonizacaoDialog } from "@/components/NovaDescarbonizacaoDialog";
import { useOS, type OSRow } from "@/hooks/useOS";

// Acompanhamento dos agendamentos de descarbonização — dados reais (crm_os.data_prevista).

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TIPO_LABEL: Record<string, string> = { b2c: "B2C", b2b: "B2B", frota: "Frota" };
const TIPO_COLOR: Record<string, string> = { b2c: "#10b981", b2b: "#3b82f6", frota: "#f59e0b" };

const osLabel = (o: OSRow) =>
  o.titulo?.trim() || o.cliente_nome?.trim() || `OS-${o.id.slice(0, 8)}`;

export default function Agendamentos() {
  const [createOpen, setCreateOpen] = useState(false);
  const [ref, setRef] = useState(() => new Date());

  const { data, isLoading } = useOS();

  // Apenas OS com data prevista
  const agendadas = useMemo(
    () => (data ?? []).filter((o) => !!o.data_prevista),
    [data],
  );

  const year = ref.getFullYear();
  const month = ref.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Eventos do mês exibido, indexados por dia
  const eventsByDay = useMemo(() => {
    const map: Record<number, { label: string; color: string }[]> = {};
    for (const o of agendadas) {
      const d = new Date(o.data_prevista!);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      (map[day] ??= []).push({ label: osLabel(o), color: TIPO_COLOR[o.tipo] ?? "#8b5cf6" });
    }
    return map;
  }, [agendadas, year, month]);

  const monthLabel = ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // Próximos eventos (a partir de hoje, ordenados por data)
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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CarboPageHeader title="Agendamentos" description="Acompanhe os agendamentos de descarbonização" icon={CalendarIcon} />
          <Button size="sm" className="gap-2 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Nova Descarbonização</Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Carregando agendamentos...</div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Calendário */}
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

          {/* Próximos */}
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
        <p className="text-xs text-muted-foreground text-center">{agendadas.length} agendamento(s) com data prevista.</p>
      </div>

      <NovaDescarbonizacaoDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
