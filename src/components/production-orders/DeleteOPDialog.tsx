import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProductionOrder, useDeleteProductionOrderOP } from "@/hooks/useProductionOrders";

interface DeleteOPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ProductionOrder | null;
  onDeleted?: () => void;
}

export function DeleteOPDialog({ open, onOpenChange, order, onDeleted }: DeleteOPDialogProps) {
  const deleteOP = useDeleteProductionOrderOP();

  if (!order) return null;

  const handleDelete = async () => {
    await deleteOP.mutateAsync(order.id);
    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Ordem de Produção</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Tem certeza que deseja excluir a OP{" "}
                <span className="font-bold text-foreground">
                  {order.op_number || order.title || order.id.slice(0, 8).toUpperCase()}
                </span>?
              </p>
              {["confirmada", "concluida"].includes(order.op_status) && (
                <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-warning-foreground font-medium">
                  Esta OP foi concluída — o estoque de insumos e produto final será revertido automaticamente em Suprimentos.
                </p>
              )}
              <p>Esta ação é irreversível.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir OP
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
