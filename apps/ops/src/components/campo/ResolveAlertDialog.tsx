// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ResolveAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo?: string;
}

export function ResolveAlertDialog({ open, onOpenChange, titulo }: ResolveAlertDialogProps) {
  const handleConfirm = () => {
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Marcar alerta como resolvido?</AlertDialogTitle>
          <AlertDialogDescription>
            {titulo ? `"${titulo}" será marcado como resolvido.` : "O alerta será marcado como resolvido."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="resolucao-obs">Observação (opcional)</Label>
          <Textarea id="resolucao-obs" placeholder="Descreva a resolução, se necessário..." rows={3} />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Resolver</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
