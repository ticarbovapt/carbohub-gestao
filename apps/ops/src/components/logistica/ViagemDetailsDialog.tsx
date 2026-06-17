// TODO: ligar em viagens (Supabase)
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Separator } from "@/components/ui/separator";
import { Plane, MapPin, Calendar, User, Wallet, Receipt } from "lucide-react";

interface ViagemDetail {
  id: string;
  destino: string;
  objetivo: string;
  solicitante: string;
  data: string;
  valor: number;
  statusLabel: string;
  pcLabel: string | null;
}

interface ViagemDetailsDialogProps {
  viagem: ViagemDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const dt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");

export function ViagemDetailsDialog({ viagem, open, onOpenChange }: ViagemDetailsDialogProps) {
  if (!viagem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="h-4 w-4" /> Viagem — {viagem.destino}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <CarboBadge variant="info">{viagem.statusLabel}</CarboBadge>
            {viagem.pcLabel && <CarboBadge variant="secondary">PC: {viagem.pcLabel}</CarboBadge>}
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Rota:</span>
              <span className="font-medium">Natal/RN → {viagem.destino}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Solicitante:</span>
              <span className="font-medium">{viagem.solicitante}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Período:</span>
              <span className="font-medium">{dt(viagem.data)}</span>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-1.5">Objetivo</h4>
            <p className="text-sm text-muted-foreground">{viagem.objetivo}</p>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Valores
            </h4>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Valor estimado</span>
              <span className="font-semibold tabular-nums">{brl(viagem.valor)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Adiantamento</span>
              <span className="font-semibold tabular-nums">—</span>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-1.5">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <Receipt className="h-4 w-4" /> Prestação de Contas (resumo)
            </h4>
            {viagem.pcLabel ? (
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <span className="font-medium text-foreground">{viagem.pcLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Total comprovado</span>
                  <span className="font-medium text-foreground tabular-nums">—</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Comprovantes</span>
                  <span className="font-medium text-foreground">—</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Prestação de contas não iniciada.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { ViagemDetail };
