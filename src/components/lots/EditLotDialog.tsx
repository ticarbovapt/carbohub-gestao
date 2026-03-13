import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ChevronRight } from "lucide-react";
import {
  InventoryLot,
  LotStatus,
  useUpdateLot,
  useQualityChecks,
  LOT_STATUS_LABELS,
  LOT_STATUS_COLORS,
  LOT_STATUS_TRANSITIONS,
  QUALITY_RESULT_LABELS,
} from "@/hooks/useLots";
import { cn } from "@/lib/utils";

interface EditLotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lot: InventoryLot | null;
}

export function EditLotDialog({ open, onOpenChange, lot }: EditLotDialogProps) {
  const updateLot = useUpdateLot();
  const { data: qualityChecks = [] } = useQualityChecks("lot", lot?.id);

  const [notes, setNotes] = useState("");
  const [collectedSamples, setCollectedSamples] = useState(0);

  useEffect(() => {
    if (lot) {
      setNotes(lot.notes || "");
      setCollectedSamples(lot.collected_samples);
    }
  }, [lot]);

  if (!lot) return null;

  const nextStatuses = LOT_STATUS_TRANSITIONS[lot.status] || [];

  const handleStatusChange = async (newStatus: LotStatus) => {
    const updates: any = { id: lot.id, status: newStatus };
    if (newStatus === "recebido") {
      updates.received_at = new Date().toISOString();
    }
    if (newStatus === "aprovado") {
      updates.released_at = new Date().toISOString();
    }
    await updateLot.mutateAsync(updates);
    onOpenChange(false);
  };

  const handleSaveNotes = async () => {
    await updateLot.mutateAsync({
      id: lot.id,
      notes,
      collected_samples: collectedSamples,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-green-500">{lot.lot_code}</span>
            <Badge
              variant="outline"
              className={cn("text-white border-0", LOT_STATUS_COLORS[lot.status])}
            >
              {LOT_STATUS_LABELS[lot.status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="dados">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dados">Dados do Lote</TabsTrigger>
            <TabsTrigger value="qualidade">Qualidade</TabsTrigger>
          </TabsList>

          {/* Tab 1: Dados */}
          <TabsContent value="dados" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Produto</Label>
                <p className="font-medium">{lot.product_name || "—"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Fornecedor</Label>
                <p className="font-medium">{lot.supplier_name || "—"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Volume Disponível</Label>
                <p className="font-medium">
                  {(lot.available_volume_ml / 1000).toFixed(1)}L / {(lot.initial_volume_ml / 1000).toFixed(1)}L
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Validade</Label>
                <p className="font-medium">
                  {lot.expired_at ? new Date(lot.expired_at).toLocaleDateString("pt-BR") : "—"}
                </p>
              </div>
            </div>

            {/* Amostras */}
            <div className="space-y-2">
              <Label>Amostras Coletadas ({collectedSamples}/{lot.expected_samples})</Label>
              <Input
                type="number"
                value={collectedSamples}
                onChange={(e) => setCollectedSamples(Number(e.target.value))}
                min={0}
                max={lot.expected_samples}
              />
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações sobre o lote..."
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
                      disabled={updateLot.isPending}
                      onClick={() => handleStatusChange(nextStatus)}
                      className="gap-1"
                    >
                      <ChevronRight className="h-3 w-3" />
                      {LOT_STATUS_LABELS[nextStatus]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveNotes} disabled={updateLot.isPending}>
                {updateLot.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Tab 2: Qualidade */}
          <TabsContent value="qualidade" className="space-y-4 mt-4">
            {qualityChecks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhuma verificação de qualidade registrada.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {qualityChecks.map((qc) => (
                  <div
                    key={qc.id}
                    className="p-4 rounded-lg border bg-card space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          qc.result === "aprovada" && "bg-green-500 text-white border-0",
                          qc.result === "reprovada" && "bg-red-500 text-white border-0",
                          qc.result === "bloqueada" && "bg-orange-500 text-white border-0",
                          qc.result === "pendente" && "bg-gray-500 text-white border-0"
                        )}
                      >
                        {QUALITY_RESULT_LABELS[qc.result]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(qc.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {qc.notes && (
                      <p className="text-sm text-muted-foreground">{qc.notes}</p>
                    )}
                    {qc.checklist_items && qc.checklist_items.length > 0 && (
                      <div className="space-y-1">
                        {qc.checklist_items.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className={item.checked ? "text-green-500" : "text-muted-foreground"}>
                              {item.checked ? "✓" : "○"}
                            </span>
                            <span>{item.item}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
