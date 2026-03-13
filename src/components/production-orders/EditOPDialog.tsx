import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronRight, Package, Check, AlertTriangle } from "lucide-react";
import {
  ProductionOrder,
  OpStatus,
  useUpdateProductionOrderOP,
  useProductionOrderMaterials,
  useExplodeBOM,
  OP_STATUS_LABELS,
  OP_STATUS_COLORS,
  OP_STATUS_TRANSITIONS,
  DEMAND_SOURCE_LABELS,
  PRIORITY_LABELS,
} from "@/hooks/useProductionOrders";
import { cn } from "@/lib/utils";

interface EditOPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ProductionOrder | null;
}

export function EditOPDialog({ open, onOpenChange, order }: EditOPDialogProps) {
  const updateOP = useUpdateProductionOrderOP();
  const explodeBOM = useExplodeBOM();
  const { data: materials = [] } = useProductionOrderMaterials(order?.id);

  const [deviationNotes, setDeviationNotes] = useState("");

  useEffect(() => {
    if (order) {
      setDeviationNotes(order.deviation_notes || "");
    }
  }, [order]);

  if (!order) return null;

  const nextStatuses = OP_STATUS_TRANSITIONS[order.op_status] || [];

  const handleStatusChange = async (newStatus: OpStatus) => {
    const updates: any = { id: order.id, op_status: newStatus };
    if (newStatus === "em_producao") {
      updates.started_at = new Date().toISOString();
    }
    if (newStatus === "concluida") {
      updates.finished_at = new Date().toISOString();
    }
    await updateOP.mutateAsync(updates);
    onOpenChange(false);
  };

  const handleSaveNotes = async () => {
    await updateOP.mutateAsync({
      id: order.id,
      deviation_notes: deviationNotes,
    });
    onOpenChange(false);
  };

  const handleExplodeBOM = async () => {
    if (!order.sku_id) return;
    await explodeBOM.mutateAsync({
      orderId: order.id,
      skuId: order.sku_id,
      plannedQuantity: order.planned_quantity,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-medium">{order.title || "OP sem título"}</span>
            <Badge
              variant="outline"
              className={cn("text-white border-0", OP_STATUS_COLORS[order.op_status])}
            >
              {OP_STATUS_LABELS[order.op_status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="dados">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dados">Dados da OP</TabsTrigger>
            <TabsTrigger value="materiais">Materiais</TabsTrigger>
          </TabsList>

          {/* Tab 1: Dados */}
          <TabsContent value="dados" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">SKU</Label>
                <p className="font-medium">
                  {order.sku_code || "—"} — {order.sku_name || "—"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Quantidade Planejada</Label>
                <p className="font-medium">{order.planned_quantity}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Prioridade</Label>
                <p className="font-medium">{PRIORITY_LABELS[order.priority] || order.priority}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Fonte de Demanda</Label>
                <p className="font-medium">
                  {DEMAND_SOURCE_LABELS[order.demand_source] || "—"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Data de Necessidade</Label>
                <p className="font-medium">
                  {order.need_date
                    ? new Date(order.need_date).toLocaleDateString("pt-BR")
                    : "—"}
                </p>
              </div>
            </div>

            {/* Observações (editável) */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={deviationNotes}
                onChange={(e) => setDeviationNotes(e.target.value)}
                placeholder="Observações sobre a OP..."
              />
            </div>

            {/* Status transitions */}
            {nextStatuses.length > 0 && (
              <div className="space-y-2">
                <Label>Avançar Status</Label>
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map((nextStatus) => (
                    <Button
                      key={nextStatus}
                      variant="outline"
                      size="sm"
                      disabled={updateOP.isPending}
                      onClick={() => handleStatusChange(nextStatus)}
                      className="gap-1"
                    >
                      <ChevronRight className="h-3 w-3" />
                      {OP_STATUS_LABELS[nextStatus]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveNotes} disabled={updateOP.isPending}>
                {updateOP.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Tab 2: Materiais */}
          <TabsContent value="materiais" className="space-y-4 mt-4">
            {materials.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Nenhum material. Clique em 'Explodir BOM' para gerar.</p>
                {order.sku_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    disabled={explodeBOM.isPending}
                    onClick={handleExplodeBOM}
                  >
                    {explodeBOM.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Explodir BOM
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {materials.map((mat) => (
                  <div
                    key={mat.id}
                    className="p-4 rounded-lg border bg-card space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{mat.product_name || "—"}</span>
                      <div className="flex items-center gap-2">
                        {mat.is_critical && (
                          <Badge variant="outline" className="bg-red-500 text-white border-0 text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Crítico
                          </Badge>
                        )}
                        {mat.is_separated ? (
                          <Badge variant="outline" className="bg-green-500 text-white border-0 text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            Separado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-400 text-white border-0 text-xs">
                            Pendente
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <div>
                        Qtd Teórica: <span className="font-medium text-foreground">{mat.theoretical_quantity}</span>
                      </div>
                      <div>
                        Qtd Separada: <span className="font-medium text-foreground">{mat.separated_quantity}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
