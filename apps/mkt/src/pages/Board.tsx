import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCorners, DragOverlay,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, X, GripVertical, MoreHorizontal, Clock, CheckSquare, MessageSquare, AlignLeft, Paperclip } from "lucide-react";
import { toast } from "sonner";
import {
  useBoard, useBoardLive, useBoardMutations, POS_GAP,
  type CardSummary, type List, type Label,
} from "@/hooks/useBoards";
import { positionForIndex } from "@/lib/mktPosition";
import { BOARD_BG, LABEL_COLORS } from "@/lib/mktTheme";
import { CardModal } from "@/components/board/CardModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fmtDue = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

// ── Cartão (frente, no kanban) ───────────────────────────────────────────────
function BoardCard({ card, labels, onOpen }: { card: CardSummary; labels: Label[]; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id, data: { type: "card", listId: card.list_id },
  });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const cardLabels = labels.filter((l) => card.labelIds.includes(l.id));
  const overdue = card.due_date && !card.is_complete && new Date(card.due_date) < new Date();

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={onOpen}
      className="group rounded-lg bg-card border border-border shadow-sm hover:border-primary/40 cursor-pointer p-2 space-y-1.5">
      {card.cover && <div className="h-8 rounded-md -mx-0.5 -mt-0.5 mb-1" style={{ background: card.cover }} />}
      {cardLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cardLabels.map((l) => (
            <span key={l.id} className="h-2 w-8 rounded-full" style={{ background: LABEL_COLORS[l.color] ?? l.color }} title={l.name} />
          ))}
        </div>
      )}
      <p className="text-sm text-foreground leading-snug">{card.title}</p>
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
        {card.due_date && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${overdue ? "bg-red-500/15 text-red-500" : card.is_complete ? "bg-emerald-500/15 text-emerald-600" : "bg-muted"}`}>
            <Clock className="h-3 w-3" /> {fmtDue(card.due_date)}
          </span>
        )}
        {card.description && <AlignLeft className="h-3.5 w-3.5" />}
        {card.attachmentCount > 0 && (
          <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{card.attachmentCount}</span>
        )}
        {card.checklistTotal > 0 && (
          <span className="inline-flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" />{card.checklistDone}/{card.checklistTotal}</span>
        )}
        {card.commentCount > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{card.commentCount}</span>}
      </div>
    </div>
  );
}

// ── Lista (coluna) ───────────────────────────────────────────────────────────
function BoardColumn({
  list, cards, labels, onOpenCard, onAddCard, onRename, onArchive,
}: {
  list: List; cards: CardSummary[]; labels: Label[];
  onOpenCard: (id: string) => void;
  onAddCard: (listId: string, title: string) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id, data: { type: "list" },
  });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState(list.title);

  const submit = () => {
    const t = text.trim();
    if (t) { onAddCard(list.id, t); setText(""); }
  };

  return (
    <div ref={setNodeRef} style={style} className="w-72 shrink-0 flex flex-col max-h-full">
      <div className="rounded-xl bg-muted/60 backdrop-blur flex flex-col max-h-full">
        <div className="flex items-center gap-1 px-2 py-2">
          <button className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground" {...attributes} {...listeners}>
            <GripVertical className="h-4 w-4" />
          </button>
          {editTitle ? (
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { setEditTitle(false); if (title.trim() && title !== list.title) onRename(list.id, title.trim()); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="h-7 text-sm font-semibold" />
          ) : (
            <button onClick={() => setEditTitle(true)} className="flex-1 text-left text-sm font-semibold text-foreground truncate px-1">
              {list.title} <span className="text-xs font-normal text-muted-foreground">{cards.length}</span>
            </button>
          )}
          <button onClick={() => { if (confirm("Arquivar esta lista?")) onArchive(list.id); }} className="p-1 text-muted-foreground hover:text-foreground" title="Arquivar lista">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        <div className="px-2 pb-2 overflow-y-auto space-y-2 flex-1 min-h-[8px]">
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {cards.map((c) => (
              <BoardCard key={c.id} card={c} labels={labels} onOpen={() => onOpenCard(c.id)} />
            ))}
          </SortableContext>
        </div>

        <div className="px-2 pb-2">
          {adding ? (
            <div className="space-y-1">
              <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === "Escape") setAdding(false); }}
                placeholder="Título do cartão…" rows={2}
                className="w-full text-sm rounded-lg border border-border bg-card p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
              <div className="flex items-center gap-1">
                <Button size="sm" onClick={submit}>Adicionar</Button>
                <button onClick={() => setAdding(false)} className="p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="w-full flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg px-2 py-1.5">
              <Plus className="h-4 w-4" /> Adicionar cartão
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Board() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useBoard(boardId ?? null);
  useBoardLive(boardId ?? null);
  const m = useBoardMutations(boardId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newList, setNewList] = useState("");

  const cardsByList = useMemo(() => {
    const map = new Map<string, CardSummary[]>();
    for (const l of data?.lists ?? []) map.set(l.id, []);
    for (const c of [...(data?.cards ?? [])].sort((a, b) => a.position - b.position)) {
      (map.get(c.list_id) ?? map.set(c.list_id, []).get(c.list_id)!).push(c);
    }
    return map;
  }, [data]);

  if (!boardId) return null;
  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando quadro…</div>;
  }

  const { board, lists, labels } = data;
  const activeCard = activeId ? data.cards.find((c) => c.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeType = active.data.current?.type;

    // ── Reordenar listas ──
    if (activeType === "list") {
      if (active.id === over.id) return;
      const ordered = [...lists];
      const from = ordered.findIndex((l) => l.id === active.id);
      const to = ordered.findIndex((l) => l.id === over.id);
      if (from < 0 || to < 0) return;
      const others = ordered.filter((l) => l.id !== active.id).map((l) => l.position);
      const pos = positionForIndex(others, to);
      m.moveList.mutate({ id: String(active.id), position: pos });
      return;
    }

    // ── Mover cartão (mesma lista ou entre listas) ──
    if (activeType === "card") {
      const overType = over.data.current?.type;
      const destListId = overType === "card" ? (over.data.current?.listId as string) : String(over.id);
      const srcCard = data.cards.find((c) => c.id === active.id);
      if (!srcCard || !destListId) return;

      const destCards = (cardsByList.get(destListId) ?? []).filter((c) => c.id !== active.id);
      let index = destCards.length;
      if (overType === "card") {
        const overIdx = destCards.findIndex((c) => c.id === over.id);
        index = overIdx < 0 ? destCards.length : overIdx;
      }
      const pos = positionForIndex(destCards.map((c) => c.position), index);

      // Otimista: reflete já no cache pra não "voltar".
      qc.setQueryData(["mkt", "board", boardId], (old: typeof data | undefined) => {
        if (!old) return old;
        return { ...old, cards: old.cards.map((c) => c.id === active.id ? { ...c, list_id: destListId, position: pos } : c) };
      });
      m.moveCard.mutate({ id: String(active.id), listId: destListId, position: pos });
    }
  };

  const addList = () => {
    const t = newList.trim();
    if (!t) return;
    const pos = (lists[lists.length - 1]?.position ?? 0) + POS_GAP;
    m.createList.mutate({ title: t, position: pos }, { onSuccess: () => { setNewList(""); setAddingList(false); } });
  };

  const addCard = (listId: string, title: string) => {
    const listCards = cardsByList.get(listId) ?? [];
    const pos = (listCards[listCards.length - 1]?.position ?? 0) + POS_GAP;
    m.createCard.mutate({ listId, title, position: pos }, { onError: () => toast.error("Não foi possível criar o cartão.") });
  };

  return (
    <div className="fixed inset-0 top-14 flex flex-col" style={{ background: BOARD_BG[board.background] ?? BOARD_BG.blue }}>
      {/* Cabeçalho do quadro */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-black/20 backdrop-blur-sm">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md hover:bg-white/10 text-white"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-lg font-bold text-white drop-shadow">{board.title}</h1>
      </div>

      {/* Colunas */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-3">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-3 h-full items-start">
            <SortableContext items={lists.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
              {lists.map((l) => (
                <BoardColumn key={l.id} list={l} cards={cardsByList.get(l.id) ?? []} labels={labels}
                  onOpenCard={setOpenCardId} onAddCard={addCard}
                  onRename={(id, title) => m.renameList.mutate({ id, title })}
                  onArchive={(id) => m.archiveList.mutate({ id })} />
              ))}
            </SortableContext>

            {/* Adicionar lista */}
            <div className="w-72 shrink-0">
              {addingList ? (
                <div className="rounded-xl bg-muted/80 p-2 space-y-1">
                  <Input autoFocus value={newList} onChange={(e) => setNewList(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addList(); if (e.key === "Escape") setAddingList(false); }}
                    placeholder="Título da lista…" className="h-8 text-sm" />
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={addList}>Adicionar lista</Button>
                    <button onClick={() => setAddingList(false)} className="p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingList(true)} className="w-full flex items-center gap-1.5 text-sm text-white/90 hover:text-white bg-white/15 hover:bg-white/25 rounded-xl px-3 py-2 backdrop-blur-sm">
                  <Plus className="h-4 w-4" /> Adicionar lista
                </button>
              )}
            </div>
          </div>

          <DragOverlay>
            {activeCard ? (
              <div className="rounded-lg bg-card border border-primary/50 shadow-lg p-2 w-64">
                <p className="text-sm">{activeCard.title}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {openCardId && (
        <CardModal cardId={openCardId} boardId={boardId} labels={labels} onClose={() => setOpenCardId(null)} />
      )}
    </div>
  );
}
