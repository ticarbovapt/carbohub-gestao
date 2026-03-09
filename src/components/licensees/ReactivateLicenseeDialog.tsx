import React from "react";
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
import { CheckCircle2 } from "lucide-react";
import { useUpdateLicensee, type Licensee } from "@/hooks/useLicensees";

interface ReactivateLicenseeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licensee: Licensee | null;
}

export function ReactivateLicenseeDialog({ open, onOpenChange, licensee }: ReactivateLicenseeDialogProps) {
  const updateLicensee = useUpdateLicensee();

  const handleReactivate = () => {
    if (!licensee) return;
    
    updateLicensee.mutate(
      { id: licensee.id, status: "active" },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  if (!licensee) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <AlertDialogTitle>Reativar Licenciado</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            Você está prestes a reativar o licenciado <strong>{licensee.name}</strong> (código: {licensee.code}).
            <br /><br />
            Esta ação irá alterar o status para <strong>Ativo</strong>. O licenciado voltará a aparecer nas listagens normais e poderá operar normalmente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReactivate}
            className="bg-success text-success-foreground hover:bg-success/90"
            disabled={updateLicensee.isPending}
          >
            {updateLicensee.isPending ? "Reativando..." : "Confirmar Reativação"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
