import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { CreateEventDialog } from "@/components/CreateEventDialog";

// ⚠️ PORT VISUAL FIEL ao Controle (/scheduling → Scheduling "Agendamentos") — dados MOCK.
// Acompanhamento dos agendamentos de descarbonização.

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const EVENTS: Record<number, { label: string; color: string }[]> = {
  10: [{ label: "OS-1039 execução", color: "#8b5cf6" }],
  12: [{ label: "OS-1041 confirmada", color: "#6366f1" }],
  14: [{ label: "OS-1042 frota", color: "#f59e0b" }, { label: "Manut. MAQ-013", color: "#ef4444" }],
  18: [{ label: "Viagem SP", color: "#06b6d4" }],
  20: [{ label: "Manut. MAQ-014", color: "#22c55e" }],
};
const UPCOMING = [
  { data: "10/06", titulo: "OS-1039 — execução", tipo: "Ordem de Serviço" },
  { data: "12/06", titulo: "OS-1041 — confirmada", tipo: "Ordem de Serviço" },
  { data: "14/06", titulo: "OS-1042 — frota", tipo: "Ordem de Serviço" },
  { data: "18/06", titulo: "Viagem São Paulo", tipo: "Viagem" },
];

export default function Agendamentos() {
  const [createOpen, setCreateOpen] = useState(false);
  const [ref] = useState(new Date(2026, 5, 1)); // jun/2026 (mock)
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CarboPageHeader title="Agendamentos" description="Acompanhe os agendamentos de descarbonização" icon={CalendarIcon} />
          <Button className="gap-2" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Novo Evento</Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Calendário */}
          <CarboCard className="lg:col-span-3">
            <CarboCardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="icon" className="h-8 w-8"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm font-semibold capitalize">junho de 2026</span>
                <Button variant="ghost" size="icon" className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {WEEK.map((w) => <div key={w} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{w}</div>)}
                {cells.map((d, i) => (
                  <div key={i} className={`min-h-[72px] rounded-lg border p-1 ${d ? "bg-card" : "bg-transparent border-transparent"}`}>
                    {d && (
                      <>
                        <p className="text-xs text-muted-foreground mb-1">{d}</p>
                        <div className="space-y-0.5">
                          {(EVENTS[d] ?? []).map((e, j) => (
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
              <div className="space-y-2">
                {UPCOMING.map((e, i) => (
                  <div key={i} className="rounded-lg border p-2.5">
                    <p className="text-xs font-semibold text-muted-foreground">{e.data}</p>
                    <p className="text-sm font-medium leading-tight mt-0.5">{e.titulo}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{e.tipo}</p>
                  </div>
                ))}
              </div>
            </CarboCardContent>
          </CarboCard>
        </div>
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. Eventos reais e vínculo com OS entram na fase de lógica.</p>
      </div>

      <CreateEventDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
