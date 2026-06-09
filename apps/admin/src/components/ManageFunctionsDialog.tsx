import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, X, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEPARTMENT_CONFIGS } from "@/constants/departments";
import { useDeptFunctions, useCreateFunction, useDeleteFunction } from "@/hooks/useAdminUsers";

const DEPTS = [...DEPARTMENT_CONFIGS].sort((a, b) => a.order - b.order);
const selectCls =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

interface Props { open: boolean; onClose: () => void; }

// Gerenciar funções de cada departamento (tabela nova carbo_functions).
// O NOME é livre; o NÍVEL (gestor/colaborador) define o que a função enxerga.
export function ManageFunctionsDialog({ open, onClose }: Props) {
  const [department, setDepartment] = useState("");
  const [label, setLabel] = useState("");
  const [accessLevel, setAccessLevel] = useState<"gestor" | "colaborador">("colaborador");

  const { data: functions = [], isLoading } = useDeptFunctions(department || undefined);
  const createFn = useCreateFunction();
  const deleteFn = useDeleteFunction();

  if (!open) return null;

  async function handleAdd() {
    if (!department || !label.trim()) return;
    try {
      await createFn.mutateAsync({ department, label, accessLevel });
      setLabel("");
      setAccessLevel("colaborador");
      toast.success("Função criada!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar função");
    }
  }

  async function handleDelete(id: string, fnLabel: string) {
    if (!confirm(`Apagar a função "${fnLabel}"? Usuários já atribuídos mantêm o registro.`)) return;
    try {
      await deleteFn.mutateAsync(id);
      toast.success("Função removida.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <ListTree className="h-5 w-5 text-primary" /> Gerenciar funções
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-1.5 mb-4">
          <label className="text-sm font-medium">Departamento</label>
          <select className={selectCls} value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Selecione um departamento</option>
            {DEPTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>

        {department && (
          <>
            {/* Lista de funções do departamento */}
            <div className="rounded-xl border divide-y mb-4">
              {isLoading ? (
                <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : functions.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">Nenhuma função ainda.</p>
              ) : (
                functions.map((f) => (
                  <div key={f.id} className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{f.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        f.access_level === "gestor"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {f.access_level === "gestor" ? "Gestor · vê global" : "Colaborador · vê próprio"}
                      </span>
                    </div>
                    <button onClick={() => f.id && handleDelete(f.id, f.label)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="Apagar função">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Adicionar função */}
            <div className="rounded-xl border bg-muted/30 p-3 space-y-2.5">
              <p className="text-sm font-medium">Nova função</p>
              <Input value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: Estagiário de Ops" />
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">O que essa função enxerga?</label>
                <select className={selectCls} value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value as "gestor" | "colaborador")}>
                  <option value="colaborador">Colaborador — vê só o próprio</option>
                  <option value="gestor">Gestor — vê o global (manda)</option>
                </select>
              </div>
              <Button className="w-full carbo-gradient text-white" disabled={!label.trim() || createFn.isPending}
                onClick={handleAdd}>
                {createFn.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
                  : <><Plus className="h-4 w-4" /> Adicionar função</>}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
