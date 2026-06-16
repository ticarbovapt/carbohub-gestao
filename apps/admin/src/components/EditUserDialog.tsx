import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, X, Pencil, KeyRound, Copy, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SYSTEMS } from "@/lib/interfaces";
import { useDeptFunctions, useUpdateUser, useSetIsVendedor, useResetPassword, useDeleteUser, type AdminProfile } from "@/hooks/useAdminUsers";
import { useDepartments } from "@/hooks/useStructure";

const DEFAULT_PASSWORD = "Carbo@2026";

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
  const setIsVendedor = useSetIsVendedor();
  const resetPwd = useResetPassword();
  const deleteUser = useDeleteUser();
  const { data: DEPTS = [] } = useDepartments();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [funcao, setFuncao] = useState("");
  const [secDepartment, setSecDepartment] = useState("");
  const [secFuncao, setSecFuncao] = useState("");
  const [escopo, setEscopo] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [interfaces, setInterfaces] = useState<string[]>([]);
  const [isVendedor, setIsVendedorState] = useState(false);

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
    setIsVendedorState(!!user.is_vendedor);
    setConfirmReset(false);
    setResetDone(false);
    setConfirmDelete(false);
  }, [user]);

  async function handleReset() {
    if (!user) return;
    try {
      const msg = await resetPwd.mutateAsync(user.id);
      setResetDone(true);
      setConfirmReset(false);
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao resetar senha");
    }
  }

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
      // Flag de vendedor via RPC dedicada (só altera se mudou).
      if (isVendedor !== !!user.is_vendedor) {
        await setIsVendedor.mutateAsync({ userId: user.id, value: isVendedor });
      }
      toast.success("Usuário atualizado!");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function handleDelete() {
    if (!user) return;
    try {
      await deleteUser.mutateAsync(user.id);
      toast.success("Usuário apagado e vaga liberada.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao apagar usuário");
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

        <p className="text-xs text-muted-foreground mb-3">
          <span className="font-mono">{user.username}</span> — o username não muda.
        </p>

        {/* Resetar senha — devolve a senha padrão (1º acesso / esqueceu a senha) */}
        <div className="mb-4 rounded-xl border bg-muted/30 p-3">
          {resetDone ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-emerald-600">Senha redefinida!</p>
              <p className="text-xs text-muted-foreground">Passe as credenciais ao colaborador:</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <code className="font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded">{user.username}</code>
                <code className="font-mono font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded">{DEFAULT_PASSWORD}</code>
                <button type="button"
                  onClick={() => { navigator.clipboard.writeText(`Usuário: ${user.username}\nSenha: ${DEFAULT_PASSWORD}`); toast.success("Credenciais copiadas!"); }}
                  className="p-1 rounded hover:bg-muted" title="Copiar">
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>
          ) : confirmReset ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                A senha vai voltar para <code className="font-mono">{DEFAULT_PASSWORD}</code>. Confirmar?
              </p>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)} disabled={resetPwd.isPending}>Cancelar</Button>
                <Button size="sm" className="bg-amber-600 text-white hover:bg-amber-600/90" onClick={handleReset} disabled={resetPwd.isPending}>
                  {resetPwd.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Resetar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm flex items-center gap-1.5"><KeyRound className="h-4 w-4 text-muted-foreground" /> Resetar senha de acesso</span>
              <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>Resetar</Button>
            </div>
          )}
        </div>

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

          {/* É vendedor? — entra no quadro de Metas do Carbo Sales */}
          <label className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer bg-muted/30">
            <input type="checkbox" className="h-4 w-4 mt-0.5 accent-primary"
              checked={isVendedor} onChange={(e) => setIsVendedorState(e.target.checked)} />
            <span>
              <span className="text-sm font-medium">É vendedor?</span>
              <span className="block text-xs text-muted-foreground">Marca o usuário como vendedor — passa a aparecer no quadro de Metas e nos rankings do Carbo Sales.</span>
            </span>
          </label>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1 carbo-gradient text-white" disabled={!canSave || updateUser.isPending}
              onClick={handleSave}>
              {updateUser.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                : <><Save className="h-4 w-4" /> Salvar</>}
            </Button>
          </div>

          {/* Zona de perigo — apagar usuário e liberar a vaga */}
          <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 text-sm font-medium text-destructive hover:underline"
              >
                <Trash2 className="h-4 w-4" /> Apagar usuário e liberar a vaga
              </button>
            ) : (
              <div className="space-y-2.5">
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Isso apaga <span className="font-semibold">{user.full_name || user.username}</span> de
                    vez (login, acesso e vínculos). Não dá pra desfazer.
                  </span>
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1"
                    onClick={() => setConfirmDelete(false)} disabled={deleteUser.isPending}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" size="sm" className="flex-1"
                    onClick={handleDelete} disabled={deleteUser.isPending}>
                    {deleteUser.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Apagando...</>
                      : <><Trash2 className="h-4 w-4" /> Apagar de vez</>}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
