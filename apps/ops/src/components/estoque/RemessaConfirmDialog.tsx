// TODO: ligar em warehouse_stock (Supabase) — submit liga na fase de lógica.
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Action = "confirmar" | "estornar";

export function RemessaConfirmDialog({
  action, produto, open, onOpenChange,
}: { action: Action | null; produto: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const confirm = () => {
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  };
  const isEstorno = action === "estornar";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isEstorno ? "Estornar envio" : "Confirmar chegada"}
            {produto ? ` — ${produto}` : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isEstorno
              ? "O envio será marcado como não recebido e a quantidade retornará ao estoque de origem (Hub Natal)."
              : "A remessa será marcada como entregue e a quantidade entrará no estoque do destino."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirm}
            className={isEstorno
              ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              : "bg-carbo-green hover:bg-carbo-green/90 text-white"}
          >
            {isEstorno ? "Confirmar Estorno" : "Confirmar Chegada"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
