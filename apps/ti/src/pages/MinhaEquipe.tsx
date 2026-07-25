import { useMemo, useState } from "react";
import { Users as UsersIcon, Search, Mail, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { useTeamMembers, useOrgLabels, type TeamMember } from "@/hooks/useTeamMembers";

// Tela só de visualização: a pessoa vê os colegas do(s) próprio(s) departamento(s),
// já filtrada. Sem qualquer ação de edição (vale para todos, inclusive gestão).
export default function MinhaEquipe() {
  const { data: team = [], isLoading } = useTeamMembers();
  const { data: labels } = useOrgLabels();
  const [search, setSearch] = useState("");

  const deptName = (k?: string | null) => (k ? labels?.deptLabel[k] ?? k : null);
  const fnName = (d?: string | null, f?: string | null) =>
    f ? labels?.fnLabel[`${d}:${f}`] ?? f : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return team;
    return team.filter((m) =>
      (m.full_name ?? "").toLowerCase().includes(q) ||
      (m.username ?? "").toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q));
  }, [team, search]);

  const roleLine = (m: TeamMember) => {
    const parts = [
      [fnName(m.department, m.funcao), deptName(m.department)].filter(Boolean).join(" · "),
      m.secondary_funcao ? [fnName(m.secondary_department, m.secondary_funcao), deptName(m.secondary_department)].filter(Boolean).join(" · ") : null,
    ].filter(Boolean);
    return parts.join("  +  ");
  };

  const realEmail = (e: string | null) => (e && !e.endsWith("@carbo.internal") ? e : null);

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <UsersIcon className="h-6 w-6 text-primary" /> Minha Equipe
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Colegas do seu departamento — para achar contato rápido. Somente visualização.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome, usuário ou e-mail..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <section className="rounded-2xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <UsersIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium">Nenhum colega encontrado</p>
            <p className="text-sm text-muted-foreground mt-0.5">Ajuste a busca.</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((m) => {
              const email = realEmail(m.email);
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                  <ProfileAvatar userId={m.id} avatarUrl={m.avatar_url} fullName={m.full_name} size={40} className="ring-1 ring-border" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{m.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{roleLine(m) || "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {email ? (
                      <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 text-xs text-carbo-green hover:underline">
                        <Mail className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{email}</span>
                      </a>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">sem e-mail</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
