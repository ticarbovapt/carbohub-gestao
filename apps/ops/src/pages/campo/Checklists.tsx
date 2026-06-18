import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { UserCheck, CheckCircle2, Circle, ChevronRight, Plus, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ChecklistDialog } from "@/components/campo/ChecklistDialog";
import { ChecklistFormDialog } from "@/components/campo/ChecklistFormDialog";
import { DeleteConfirmDialog } from "@/components/producao/DeleteConfirmDialog";
import { useChecklists, useChecklistMutations, type Checklist } from "@/hooks/useChecklists";

const DEPARTAMENTOS = [
  { key: "preparacao", label: "Preparação" },
  { key: "operacao", label: "Operação" },
  { key: "expedicao", label: "Expedição" },
  { key: "pos_venda", label: "Pós-Venda" },
];

export default function Checklists() {
  const { data: checklists = [], isLoading } = useChecklists();
  const { remove } = useChecklistMutations();
  const [dep, setDep] = useState("preparacao");
  const [openChecklist, setOpenChecklist] = useState<Checklist | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteChecklist, setDeleteChecklist] = useState<Checklist | null>(null);
  const lists = checklists.filter((c) => c.departamento === dep);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1200px] mx-auto">
        <CarboPageHeader
          title="Checklists"
          description="Carbo Check — checklists operacionais por departamento"
          icon={UserCheck}
          actions={<Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo Checklist</Button>}
        />

        {/* Seletor de departamento */}
        <div className="flex gap-1.5 flex-wrap">
          {DEPARTAMENTOS.map((d) => (
            <button key={d.key} onClick={() => setDep(d.key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${dep === d.key ? "bg-carbo-green text-white" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}>{d.label}</button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
        ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lists.map((c) => {
            const done = c.etapas.filter((e) => e.concluida).length;
            const total = c.etapas.length;
            const pct = total ? Math.round((done / total) * 100) : 0;
            const completo = total > 0 && done === total;
            return (
              <CarboCard key={c.id}>
                <CarboCardContent className="p-4">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <h3 className="font-semibold text-sm">{c.nome}</h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <CarboBadge variant={completo ? "success" : "warning"} size="sm">{done}/{total}</CarboBadge>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteChecklist(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
                    <div className={cn("h-full rounded-full transition-all", completo ? "bg-success" : "bg-carbo-green")} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="space-y-1.5">
                    {c.etapas.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {e.concluida ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                        <span className={cn(e.concluida && "text-muted-foreground line-through")}>{e.nome}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setOpenChecklist(c)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    Abrir checklist <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </CarboCardContent>
              </CarboCard>
            );
          })}
          {lists.length === 0 && <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground"><UserCheck className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Nenhum checklist neste departamento</p></CarboCardContent></CarboCard>}
        </div>
        )}
      </div>

      <ChecklistDialog
        open={openChecklist !== null}
        onOpenChange={(o) => { if (!o) setOpenChecklist(null); }}
        checklist={openChecklist}
      />
      <ChecklistFormDialog open={createOpen} onOpenChange={setCreateOpen} defaultDepartamento={dep} />
      <DeleteConfirmDialog
        open={deleteChecklist !== null}
        onOpenChange={(v) => { if (!v) setDeleteChecklist(null); }}
        title="Excluir checklist?"
        description={`O checklist "${deleteChecklist?.nome ?? ""}" será excluído permanentemente.`}
        onConfirm={deleteChecklist ? async () => {
          try { await remove.mutateAsync(deleteChecklist.id); toast.success("Checklist excluído."); setDeleteChecklist(null); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível excluir."); }
        } : undefined}
      />
    </div>
  );
}
