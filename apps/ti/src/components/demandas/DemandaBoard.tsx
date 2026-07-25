import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, closestCorners,
  useSensor, useSensors, useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { BugReport, BugStatus } from "@/hooks/useBugReports";
import { STAGES, prioOf } from "@/lib/demandas";
import { DemandaCardFace, type CardCounts } from "./DemandaCard";

// ─────────────────────────────────────────────────────────────────────────────
// Quadro de demandas — mesma fluidez do quadro do Marketing e dos pipelines do
// Sales: PointerSensor com 5px de tolerância (não briga com o clique),
// closestCorners, DragOverlay reusando a mesma face do cartão e placeholder
// tracejado na origem (preserva a altura, não "pula").
// ─────────────────────────────────────────────────────────────────────────────

function DraggableCard({ d, onClick, counts, avatarUrl }: {
  d: BugReport; onClick: (d: BugReport) => void; counts?: CardCounts; avatarUrl?: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: d.id,
    data: { entity: d },
  });

  if (isDragging) {
    // Mantém o espaço da coluna estável enquanto arrasta.
    return <div ref={setNodeRef} className="ti-card-placeholder h-[150px]" />;
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={() => onClick(d)}
      className="ti-card cursor-pointer select-none touch-none"
    >
      <DemandaCardFace d={d} counts={counts} avatarUrl={avatarUrl} />
    </div>
  );
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto px-2 py-2 space-y-2 min-h-[80px] rounded-b-xl transition-colors ${
        isOver ? "ring-2 ring-primary/60 bg-primary/5" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function DemandaBoard({
  demandas, onCardClick, onMove, counts = {}, avatarOf,
}: {
  demandas: BugReport[];
  onCardClick: (d: BugReport) => void;
  /** Chamado no fim do gesto: (demanda, etapa destino). */
  onMove: (d: BugReport, to: BugStatus) => void;
  counts?: Record<string, CardCounts>;
  avatarOf?: (userId: string | null) => string | null | undefined;
}) {
  const [active, setActive] = useState<BugReport | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // Agrupa por etapa uma vez só (evita refiltrar por coluna a cada render).
  const byStage = useMemo(() => {
    const m = new Map<string, BugReport[]>();
    for (const s of STAGES) m.set(s.id, []);
    // Dentro da coluna, mais urgente primeiro; depois mais antigo primeiro.
    const ordered = [...demandas].sort((a, b) => {
      const w = prioOf(b.priority).weight - prioOf(a.priority).weight;
      return w !== 0 ? w : +new Date(a.created_at) - +new Date(b.created_at);
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
      {/* items-stretch + h-full nas colunas: cada coluna ocupa a altura do
          quadro e rola por dentro (a página nunca rola na vertical). */}
      <div className="flex gap-4 items-stretch h-full">
        {STAGES.map((stage) => {
          const items = byStage.get(stage.id) ?? [];
          return (
            <div
              key={stage.id}
              className="ti-column w-80 shrink-0 flex flex-col h-full min-h-0"
              style={{ ["--ti-accent" as string]: stage.color }}
            >
              <div className="ti-accent-bar" />
              <div className="ti-column-header">
                <span className="ti-dot" />
                <span className="ti-column-title">{stage.label}</span>
                <span className="ti-column-count">({items.length})</span>
              </div>
              <p className="px-3 -mt-1 pb-1.5 text-[11px] text-muted-foreground">{stage.hint}</p>

              <DroppableColumn id={stage.id}>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                    Nada aqui.
                  </p>
                ) : (
                  items.map((d) => (
                    <DraggableCard key={d.id} d={d} onClick={onCardClick}
                      counts={counts[d.id]} avatarUrl={avatarOf?.(d.assignee_id)} />
                  ))
                )}
              </DroppableColumn>
            </div>
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className="ti-card ti-card-overlay w-80 cursor-grabbing pointer-events-none">
            <DemandaCardFace d={active} counts={counts[active.id]} avatarUrl={avatarOf?.(active.assignee_id)} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
