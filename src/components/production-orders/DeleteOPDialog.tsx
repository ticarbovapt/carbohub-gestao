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
}

export function DeleteOPDialog({ open, onOpenChange, order }: DeleteOPDialogProps) {
  const deleteOP = useDeleteProductionOrderOP();

  if (!order) return null;

  const handleDelete = async () => {
    await deleteOP.mutateAsync(order.id);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Ordem de Produção</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir a OP{" "}
            <span className="font-bold text-foreground">{order.title}</span>?
            <br />
            <br />
            Esta ação é irreversível e removerá também todos os materiais associados.
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
