import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  UserPlus, Loader2, Copy, CheckCircle2, KeyRound, ShieldCheck, LogOut, Users as UsersIcon, Pencil,
  Search, ListTree,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEPARTMENT_CONFIGS, getDeptLabel } from "@/constants/departments";
import { SYSTEMS, DEFAULT_INTERFACES } from "@/lib/interfaces";
import { useProfiles, useCreateUser, useDeptFunctions, useAllDeptFunctions, type AdminProfile } from "@/hooks/useAdminUsers";
import { EditUserDialog } from "@/components/EditUserDialog";
import { ManageFunctionsDialog } from "@/components/ManageFunctionsDialog";
import { isManager, fnKey, type FnAccessMap } from "@/lib/access";

const DEFAULT_PASSWORD = "Carbo@2026";
const DEPTS = [...DEPARTMENT_CONFIGS].sort((a, b) => a.order - b.order);

const selectCls =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export default function Users() {
  const { profile, signOut } = useAuth();
  const { data: profiles = [], isLoading: loadingList } = useProfiles();
  const createUser = useCreateUser();

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [funcao, setFuncao] = useState("");
  const [secDepartment, setSecDepartment] = useState("");
  const [secFuncao, setSecFuncao] = useState("");
  const [escopo, setEscopo] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [interfaces, setInterfaces] = useState<string[]>(DEFAULT_INTERFACES);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [editing, setEditing] = useState<AdminProfile | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");

  const { data: deptFunctions = [] } = useDeptFunctions(department || undefined);
  const { data: secFunctions = [] } = useDeptFunctions(secDepartment || undefined);
  const { data: allFunctions = [] } = useAllDeptFunctions();
  const approved = useMemo(() => profiles.filter((p) => p.status === "approved" && p.full_name), [profiles]);

  // Mapa `${dept}:${funcao}` → nível, pra calcular Gestor/Membro na lista.
  const fnMap = useMemo<FnAccessMap>(() => {
    const m: FnAccessMap = {};
    for (const f of allFunctions) m[fnKey(f.department, f.function_key)] = f.access_level;
    return m;
  }, [allFunctions]);

  const fnLabel = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const f of allFunctions) m[fnKey(f.department, f.function_key)] = f.label;
    return m;
  }, [allFunctions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (deptFilter && p.department !== deptFilter) return false;
      if (!q) return true;
      return (p.full_name ?? "").toLowerCase().includes(q) || (p.username ?? "").toLowerCase().includes(q);
    });
  }, [profiles, search, deptFilter]);

  const selectedFn = deptFunctions.find((f) => f.function_key === funcao);
  const canSubmit = fullName.trim().length > 0 && department !== "" && interfaces.length > 0;

  function toggleInterface(iface: string) {
    setInterfaces((prev) => prev.includes(iface) ? prev.filter((i) => i !== iface) : [...prev, iface]);
  }

  function resetForm() {
    setFullName(""); setDepartment(""); setFuncao(""); setSecDepartment(""); setSecFuncao("");
    setEscopo(""); setManagerUserId(""); setInterfaces(DEFAULT_INTERFACES);
  }

  async function handleSubmit() {
    try {
      const result = await createUser.mutateAsync({
        fullName, department,
        // app_role legado não governa mais o acesso (quem manda = head/command/TI,
        // derivado do perfil). Enviamos 'operator' só porque a edge function
        // ainda grava user_roles; o valor é irrelevante para o modelo novo.
        role: "operator",
        funcao: funcao || undefined,
        secondaryDepartment: secDepartment || undefined,
        secondaryFuncao: secFuncao || undefined,
        escopo: escopo || undefined,
        managerUserId: managerUserId || undefined,
        allowedInterfaces: interfaces,
      });
      setCredentials({ username: result.username, password: DEFAULT_PASSWORD });
      resetForm();
      toast.success("Usuário criado com sucesso!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar usuário");
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl carbo-gradient flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold leading-none">Carbo Admin</p>
              <p className="text-xs text-muted-foreground">Identidades e acessos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {profile?.full_name ?? profile?.username}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* ── Criar usuário ── */}
        <section className="rounded-2xl border bg-card p-5 h-fit">
          <h2 className="flex items-center gap-2 font-semibold text-lg mb-4">
            <UserPlus className="h-5 w-5 text-primary" /> Criar usuário
          </h2>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome completo *</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex: João Silva" />
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

            {/* Explica o acesso da função escolhida */}
            {selectedFn && (
              <p className="text-xs flex items-center gap-1.5 -mt-1">
                <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                  selectedFn.access_level === "gestor"
                    ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                  {selectedFn.access_level === "gestor" ? "Gestor" : "Colaborador"}
                </span>
                <span className="text-muted-foreground">
                  {selectedFn.access_level === "gestor"
                    ? "vê o global do app (manda)." : "vê só o próprio."}
                </span>
              </p>
            )}

            {/* 2º papel (opcional) — ex.: também é TI. O sistema pega o maior. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">2º Depto <span className="text-xs">(opcional)</span></label>
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
                {approved.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
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
                    <span className="text-muted-foreground text-xs">— {s.hint}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button className="w-full carbo-gradient text-white" disabled={!canSubmit || createUser.isPending}
              onClick={handleSubmit}>
              {createUser.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
                : <><UserPlus className="h-4 w-4" /> Criar usuário</>}
            </Button>

            <p className="text-xs text-muted-foreground">
              Username gerado automaticamente (ex: OPS0001) e senha padrão{" "}
              <code className="font-mono bg-muted px-1 rounded">{DEFAULT_PASSWORD}</code>.
              No 1º acesso o colaborador troca a senha e informa o e-mail real.
            </p>
          </div>
        </section>

        {/* ── Lista de usuários ── */}
        <section className="rounded-2xl border bg-card overflow-hidden h-fit">
          <div className="px-5 py-4 border-b flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">Usuários ({filtered.length})</h2>
            </div>
            <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
              <ListTree className="h-4 w-4" /> Gerenciar funções
            </Button>
          </div>

          {/* Busca + filtro por departamento */}
          <div className="px-5 py-3 border-b flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nome ou usuário..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className={`${selectCls} sm:w-52`} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="">Todos os departamentos</option>
              {DEPTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
          {loadingList ? (
            <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Nome</th>
                    <th className="px-4 py-2.5 font-semibold">Usuário</th>
                    <th className="px-4 py-2.5 font-semibold">Departamento</th>
                    <th className="px-4 py-2.5 font-semibold">Função</th>
                    <th className="px-4 py-2.5 font-semibold">Nível</th>
                    <th className="px-4 py-2.5 font-semibold">Sistemas</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const gestor = isManager(p, fnMap);
                    const funcLabel = fnLabel[fnKey(p.department, p.funcao)] ?? p.funcao;
                    const secLabel = p.secondary_funcao
                      ? fnLabel[fnKey(p.secondary_department, p.secondary_funcao)] ?? p.secondary_funcao
                      : null;
                    return (
                    <tr key={p.id} className="border-t hover:bg-muted/30 cursor-pointer"
                      onClick={() => setEditing(p)}>
                      <td className="px-4 py-2.5 font-medium">{p.full_name ?? "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{p.username ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        {getDeptLabel(p.department)}
                        {p.secondary_department && (
                          <span className="text-xs text-muted-foreground"> + {getDeptLabel(p.secondary_department)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {funcLabel ?? "—"}
                        {secLabel && <span className="text-xs text-muted-foreground"> + {secLabel}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          gestor ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                          {gestor ? "Gestor" : "Membro"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {(p.allowed_interfaces ?? []).map((i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {SYSTEMS.find((s) => s.iface === i)?.label ?? i}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Pencil className="h-4 w-4 text-muted-foreground inline-block" />
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* ── Editar usuário ── */}
      <EditUserDialog user={editing} approved={approved} onClose={() => setEditing(null)} />

      {/* ── Gerenciar funções ── */}
      <ManageFunctionsDialog open={manageOpen} onClose={() => setManageOpen(false)} />

      {/* ── Credenciais (após criar) ── */}
      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setCredentials(null)}>
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold">Conta criada!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Compartilhe as credenciais com o colaborador.
            </p>
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3 my-4 text-left">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5"><KeyRound className="h-4 w-4" /> Username</span>
                <div className="flex items-center gap-2">
                  <code className="font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded">{credentials.username}</code>
                  <button onClick={() => copy(credentials.username, "Username")} className="p-1 rounded hover:bg-muted">
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Senha inicial</span>
                <div className="flex items-center gap-2">
                  <code className="font-mono font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded">{credentials.password}</code>
                  <button onClick={() => copy(credentials.password, "Senha")} className="p-1 rounded hover:bg-muted">
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>
            <Button className="w-full carbo-gradient text-white" onClick={() => setCredentials(null)}>Concluir</Button>
          </div>
        </div>
      )}
    </div>
  );
}
