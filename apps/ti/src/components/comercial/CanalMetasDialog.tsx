import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCanalMetas, useUpsertCanalMeta } from "@/hooks/useCanalMetas";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; ano: number }

const CANAIS = [
  { key: "consumo", label: "Consumo (B2B)", hint: "vazio = regra automática (mês anterior +15%)" },
  { key: "revenda", label: "Revenda (PDV)", hint: "Nordeste + Sudeste" },
  { key: "online", label: "On-line", hint: "a partir de jul/26" },
] as const;

export function CanalMetasDialog({ open, onOpenChange, ano }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: metas } = useCanalMetas(ano);
  const upsert = useUpsertCanalMeta();
  const [mes, setMes] = useState(() => new Date().getMonth() + 1);
  const [vals, setVals] = useState({ consumo: "", revenda: "", online: "" });

  useEffect(() => {
    setVals({
      consumo: metas?.consumo?.[mes] != null ? String(metas.consumo[mes]) : "",
      revenda: metas?.revenda?.[mes] != null ? String(metas.revenda[mes]) : "",
      online: metas?.online?.[mes] != null ? String(metas.online[mes]) : "",
    });
  }, [mes, metas]);

  const save = async () => {
    let n = 0;
    for (const canal of ["consumo", "revenda", "online"] as const) {
      const raw = vals[canal].trim();
      if (raw === "") continue;
      const valor = Number(raw.replace(/\./g, "").replace(",", "."));
      if (!isFinite(valor) || valor < 0) continue;
      try { await upsert.mutateAsync({ ano, mes, canal, valor, updatedBy: user?.id }); n++; }
      catch (e: any) { toast({ title: "Erro ao salvar meta", description: e?.message, variant: "destructive" }); }
    }
    if (n > 0) toast({ title: "Metas atualizadas!" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Metas por Canal — {ano}</DialogTitle>
          <DialogDescription>Defina a meta mensal de cada canal. Salva apenas os campos preenchidos.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Mês</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>{format(new Date(ano, m - 1, 1), "MMMM 'de' yyyy", { locale: ptBR })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {CANAIS.map((c) => (
            <div key={c.key} className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                {c.label}<span className="text-[10px] text-muted-foreground font-normal">— {c.hint}</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                <Input inputMode="decimal" className="pl-8 h-9"
                  placeholder={c.key === "consumo" ? "automático" : "0,00"}
                  value={vals[c.key]} onChange={(e) => setVals((p) => ({ ...p, [c.key]: e.target.value }))} />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>Cancelar</Button>
          <Button onClick={save} disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar metas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
