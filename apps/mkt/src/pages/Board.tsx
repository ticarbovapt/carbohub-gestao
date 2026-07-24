import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCorners, DragOverlay,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, X, GripVertical, MoreHorizontal, Clock, CheckSquare, MessageSquare, AlignLeft, Paperclip, Settings2, Link2, ChevronLeft, ChevronRight, Filter, Bookmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useBoard, useBoardLive, useBoardMutations, POS_GAP,
  type CardSummary, type List, type Label,
} from "@/hooks/useBoards";
import { positionForIndex } from "@/lib/mktPosition";
import { LABEL_COLORS, getAccent, tintedLabelStyle, ACCENT_SWATCHES } from "@/lib/mktTheme";
import { CardModal } from "@/components/board/CardModal";
import { BoardFieldsDialog } from "@/components/board/BoardFieldsDialog";
import { FilterControls } from "@/components/board/FilterControls";
import { ViewSwitcher } from "@/components/board/ViewSwitcher";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useSavedSearches, useSavedSearchMutations } from "@/hooks/useSavedSearches";
import { emptyCriteria, criteriaActive, matchCard, type SearchCriteria } from "@/lib/mktFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fmtDue = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

// ── Face presentacional do cartão (reusada no kanban e no DragOverlay) ────────
function CardFace({ card, labels }: { card: CardSummary; labels: Label[] }) {
  const cardLabels = labels.filter((l) => card.labelIds.includes(l.id));
  const overdue = card.due_date && !card.is_complete && new Date(card.due_date) < new Date();

  return (
    <>
      {card.cover && <div className="h-8 rounded-md -mx-0.5 -mt-0.5" style={{ background: card.cover }} />}
      {cardLabels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cardLabels.map((l) => (
            <span key={l.id}
              className="inline-flex items-center h-5 px-2 rounded-md border text-xs font-medium"
              style={tintedLabelStyle(LABEL_COLORS[l.color] ?? l.color)} title={l.name}>
              {l.name}
            </span>
          ))}
        </div>
      )}
      {card.mirrorOf && (
        <div className="flex items-center gap-1 text-xs text-accent">
          <Link2 className="h-3.5 w-3.5" /> espelhado de {card.mirrorSourceBoard ?? "—"}{card.mirrorSourceList ? ` / ${card.mirrorSourceList}` : ""}
        </div>
      )}
      <p className="mkt-card-title">{card.title}</p>
      <div className="mkt-meta-row flex-wrap">
        {card.due_date && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${overdue ? "bg-destructive/10 text-destructive" : card.is_complete ? "bg-success/10 text-success" : "bg-muted"}`}>
            <Clock className="h-3.5 w-3.5" /> {fmtDue(card.due_date)}
          </span>
        )}
        {card.checklistOverdue && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive" title="Item de checklist atrasado">
            <CheckSquare className="h-3.5 w-3.5" /> atrasado
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
    </>
  );
}

// ── Cartão (frente, no kanban) ───────────────────────────────────────────────
function BoardCard({ card, labels, onOpen }: { card: CardSummary; labels: Label[]; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id, data: { type: "card", listId: card.list_id },
  });
  const style = { transform: CSS.Translate.toString(transform), transition };

  // Origem do drag vira placeholder tracejado (não opacity), mantendo a altura.
  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}
        className="mkt-card-placeholder h-20" />
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={onOpen}
      className="group mkt-card cursor-pointer">
      <CardFace card={card} labels={labels} />
    </div>
  );
}

// ── Lista (coluna) ───────────────────────────────────────────────────────────
function BoardColumn({
  list, index, cards, labels, collapsed, onOpenCard, onAddCard, onRename, onArchive, onSetColor, onToggleCollapse,
}: {
  list: List; index: number; cards: CardSummary[]; labels: Label[]; collapsed: boolean;
  onOpenCard: (id: string) => void;
  onAddCard: (listId: string, title: string) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onSetColor: (id: string, color: string | null) => void;
  onToggleCollapse: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id, data: { type: "list" },
  });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState(list.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const accent = getAccent(list.color, index);

  const submit = () => {
    const t = text.trim();
    if (t) { onAddCard(list.id, t); setText(""); }
  };

  // Recolhida: barra fina vertical neutra com dot de acento + título + contagem.
  if (collapsed) {
    return (
      <div ref={setNodeRef} style={style} className="w-10 shrink-0">
        <button onClick={() => onToggleCollapse(list.id)} title="Expandir lista"
          className="mkt-column-collapsed w-10 h-full min-h-[120px] flex flex-col items-center gap-2 py-2.5">
          <span className="mkt-dot" style={{ ["--mkt-accent" as any]: accent }} />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{list.title}</span>
          <span className="mkt-column-count">{cards.length}</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="w-80 shrink-0 flex flex-col max-h-full">
      <div className="mkt-column flex flex-col max-h-full">
        <div className="mkt-column-header">
          <button className="p-1 -ml-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground" {...attributes} {...listeners}>
            <GripVertical className="h-4 w-4" />
          </button>
          <button onClick={() => onToggleCollapse(list.id)} className="p-1 text-muted-foreground hover:text-foreground" title="Recolher lista"><ChevronLeft className="h-4 w-4" /></button>
          <span className="mkt-dot" style={{ ["--mkt-accent" as any]: accent }} />
          {editTitle ? (
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { setEditTitle(false); if (title.trim() && title !== list.title) onRename(list.id, title.trim()); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="h-8 text-sm font-semibold" />
          ) : (
            <button onClick={() => setEditTitle(true)} className="flex-1 flex items-center gap-2 text-left min-w-0 px-1">
              <span className="mkt-column-title truncate">{list.title}</span>
              <span className="mkt-column-count">{cards.length}</span>
            </button>
          )}
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-1 text-muted-foreground hover:text-foreground" title="Ações da lista">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1 w-52 rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-3 space-y-2">
                <p className="mkt-meta-label">Cor da lista</p>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => { onSetColor(list.id, null); setMenuOpen(false); }} className={`h-6 w-6 rounded-md border border-border bg-muted ${!list.color ? "ring-2 ring-primary" : ""}`} title="Sem cor" />
                  {ACCENT_SWATCHES.map((s) => (
                    <button key={s.key} onClick={() => { onSetColor(list.id, s.key); setMenuOpen(false); }}
                      className={`h-6 w-6 rounded-md ${list.color === s.key ? "ring-2 ring-primary ring-offset-1 ring-offset-popover" : ""}`} style={{ background: s.color }} />
                  ))}
                </div>
                <button onClick={() => { setMenuOpen(false); onToggleCollapse(list.id); }} className="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted">Recolher lista</button>
                <button onClick={() => { setMenuOpen(false); if (confirm("Arquivar esta lista?")) onArchive(list.id); }} className="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted text-destructive">Arquivar lista</button>
              </div>
            )}
          </div>
        </div>

        <div className="px-2 py-2 overflow-y-auto space-y-2 flex-1 min-h-[8px]">
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {cards.map((c) => (
              <BoardCard key={c.id} card={c} labels={labels} onOpen={() => onOpenCard(c.mirrorOf ?? c.id)} />
            ))}
          </SortableContext>
        </div>

        <div className="px-2 pb-2">
          {adding ? (
            <div className="space-y-2">
              <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === "Escape") setAdding(false); }}
                placeholder="Título do cartão…" rows={2}
                className="w-full text-sm rounded-[var(--input-radius)] border border-border bg-card p-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={submit}>Adicionar</Button>
                <button onClick={() => setAdding(false)} className="p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="w-full flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary hover:bg-muted rounded-[var(--input-radius)] px-2 py-2 transition-colors">
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
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { data, isLoading } = useBoard(boardId ?? null);
  useBoardLive(boardId ?? null);
  const m = useBoardMutations(boardId);
  const { data: team = [] } = useTeamMembers();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newList, setNewList] = useState("");

  // Filtro do quadro + buscas salvas (escopo do quadro).
  const [criteria, setCriteria] = useState<SearchCriteria>(emptyCriteria());
  const [filterOpen, setFilterOpen] = useState(false);
  const filterActive = criteriaActive(criteria);
  const saved = useSavedSearches("board", boardId);
  const savedMut = useSavedSearchMutations();

  // Listas recolhidas — preferência PESSOAL por quadro (localStorage).
  const collapseKey = `mkt:collapsed:${boardId}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(collapseKey) || "[]")); } catch { return new Set(); }
  });
  const toggleCollapse = (listId: string) => setCollapsed((prev) => {
    const n = new Set(prev);
    if (n.has(listId)) n.delete(listId); else n.add(listId);
    try { localStorage.setItem(collapseKey, JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });

  // Abre o cartão vindo da busca entre quadros (?card=…), uma vez, e limpa o param.
  useEffect(() => {
    const cid = searchParams.get("card");
    if (cid) { setOpenCardId(cid); searchParams.delete("card"); setSearchParams(searchParams, { replace: true }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    return (
      <div className="fixed inset-0 top-14 mkt-canvas bg-dot-grid flex flex-col">
        <div className="mkt-toolbar" />
        <div className="flex-1 overflow-hidden p-4 md:p-6">
          <div className="flex gap-4 h-full items-start">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-80 shrink-0 space-y-2">
                <div className="mkt-skeleton h-10" />
                <div className="mkt-skeleton h-20" />
                <div className="mkt-skeleton h-24" />
                <div className="mkt-skeleton h-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { board, lists, labels } = data;
  const activeCard = activeId ? data.cards.find((c) => c.id === activeId) ?? null : null;
  const boardAccent = getAccent(board.background);

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
    <div className="fixed inset-0 top-14 mkt-canvas bg-dot-grid flex flex-col">
      {/* Cabeçalho do quadro */}
      <div className="mkt-toolbar header-depth-glow gap-2">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></button>
        <span className="mkt-dot" style={{ ["--mkt-accent" as any]: boardAccent }} />
        <h1 className="mkt-view-title truncate">{board.title}</h1>
        <ViewSwitcher boardId={boardId} current="kanban" />

        {/* Filtro + buscas salvas do quadro */}
        <div className="ml-auto relative">
          <button onClick={() => setFilterOpen((v) => !v)}
            className={`flex items-center gap-1.5 text-sm rounded-md px-2.5 py-1.5 transition-colors ${filterActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            <Filter className="h-4 w-4" /> Filtrar{filterActive ? " •" : ""}
          </button>
          {filterOpen && (
            <div className="absolute right-0 z-30 mt-1 w-72 rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-4 space-y-3 text-foreground">
              <FilterControls value={criteria} onChange={setCriteria} labels={labels} team={team} />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setCriteria(emptyCriteria())}>Limpar</Button>
                <Button size="sm" className="h-8 text-xs" disabled={!filterActive}
                  onClick={() => { const name = prompt("Nome da busca salva:"); if (name?.trim()) savedMut.create.mutate({ name: name.trim(), scope: "board", boardId, criteria }); }}>
                  Salvar busca
                </Button>
              </div>
              {saved.data && saved.data.length > 0 && (
                <div className="border-t border-border pt-3 space-y-1">
                  <p className="mkt-meta-label flex items-center gap-1"><Bookmark className="h-3 w-3" /> Buscas salvas</p>
                  {saved.data.map((s) => (
                    <div key={s.id} className="flex items-center gap-1 group">
                      <button onClick={() => setCriteria(s.criteria)} className="flex-1 text-left text-sm px-2 py-1 rounded-md hover:bg-muted truncate">{s.name}</button>
                      <button onClick={() => savedMut.remove.mutate({ id: s.id })} className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button onClick={() => setFieldsOpen(true)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-2.5 py-1.5 transition-colors" title="Campos personalizados">
          <Settings2 className="h-4 w-4" /> Campos
        </button>
      </div>

      {/* Colunas */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 md:p-6">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-4 h-full items-start">
            <SortableContext items={lists.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
              {lists.map((l, i) => (
                <BoardColumn key={l.id} list={l} index={i}
                  cards={(cardsByList.get(l.id) ?? []).filter((c) => !filterActive || matchCard(c, criteria))}
                  labels={labels} collapsed={collapsed.has(l.id)}
                  onOpenCard={(id) => setOpenCardId(id)} onAddCard={addCard}
                  onRename={(id, title) => m.renameList.mutate({ id, title })}
                  onArchive={(id) => m.archiveList.mutate({ id })}
                  onSetColor={(id, color) => m.setListColor.mutate({ id, color })}
                  onToggleCollapse={toggleCollapse} />
              ))}
            </SortableContext>

            {/* Adicionar lista */}
            <div className="w-80 shrink-0">
              {addingList ? (
                <div className="mkt-column p-2 space-y-2">
                  <Input autoFocus value={newList} onChange={(e) => setNewList(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addList(); if (e.key === "Escape") setAddingList(false); }}
                    placeholder="Título da lista…" className="h-9 text-sm" />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={addList}>Adicionar lista</Button>
                    <button onClick={() => setAddingList(false)} className="p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingList(true)} className="w-full flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-card border border-border rounded-[var(--radius)] px-3 py-2.5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow">
                  <Plus className="h-4 w-4" /> Adicionar lista
                </button>
              )}
            </div>
          </div>

          <DragOverlay>
            {activeCard ? (
              <div className="mkt-card mkt-card-overlay w-72 cursor-grabbing">
                <CardFace card={activeCard} labels={labels} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {openCardId && (
        <CardModal cardId={openCardId} boardId={boardId} labels={labels} onClose={() => setOpenCardId(null)} />
      )}
      {fieldsOpen && <BoardFieldsDialog boardId={boardId} onClose={() => setFieldsOpen(false)} />}
    </div>
  );
}
