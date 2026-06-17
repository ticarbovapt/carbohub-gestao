// TODO: ligar em <tabela de compras> (Supabase).
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export function RCAprovarDialog({ rcNumber, open, onOpenChange }: { rcNumber: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const confirm = () => {
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Aprovar requisição {rcNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            A requisição será marcada como aprovada e seguirá para geração do pedido de compra (PC).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} className="bg-carbo-green hover:bg-carbo-green/90 text-white">Aprovar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
