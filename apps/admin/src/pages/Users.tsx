import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  UserPlus, Loader2, Copy, CheckCircle2, KeyRound, ShieldCheck, LogOut, Users as UsersIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEPARTMENT_CONFIGS, getDeptLabel } from "@/constants/departments";
import { SYSTEMS, DEFAULT_INTERFACES } from "@/lib/interfaces";
import { useProfiles, useDeptFunctions, useCreateUser } from "@/hooks/useAdminUsers";

const DEFAULT_PASSWORD = "Carbo@2026";
const DEPTS = [...DEPARTMENT_CONFIGS].sort((a, b) => a.order - b.order);
const ROLES = [
  { value: "operator", label: "Operador" },
  { value: "manager", label: "Gestor" },
  { value: "admin", label: "Administrador" },
];

const selectCls =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export default function Users() {
  const { profile, signOut } = useAuth();
  const { data: profiles = [], isLoading: loadingList } = useProfiles();
  const createUser = useCreateUser();

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [funcao, setFuncao] = useState("");
  const [escopo, setEscopo] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [role, setRole] = useState("operator");
  const [interfaces, setInterfaces] = useState<string[]>(DEFAULT_INTERFACES);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);

  const { data: deptFunctions = [] } = useDeptFunctions(department || undefined);
  const approved = useMemo(() => profiles.filter((p) => p.status === "approved" && p.full_name), [profiles]);

  const canSubmit = fullName.trim().length > 0 && department !== "" && interfaces.length > 0;

  function toggleInterface(iface: string) {
    setInterfaces((prev) => prev.includes(iface) ? prev.filter((i) => i !== iface) : [...prev, iface]);
  }

  function resetForm() {
    setFullName(""); setDepartment(""); setFuncao(""); setEscopo("");
    setManagerUserId(""); setRole("operator"); setInterfaces(DEFAULT_INTERFACES);
  }

  async function handleSubmit() {
    try {
      const result = await createUser.mutateAsync({
        fullName, department, role,
        funcao: funcao || undefined,
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
              <label className="text-sm font-medium">Nível de acesso</label>
              <select className={selectCls} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
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
          <div className="px-5 py-4 border-b flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Usuários ({profiles.length})</h2>
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
                    <th className="px-4 py-2.5 font-semibold">Sistemas</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{p.full_name ?? "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{p.username ?? "—"}</td>
                      <td className="px-4 py-2.5">{getDeptLabel(p.department)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {(p.allowed_interfaces ?? []).map((i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {SYSTEMS.find((s) => s.iface === i)?.label ?? i}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

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
