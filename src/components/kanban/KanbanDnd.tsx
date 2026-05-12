import { ReactNode } from "react";
import { useDraggable, useDroppable, DragOverlay } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

// ── DraggableCard ─────────────────────────────────────────────────────────────
// Wraps any card component with drag behavior. Does NOT modify the inner card.
interface DraggableCardProps {
  id: string;
  data?: Record<string, unknown>;
  children: ReactNode;
  disabled?: boolean;
}

export function DraggableCard({ id, data, children, disabled }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("touch-none", isDragging && "opacity-40")}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

// ── DroppableColumn ───────────────────────────────────────────────────────────
// Wraps a column's card list. Highlights when a card is dragged over it.
interface DroppableColumnProps {
  id: string;
  children: ReactNode;
}

export function DroppableColumn({ id, children }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[80px] rounded-lg transition-colors duration-150",
        isOver && "ring-2 ring-primary/60 bg-primary/5"
      )}
    >
      {children}
    </div>
  );
}

// ── KanbanDragOverlay ─────────────────────────────────────────────────────────
// Renders the ghost card in a portal above everything (not clipped by ScrollArea).
interface KanbanDragOverlayProps {
  children: ReactNode | null;
}

export function KanbanDragOverlay({ children }: KanbanDragOverlayProps) {
  return (
    <DragOverlay
      dropAnimation={{
        duration: 180,
        easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
      }}
    >
      {children ? (
        <div className="rotate-2 opacity-90 shadow-xl scale-105 cursor-grabbing pointer-events-none">
          {children}
        </div>
      ) : null}
    </DragOverlay>
  );
}
