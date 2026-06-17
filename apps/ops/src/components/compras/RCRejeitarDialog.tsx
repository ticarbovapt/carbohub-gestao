// TODO: ligar em <tabela de compras> (Supabase).
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

export function RCRejeitarDialog({ rcNumber, open, onOpenChange, onConfirm }: { rcNumber: string | null; open: boolean; onOpenChange: (v: boolean) => void; onConfirm?: () => Promise<void> | void }) {
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    if (!onConfirm) { toast.info("Disponível na fase de lógica"); onOpenChange(false); return; }
    try { setPending(true); await onConfirm(); onOpenChange(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao rejeitar."); }
    finally { setPending(false); }
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rejeitar requisição {rcNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            A requisição será marcada como rejeitada. Informe o motivo (opcional) para o histórico.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label>Motivo da rejeição (opcional)</Label>
          <Textarea placeholder="Motivo da rejeição..." rows={3} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); confirm(); }} disabled={pending} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">{pending ? "Rejeitando…" : "Confirmar Rejeição"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
