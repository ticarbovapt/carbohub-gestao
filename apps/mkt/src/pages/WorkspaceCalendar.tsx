import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarClock, Table2, LayoutGrid } from "lucide-react";
import { useBoardMutations, type CardSummary } from "@/hooks/useBoards";
import { useDefaultWorkspace, useWorkspaceData, useWorkspaceLive } from "@/hooks/useWorkspace";
import { LABEL_COLORS, LIST_PALETTE, getAccent } from "@/lib/mktTheme";
import { addMonths, addDays, fmtMonthYear, isoForDay } from "@/lib/mktCalendar";
import { CardModal } from "@/components/board/CardModal";
import { CalendarGrid } from "@/components/board/CalendarGrid";

// Calendário geral — cruza todos os quadros da área de trabalho (D6).
export default function WorkspaceCalendar() {
  const navigate = useNavigate();
  const { data: ws } = useDefaultWorkspace();
  const wsId = ws?.id ?? null;
  const { data, isLoading } = useWorkspaceData(wsId);
  useWorkspaceLive(wsId);
  const m = useBoardMutations();

  const [ref, setRef] = useState<Date>(() => new Date());
  const [mode, setMode] = useState<"month" | "week">("month");
  const [colorBy, setColorBy] = useState<"label" | "board">("board");
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const boardColor = useMemo(() => {
    const idx = new Map((data?.boards ?? []).map((b, i) => [b.id, i]));
    return (boardId: string) => LIST_PALETTE[(idx.get(boardId) ?? 0) % LIST_PALETTE.length];
  }, [data?.boards]);

  const cardColor = useMemo(() => (card: CardSummary): string => {
    if (colorBy === "board") return boardColor(card.board_id);
    const lab = (data?.labels ?? []).find((l) => card.labelIds.includes(l.id));
    return lab ? (LABEL_COLORS[lab.color] ?? lab.color) : "#94a3b8";
  }, [colorBy, boardColor, data?.labels]);

  const cardById = useMemo(() => new Map((data?.cards ?? []).map((c) => [c.id, c])), [data?.cards]);
  const openCard = openCardId ? cardById.get(openCardId) : undefined;
  const modalLabels = useMemo(
    () => (openCard ? (data?.labels ?? []).filter((l) => l.board_id === openCard.board_id) : []),
    [openCard, data?.labels],
  );

  if (isLoading || !data) {
    return (
      <div className="mkt-canvas fixed inset-0 top-14 flex flex-col">
        <div className="mkt-toolbar">
          <div className="mkt-skeleton h-6 w-6 !rounded-md" />
          <div className="mkt-skeleton h-5 w-56 !rounded-md" />
        </div>
        <div className="flex-1 p-4 md:p-6">
          <div className="mkt-skeleton h-full w-full" />
        </div>
      </div>
    );
  }

  const onSetDay = (cardId: string, dayYmd: string | null) => {
    const card = cardById.get(cardId);
    if (!card) return;
    m.setCardDates.mutate({ id: card.id, due_date: dayYmd ? isoForDay(dayYmd, card.due_date) : null });
  };
  const step = (dir: number) => setRef((r) => mode === "month" ? addMonths(r, dir) : addDays(r, dir * 7));

  return (
    <div className="mkt-canvas fixed inset-0 top-14 flex flex-col">
      {/* Cabeçalho */}
      <div className="mkt-toolbar header-depth-glow flex-wrap gap-2 py-2.5">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><ArrowLeft className="h-4 w-4" /></button>
        <span className="mkt-dot" style={{ ["--mkt-accent" as any]: getAccent("blue") }} />
        <CalendarClock className="h-5 w-5 text-primary" />
        <h1 className="mkt-view-title flex items-center gap-2">Todos os quadros · Calendário</h1>
        {/* alternar entre as views gerais */}
        <div className="mkt-segmented ml-1">
          <button className="mkt-segmented-item is-active"><CalendarClock className="h-3.5 w-3.5" /> Calendário</button>
          <button onClick={() => navigate("/todos/tabela")} className="mkt-segmented-item"><Table2 className="h-3.5 w-3.5" /> Tabela</button>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-foreground">
            <button onClick={() => step(-1)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold capitalize min-w-[130px] text-center text-foreground">{fmtMonthYear(ref)}</span>
            <button onClick={() => step(1)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => setRef(new Date())} className="text-xs h-8 rounded-md border border-border bg-card px-2.5 hover:bg-muted text-foreground">Hoje</button>
          </div>
          <div className="mkt-segmented">
            {(["month", "week"] as const).map((mo) => (
              <button key={mo} onClick={() => setMode(mo)} className={`mkt-segmented-item ${mode === mo ? "is-active" : ""}`}>{mo === "month" ? "Mês" : "Semana"}</button>
            ))}
          </div>
          <div className="mkt-segmented">
            {(["board", "label"] as const).map((cb) => (
              <button key={cb} onClick={() => setColorBy(cb)} className={`mkt-segmented-item ${colorBy === cb ? "is-active" : ""}`}>{cb === "board" ? "Cor: quadro" : "Cor: etiqueta"}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Legenda de quadros (quando cor = quadro) */}
      {colorBy === "board" && data.boards.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-card/60 border-b border-border flex-wrap">
          <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
          {data.boards.map((b) => (
            <button key={b.id} onClick={() => navigate(`/quadros/${b.id}/calendario`)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <span className="h-2 w-2 rounded-full" style={{ background: boardColor(b.id) }} /> {b.title}
            </button>
          ))}
        </div>
      )}

      {data.boards.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="mkt-empty">
            <div className="mkt-empty-icon"><LayoutGrid className="h-6 w-6" /></div>
            <div className="mkt-empty-title">Nenhum quadro por aqui</div>
            <p className="mkt-empty-subcopy">Esta área de trabalho ainda não tem quadros. Crie um quadro para começar a organizar o calendário.</p>
          </div>
        </div>
      ) : (
        <CalendarGrid
          cards={data.cards}
          refDate={ref}
          mode={mode}
          color={cardColor}
          onOpenCard={(c) => setOpenCardId(c.id)}
          onSetDay={onSetDay}
        />
      )}

      {openCard && <CardModal cardId={openCard.id} boardId={openCard.board_id} labels={modalLabels} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
