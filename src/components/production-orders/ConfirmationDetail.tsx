import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertTriangle, XCircle, Package, User, Clock, Beaker } from "lucide-react";
import { useConfirmation } from "@/hooks/useProductionConfirmation";
import { cn } from "@/lib/utils";

interface ConfirmationDetailProps {
  opId: string;
  plannedQuantity: number;
}

function KpiBadge({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 90 ? "bg-green-500" : pct >= 75 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <Badge className={cn("text-white border-0 text-sm px-3 py-1", color)}>
        {pct.toFixed(1)}%
      </Badge>
    </div>
  );
}

export function ConfirmationDetail({ opId, plannedQuantity }: ConfirmationDetailProps) {
  const { data, isLoading } = useConfirmation(opId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Nenhuma confirmação registrada para esta OP.</p>
      </div>
    );
  }

  const { confirmation, items } = data;

  return (
    <div className="space-y-5">
      {/* Result */}
      <div className="rounded-lg border p-4 space-y-3">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          Resultado da Produção
        </h4>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Planejado</p>
            <p className="text-xl font-bold">{plannedQuantity}</p>
          </div>
          <div>
            <p className="text-xs text-green-500">Aprovado</p>
            <p className="text-xl font-bold text-green-600">{confirmation.good_quantity}</p>
          </div>
          <div>
            <p className="text-xs text-red-500">Rejeitado</p>
            <p className="text-xl font-bold text-red-600">{confirmation.rejected_quantity}</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <KpiBadge pct={confirmation.yield_pct || 0} label="Rendimento" />
        </div>
        <div className="rounded-lg border p-4">
          <KpiBadge pct={confirmation.bom_adherence_pct || 0} label="Aderência BOM" />
        </div>
      </div>

      {/* Rejection reason */}
      {confirmation.rejection_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/10 p-3">
          <p className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5" /> Motivo da Rejeição
          </p>
          <p className="text-sm text-red-600">{confirmation.rejection_reason}</p>
        </div>
      )}

      {/* Deviation notes */}
      {confirmation.deviation_notes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 p-3">
          <p className="text-xs font-medium text-amber-700 mb-1 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Observações
          </p>
          <p className="text-sm text-amber-600">{confirmation.deviation_notes}</p>
        </div>
      )}

      {/* Material consumption table */}
      {items.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-500" />
            Consumo de Materiais
          </h4>
          <div className="space-y-2">
            {items.map((item) => {
              const adherence = item.theoretical_quantity > 0
                ? (item.actual_quantity / item.theoretical_quantity) * 100
                : 100;
              const isOver = adherence > 105;
              const isUnder = adherence < 95;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between py-2 px-3 rounded-lg text-sm",
                    isOver ? "bg-amber-50 dark:bg-amber-950/10" :
                    isUnder ? "bg-blue-50 dark:bg-blue-950/10" :
                    "bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate max-w-[180px] font-medium">
                      {item.product_name}
                    </span>
                    {item.lot_id && (
                      <Beaker className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" title="Com lote rastreado" />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs">
                      {item.actual_quantity} / {item.theoretical_quantity}
                    </span>
                    {item.loss_quantity > 0 && (
                      <span className="text-xs text-amber-600">
                        +{item.loss_quantity} perda
                      </span>
                    )}
                    {isOver && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                    {isUnder && <AlertTriangle className="h-3.5 w-3.5 text-blue-500" />}
                    {!isOver && !isUnder && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-3">
        <div className="flex items-center gap-1">
          <User className="h-3.5 w-3.5" />
          <span>Confirmado por: {confirmation.confirmed_by?.slice(0, 8) || "—"}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span>
            {confirmation.confirmed_at
              ? new Date(confirmation.confirmed_at).toLocaleString("pt-BR")
              : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
