import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CarboButton } from "@/components/ui/carbo-button";
import { Users } from "lucide-react";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useBulkAssignVendedor } from "@/hooks/useFaturamento";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
  onSuccess: () => void;
}

export function BulkVendorAssignDialog({ open, onOpenChange, selectedIds, onSuccess }: Props) {
  const [vendedorId, setVendedorId] = useState("");
  const [saleDate, setSaleDate]     = useState("");

  const { data: teamMembers = [] } = useTeamMembers();
  const vendedores = teamMembers.filter(m => m.status === "approved" && m.is_vendedor);

  const assign = useBulkAssignVendedor();

  async function handleConfirm() {
    const vendor = vendedores.find(v => v.id === vendedorId);
    if (!vendor) return;

    await assign.mutateAsync({
      orderIds: selectedIds,
      vendedorId: vendor.id,
      vendedorName: vendor.full_name || vendor.username || vendor.id,
      saleDate: saleDate || undefined,
    });

    onSuccess();
    onOpenChange(false);
    setVendedorId("");
    setSaleDate("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-carbo-green" />
            Atribuir vendedor em massa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span className="font-semibold text-carbo-green">{selectedIds.length}</span> pedido(s) selecionado(s)
          </div>

          <div className="space-y-1.5">
            <Label>Atribuir para o vendedor</Label>
            <Select value={vendedorId} onValueChange={setVendedorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um vendedor..." />
              </SelectTrigger>
              <SelectContent>
                {vendedores.map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.full_name || v.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {vendedores.length === 0 && (
              <p className="text-xs text-amber-500">
                Nenhum vendedor cadastrado. Ative o toggle "É vendedor?" em /team para os membros da equipe.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>
              Data real da venda{" "}
              <span className="text-muted-foreground font-normal">(opcional — aplica a todos)</span>
            </Label>
            <Input
              type="date"
              value={saleDate}
              onChange={e => setSaleDate(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Se preenchida, esta data será usada no cálculo de metas e comissões. Deixe em branco para manter as datas originais.
            </p>
          </div>
        </div>

        <DialogFooter>
          <CarboButton variant="outline" onClick={() => onOpenChange(false)} disabled={assign.isPending}>
            Cancelar
          </CarboButton>
          <CarboButton
            onClick={handleConfirm}
            disabled={!vendedorId || assign.isPending}
          >
            {assign.isPending ? "Atribuindo..." : `Atribuir ${selectedIds.length} pedido(s)`}
          </CarboButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
