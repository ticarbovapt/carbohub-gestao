import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SYSTEMS } from "@/lib/interfaces";
import { useDeptFunctions, useUpdateUser, type AdminProfile } from "@/hooks/useAdminUsers";
import { useDepartments } from "@/hooks/useStructure";

const selectCls =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

interface Props {
  user: AdminProfile | null;
  approved: AdminProfile[];
  onClose: () => void;
}

// Modal de edição de usuário — mesma lógica do "criar": escolhe departamento,
// as funções daquele departamento aparecem (department_functions).
export function EditUserDialog({ user, approved, onClose }: Props) {
  const updateUser = useUpdateUser();
  const { data: DEPTS = [] } = useDepartments();

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [funcao, setFuncao] = useState("");
  const [secDepartment, setSecDepartment] = useState("");
  const [secFuncao, setSecFuncao] = useState("");
  const [escopo, setEscopo] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [interfaces, setInterfaces] = useState<string[]>([]);

  // Re-hidrata o form sempre que abre com um usuário diferente.
  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name ?? "");
    setDepartment(user.department ?? "");
    setFuncao(user.funcao ?? "");
    setSecDepartment(user.secondary_department ?? "");
    setSecFuncao(user.secondary_funcao ?? "");
    setEscopo(user.escopo ?? "");
    setManagerUserId(user.manager_user_id ?? "");
    setInterfaces(user.allowed_interfaces ?? []);
  }, [user]);

  const { data: deptFunctions = [] } = useDeptFunctions(department || undefined);
  const { data: secFunctions = [] } = useDeptFunctions(secDepartment || undefined);

  if (!user) return null;

  function toggleInterface(iface: string) {
    setInterfaces((prev) => prev.includes(iface) ? prev.filter((i) => i !== iface) : [...prev, iface]);
  }

  const canSave = fullName.trim().length > 0 && department !== "" && interfaces.length > 0;

  async function handleSave() {
    if (!user) return;
    try {
      await updateUser.mutateAsync({
        userId: user.id,
        fullName,
        department,
        funcao: funcao || undefined,
        secondaryDepartment: secDepartment || "",
        secondaryFuncao: secFuncao || "",
        escopo: escopo || undefined,
        managerUserId: managerUserId || undefined,
        allowedInterfaces: interfaces,
      });
      toast.success("Usuário atualizado!");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Pencil className="h-5 w-5 text-primary" /> Editar usuário
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          <span className="font-mono">{user.username}</span> — o username não muda.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nome completo *</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Departamento *</label>
              <select className={selectCls} value={department}
                onChange={(e) => { setDepartment(e.target.value); setFuncao(""); }}>
                <option value="">Selecione</option>
                {DEPTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Função</label>
              <select className={selectCls} value={funcao} disabled={!department}
                onChange={(e) => setFuncao(e.target.value)}>
                <option value="">{department ? "—" : "Dept. primeiro"}</option>
                {deptFunctions.map((f) => <option key={f.function_key} value={f.function_key}>{f.label}</option>)}
              </select>
            </div>
          </div>

          {/* 2º papel (opcional) — ex.: também é TI. O sistema pega o maior. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">2º Departamento <span className="text-xs">(opcional)</span></label>
              <select className={selectCls} value={secDepartment}
                onChange={(e) => { setSecDepartment(e.target.value); setSecFuncao(""); }}>
                <option value="">— Nenhum —</option>
                {DEPTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">2ª Função</label>
              <select className={selectCls} value={secFuncao} disabled={!secDepartment}
                onChange={(e) => setSecFuncao(e.target.value)}>
                <option value="">{secDepartment ? "—" : "Dept. primeiro"}</option>
                {secFunctions.map((f) => <option key={f.function_key} value={f.function_key}>{f.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Escopo / Responsabilidades</label>
            <Input value={escopo} onChange={(e) => setEscopo(e.target.value)} placeholder="Principais atividades" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Superior direto</label>
            <select className={selectCls} value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
              <option value="">— Sem superior —</option>
              {approved.filter((m) => m.id !== user.id)
                .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
                .map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Sistemas liberados *</label>
            <div className="grid gap-1.5 rounded-xl border p-3 bg-muted/30">
              {SYSTEMS.map((s) => (
                <label key={s.iface} className="flex items-center gap-2.5 cursor-pointer text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary"
                    checked={interfaces.includes(s.iface)} onChange={() => toggleInterface(s.iface)} />
                  <span className="font-medium">{s.label}</span>
                  {s.comingSoon && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-medium">Em breve</span>}
                  <span className="text-muted-foreground text-xs">— {s.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1 carbo-gradient text-white" disabled={!canSave || updateUser.isPending}
              onClick={handleSave}>
              {updateUser.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                : <><Save className="h-4 w-4" /> Salvar</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
