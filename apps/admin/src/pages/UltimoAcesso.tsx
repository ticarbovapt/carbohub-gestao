import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, differenceInDays, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Users, Store, Building2, Search, Clock, Activity } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Último acesso — quem acessa (ou não) o ecossistema, de verdade.
// Internos: logam pelo Hub e abrem um dos sistemas → mostramos o ÚLTIMO sistema.
// Licenciados / Lojas: usuários externos (tenant), segmentados à parte.
// Fonte: RPC get_last_login_summary (last_login_at + last_app).
// ─────────────────────────────────────────────────────────────────────────────

interface LoginRow {
  user_id: string;
  full_name: string | null;
  department: string | null;
  funcao: string | null;
  secondary_department: string | null;
  secondary_funcao: string | null;
  last_login_at: string | null;
  user_area: string;
  region: string | null;
  orders_last_30_days: number;
  last_replenishment_at: string | null;
  last_app: string | null;
  last_app_at: string | null;
}

const APP_LABEL: Record<string, string> = {
  carbo_admin: "Carbo Admin",
  carbo_crm: "Carbo Sales",
  carbo_ops_app: "Carbo Ops",
  carbo_financas: "Carbo Finanças",
  carbo_mkt: "Carbo Marketing",
  carbo_ops: "Carbo Controle",
  portal_licenciado: "Licenciados",
  portal_pdv: "Lojas",
};
const appLabel = (a: string | null) => (a ? APP_LABEL[a] ?? a : null);
const pretty = (s: string | null) => (s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—");

function getActivityStatus(dt: string | null) {
  if (!dt) return { label: "Nunca acessou", color: "text-muted-foreground", dot: "⚫" };
  const d = new Date(dt);
  const days = differenceInDays(new Date(), d);
  if (isToday(d)) return { label: "Hoje", color: "text-emerald-600", dot: "🟢" };
  if (days <= 7) return { label: "Últimos 7 dias", color: "text-amber-600", dot: "🟡" };
  if (days <= 30) return { label: "+7 dias", color: "text-red-500", dot: "🔴" };
  return { label: "+30 dias", color: "text-muted-foreground", dot: "⚫" };
}
function getLicenseeStatus(dt: string | null, orders: number): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (!dt) return { label: "Inativo", variant: "destructive" };
  if (differenceInDays(new Date(), new Date(dt)) > 30) return { label: "Inativo (+30d)", variant: "destructive" };
  return orders > 0 ? { label: "Ativo", variant: "default" } : { label: "Passivo", variant: "secondary" };
}
const fmt = (dt: string | null) => (dt ? format(new Date(dt), "dd/MM/yy HH:mm", { locale: ptBR }) : "—");

function EmptyState({ label, cols }: { label: string; cols: number }) {
  return (
    <tr><td colSpan={cols} className="px-4 py-10 text-center text-muted-foreground text-sm">
      <Clock className="mx-auto mb-2 h-8 w-8 opacity-30" /> Nenhum {label} encontrado
    </td></tr>
  );
}
function SkeletonRows({ cols }: { cols: number }) {
  return <>{Array.from({ length: 5 }).map((_, i) => (
    <tr key={i}>{Array.from({ length: cols }).map((_, j) => (
      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>))}</tr>
  ))}</>;
}
const th = "px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide";

