// TODO: ligar em <tabela de compras> (Supabase).
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { toast } from "sonner";

export function RCAprovarDialog({ rcNumber, open, onOpenChange, onConfirm }: { rcNumber: string | null; open: boolean; onOpenChange: (v: boolean) => void; onConfirm?: () => Promise<void> | void }) {
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    if (!onConfirm) { toast.info("Disponível na fase de lógica"); onOpenChange(false); return; }
    try { setPending(true); await onConfirm(); onOpenChange(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao aprovar."); }
    finally { setPending(false); }
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
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); confirm(); }} disabled={pending} className="bg-carbo-green hover:bg-carbo-green/90 text-white">{pending ? "Aprovando…" : "Aprovar"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
