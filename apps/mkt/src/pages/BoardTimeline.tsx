import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable,
  type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowLeft, GanttChartSquare, CalendarOff } from "lucide-react";
import { useBoard, useBoardLive, useBoardMutations, type CardSummary } from "@/hooks/useBoards";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { LIST_DOT, LIST_PALETTE, getAccent, tintedLabelStyle } from "@/lib/mktTheme";
import { ymd, ymdOfIso, diffDays, shiftYmd, isoForDay, addDays } from "@/lib/mktCalendar";
import { CardModal } from "@/components/board/CardModal";
import { ViewSwitcher } from "@/components/board/ViewSwitcher";

type Edge = "start" | "move" | "end";
interface DragState { id: string; edge: Edge; }
const DAY_WIDTH: Record<string, number> = { dia: 36, semana: 14, mes: 5 };
const LEFT_W = 190;

// Datas efetivas (s ≤ e) de um cartão; null se não tem data alguma.
function cardRange(c: CardSummary): { s: string; e: string } | null {
  let s = c.start_date ? ymdOfIso(c.start_date) : null;
  let e = c.due_date ? ymdOfIso(c.due_date) : null;
  if (!s && !e) return null;
  if (s && !e) e = s;
  if (e && !s) s = e;
  if (s! > e!) { const t = s!; s = e!; e = t; }
  return { s: s!, e: e! };
}

// Barra arrastável (3 zonas: alça esq, corpo, alça dir).
function Bar({ card, rangeStart, dayWidth, color, preview, onOpen }: {
  card: CardSummary; rangeStart: string; dayWidth: number; color: string;
  preview: DragState & { delta: number } | null; onOpen: () => void;
}) {
  const range = cardRange(card);
  const startZone = useDraggable({ id: `${card.id}|start` });
  const moveZone = useDraggable({ id: `${card.id}|move` });
  const endZone = useDraggable({ id: `${card.id}|end` });
  if (!range) return null;

  let { s, e } = range;
  if (preview && preview.id === card.id) {
    const d = preview.delta;
    if (preview.edge === "move") { s = shiftYmd(s, d); e = shiftYmd(e, d); }
    else if (preview.edge === "start") { s = shiftYmd(s, d); if (s > e) s = e; }
    else if (preview.edge === "end") { e = shiftYmd(e, d); if (e < s) e = s; }
  }
  const left = LEFT_W + diffDays(rangeStart, s) * dayWidth;
  const width = Math.max(dayWidth, (diffDays(s, e) + 1) * dayWidth);
  const hasBoth = !!card.start_date && !!card.due_date;

  return (
    <div className="absolute top-1 h-6 rounded-md border flex items-stretch overflow-hidden text-xs shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elevated)]"
      style={{ left, width, ...tintedLabelStyle(color) }}>
      {hasBoth && (
        <div ref={startZone.setNodeRef} {...startZone.attributes} {...startZone.listeners}
          className="w-1.5 shrink-0 cursor-ew-resize opacity-60 hover:opacity-100 transition-opacity"
          style={{ background: color }} title="Ajustar início" />
      )}
      <div ref={moveZone.setNodeRef} {...moveZone.attributes} {...moveZone.listeners}
        onClick={onOpen} className="flex-1 min-w-0 cursor-grab active:cursor-grabbing px-2 flex items-center truncate font-medium">
        {card.title}
      </div>
      {hasBoth && (
        <div ref={endZone.setNodeRef} {...endZone.attributes} {...endZone.listeners}
          className="w-1.5 shrink-0 cursor-ew-resize opacity-60 hover:opacity-100 transition-opacity"
          style={{ background: color }} title="Ajustar entrega" />
      )}
    </div>
  );
}

