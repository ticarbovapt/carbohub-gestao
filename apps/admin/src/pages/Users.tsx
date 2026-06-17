import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  UserPlus, Loader2, Copy, CheckCircle2, KeyRound, Users as UsersIcon, Pencil, Search, Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { SYSTEMS, DEFAULT_INTERFACES, brandOf } from "@/lib/interfaces";
import { useProfiles, useCreateUser, useDeptFunctions, useAllDeptFunctions, type AdminProfile } from "@/hooks/useAdminUsers";
import { useDepartments } from "@/hooks/useStructure";
import { EditUserDialog } from "@/components/EditUserDialog";
import { isManager, fnKey, type FnAccessMap } from "@/lib/access";

const DEFAULT_PASSWORD = "Carbo@2026";

const selectCls =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Chips dos apps liberados — padronizados por cor, com overflow "+N". */
function SystemsChips({ ifaces }: { ifaces: string[] }) {
  if (!ifaces.length) return <span className="text-xs text-muted-foreground">—</span>;
  const shown = ifaces.slice(0, 3);
  const rest = ifaces.slice(3);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((i) => {
        const b = brandOf(i);
        return (
          <span key={i} className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${b.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${b.dot}`} /> {b.short}
          </span>
        );
      })}
      {rest.length > 0 && (
        <span title={rest.map((i) => brandOf(i).short).join(", ")}
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground ring-1 ring-inset ring-border">
          +{rest.length}
        </span>
      )}
    </div>
  );
}

/** Selo de nível (Gestor / Membro). */
function NivelBadge({ gestor }: { gestor: boolean }) {
  return gestor ? (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-600">
      <Crown className="h-3 w-3" /> Gestor
    </span>
  ) : (
    <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
      Membro
    </span>
  );
}

export default function Users() {
  const { data: profiles = [], isLoading: loadingList } = useProfiles();
  const { data: departments = [] } = useDepartments();
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
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");

  const deptLabel = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const d of departments) m[d.key] = d.label;
    return m;
  }, [departments]);
  const getDept = (k?: string | null) => (k ? deptLabel[k] ?? k : "—");

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

  // Linhas enriquecidas (reaproveitadas pela tabela e pelos cartões do mobile).
  const rows = useMemo(() => filtered.map((p) => ({
    p,
    gestor: isManager(p, fnMap),
    funcLabel: fnLabel[fnKey(p.department, p.funcao)] ?? p.funcao,
    secLabel: p.secondary_funcao
      ? fnLabel[fnKey(p.secondary_department, p.secondary_funcao)] ?? p.secondary_funcao
      : null,
  })), [filtered, fnMap, fnLabel]);

  const gestoresCount = useMemo(() => rows.filter((r) => r.gestor).length, [rows]);
  const appCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of filtered) for (const i of (p.allowed_interfaces ?? [])) m[i] = (m[i] ?? 0) + 1;
    return m;
  }, [filtered]);

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
      setCreateOpen(false);
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
    <>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
        {/* ── Cabeçalho ── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <UsersIcon className="h-6 w-6 text-primary" /> Usuários
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gerencie acessos, departamentos e funções da equipe.
            </p>
          </div>
          <Button className="carbo-gradient text-white shadow-sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" /> Criar usuário
          </Button>
        </div>

        {/* ── Resumo (chips) ── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-card border">
            <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" /> {filtered.length} usuários
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <Crown className="h-3.5 w-3.5" /> {gestoresCount} gestores
          </span>
          <span className="h-4 w-px bg-border mx-1 hidden sm:block" />
          {SYSTEMS.filter((s) => appCounts[s.iface]).map((s) => {
            const b = brandOf(s.iface);
            return (
              <span key={s.iface} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${b.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${b.dot}`} /> {b.short} · {appCounts[s.iface]}
              </span>
            );
          })}
        </div>

        {/* ── Lista de usuários ── */}
        <section className="rounded-2xl border bg-card overflow-hidden">
          {/* Busca + filtro por departamento */}
          <div className="px-4 sm:px-5 py-3 border-b flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nome ou usuário..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className={`${selectCls} sm:w-52`} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="">Todos os departamentos</option>
              {departments.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>

          {loadingList ? (
            <div className="divide-y">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-md hidden sm:block" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Nenhum usuário encontrado</p>
              <p className="text-sm text-muted-foreground mt-0.5">Ajuste a busca ou o filtro de departamento.</p>
            </div>
          ) : (
            <>
              {/* Desktop: tabela refinada */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Usuário</th>
                      <th className="px-4 py-3 font-semibold">Departamento</th>
                      <th className="px-4 py-3 font-semibold">Função</th>
                      <th className="px-4 py-3 font-semibold">Nível</th>
                      <th className="px-4 py-3 font-semibold">Sistemas</th>
                      <th className="px-5 py-3 font-semibold text-right">Editar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ p, gestor, funcLabel, secLabel }) => (
                      <tr key={p.id}
                        className="border-t border-border/60 odd:bg-muted/[0.12] hover:bg-muted/50 cursor-pointer transition-colors group"
                        onClick={() => setEditing(p)}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <ProfileAvatar userId={p.id} avatarUrl={p.avatar_url} fullName={p.full_name} size={40}
                              className={gestor ? "ring-2 ring-amber-400/70" : "ring-1 ring-border"} />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{p.full_name ?? "—"}</p>
                              <p className="font-mono text-xs text-muted-foreground">{p.username ?? "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                            <span>{getDept(p.department)}</span>
                          </div>
                          {p.secondary_department && (
                            <span className="text-xs text-muted-foreground pl-3">+ {getDept(p.secondary_department)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span>{funcLabel ?? "—"}</span>
                          {secLabel && <span className="block text-xs text-muted-foreground">+ {secLabel}</span>}
                        </td>
                        <td className="px-4 py-3"><NivelBadge gestor={gestor} /></td>
                        <td className="px-4 py-3"><SystemsChips ifaces={p.allowed_interfaces ?? []} /></td>
                        <td className="px-5 py-3 text-right">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground group-hover:bg-background group-hover:text-primary transition-colors">
                            <Pencil className="h-4 w-4" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: cartões */}
              <div className="md:hidden divide-y">
                {rows.map(({ p, gestor, funcLabel, secLabel }) => (
                  <button key={p.id} onClick={() => setEditing(p)}
                    className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/40 transition-colors">
                    <ProfileAvatar userId={p.id} avatarUrl={p.avatar_url} fullName={p.full_name} size={44}
                      className={gestor ? "ring-2 ring-amber-400/70" : "ring-1 ring-border"} />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium truncate">{p.full_name ?? "—"}</p>
                        <NivelBadge gestor={gestor} />
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">{p.username ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {getDept(p.department)}{secLabel ? "" : ""} · {funcLabel ?? "—"}
                      </p>
                      <SystemsChips ifaces={p.allowed_interfaces ?? []} />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {/* ── Criar usuário (painel deslizante) ── */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Criar usuário
            </SheetTitle>
            <SheetDescription>
              Username e senha são gerados automaticamente. O colaborador troca no 1º acesso.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 mt-5">
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
                  {departments.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
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
                  {departments.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
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
                    {s.comingSoon && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-medium">Em breve</span>}
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
        </SheetContent>
      </Sheet>

      {/* ── Editar usuário ── */}
      <EditUserDialog user={editing} approved={approved} onClose={() => setEditing(null)} />

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
    </>
  );
}
