import { useMemo, useState } from "react";
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, DragOverlay,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { monthMatrix, weekDays, ymd, ymdOfIso, isSameDay, WEEKDAY_LABELS } from "@/lib/mktCalendar";
import type { CardSummary } from "@/hooks/useBoards";

// Grade de calendário reutilizável (D1 e views de área de trabalho — D6).
// A navegação/toggles ficam na página; aqui é só a grade + drag de data.

function CalCard({ card, color, onOpen }: { card: CardSummary; color: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1, borderLeftColor: color };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onOpen}
      className="rounded-md bg-card border border-border border-l-[3px] shadow-sm hover:border-primary/40 cursor-pointer px-1.5 py-1 text-[11px] leading-tight text-foreground truncate">
      {card.title}
    </div>
  );
}

function DayCell({ dayId, isToday, isOther, dayNum, tall, children }: {
  dayId: string; isToday: boolean; isOther: boolean; dayNum: number; tall?: boolean; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayId });
  return (
    <div ref={setNodeRef}
      className={`border border-border/60 rounded-md p-1 flex flex-col gap-1 overflow-hidden ${tall ? "min-h-[220px]" : "min-h-[92px]"} ${isOther ? "bg-muted/20" : "bg-card"} ${isOver ? "ring-2 ring-primary" : ""}`}>
      <span className={`text-[11px] font-semibold self-end h-5 w-5 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : isOther ? "text-muted-foreground" : "text-foreground"}`}>{dayNum}</span>
      <div className="flex flex-col gap-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function NoDateTray({ cards, color, onOpen }: { cards: CardSummary[]; color: (c: CardSummary) => string; onOpen: (c: CardSummary) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: "no-date" });
  return (
    <div ref={setNodeRef} className={`shrink-0 border-t border-border bg-muted/30 px-3 py-2 ${isOver ? "ring-2 ring-primary ring-inset" : ""}`}>
      <p className="text-[11px] font-semibold text-muted-foreground mb-1">Sem data ({cards.length}) — arraste para um dia; ou solte aqui para remover a data</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cards.length === 0 && <span className="text-xs text-muted-foreground">Nenhum cartão sem data.</span>}
        {cards.map((c) => <div key={c.id} className="w-40 shrink-0"><CalCard card={c} color={color(c)} onOpen={() => onOpen(c)} /></div>)}
      </div>
    </div>
  );
}

export function CalendarGrid({ cards, refDate, mode, color, onOpenCard, onSetDay }: {
  cards: CardSummary[];
  refDate: Date;
  mode: "month" | "week";
  color: (c: CardSummary) => string;
  onOpenCard: (c: CardSummary) => void;
  onSetDay: (cardId: string, dayYmd: string | null) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  const cardDate = (c: CardSummary) => c.due_date ?? c.start_date;
  const { byDay, undated } = useMemo(() => {
    const map = new Map<string, CardSummary[]>();
    const und: CardSummary[] = [];
    for (const c of cards) {
      const d = cardDate(c);
      if (!d) { und.push(c); continue; }
      const key = ymdOfIso(d);
      (map.get(key) ?? map.set(key, []).get(key)!).push(c);
    }
    return { byDay: map, undated: und };
  }, [cards]);

  const weeks = mode === "month" ? monthMatrix(refDate) : [weekDays(refDate)];
  const today = new Date();
  const activeCard = activeId ? cards.find((c) => c.id === activeId) ?? null : null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    onSetDay(String(active.id), over.id === "no-date" ? null : String(over.id));
  };

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd}>
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LABELS.map((w) => <div key={w} className="text-center text-xs font-semibold text-white/90 drop-shadow">{w}</div>)}
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {weeks.flat().map((day) => {
            const key = ymd(day);
            const dayCards = byDay.get(key) ?? [];
            return (
              <DayCell key={key} dayId={key} isToday={isSameDay(day, today)} isOther={day.getMonth() !== refDate.getMonth() && mode === "month"} dayNum={day.getDate()} tall={mode === "week"}>
                {dayCards.map((c) => <CalCard key={c.id} card={c} color={color(c)} onOpen={() => onOpenCard(c)} />)}
              </DayCell>
            );
          })}
        </div>
      </div>

      <NoDateTray cards={undated} color={color} onOpen={onOpenCard} />

      <DragOverlay>
        {activeCard ? <div className="rounded-md bg-card border border-primary/50 shadow-lg px-1.5 py-1 text-[11px] w-40 truncate">{activeCard.title}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
