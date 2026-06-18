import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Separator } from "@/components/ui/separator";
import { Plane, MapPin, Calendar, User, Wallet, Receipt } from "lucide-react";
import type { Viagem } from "@/hooks/useViagens";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const dt = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");

const PC_LABEL: Record<string, string> = {
  aberta: "Em preenchimento", enviada: "Aguardando aprovação", aprovada: "Aprovada", reprovada: "Reprovada", encerrada: "Encerrada",
};

export function ViagemDetailsDialog({ viagem, statusLabel, open, onOpenChange }: { viagem: Viagem | null; statusLabel: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!viagem) return null;
  const periodo = viagem.data_ida ? `${dt(viagem.data_ida)}${viagem.data_volta ? ` → ${dt(viagem.data_volta)}` : ""}` : "—";

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
            <CarboBadge variant="info">{statusLabel}</CarboBadge>
            {viagem.pc_status && <CarboBadge variant="secondary">PC: {PC_LABEL[viagem.pc_status] ?? viagem.pc_status}</CarboBadge>}
          </div>

          {viagem.status === "reprovado" && viagem.motivo_reprovacao && (
            <p className="text-sm text-destructive">Motivo da reprovação: {viagem.motivo_reprovacao}</p>
          )}

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Destino:</span>
              <span className="font-medium">{viagem.destino}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Solicitante:</span>
              <span className="font-medium">{viagem.solicitante}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Período:</span>
              <span className="font-medium">{periodo}</span>
            </div>
            {viagem.centro_custo && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Centro de custo:</span>
                <span className="font-medium">{viagem.centro_custo}</span>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-1.5">Objetivo</h4>
            <p className="text-sm text-muted-foreground">{viagem.objetivo || "—"}</p>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5"><Wallet className="h-4 w-4" /> Valores</h4>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Valor estimado</span>
              <span className="font-semibold tabular-nums">{brl(viagem.valor_estimado)}</span>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-1.5">
            <h4 className="text-sm font-medium flex items-center gap-1.5"><Receipt className="h-4 w-4" /> Prestação de Contas</h4>
            {viagem.pc_status ? (
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center justify-between"><span>Status</span><span className="font-medium text-foreground">{PC_LABEL[viagem.pc_status] ?? viagem.pc_status}</span></div>
                <div className="flex items-center justify-between"><span>Total comprovado</span><span className="font-medium text-foreground tabular-nums">{brl(viagem.pc_total)}</span></div>
                {viagem.pc_notas && <p className="pt-1">{viagem.pc_notas}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Prestação de contas não iniciada.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
