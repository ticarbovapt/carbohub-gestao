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
import { useDeleteSku, Sku } from "@/hooks/useSkus";
import { Loader2 } from "lucide-react";

interface DeleteSkuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku: Sku | null;
}

export function DeleteSkuDialog({ open, onOpenChange, sku }: DeleteSkuDialogProps) {
  const deleteSku = useDeleteSku();

  const handleDelete = async () => {
    if (!sku) return;
    await deleteSku.mutateAsync(sku.id);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o SKU <strong>{sku?.code}</strong> ({sku?.name})?
            Todas as versões de BOM associadas também serão removidas.
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteSku.isPending}
          >
            {deleteSku.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
