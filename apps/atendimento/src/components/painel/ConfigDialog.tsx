import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSalvarConfigAtendimento, type PainelConfig } from "@/hooks/usePainelAtendimento";
import { DIAS_CURTOS, hhmm } from "@/lib/painelAtendimento";

function Campo({ id, rotulo, sufixo, valor, onChange, min, max }: {
  id: string; rotulo: string; sufixo: string; valor: string; onChange: (v: string) => void; min: number; max: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{rotulo}</Label>
      <div className="relative">
        <Input id={id} type="number" inputMode="numeric" min={min} max={max} value={valor}
          onChange={(e) => onChange(e.target.value)} className="pr-12 tabular-nums" />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{sufixo}</span>
      </div>
    </div>
  );
}

export function ConfigDialog({ aberto, onAberto, config }: { aberto: boolean; onAberto: (v: boolean) => void; config: PainelConfig }) {
  const salvar = useSalvarConfigAtendimento();
  const [ini, setIni] = useState(hhmm(config.hora_inicio));
  const [fim, setFim] = useState(hhmm(config.hora_fim));
  const [dias, setDias] = useState<number[]>(config.dias);
  const [metaMin, setMetaMin] = useState(String(config.meta_resposta_min));
  const [metaSla, setMetaSla] = useState(String(config.meta_sla_pct));
  const [metaTaxa, setMetaTaxa] = useState(String(config.meta_taxa_resposta_pct));

  // Abrir de novo parte do que está gravado, não do rascunho da última vez.
  useEffect(() => {
    if (!aberto) return;
    setIni(hhmm(config.hora_inicio)); setFim(hhmm(config.hora_fim)); setDias(config.dias);
    setMetaMin(String(config.meta_resposta_min)); setMetaSla(String(config.meta_sla_pct));
    setMetaTaxa(String(config.meta_taxa_resposta_pct));
  }, [aberto, config]);

  const inteiro = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);
  const nMin = inteiro(metaMin), nSla = inteiro(metaSla), nTaxa = inteiro(metaTaxa);
  const erro =
    !ini || !fim ? "Informe o horário."
    : fim <= ini ? "O fim tem de ser depois do início."
    : dias.length === 0 ? "Escolha ao menos um dia."
    : !(nMin >= 1 && nMin <= 1440) ? "Meta de 1ª resposta entre 1 e 1440 min."
    : !(nSla >= 1 && nSla <= 100) ? "Meta de SLA entre 1% e 100%."
    : !(nTaxa >= 1 && nTaxa <= 100) ? "Meta de taxa de resposta entre 1% e 100%."
    : null;

  const alternarDia = (d: number) => setDias((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort((a, b) => a - b)));

  const enviar = () => {
    if (erro) return;
    salvar.mutate(
      { hora_inicio: ini, hora_fim: fim, dias, meta_resposta_min: nMin, meta_sla_pct: nSla, meta_taxa_resposta_pct: nTaxa },
      {
        onSuccess: () => { toast.success("Horário e metas salvos"); onAberto(false); },
        onError: (e) => toast.error((e as { message?: string })?.message ?? "Não foi possível salvar"),
      },
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Horário e metas</DialogTitle></DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Horário de atendimento</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-ini" className="text-xs">Início</Label>
                <Input id="cfg-ini" type="time" value={ini} onChange={(e) => setIni(e.target.value)} className="tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-fim" className="text-xs">Fim</Label>
                <Input id="cfg-fim" type="time" value={fim} onChange={(e) => setFim(e.target.value)} className="tabular-nums" />
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {DIAS_CURTOS.map((r, i) => {
                const d = i + 1, on = dias.includes(d);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => alternarDia(d)}
                    className={cn("h-9 rounded-md border text-xs font-medium transition-colors",
                      on ? "border-foreground/30 bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}>
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Metas</p>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
              <Campo id="cfg-meta-min" rotulo="1ª resposta em até" sufixo="min" valor={metaMin} onChange={setMetaMin} min={1} max={1440} />
              <Campo id="cfg-meta-sla" rotulo="Dentro da meta" sufixo="%" valor={metaSla} onChange={setMetaSla} min={1} max={100} />
              <Campo id="cfg-meta-taxa" rotulo="Taxa de resposta" sufixo="%" valor={metaTaxa} onChange={setMetaTaxa} min={1} max={100} />
            </div>
          </div>

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onAberto(false)}>Cancelar</Button>
          <Button onClick={enviar} disabled={!!erro || salvar.isPending}>
            {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
