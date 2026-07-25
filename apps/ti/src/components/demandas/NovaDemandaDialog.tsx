import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCriarDemanda, useAllProfiles, type BugKind } from "@/hooks/useBugReports";
import { BLOQUEIOS, ALCANCES, calcPriority, prioOf } from "@/lib/demandas";

const APPS = ["sales", "ops", "admin", "financas", "mkt", "lojas", "licenciados", "ti", "outro"];

/**
 * Registrar uma demanda que chegou fora do botão de bug (telefone, pessoalmente,
 * no corredor). Sem isso o TI precisava se passar pelo solicitante.
 */
export function NovaDemandaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const criar = useCriarDemanda();
  const { data: dir = [] } = useAllProfiles();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<BugKind>("bug");
  const [app, setApp] = useState("sales");
  const [reporter, setReporter] = useState("__none__");
  const [bloqueio, setBloqueio] = useState("__none__");
  const [alcance, setAlcance] = useState("__none__");

  const prioridade = calcPriority(
    bloqueio === "__none__" ? null : bloqueio,
    alcance === "__none__" ? null : alcance,
  );

  function reset() {
    setTitle(""); setDescription(""); setKind("bug"); setApp("sales");
    setReporter("__none__"); setBloqueio("__none__"); setAlcance("__none__");
  }

  function submit() {
    if (!title.trim() || !description.trim()) return;
    const pes = reporter === "__none__" ? null : dir.find((x) => x.id === reporter);
    criar.mutate({
      title: title.trim(), description: description.trim(), kind, app,
      priority: prioridade,
      reporter_id: pes?.id ?? null,
      reporter_name: pes?.full_name ?? null,
      department: pes?.department ?? null,
      bloqueio: bloqueio === "__none__" ? null : bloqueio,
      pessoas_afetadas: alcance === "__none__" ? null : alcance,
    }, { onSuccess: () => { reset(); onClose(); } });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova demanda</DialogTitle>
          <DialogDescription>Para registrar o que chegou por fora do botão de reporte.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Assunto *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resumo em uma linha" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="O que acontece, em qual tela, o que era esperado…"
              className="min-h-[90px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as BugKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="sugestao">Sugestão</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sistema</Label>
              <Select value={app} onValueChange={setApp}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPS.map((a) => <SelectItem key={a} value={a} className="uppercase">{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Quem pediu</Label>
            <Select value={reporter} onValueChange={setReporter}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Não informar</SelectItem>
                {dir.map((x) => <SelectItem key={x.id} value={x.id}>{x.full_name || "—"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Impacto → prioridade calculada (a mesma régua do banco) */}
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Impacto</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Impede de trabalhar?</Label>
                <Select value={bloqueio} onValueChange={setBloqueio}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não informado</SelectItem>
                    {BLOQUEIOS.map((b) => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Afeta quem?</Label>
                <Select value={alcance} onValueChange={setAlcance}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não informado</SelectItem>
                    {ALCANCES.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Prioridade sugerida:{" "}
              <strong className="text-foreground">{prioridade ? prioOf(prioridade).label : "a triar"}</strong>
              {" "}— dá pra ajustar depois no card.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button onClick={submit} disabled={!title.trim() || !description.trim() || criar.isPending}>
            {criar.isPending ? "Criando…" : "Criar demanda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
