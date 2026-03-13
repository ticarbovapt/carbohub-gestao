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
import { InventoryLot, useDeleteLot } from "@/hooks/useLots";

interface DeleteLotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lot: InventoryLot | null;
}

export function DeleteLotDialog({ open, onOpenChange, lot }: DeleteLotDialogProps) {
  const deleteLot = useDeleteLot();

  if (!lot) return null;

  const handleDelete = async () => {
    await deleteLot.mutateAsync(lot.id);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Lote</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o lote{" "}
            <span className="font-mono font-bold text-foreground">{lot.lot_code}</span>?
            <br />
            <br />
            Esta ação é irreversível e removerá também todo o histórico de consumo
            e verificações de qualidade associados a este lote.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir Lote
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