export default function BoardTimeline() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useBoard(boardId ?? null);
  useBoardLive(boardId ?? null);
  const m = useBoardMutations(boardId);
  const { data: team = [] } = useTeamMembers();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const [zoom, setZoom] = useState<"dia" | "semana" | "mes">("semana");
  const [groupBy, setGroupBy] = useState<"list" | "member">("list");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [delta, setDelta] = useState(0);
  const dayWidth = DAY_WIDTH[zoom];

  const listColor = useMemo(() => {
    const idx = new Map((data?.lists ?? []).map((l, i) => [l.id, i]));
    return (listId: string) => {
      const l = (data?.lists ?? []).find((x) => x.id === listId);
      if (l?.color && LIST_DOT[l.color]) return LIST_DOT[l.color];
      return LIST_PALETTE[(idx.get(listId) ?? 0) % LIST_PALETTE.length];
    };
  }, [data?.lists]);

  // Range de datas (min→max com folga) ou mês atual se não houver datas.
  const { rangeStart, totalDays } = useMemo(() => {
    const ds: string[] = [];
    for (const c of data?.cards ?? []) { const r = cardRange(c); if (r) { ds.push(r.s, r.e); } }
    if (ds.length === 0) {
      const now = new Date();
      const first = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      const last = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { rangeStart: first, totalDays: diffDays(first, last) + 1 };
    }
    ds.sort();
    const start = shiftYmd(ds[0], -3);
    const end = shiftYmd(ds[ds.length - 1], 3);
    return { rangeStart: start, totalDays: diffDays(start, end) + 1 };
  }, [data?.cards]);

  if (!boardId) return null;
  if (isLoading || !data) return (
    <div className="fixed inset-0 top-14 mkt-canvas p-4 md:p-6 space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mkt-skeleton h-8" style={{ width: `${40 + (i % 3) * 20}%`, marginLeft: `${(i % 4) * 8}%` }} />
      ))}
    </div>
  );
  const { board, cards, lists, labels } = data;

  // Grupos (lista ou membro) + cartões sem data.
  const undated = cards.filter((c) => !cardRange(c));
  const dated = cards.filter((c) => cardRange(c));
  const groups: { key: string; label: string; cards: CardSummary[] }[] = [];
  if (groupBy === "list") {
    for (const l of lists) groups.push({ key: l.id, label: l.title, cards: dated.filter((c) => c.list_id === l.id) });
  } else {
    const byMember = new Map<string, CardSummary[]>();
    for (const c of dated) {
      if (c.memberIds.length === 0) (byMember.get("none") ?? byMember.set("none", []).get("none")!).push(c);
      else for (const mid of c.memberIds) (byMember.get(mid) ?? byMember.set(mid, []).get(mid)!).push(c);
    }
    for (const t of team) if (byMember.has(t.id)) groups.push({ key: t.id, label: t.full_name ?? "Usuário", cards: byMember.get(t.id)! });
    if (byMember.has("none")) groups.push({ key: "none", label: "Sem responsável", cards: byMember.get("none")! });
  }
  const visibleGroups = groups.filter((g) => g.cards.length > 0);

  const gridW = LEFT_W + totalDays * dayWidth;
  const todayLeft = LEFT_W + diffDays(rangeStart, ymd(new Date())) * dayWidth;

  // Segmentos de mês pro cabeçalho.
  const monthSegs: { label: string; left: number; width: number }[] = [];
  {
    let i = 0;
    while (i < totalDays) {
      const d0 = addDays(new Date(rangeStart + "T12:00:00"), i);
      const y = d0.getFullYear(), mo = d0.getMonth();
      let j = i;
      while (j < totalDays) { const dj = addDays(new Date(rangeStart + "T12:00:00"), j); if (dj.getFullYear() !== y || dj.getMonth() !== mo) break; j++; }
      const mLbl = d0.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      monthSegs.push({ label: `${mLbl} ${d0.getFullYear()}`, left: LEFT_W + i * dayWidth, width: (j - i) * dayWidth });
      i = j;
    }
  }

  const onDragStart = (e: DragStartEvent) => {
    const [id, edge] = String(e.active.id).split("|");
    setDrag({ id, edge: edge as Edge }); setDelta(0);
  };
  const onDragMove = (e: DragMoveEvent) => setDelta(Math.round(e.delta.x / dayWidth));
  const onDragEnd = (_e: DragEndEvent) => {
    if (drag) {
      const card = cards.find((c) => c.id === drag.id);
      const r = card ? cardRange(card) : null;
      if (card && r) {
        let s = r.s, e = r.e;
        if (drag.edge === "move") { s = shiftYmd(s, delta); e = shiftYmd(e, delta); }
        else if (drag.edge === "start") { s = shiftYmd(s, delta); if (s > e) s = e; }
        else if (drag.edge === "end") { e = shiftYmd(e, delta); if (e < s) e = s; }
        if (delta !== 0) {
          if (drag.edge === "start") m.setCardDates.mutate({ id: card.id, start_date: isoForDay(s, card.start_date) });
          else if (drag.edge === "end") m.setCardDates.mutate({ id: card.id, due_date: isoForDay(e, card.due_date) });
          else { // move
            const patch: { id: string; start_date?: string; due_date?: string } = { id: card.id };
            if (card.start_date) patch.start_date = isoForDay(s, card.start_date);
            if (card.due_date) patch.due_date = isoForDay(e, card.due_date);
            m.setCardDates.mutate(patch);
          }
        }
      }
    }
    setDrag(null); setDelta(0);
  };
  const preview = drag ? { ...drag, delta } : null;

  return (
    <div className="fixed inset-0 top-14 flex flex-col mkt-canvas">
      <div className="mkt-toolbar header-depth-glow flex-wrap">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"><ArrowLeft className="h-4 w-4" /></button>
        <span className="mkt-dot" style={{ ["--mkt-accent" as string]: getAccent(board.background) }} />
        <GanttChartSquare className="h-5 w-5 text-primary" />
        <h1 className="mkt-view-title">{board.title}</h1>
        <ViewSwitcher boardId={boardId} current="timeline" />
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="mkt-segmented">
            {(["list", "member"] as const).map((g) => (
              <button key={g} onClick={() => setGroupBy(g)} data-active={groupBy === g} className="mkt-segmented-item font-semibold">{g === "list" ? "Por lista" : "Por membro"}</button>
            ))}
          </div>
          <div className="mkt-segmented">
            {(["dia", "semana", "mes"] as const).map((z) => (
              <button key={z} onClick={() => setZoom(z)} data-active={zoom === z} className="mkt-segmented-item font-semibold capitalize">{z === "mes" ? "Mês" : z}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-dot-grid">
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd}>
          <div style={{ width: gridW, minWidth: "100%" }} className="relative flex flex-col min-h-full">
            {/* Colunas verticais semanais — estrutura de "canvas de Gantt" que
                elimina o vazião branco quando há poucos cartões. */}
            <div className="absolute top-7 bottom-0 pointer-events-none z-0" style={{
              left: LEFT_W, right: 0,
              backgroundImage: `repeating-linear-gradient(to right, hsl(var(--border) / 0.45), hsl(var(--border) / 0.45) 1px, transparent 1px, transparent ${dayWidth * 7}px)`,
            }} />
            {/* Cabeçalho de meses */}
            <div className="sticky top-0 z-20 h-7 bg-card border-b border-border" style={{ width: gridW }}>
              <div className="absolute left-0 top-0 h-7 bg-card border-r border-border flex items-center px-2 text-xs font-semibold text-muted-foreground" style={{ width: LEFT_W }}>Cartão</div>
              {monthSegs.map((seg, i) => (
                <div key={i} className="absolute top-0 h-7 border-r border-border/60 flex items-center px-2 text-xs font-semibold text-muted-foreground capitalize" style={{ left: seg.left, width: seg.width }}>{seg.label}</div>
              ))}
            </div>

            {/* Linha do hoje */}
            {todayLeft >= LEFT_W && todayLeft <= gridW && (
              <div className="absolute top-7 bottom-0 w-0.5 bg-destructive/70 z-10" style={{ left: todayLeft }} />
            )}

            {/* Grupos */}
            <div className="flex-1">
              {visibleGroups.length === 0 ? (
                <div className="h-full flex items-center justify-center px-4 py-10">
                  <div className="mkt-empty">
                    <div className="mkt-empty-icon"><GanttChartSquare className="h-5 w-5" /></div>
                    <p className="mkt-empty-title">Nenhum cartão com data ainda</p>
                    <p className="mkt-empty-subcopy">Defina início e/ou entrega nos cartões para vê-los aqui na linha do tempo como barras.</p>
                  </div>
                </div>
              ) : (
                visibleGroups.map((g) => (
                  <div key={g.key} className="board-fade-in">
                    <div className="sticky left-0 z-10 bg-muted/60 border-y border-border px-3 py-2 flex items-center gap-2 text-sm font-semibold text-foreground" style={{ width: LEFT_W }}>
                      {groupBy === "list" && <span className="mkt-dot" style={{ ["--mkt-accent" as string]: listColor(g.key) }} />}
                      <span className="truncate">{g.label}</span>
                      <span className="mkt-column-count">({g.cards.length})</span>
                    </div>
                    {g.cards.map((c) => (
                      <div key={c.id} className="relative h-9 border-b border-border/40 hover:bg-muted/30 transition-colors">
                        <div className="sticky left-0 z-10 bg-card h-9 border-r border-border px-3 flex items-center text-xs text-foreground truncate" style={{ width: LEFT_W }}>{c.title}</div>
                        <Bar card={c} rangeStart={rangeStart} dayWidth={dayWidth} color={listColor(c.list_id)} preview={preview} onOpen={() => setOpenCardId(c.mirrorOf ?? c.id)} />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </DndContext>

        {/* Sem datas */}
        {undated.length > 0 && (
          <div className="border-t border-border bg-card px-4 py-3 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <CalendarOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="mkt-meta-label">Sem datas ({undated.length})</p>
              <span className="text-xs text-muted-foreground truncate">— defina início/entrega no cartão para posicioná-lo na linha do tempo</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {undated.map((c) => (
                <button key={c.id} onClick={() => setOpenCardId(c.mirrorOf ?? c.id)} className="inline-flex items-center gap-1.5 text-xs rounded-md border border-border bg-card px-2.5 py-1.5 text-foreground shadow-[var(--shadow-card)] hover:border-primary/40 hover:shadow-[var(--shadow-elevated)] transition-all">
                  <span className="mkt-dot" style={{ ["--mkt-accent" as string]: listColor(c.list_id) }} />
                  <span className="truncate max-w-[12rem]">{c.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {openCardId && <CardModal cardId={openCardId} boardId={boardId} labels={labels} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
