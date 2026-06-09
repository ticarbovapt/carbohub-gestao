import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil, Check, X, Building2, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment, useUpdateFunction,
} from "@/hooks/useStructure";
import { useDeptFunctions, useCreateFunction, useDeleteFunction } from "@/hooks/useAdminUsers";

const selectCls =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const NivelBadge = ({ level }: { level: "gestor" | "colaborador" }) => (
  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
    level === "gestor" ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"}`}>
    {level === "gestor" ? "Gestor · vê global" : "Colaborador · vê próprio"}
  </span>
);

export default function Structure() {
  const { data: departments = [], isLoading: loadingDepts } = useDepartments();
  const [selectedDept, setSelectedDept] = useState<string>("");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 grid gap-6 lg:grid-cols-2">
      <DepartmentsPanel
        departments={departments}
        loading={loadingDepts}
        selectedKey={selectedDept}
        onSelect={setSelectedDept}
      />
      <FunctionsPanel department={selectedDept} />
    </div>
  );
}

// ── Departamentos ────────────────────────────────────────────────────────────
function DepartmentsPanel({
  departments, loading, selectedKey, onSelect,
}: {
  departments: ReturnType<typeof useDepartments>["data"] & object;
  loading: boolean;
  selectedKey: string;
  onSelect: (k: string) => void;
}) {
  const createDept = useCreateDepartment();
  const updateDept = useUpdateDepartment();
  const deleteDept = useDeleteDepartment();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [eLabel, setELabel] = useState("");
  const [eSigla, setESigla] = useState("");
  const [eColor, setEColor] = useState("#64748b");

  const [nLabel, setNLabel] = useState("");
  const [nSigla, setNSigla] = useState("");
  const [nColor, setNColor] = useState("#6366f1");

  async function add() {
    if (!nLabel.trim() || !nSigla.trim()) return;
    try {
      await createDept.mutateAsync({ label: nLabel, sigla: nSigla, color: nColor });
      setNLabel(""); setNSigla("");
      toast.success("Departamento criado!");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function saveEdit(id: string) {
    try {
      await updateDept.mutateAsync({ id, label: eLabel, sigla: eSigla, color: eColor });
      setEditingId(null);
      toast.success("Departamento atualizado!");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Remover o departamento "${label}"? Usuários já atribuídos mantêm o registro.`)) return;
    try { await deleteDept.mutateAsync(id); toast.success("Departamento removido."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  return (
    <section className="rounded-2xl border bg-card overflow-hidden h-fit">
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">Departamentos</h2>
      </div>

      <div className="divide-y">
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : departments.map((d) => (
          editingId === d.id ? (
            <div key={d.id} className="p-3 space-y-2 bg-muted/30">
              <div className="flex gap-2">
                <Input value={eLabel} onChange={(e) => setELabel(e.target.value)} placeholder="Nome" />
                <Input value={eSigla} onChange={(e) => setESigla(e.target.value)} placeholder="Sigla" className="w-24" />
                <input type="color" value={eColor} onChange={(e) => setEColor(e.target.value)}
                  className="h-10 w-12 rounded-lg border cursor-pointer" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 carbo-gradient text-white" disabled={updateDept.isPending}
                  onClick={() => saveEdit(d.id)}><Check className="h-4 w-4" /> Salvar</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          ) : (
            <div key={d.id}
              className={`flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 ${
                selectedKey === d.key ? "bg-primary/5" : ""}`}
              onClick={() => onSelect(d.key)}>
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                <span className="text-sm font-medium">{d.label}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{d.sigla}</span>
              </div>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button className="p-1.5 rounded hover:bg-muted"
                  onClick={() => { setEditingId(d.id); setELabel(d.label); setESigla(d.sigla); setEColor(d.color); }}>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                  onClick={() => remove(d.id, d.label)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        ))}
      </div>

      {/* Novo departamento */}
      <div className="p-3 border-t bg-muted/20 space-y-2">
        <p className="text-sm font-medium">Novo departamento</p>
        <div className="flex gap-2">
          <Input value={nLabel} onChange={(e) => setNLabel(e.target.value)} placeholder="Nome (ex: Marketing)" />
          <Input value={nSigla} onChange={(e) => setNSigla(e.target.value)} placeholder="Sigla" className="w-24" />
          <input type="color" value={nColor} onChange={(e) => setNColor(e.target.value)}
            className="h-10 w-12 rounded-lg border cursor-pointer" />
        </div>
        <Button className="w-full carbo-gradient text-white" disabled={!nLabel.trim() || !nSigla.trim() || createDept.isPending}
          onClick={add}>
          {createDept.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</> : <><Plus className="h-4 w-4" /> Adicionar departamento</>}
        </Button>
        <p className="text-xs text-muted-foreground">A sigla vira o prefixo do username (ex: MKT0001).</p>
      </div>
    </section>
  );
}

// ── Funções do departamento selecionado ──────────────────────────────────────
function FunctionsPanel({ department }: { department: string }) {
  const { data: functions = [], isLoading } = useDeptFunctions(department || undefined);
  const createFn = useCreateFunction();
  const updateFn = useUpdateFunction();
  const deleteFn = useDeleteFunction();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [eLabel, setELabel] = useState("");
  const [eLevel, setELevel] = useState<"gestor" | "colaborador">("colaborador");

  const [nLabel, setNLabel] = useState("");
  const [nLevel, setNLevel] = useState<"gestor" | "colaborador">("colaborador");

  async function add() {
    if (!department || !nLabel.trim()) return;
    try {
      await createFn.mutateAsync({ department, label: nLabel, accessLevel: nLevel });
      setNLabel(""); setNLevel("colaborador");
      toast.success("Função criada!");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function saveEdit(id: string) {
    try {
      await updateFn.mutateAsync({ id, label: eLabel, accessLevel: eLevel });
      setEditingId(null);
      toast.success("Função atualizada!");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Apagar a função "${label}"? Usuários já atribuídos mantêm o registro.`)) return;
    try { await deleteFn.mutateAsync(id); toast.success("Função removida."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  return (
    <section className="rounded-2xl border bg-card overflow-hidden h-fit">
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <ListTree className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">Funções {department && <span className="text-muted-foreground font-normal">do departamento</span>}</h2>
      </div>

      {!department ? (
        <p className="p-8 text-sm text-muted-foreground text-center">
          Selecione um departamento à esquerda para gerenciar suas funções.
        </p>
      ) : (
        <>
          <div className="divide-y">
            {isLoading ? (
              <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : functions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">Nenhuma função ainda.</p>
            ) : functions.map((f) => (
              editingId === f.id ? (
                <div key={f.id} className="p-3 space-y-2 bg-muted/30">
                  <Input value={eLabel} onChange={(e) => setELabel(e.target.value)} placeholder="Nome da função" />
                  <select className={selectCls} value={eLevel} onChange={(e) => setELevel(e.target.value as "gestor" | "colaborador")}>
                    <option value="colaborador">Colaborador — vê só o próprio</option>
                    <option value="gestor">Gestor — vê o global (manda)</option>
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 carbo-gradient text-white" disabled={updateFn.isPending}
                      onClick={() => f.id && saveEdit(f.id)}><Check className="h-4 w-4" /> Salvar</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                  </div>
                </div>
              ) : (
                <div key={f.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{f.label}</span>
                    <NivelBadge level={f.access_level} />
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 rounded hover:bg-muted"
                      onClick={() => { setEditingId(f.id ?? null); setELabel(f.label); setELevel(f.access_level); }}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                      onClick={() => f.id && remove(f.id, f.label)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>

          {/* Nova função */}
          <div className="p-3 border-t bg-muted/20 space-y-2">
            <p className="text-sm font-medium">Nova função</p>
            <Input value={nLabel} onChange={(e) => setNLabel(e.target.value)} placeholder="Ex: Estagiário de Ops" />
            <select className={selectCls} value={nLevel} onChange={(e) => setNLevel(e.target.value as "gestor" | "colaborador")}>
              <option value="colaborador">Colaborador — vê só o próprio</option>
              <option value="gestor">Gestor — vê o global (manda)</option>
            </select>
            <Button className="w-full carbo-gradient text-white" disabled={!nLabel.trim() || createFn.isPending} onClick={add}>
              {createFn.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</> : <><Plus className="h-4 w-4" /> Adicionar função</>}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
