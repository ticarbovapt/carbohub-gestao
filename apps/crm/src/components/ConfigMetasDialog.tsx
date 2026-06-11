import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { useUpsertMeta, type MetaVendedor } from "@/hooks/useMetas";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: Date;
  metas: MetaVendedor[];
}

interface Draft { target_amount: string; target_qty: string; }

export function ConfigMetasDialog({ open, onOpenChange, month, metas }: Props) {
  const upsert = useUpsertMeta();
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);

  // Pré-preenche com as metas atuais sempre que abre.
  useEffect(() => {
    if (!open) return;
    const d: Record<string, Draft> = {};
    for (const m of metas) {
      d[m.vendedor_id] = { target_amount: String(m.target_amount || ""), target_qty: String(m.target_qty || "") };
    }
    setDraft(d);
  }, [open, metas]);

  const set = (id: string, patch: Partial<Draft>) =>
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  async function handleSave() {
    setSaving(true);
    const ano = month.getFullYear();
    const mes = month.getMonth() + 1;
    try {
      await Promise.all(metas.map((m) => {
        const d = draft[m.vendedor_id] ?? { target_amount: "", target_qty: "" };
        return upsert.mutateAsync({
          vendedor_id: m.vendedor_id, ano, mes,
          target_amount: Number(d.target_amount) || 0,
          target_qty: Number(d.target_qty) || 0,
        });
      }));
      toast.success("Metas salvas!");
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao salvar metas: " + (e instanceof Error ? e.message : "tente de novo"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-carbo-green" /> Configurar Metas</DialogTitle>
          <DialogDescription className="capitalize">{format(month, "MMMM 'de' yyyy", { locale: ptBR })}</DialogDescription>
        </DialogHeader>

        {metas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum vendedor marcado. Marque "É vendedor?" no Admin para alguém aparecer aqui.
          </p>
        ) : (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-[1fr_120px_90px] gap-2 px-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              <span>Vendedor</span><span className="text-right">Meta (R$)</span><span className="text-right">Qtd</span>
            </div>
            {metas.map((m) => {
              const d = draft[m.vendedor_id] ?? { target_amount: "", target_qty: "" };
              return (
                <div key={m.vendedor_id} className="grid grid-cols-[1fr_120px_90px] gap-2 items-center">
                  <span className="text-sm font-medium truncate">{m.full_name ?? "—"}</span>
                  <Input type="number" min="0" inputMode="numeric" className="h-9 text-right" placeholder="0"
                    value={d.target_amount} onChange={(e) => set(m.vendedor_id, { target_amount: e.target.value })} />
                  <Input type="number" min="0" inputMode="numeric" className="h-9 text-right" placeholder="0"
                    value={d.target_qty} onChange={(e) => set(m.vendedor_id, { target_qty: e.target.value })} />
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving || metas.length === 0} onClick={handleSave}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : "Salvar metas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
