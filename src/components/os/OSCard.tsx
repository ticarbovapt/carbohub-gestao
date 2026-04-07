import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, X, Calendar, Car } from "lucide-react";
import type { ServiceOrderCarboVAPT, OsServiceType } from "@/types/os";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OSCardProps {
  order: ServiceOrderCarboVAPT;
  onAdvance?: (order: ServiceOrderCarboVAPT) => void;
  onCancel?: (order: ServiceOrderCarboVAPT) => void;
  onClick?: (order: ServiceOrderCarboVAPT) => void;
}

const SERVICE_TYPE_LABELS: Record<OsServiceType, string> = {
  b2c: "B2C",
  b2b: "B2B",
  frota: "Frota",
};

const SERVICE_TYPE_COLORS: Record<OsServiceType, string> = {
  b2c:   "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  b2b:   "bg-blue-500/10 text-blue-700 border-blue-500/30",
  frota: "bg-purple-500/10 text-purple-700 border-purple-500/30",
};

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Urgente", color: "bg-red-500/10 text-red-700 border-red-500/30" },
  2: { label: "Alta",    color: "bg-orange-500/10 text-orange-700 border-orange-500/30" },
  3: { label: "Normal",  color: "bg-gray-500/10 text-gray-600 border-gray-400/30" },
  4: { label: "Baixa",   color: "bg-slate-500/10 text-slate-500 border-slate-400/20" },
  5: { label: "Planej.", color: "bg-slate-500/10 text-slate-400 border-slate-400/20" },
};

export function OSCard({ order, onAdvance, onCancel, onClick }: OSCardProps) {
  const priority = PRIORITY_LABELS[order.priority] ?? PRIORITY_LABELS[3];
  const serviceType = order.service_type as OsServiceType | null;

  const customerDisplay =
    order.customer?.name || order.customer_name || "Cliente não informado";

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
            {order.os_number || "OS-—"}
          </p>
          <p className="font-semibold text-sm truncate mt-0.5">{customerDisplay}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {serviceType && (
            <Badge
              variant="outline"
              className={`text-[9px] px-1.5 h-4 ${SERVICE_TYPE_COLORS[serviceType]}`}
            >
              {SERVICE_TYPE_LABELS[serviceType]}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-[9px] px-1.5 h-4 ${priority.color}`}
          >
            {priority.label}
          </Badge>
        </div>
      </div>

      {/* Vehicle */}
      {(order.vehicle_plate || order.vehicle_model) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <Car className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">
            {[order.vehicle_plate, order.vehicle_model].filter(Boolean).join(" · ")}
          </span>
        </div>
      )}

      {/* Scheduled at */}
      {order.scheduled_at && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <Calendar className="h-3 w-3 flex-shrink-0" />
          <span>
            {format(new Date(order.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
          </span>
        </div>
      )}

      {/* Title + age */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
        <span className="truncate max-w-[140px]">
          {order.title.length > 28 ? order.title.slice(0, 25) + "…" : order.title}
        </span>
        <span className="flex-shrink-0 ml-1">{daysSince}</span>
      </div>

      {/* Actions */}
      {(onAdvance || onCancel) && (
        <div className="flex gap-1 pt-2 border-t border-border">
          {onAdvance && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/10"
              onClick={(e) => {
                e.stopPropagation();
                onAdvance(order);
              }}
            >
              Avançar <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                onCancel(order);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
