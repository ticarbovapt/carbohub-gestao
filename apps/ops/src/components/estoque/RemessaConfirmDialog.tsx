import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useConfirmChegada, useEstornarEnvio } from "@/hooks/useStockTransfers";

type Action = "confirmar" | "estornar";

export function RemessaConfirmDialog({
  action, transferId, produto, open, onOpenChange,
}: { action: Action | null; transferId: string | null; produto: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const confirmChegada = useConfirmChegada();
  const estornar = useEstornarEnvio();
  const isEstorno = action === "estornar";
  const pending = confirmChegada.isPending || estornar.isPending;

  const confirm = async () => {
    if (!transferId) return;
    try {
      if (isEstorno) {
        await estornar.mutateAsync(transferId);
        toast.success("Envio estornado — quantidade devolvida ao Hub Natal.");
      } else {
        await confirmChegada.mutateAsync(transferId);
        toast.success("Chegada confirmada — saldo creditado no destino.");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir a operação.");
    }
  };

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
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); confirm(); }}
            disabled={pending}
            className={isEstorno
              ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              : "bg-carbo-green hover:bg-carbo-green/90 text-white"}
          >
            {pending ? "Processando…" : isEstorno ? "Confirmar Estorno" : "Confirmar Chegada"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
