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
import { AlertTriangle } from "lucide-react";
import { useUpdateLicensee, type Licensee } from "@/hooks/useLicensees";

interface InactivateLicenseeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licensee: Licensee | null;
}

export function InactivateLicenseeDialog({ open, onOpenChange, licensee }: InactivateLicenseeDialogProps) {
  const updateLicensee = useUpdateLicensee();

  const handleInactivate = () => {
    if (!licensee) return;
    
    updateLicensee.mutate(
      { id: licensee.id, status: "inactive" },
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
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
              <AlertTriangle className="h-5 w-5 text-warning" />
            </div>
            <AlertDialogTitle>Inativar Licenciado</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            Você está prestes a inativar o licenciado <strong>{licensee.name}</strong> (código: {licensee.code}).
            <br /><br />
            Esta ação irá alterar o status para <strong>Inativo</strong>. Nenhum dado será excluído e você poderá reativar este licenciado a qualquer momento.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleInactivate}
            className="bg-warning text-warning-foreground hover:bg-warning/90"
            disabled={updateLicensee.isPending}
          >
            {updateLicensee.isPending ? "Inativando..." : "Confirmar Inativação"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
