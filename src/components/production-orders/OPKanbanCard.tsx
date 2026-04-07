import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, Calendar, Package } from "lucide-react";
import type { ProductionOrder, DemandSource } from "@/hooks/useProductionOrders";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OPKanbanCardProps {
  order: ProductionOrder;
  onAdvance?: (order: ProductionOrder) => void;
  onClick?: (order: ProductionOrder) => void;
}

const PRIORITY_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: "Urgente", color: "bg-red-500/10 text-red-700 border-red-500/30" },
  2: { label: "Alta",    color: "bg-orange-500/10 text-orange-700 border-orange-500/30" },
  3: { label: "Normal",  color: "bg-gray-500/10 text-gray-600 border-gray-400/30" },
  4: { label: "Baixa",   color: "bg-slate-500/10 text-slate-500 border-slate-400/20" },
  5: { label: "Planej.", color: "bg-slate-500/10 text-slate-400 border-slate-400/20" },
};

const DEMAND_LABELS: Record<DemandSource, string> = {
  venda:        "Venda",
  recorrencia:  "Recorrência",
  safety_stock: "Safety Stock",
  pcp_manual:   "PCP Manual",
};

const DEMAND_COLORS: Record<DemandSource, string> = {
  venda:        "bg-blue-500/10 text-blue-700 border-blue-500/30",
  recorrencia:  "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
  safety_stock: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  pcp_manual:   "bg-gray-500/10 text-gray-600 border-gray-400/30",
};

export function OPKanbanCard({ order, onAdvance, onClick }: OPKanbanCardProps) {
  const priority = PRIORITY_CONFIG[order.priority] ?? PRIORITY_CONFIG[3];
  const demand = order.demand_source as DemandSource;

  const displayName = order.sku_name || order.title || `OP ${order.id.slice(0, 8)}`;

  const daysSince = formatDistanceToNow(new Date(order.updated_at), {
    locale: ptBR,
    addSuffix: false,
  });

  return (
    <div
      className="p-3 bg-card rounded-lg border border-border hover:shadow-md transition-all cursor-pointer group"
      onClick={() => onClick?.(order)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] text-muted-foreground">
            {order.title || "OP-—"}
          </p>
          <p className="font-semibold text-sm truncate mt-0.5">{displayName}</p>
        </div>
        <Badge
          variant="outline"
          className={`text-[9px] px-1.5 h-4 flex-shrink-0 ${priority.color}`}
        >
          {priority.label}
        </Badge>
      </div>

      {/* SKU code */}
      {order.sku_code && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <Package className="h-3 w-3 flex-shrink-0" />
          <span className="font-mono">{order.sku_code}</span>
        </div>
      )}

      {/* Quantity */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-muted-foreground">Qtd:</span>
        <span className="text-xs font-semibold">{order.planned_quantity ?? order.quantity ?? 0}</span>
        {demand && (
          <Badge
            variant="outline"
            className={`text-[9px] px-1.5 h-4 ml-auto ${DEMAND_COLORS[demand] ?? ""}`}
          >
            {DEMAND_LABELS[demand] ?? demand}
          </Badge>
        )}
      </div>

      {/* Need date */}
      {order.need_date && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Calendar className="h-3 w-3 flex-shrink-0" />
          <span>
            Prazo: {format(new Date(order.need_date), "dd/MM/yy", { locale: ptBR })}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
        <span className="text-muted-foreground/60">{daysSince} atrás</span>
      </div>

      {/* Advance action */}
      {onAdvance && (
        <div className="pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs text-orange-600 border-orange-500/40 hover:bg-orange-500/10"
            onClick={(e) => {
              e.stopPropagation();
              onAdvance(order);
            }}
          >
            Avançar Etapa <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
