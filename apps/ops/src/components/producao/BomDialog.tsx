import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface BomItem { id: string; insumo: string; qty: number; unit: string; }
// TODO: ligar em bom_items (Supabase)
const MOCK_BOM: BomItem[] = [];

interface BomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
}

export function BomDialog({ open, onOpenChange, productName }: BomDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            BOM — {productName}
          </DialogTitle>
          <DialogDescription>Lista de insumos consumidos por unidade produzida.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Disponível na fase de lógica")}>
              <Plus className="h-3.5 w-3.5" /> Adicionar insumo
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Insumo</CarboTableHead>
                  <CarboTableHead className="text-right">Qtd por unidade</CarboTableHead>
                  <CarboTableHead>Unidade</CarboTableHead>
                  <CarboTableHead className="w-10" />
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {MOCK_BOM.length === 0 && (
                  <CarboTableRow>
                    <CarboTableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Nenhum insumo</CarboTableCell>
                  </CarboTableRow>
                )}
                {MOCK_BOM.map((item) => (
                  <CarboTableRow key={item.id}>
                    <CarboTableCell className="font-medium">{item.insumo}</CarboTableCell>
                    <CarboTableCell className="text-right tabular-nums">{item.qty.toLocaleString("pt-BR")}</CarboTableCell>
                    <CarboTableCell className="text-muted-foreground">{item.unit}</CarboTableCell>
                    <CarboTableCell>
                      <button onClick={() => toast.info("Disponível na fase de lógica")} className="p-1.5 hover:bg-muted rounded-md text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </CarboTableCell>
                  </CarboTableRow>
                ))}
              </CarboTableBody>
            </CarboTable>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
