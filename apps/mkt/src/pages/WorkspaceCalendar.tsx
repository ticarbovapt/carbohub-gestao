import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarClock, Table2, LayoutGrid } from "lucide-react";
import { useBoardMutations, type CardSummary } from "@/hooks/useBoards";
import { useDefaultWorkspace, useWorkspaceData, useWorkspaceLive } from "@/hooks/useWorkspace";
import { BOARD_BG, LABEL_COLORS, LIST_PALETTE } from "@/lib/mktTheme";
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

  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Carregando calendário…</div>;

  const onSetDay = (cardId: string, dayYmd: string | null) => {
    const card = cardById.get(cardId);
    if (!card) return;
    m.setCardDates.mutate({ id: card.id, due_date: dayYmd ? isoForDay(dayYmd, card.due_date) : null });
  };
  const step = (dir: number) => setRef((r) => mode === "month" ? addMonths(r, dir) : addDays(r, dir * 7));

  return (
    <div className="fixed inset-0 top-14 flex flex-col" style={{ background: BOARD_BG.blue }}>
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-black/20 backdrop-blur-sm flex-wrap">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md hover:bg-white/10 text-white"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-lg font-bold text-white drop-shadow flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Todos os quadros · Calendário</h1>
        {/* alternar entre as views gerais */}
        <div className="flex gap-0.5 bg-white/15 rounded-md p-0.5">
          <button className="px-2.5 py-1 text-xs font-semibold rounded bg-white text-slate-900 inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Calendário</button>
          <button onClick={() => navigate("/todos/tabela")} className="px-2.5 py-1 text-xs font-semibold rounded text-white/90 hover:text-white inline-flex items-center gap-1"><Table2 className="h-3.5 w-3.5" /> Tabela</button>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-white">
            <button onClick={() => step(-1)} className="p-1.5 rounded hover:bg-white/15"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold capitalize min-w-[130px] text-center">{fmtMonthYear(ref)}</span>
            <button onClick={() => step(1)} className="p-1.5 rounded hover:bg-white/15"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => setRef(new Date())} className="text-xs bg-white/15 hover:bg-white/25 rounded px-2 py-1">Hoje</button>
          </div>
          <div className="flex gap-0.5 bg-white/15 rounded-md p-0.5">
            {(["month", "week"] as const).map((mo) => (
              <button key={mo} onClick={() => setMode(mo)} className={`px-2.5 py-1 text-xs font-semibold rounded ${mode === mo ? "bg-white text-slate-900" : "text-white/90"}`}>{mo === "month" ? "Mês" : "Semana"}</button>
            ))}
          </div>
          <div className="flex gap-0.5 bg-white/15 rounded-md p-0.5">
            {(["board", "label"] as const).map((cb) => (
              <button key={cb} onClick={() => setColorBy(cb)} className={`px-2.5 py-1 text-xs font-semibold rounded ${colorBy === cb ? "bg-white text-slate-900" : "text-white/90"}`}>{cb === "board" ? "Cor: quadro" : "Cor: etiqueta"}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Legenda de quadros (quando cor = quadro) */}
      {colorBy === "board" && data.boards.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 bg-black/10 flex-wrap">
          <LayoutGrid className="h-3.5 w-3.5 text-white/70" />
          {data.boards.map((b) => (
            <button key={b.id} onClick={() => navigate(`/quadros/${b.id}/calendario`)} className="inline-flex items-center gap-1.5 text-[11px] text-white/90 hover:text-white">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: boardColor(b.id) }} /> {b.title}
            </button>
          ))}
        </div>
      )}

      {data.boards.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="bg-card/90 border border-border rounded-lg px-4 py-2 text-sm text-muted-foreground">Nenhum quadro nesta área de trabalho.</p>
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
