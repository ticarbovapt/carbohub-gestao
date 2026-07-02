import { useMemo, useState } from "react";
import { Link2, Search, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useProfiles } from "@/hooks/useAdminUsers";
import { useBlingVendedores, useSetVendedorProfile } from "@/hooks/useBlingVendedores";

// ─────────────────────────────────────────────────────────────────────────────
// De-Para: liga cada vendedor do Bling a um perfil interno (profiles).
// O match por e-mail já roda na migração; aqui você resolve os que não bateram
// e ajusta manualmente. O vínculo é usado para atribuir vendedor às vendas Bling.
// ─────────────────────────────────────────────────────────────────────────────
export default function VendedoresBling() {
  const { data: vendedores = [], isLoading } = useBlingVendedores();
  const { data: profiles = [] } = useProfiles();
  const setProfile = useSetVendedorProfile();
  const [search, setSearch] = useState("");

  const nomeById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of profiles) m[p.id] = p.full_name || p.username || "—";
    return m;
  }, [profiles]);

  const filtered = vendedores.filter(
    (v) => !search || v.nome.toLowerCase().includes(search.toLowerCase()) || (v.email ?? "").toLowerCase().includes(search.toLowerCase()),
  );
  const vinculados = vendedores.filter((v) => v.profile_id).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Link2 className="h-6 w-6 text-carbo-green" /> Vendedores do Bling</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ligue cada vendedor do Bling a um perfil interno. Esse vínculo atribui o vendedor às vendas que vêm do Bling.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar vendedor do Bling..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {vinculados} vinculados</Badge>
        <Badge variant="outline" className="gap-1"><AlertCircle className="h-3.5 w-3.5 text-amber-500" /> {vendedores.length - vinculados} pendentes</Badge>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Vendedor (Bling)</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">E-mail</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Perfil interno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">Carregando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">Nenhum vendedor do Bling encontrado.</td></tr>
              ) : filtered.map((v) => (
                <tr key={v.bling_id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{v.nome || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.email || "—"}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={v.profile_id ?? "none"}
                      onValueChange={(val) => setProfile.mutate({ blingId: v.bling_id, profileId: val === "none" ? null : val })}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Selecionar perfil…">
                          {v.profile_id
                            ? <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {nomeById[v.profile_id] ?? "—"}</span>
                            : <span className="text-amber-500 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Não vinculado</span>}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="none">— Não vinculado —</SelectItem>
                        {profiles
                          .filter((p) => p.full_name)
                          .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
                          .map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{filtered.length} vendedor(es) do Bling</div>
      </div>
    </div>
  );
}
