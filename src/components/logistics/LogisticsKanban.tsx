import { Shipment, ShipmentStatus, SHIPMENT_STATUS_CONFIG } from "@/types/shipment";
import { ShipmentCard } from "./ShipmentCard";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const KANBAN_COLUMNS: ShipmentStatus[] = [
  "separacao_pendente",
  "separando",
  "separado",
  "em_transporte",
  "entregue",
];

interface LogisticsKanbanProps {
  shipments: Shipment[];
  onAdvance: (id: string, nextStatus: ShipmentStatus) => void;
  onViewDetails: (shipment: Shipment) => void;
}

export function LogisticsKanban({
  shipments,
  onAdvance,
  onViewDetails,
}: LogisticsKanbanProps) {
  return (
    <ScrollArea className="w-full">
      <div className="flex gap-4 pb-4 min-w-[900px]">
        {KANBAN_COLUMNS.map((status) => {
          const config = SHIPMENT_STATUS_CONFIG[status];
          const items = shipments.filter((s) => s.status === status);

          return (
            <div
              key={status}
              className="flex-1 min-w-[220px] bg-muted/40 rounded-xl p-3 space-y-3"
            >
              {/* Column header */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-base">{config.icon}</span>
                <h3 className="text-sm font-semibold text-foreground">
                  {config.label}
                </h3>
                <span className="ml-auto text-xs font-medium bg-muted rounded-full px-2 py-0.5 text-muted-foreground">
                  {items.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    Nenhum envio
                  </p>
                ) : (
                  items.map((shipment) => (
                    <ShipmentCard
                      key={shipment.id}
                      shipment={shipment}
                      onAdvance={onAdvance}
                      onViewDetails={onViewDetails}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
