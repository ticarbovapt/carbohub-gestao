import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, closestCorners,
  useSensor, useSensors, useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BugReport, BugStatus } from "@/hooks/useBugReports";
import { STAGES, prioOf, agingOf, stageDays } from "@/lib/demandas";
import { DemandaCardFace, type CardCounts } from "./DemandaCard";

// ─────────────────────────────────────────────────────────────────────────────
// Quadro de demandas — fluidez do quadro do Marketing (PointerSensor 5px,
// closestCorners, DragOverlay reusando a face do cartão, placeholder tracejado
// na origem) + colunas finais recolhidas por padrão, pra tela ficar com o
// trabalho VIVO e não com o histórico.
// ─────────────────────────────────────────────────────────────────────────────

const LS_KEY = "ti:demandas:collapsed";
/** Limite leve de trabalho em andamento — acima disso o contador acende. */
const WIP_LIMIT = 5;

function DraggableCard({ d, onClick, counts, avatarUrl, onAssumir }: {
  d: BugReport; onClick: (d: BugReport) => void; counts?: CardCounts;
  avatarUrl?: string | null; onAssumir?: (d: BugReport) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: d.id,
    data: { entity: d },
  });

  if (isDragging) {
    // Mantém o espaço da coluna estável enquanto arrasta.
    return <div ref={setNodeRef} className="ti-card-placeholder h-[124px]" />;
  }

  const p = prioOf(d.priority);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onClick={() => onClick(d)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(d); } }}
      style={{ transform: CSS.Translate.toString(transform), ["--ti-prio" as string]: p.hex }}
      className="ti-card ti-card-prio cursor-grab active:cursor-grabbing select-none touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <DemandaCardFace d={d} counts={counts} avatarUrl={avatarUrl} onAssumir={onAssumir} />
    </div>
  );
}

/** A coluna inteira é alvo de drop (inclusive o cabeçalho — é o alvo natural). */
function DroppableColumn({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className ?? ""} ${isOver ? "ring-2 ring-primary/60" : ""} transition-shadow`}>
      {children}
    </div>
  );
}

export function DemandaBoard({
  demandas, onCardClick, onMove, counts = {}, avatarOf, onAssumir,
}: {
  demandas: BugReport[];
  onCardClick: (d: BugReport) => void;
  onMove: (d: BugReport, to: BugStatus) => void;
  counts?: Record<string, CardCounts>;
  avatarOf?: (userId: string | null) => string | null | undefined;
  onAssumir?: (d: BugReport) => void;
}) {
  const [active, setActive] = useState<BugReport | null>(null);
  // Concluída/Recusada nascem recolhidas: 2/3 do acervo não pode ocupar 1/3 da tela.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* primeira visita */ }
    return new Set(STAGES.filter((s) => s.final).map((s) => s.id));
  });

  const toggle = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    try { localStorage.setItem(LS_KEY, JSON.stringify([...next])); } catch { /* ok */ }
    return next;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const byStage = useMemo(() => {
    const m = new Map<string, BugReport[]>();
    for (const s of STAGES) m.set(s.id, []);
    // Mais urgente primeiro; empate → mais tempo parada na etapa.
    const ordered = [...demandas].sort((a, b) => {
      const w = prioOf(b.priority).weight - prioOf(a.priority).weight;
      return w !== 0 ? w : stageDays(b) - stageDays(a);
    });
    for (const d of ordered) (m.get(d.status) ?? m.get("open"))!.push(d);
    return m;
  }, [demandas]);

  function handleDragStart(e: DragStartEvent) {
    setActive((e.active.data.current as { entity?: BugReport } | undefined)?.entity ?? null);
  }
  function handleDragEnd(e: DragEndEvent) {
    const dragged = (e.active.data.current as { entity?: BugReport } | undefined)?.entity;
    setActive(null);
    if (!dragged || !e.over) return;
    const to = String(e.over.id) as BugStatus;
    if (to === dragged.status) return;
    onMove(dragged, to);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
      autoScroll={{ threshold: { x: 0.2, y: 0.2 }, acceleration: 18 }}
    >
      <div className="flex gap-4 items-stretch h-full">
        {STAGES.map((stage) => {
          const items = byStage.get(stage.id) ?? [];
          const isCollapsed = collapsed.has(stage.id);

          // Coluna recolhida: trilho fino, mas continua aceitando drop.
          if (isCollapsed) {
            return (
              <DroppableColumn key={stage.id} id={stage.id}
                className="ti-column-collapsed w-12 shrink-0 flex flex-col items-center py-3 gap-3 cursor-pointer"
              >
                <button onClick={() => toggle(stage.id)} title={`Expandir ${stage.label}`}
                  className="text-muted-foreground hover:text-foreground">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: stage.color }} />
                <span className="text-xs font-semibold text-muted-foreground">{items.length}</span>
                <span className="text-xs font-medium text-foreground/80 [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
                  {stage.label}
                </span>
              </DroppableColumn>
            );
          }

          const semDono = items.filter((d) => !d.assignee_id).length;
          const paradas = items.filter((d) => agingOf(d) === "red").length;
          const acimaWip = stage.id === "in_progress" && items.length > WIP_LIMIT;

          return (
            <DroppableColumn key={stage.id} id={stage.id}
              className="ti-column w-80 shrink-0 flex flex-col h-full min-h-0"
            >
              <div className="ti-accent-bar" style={{ ["--ti-accent" as string]: stage.color }} />
              <div className="ti-column-header" title={stage.hint}>
                <span className="ti-dot" style={{ ["--ti-accent" as string]: stage.color }} />
                <span className="ti-column-title">{stage.label}</span>
                <span className={`ti-column-count ${acimaWip ? "text-destructive font-semibold" : ""}`}
                  title={acimaWip ? `Acima do limite de ${WIP_LIMIT} em paralelo` : undefined}>
                  ({items.length})
                </span>
                <button onClick={() => toggle(stage.id)} title="Recolher coluna"
                  className="ml-auto text-muted-foreground hover:text-foreground">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Sinal contextual no lugar do texto fixo (que virava ruído) */}
              <div className="px-3 pb-1.5 min-h-[20px] flex gap-1.5 flex-wrap">
                {semDono > 0 && !stage.final && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                    {semDono} sem dono
                  </span>
                )}
                {paradas > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">
                    {paradas} parada(s)
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[80px]">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                    Nada aqui.
                  </p>
                ) : (
                  items.map((d) => (
                    <DraggableCard key={d.id} d={d} onClick={onCardClick} onAssumir={onAssumir}
                      counts={counts[d.id]} avatarUrl={avatarOf?.(d.assignee_id)} />
                  ))
                )}
              </div>
            </DroppableColumn>
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className="ti-card ti-card-overlay ti-card-prio w-80 cursor-grabbing pointer-events-none"
            style={{ ["--ti-prio" as string]: prioOf(active.priority).hex }}>
            <DemandaCardFace d={active} counts={counts[active.id]} avatarUrl={avatarOf?.(active.assignee_id)} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