// ── Internos (com Último sistema) ────────────────────────────────────────────
function InternalSection({ rows }: { rows: LoginRow[] }) {
  const [filterDept, setFilterDept] = useState("all");
  const [filterApp, setFilterApp] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))] as string[];
  const apps = [...new Set(rows.map((r) => r.last_app).filter(Boolean))] as string[];

  const filtered = rows.filter((r) => {
    if (filterDept !== "all" && r.department !== filterDept) return false;
    if (filterApp !== "all" && r.last_app !== filterApp) return false;
    if (filterStatus !== "all") {
      const map: Record<string, string> = { today: "Hoje", week: "Últimos 7 dias", over7: "+7 dias", over30: "+30 dias", never: "Nunca acessou" };
      if (getActivityStatus(r.last_login_at).label !== map[filterStatus]) return false;
    }
    if (search && !r.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Departamento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos departamentos</SelectItem>
            {departments.map((d) => <SelectItem key={d} value={d}>{pretty(d)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterApp} onValueChange={setFilterApp}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Sistema" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os sistemas</SelectItem>
            {apps.map((a) => <SelectItem key={a} value={a}>{appLabel(a)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="today">🟢 Hoje</SelectItem>
            <SelectItem value="week">🟡 Últimos 7 dias</SelectItem>
            <SelectItem value="over7">🔴 +7 dias</SelectItem>
            <SelectItem value="over30">⚫ +30 dias</SelectItem>
            <SelectItem value="never">⚫ Nunca acessou</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-secondary/30">
              <th className={th}>Nome</th><th className={th}>Departamento</th><th className={th}>Função</th>
              <th className={th}>Último sistema</th><th className={th}>Último acesso</th><th className={th}>Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? <EmptyState label="usuário interno" cols={6} /> : filtered.map((row) => {
                const status = getActivityStatus(row.last_login_at);
                return (
                  <tr key={row.user_id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{row.full_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {pretty(row.department)}
                      {row.secondary_department && <span className="text-muted-foreground/60"> + {pretty(row.secondary_department)}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.funcao ? <Badge variant="outline" className="text-xs">{pretty(row.funcao)}</Badge> : <span className="text-muted-foreground">—</span>}
                        {row.secondary_funcao && <Badge variant="secondary" className="text-xs">{pretty(row.secondary_funcao)}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.last_app
                        ? <Badge variant="outline" className="text-xs gap-1"><Activity className="h-3 w-3 text-carbo-green" />{appLabel(row.last_app)}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(row.last_app_at ?? row.last_login_at)}</td>
                    <td className="px-4 py-3"><span className={`text-sm font-medium ${status.color}`}>{status.dot} {status.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{filtered.length} usuário(s) exibido(s)</div>
      </div>
    </div>
  );
}

// ── Licenciados ──────────────────────────────────────────────────────────────
function LicenseesSection({ rows }: { rows: LoginRow[] }) {
  const [filterRegion, setFilterRegion] = useState("all");
  const [search, setSearch] = useState("");
  const regions = [...new Set(rows.map((r) => r.region).filter(Boolean))] as string[];
  const filtered = rows.filter((r) => {
    if (filterRegion !== "all" && r.region !== filterRegion) return false;
    if (search && !r.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar licenciado..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterRegion} onValueChange={setFilterRegion}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Região" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas regiões</SelectItem>
            {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-secondary/30">
              <th className={th}>Licenciado</th><th className={th}>Região</th><th className={th}>Último acesso</th>
              <th className={th}>Pedidos (30d)</th><th className={th}>Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? <EmptyState label="licenciado" cols={5} /> : filtered.map((row) => {
                const st = getLicenseeStatus(row.last_login_at, row.orders_last_30_days);
                return (
                  <tr key={row.user_id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{row.full_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.region || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(row.last_login_at)}</td>
                    <td className="px-4 py-3 text-center font-mono">{row.orders_last_30_days}</td>
                    <td className="px-4 py-3"><Badge variant={st.variant} className="text-xs">{st.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{filtered.length} licenciado(s) exibido(s)</div>
      </div>
    </div>
  );
}

// ── Lojas (PDV), dividido por loja/região ────────────────────────────────────
function LojasSection({ rows }: { rows: LoginRow[] }) {
  const [filterRegion, setFilterRegion] = useState("all");
  const [search, setSearch] = useState("");
  const regions = [...new Set(rows.map((r) => r.region).filter(Boolean))] as string[];
  const filtered = rows.filter((r) => {
    if (filterRegion !== "all" && r.region !== filterRegion) return false;
    if (search && !r.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar loja..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterRegion} onValueChange={setFilterRegion}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Rede" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as redes</SelectItem>
            {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-secondary/30">
              <th className={th}>Loja</th><th className={th}>Rede</th><th className={th}>Último acesso</th>
              <th className={th}>Última reposição</th><th className={th}>Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? <EmptyState label="loja" cols={5} /> : filtered.map((row) => {
                const status = getActivityStatus(row.last_login_at);
                return (
                  <tr key={row.user_id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{row.full_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.region || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(row.last_login_at)}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(row.last_replenishment_at)}</td>
                    <td className="px-4 py-3"><span className={`text-sm font-medium ${status.color}`}>{status.dot} {status.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{filtered.length} loja(s) exibida(s)</div>
      </div>
    </div>
  );
}

export default function UltimoAcesso() {
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["ultimo-acesso"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_last_login_summary");
      if (error) throw error;
      return (data || []) as LoginRow[];
    },
    refetchInterval: 60_000,
  });

  const internal = rows?.filter((r) => r.user_area === "internal") ?? [];
  const licensees = rows?.filter((r) => r.user_area === "licensee") ?? [];
  const lojas = rows?.filter((r) => r.user_area === "produtos") ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6 text-carbo-green" /> Último acesso</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Quem acessa (ou não) o ecossistema — e por qual sistema entrou.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
          Erro ao carregar dados de acesso. Verifique as permissões.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><Building2 className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-2xl font-bold">{isLoading ? "—" : internal.length}</p><p className="text-xs text-muted-foreground">Internos</p></div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Users className="h-5 w-5 text-emerald-500" /></div>
              <div><p className="text-2xl font-bold">{isLoading ? "—" : licensees.length}</p><p className="text-xs text-muted-foreground">Licenciados</p></div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><Store className="h-5 w-5 text-amber-500" /></div>
              <div><p className="text-2xl font-bold">{isLoading ? "—" : lojas.length}</p><p className="text-xs text-muted-foreground">Lojas</p></div>
            </div>
          </div>

          <Tabs defaultValue="internal">
            <TabsList>
              <TabsTrigger value="internal" className="gap-2"><Building2 className="h-4 w-4" /> Internos</TabsTrigger>
              <TabsTrigger value="licensees" className="gap-2"><Users className="h-4 w-4" /> Licenciados</TabsTrigger>
              <TabsTrigger value="lojas" className="gap-2"><Store className="h-4 w-4" /> Lojas</TabsTrigger>
            </TabsList>
            <TabsContent value="internal" className="mt-4">
              {isLoading ? <div className="rounded-xl border border-border overflow-hidden"><table className="w-full"><tbody><SkeletonRows cols={6} /></tbody></table></div> : <InternalSection rows={internal} />}
            </TabsContent>
            <TabsContent value="licensees" className="mt-4">
              {isLoading ? <div className="rounded-xl border border-border overflow-hidden"><table className="w-full"><tbody><SkeletonRows cols={5} /></tbody></table></div> : <LicenseesSection rows={licensees} />}
            </TabsContent>
            <TabsContent value="lojas" className="mt-4">
              {isLoading ? <div className="rounded-xl border border-border overflow-hidden"><table className="w-full"><tbody><SkeletonRows cols={5} /></tbody></table></div> : <LojasSection rows={lojas} />}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
