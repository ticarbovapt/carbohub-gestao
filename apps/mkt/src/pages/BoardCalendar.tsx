import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { useBoard, useBoardLive, useBoardMutations, type CardSummary } from "@/hooks/useBoards";
import { LABEL_COLORS, LIST_DOT, LIST_PALETTE, getAccent } from "@/lib/mktTheme";
import { addMonths, addDays, fmtMonthYear, isoForDay } from "@/lib/mktCalendar";
import { CardModal } from "@/components/board/CardModal";
import { CalendarGrid } from "@/components/board/CalendarGrid";
import { ViewSwitcher } from "@/components/board/ViewSwitcher";

export default function BoardCalendar() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading } = useBoard(boardId ?? null);
  useBoardLive(boardId ?? null);
  const m = useBoardMutations(boardId);

  const [ref, setRef] = useState<Date>(() => new Date());
  const [mode, setMode] = useState<"month" | "week">("month");
  const [colorBy, setColorBy] = useState<"label" | "list">("list");
  const [openCardId, setOpenCardId] = useState<string | null>(null);

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

  const cardById = useMemo(() => new Map((data?.cards ?? []).map((c) => [c.id, c])), [data?.cards]);

  if (!boardId) return null;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Carregando calendário…</div>;
  const { board } = data;

  const onSetDay = (cardId: string, dayYmd: string | null) => {
    const card = cardById.get(cardId);
    if (!card) return;
    m.setCardDates.mutate({ id: card.id, due_date: dayYmd ? isoForDay(dayYmd, card.due_date) : null });
  };

  const step = (dir: number) => setRef((r) => mode === "month" ? addMonths(r, dir) : addDays(r, dir * 7));

  const accent = getAccent(board.background);

  return (
    <div className="fixed inset-0 top-14 flex flex-col mkt-canvas">
      {/* Cabeçalho */}
      <div className="mkt-toolbar header-depth-glow flex-wrap gap-2">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><ArrowLeft className="h-4 w-4" /></button>
        <span className="mkt-dot" style={{ ["--mkt-accent" as any]: accent }} />
        <CalendarClock className="h-5 w-5 text-primary" />
        <h1 className="mkt-view-title">{board.title}</h1>
        <ViewSwitcher boardId={boardId} current="calendario" />

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* navegação */}
          <div className="flex items-center gap-1 text-foreground">
            <button onClick={() => step(-1)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold capitalize min-w-[130px] text-center text-foreground">{fmtMonthYear(ref)}</span>
            <button onClick={() => step(1)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => setRef(new Date())} className="text-xs h-8 rounded-md border border-border bg-card hover:bg-muted px-2.5 text-foreground">Hoje</button>
          </div>
          {/* mês/semana */}
          <div className="mkt-segmented">
            {(["month", "week"] as const).map((mo) => (
              <button key={mo} onClick={() => setMode(mo)} data-active={mode === mo} className={`mkt-segmented-item ${mode === mo ? "is-active" : ""}`}>{mo === "month" ? "Mês" : "Semana"}</button>
            ))}
          </div>
          {/* cor por */}
          <div className="mkt-segmented">
            {(["list", "label"] as const).map((cb) => (
              <button key={cb} onClick={() => setColorBy(cb)} data-active={colorBy === cb} className={`mkt-segmented-item ${colorBy === cb ? "is-active" : ""}`}>{cb === "list" ? "Cor: lista" : "Cor: etiqueta"}</button>
            ))}
          </div>
        </div>
      </div>

      <CalendarGrid
        cards={data.cards}
        refDate={ref}
        mode={mode}
        color={cardColor}
        onOpenCard={(c) => setOpenCardId(c.mirrorOf ?? c.id)}
        onSetDay={onSetDay}
      />

      {openCardId && <CardModal cardId={openCardId} boardId={boardId} labels={data.labels} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
