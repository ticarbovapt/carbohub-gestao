import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, DragOverlay,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarClock, Clock } from "lucide-react";
import { useBoard, useBoardLive, useBoardMutations, type CardSummary } from "@/hooks/useBoards";
import { BOARD_BG, LABEL_COLORS, LIST_DOT, LIST_PALETTE } from "@/lib/mktTheme";
import {
  monthMatrix, weekDays, ymd, ymdOfIso, isSameDay, addMonths, addDays, fmtMonthYear, isoForDay, WEEKDAY_LABELS,
} from "@/lib/mktCalendar";
import { CardModal } from "@/components/board/CardModal";
import { ViewSwitcher } from "@/components/board/ViewSwitcher";

// Cartão no calendário (arrastável).
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

// Célula de dia (área de drop).
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

// Faixa "sem data" (área de drop que limpa a entrega).
function NoDateTray({ cards, color, onOpen }: { cards: CardSummary[]; color: (c: CardSummary) => string; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: "no-date" });
  return (
    <div ref={setNodeRef} className={`shrink-0 border-t border-border bg-muted/30 px-3 py-2 ${isOver ? "ring-2 ring-primary ring-inset" : ""}`}>
      <p className="text-[11px] font-semibold text-muted-foreground mb-1">Sem data ({cards.length}) — arraste para um dia; ou solte aqui para remover a data</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cards.length === 0 && <span className="text-xs text-muted-foreground">Nenhum cartão sem data.</span>}
        {cards.map((c) => (
          <div key={c.id} className="w-40 shrink-0"><CalCard card={c} color={color(c)} onOpen={() => onOpen(c.id)} /></div>
        ))}
      </div>
    </div>
  );
}

export default function BoardCalendar() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading } = useBoard(boardId ?? null);
  useBoardLive(boardId ?? null);
  const m = useBoardMutations(boardId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [ref, setRef] = useState<Date>(() => new Date());
  const [mode, setMode] = useState<"month" | "week">("month");
  const [colorBy, setColorBy] = useState<"label" | "list">("list");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const cid = searchParams.get("card");
    if (cid) { setOpenCardId(cid); searchParams.delete("card"); setSearchParams(searchParams, { replace: true }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const listColorMap = useMemo(() => {
    const idx = new Map((data?.lists ?? []).map((l, i) => [l.id, i]));
    return (listId: string) => {
      const l = (data?.lists ?? []).find((x) => x.id === listId);
      if (l?.color && LIST_DOT[l.color]) return LIST_DOT[l.color];
      return LIST_PALETTE[(idx.get(listId) ?? 0) % LIST_PALETTE.length];
    };
  }, [data?.lists]);

  const cardColor = useMemo(() => (card: CardSummary): string => {
    if (colorBy === "list") return listColorMap(card.list_id);
    const lab = (data?.labels ?? []).find((l) => card.labelIds.includes(l.id));
    return lab ? (LABEL_COLORS[lab.color] ?? lab.color) : "#94a3b8";
  }, [colorBy, listColorMap, data?.labels]);

  // Data do cartão = entrega, senão início.
  const cardDate = (c: CardSummary) => c.due_date ?? c.start_date;
  const { byDay, undated } = useMemo(() => {
    const map = new Map<string, CardSummary[]>();
    const und: CardSummary[] = [];
    for (const c of data?.cards ?? []) {
      const d = cardDate(c);
      if (!d) { und.push(c); continue; }
      const key = ymdOfIso(d);
      (map.get(key) ?? map.set(key, []).get(key)!).push(c);
    }
    return { byDay: map, undated: und };
  }, [data?.cards]);

  if (!boardId) return null;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Carregando calendário…</div>;
  const { board } = data;
  const weeks = mode === "month" ? monthMatrix(ref) : [weekDays(ref)];
  const today = new Date();
  const activeCard = activeId ? data.cards.find((c) => c.id === activeId) ?? null : null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const card = data.cards.find((c) => c.id === active.id);
    if (!card) return;
    if (over.id === "no-date") {
      m.setCardDates.mutate({ id: card.id, due_date: null });
    } else {
      const iso = isoForDay(String(over.id), card.due_date);
      m.setCardDates.mutate({ id: card.id, due_date: iso });
    }
  };

  const step = (dir: number) => setRef((r) => mode === "month" ? addMonths(r, dir) : addDays(r, dir * 7));

  return (
    <div className="fixed inset-0 top-14 flex flex-col" style={{ background: BOARD_BG[board.background] ?? BOARD_BG.blue }}>
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-black/20 backdrop-blur-sm flex-wrap">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md hover:bg-white/10 text-white"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-lg font-bold text-white drop-shadow flex items-center gap-2"><CalendarClock className="h-5 w-5" /> {board.title}</h1>
        <ViewSwitcher boardId={boardId} current="calendario" />

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* navegação */}
          <div className="flex items-center gap-1 text-white">
            <button onClick={() => step(-1)} className="p-1.5 rounded hover:bg-white/15"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold capitalize min-w-[130px] text-center">{fmtMonthYear(ref)}</span>
            <button onClick={() => step(1)} className="p-1.5 rounded hover:bg-white/15"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => setRef(new Date())} className="text-xs bg-white/15 hover:bg-white/25 rounded px-2 py-1">Hoje</button>
          </div>
          {/* mês/semana */}
          <div className="flex gap-0.5 bg-white/15 rounded-md p-0.5">
            {(["month", "week"] as const).map((mo) => (
              <button key={mo} onClick={() => setMode(mo)} className={`px-2.5 py-1 text-xs font-semibold rounded ${mode === mo ? "bg-white text-slate-900" : "text-white/90"}`}>{mo === "month" ? "Mês" : "Semana"}</button>
            ))}
          </div>
          {/* cor por */}
          <div className="flex gap-0.5 bg-white/15 rounded-md p-0.5">
            {(["list", "label"] as const).map((cb) => (
              <button key={cb} onClick={() => setColorBy(cb)} className={`px-2.5 py-1 text-xs font-semibold rounded ${colorBy === cb ? "bg-white text-slate-900" : "text-white/90"}`}>{cb === "list" ? "Cor: lista" : "Cor: etiqueta"}</button>
            ))}
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-auto p-3">
          {/* cabeçalho dos dias da semana */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_LABELS.map((w) => <div key={w} className="text-center text-xs font-semibold text-white/90 drop-shadow">{w}</div>)}
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {weeks.flat().map((day) => {
              const key = ymd(day);
              const cards = byDay.get(key) ?? [];
              return (
                <DayCell key={key} dayId={key} isToday={isSameDay(day, today)} isOther={day.getMonth() !== ref.getMonth() && mode === "month"} dayNum={day.getDate()} tall={mode === "week"}>
                  {cards.map((c) => <CalCard key={c.id} card={c} color={cardColor(c)} onOpen={() => setOpenCardId(c.mirrorOf ?? c.id)} />)}
                </DayCell>
              );
            })}
          </div>
        </div>

        <NoDateTray cards={undated} color={cardColor} onOpen={(id) => setOpenCardId(id)} />

        <DragOverlay>
          {activeCard ? <div className="rounded-md bg-card border border-primary/50 shadow-lg px-1.5 py-1 text-[11px] w-40 truncate">{activeCard.title}</div> : null}
        </DragOverlay>
      </DndContext>

      {openCardId && <CardModal cardId={openCardId} boardId={boardId} labels={data.labels} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
