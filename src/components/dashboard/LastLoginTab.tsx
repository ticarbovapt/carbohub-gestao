import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, differenceInDays, differenceInHours, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Users, Store, Building2, Search, Clock } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoginRow {
  user_id: string;
  full_name: string | null;
  department: string | null;
  role: string | null;
  last_login_at: string | null;
  user_area: string;
  region: string | null;
  orders_last_30_days: number;
  last_replenishment_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActivityStatus(lastLoginAt: string | null): {
  label: string;
  color: string;
  dot: string;
} {
  if (!lastLoginAt) {
    return { label: "Nunca acessou", color: "text-muted-foreground", dot: "⚫" };
  }
  const now = new Date();
  const loginDate = new Date(lastLoginAt);
  const daysDiff = differenceInDays(now, loginDate);

  if (isToday(loginDate)) return { label: "Hoje", color: "text-emerald-600", dot: "🟢" };
  if (daysDiff <= 7) return { label: "Últimos 7 dias", color: "text-amber-600", dot: "🟡" };
  if (daysDiff <= 30) return { label: "+7 dias", color: "text-red-500", dot: "🔴" };
  return { label: "+30 dias", color: "text-muted-foreground", dot: "⚫" };
}

function getLicenseeActivityStatus(lastLoginAt: string | null, orders: number): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (!lastLoginAt) return { label: "Inativo", variant: "destructive" };
  const daysDiff = differenceInDays(new Date(), new Date(lastLoginAt));
  if (daysDiff > 30) return { label: "Inativo (+30d)", variant: "destructive" };
  if (orders > 0) return { label: "Ativo", variant: "default" };
  return { label: "Passivo", variant: "secondary" };
}

function formatLogin(dt: string | null) {
  if (!dt) return "—";
  return format(new Date(dt), "dd/MM/yy HH:mm", { locale: ptBR });
}

const DEPT_LABELS: Record<string, string> = {
  venda: "Venda",
  preparacao: "Preparação",
  expedicao: "Expedição",
  operacao: "Operação",
  pos_venda: "Pós-Venda",
  command: "Comando",
  expansao: "Expansão",
  finance: "Financeiro",
  growth: "Growth",
  ops: "Ops",
  b2b: "B2B",
  adm_financeiro: "Adm/Financeiro",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  operator: "Operador",
  viewer: "Viewer",
  ceo: "CEO",
  gestor_adm: "Gestor Adm",
  gestor_fin: "Gestor Fin",
  gestor_compras: "Gestor Compras",
  operador_fiscal: "Operador Fiscal",
  operador: "Operador",
  licensee: "Licenciado",
  pdv: "PDV",
};

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
        <Clock className="mx-auto mb-2 h-8 w-8 opacity-30" />
        Nenhum {label} encontrado
      </td>
    </tr>
  );
}

// ─── Skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Section 1: Internal users ────────────────────────────────────────────────

function InternalUsersSection({ rows }: { rows: LoginRow[] }) {
  const [filterDept, setFilterDept] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))];
  const roles = [...new Set(rows.map((r) => r.role).filter(Boolean))];

  const filtered = rows.filter((r) => {
    if (filterDept !== "all" && r.department !== filterDept) return false;
    if (filterRole !== "all" && r.role !== filterRole) return false;
    if (filterStatus !== "all") {
      const status = getActivityStatus(r.last_login_at);
      const map: Record<string, string> = {
        today: "Hoje",
        week: "Últimos 7 dias",
        over7: "+7 dias",
        over30: "+30 dias",
        never: "Nunca acessou",
      };
      if (status.label !== map[filterStatus]) return false;
    }
    if (search && !r.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Departamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos departamentos</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d!} value={d!}>
                {DEPT_LABELS[d!] || d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos roles</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r!} value={r!}>
                {ROLE_LABELS[r!] || r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
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

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Nome</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Departamento</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Último login</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <EmptyState label="usuário interno" />
              ) : (
                filtered.map((row) => {
                  const status = getActivityStatus(row.last_login_at);
                  return (
                    <tr key={row.user_id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{row.full_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {DEPT_LABELS[row.department || ""] || row.department || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">
                          {ROLE_LABELS[row.role || ""] || row.role || "—"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatLogin(row.last_login_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium ${status.color}`}>
                          {status.dot} {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {filtered.length} usuário(s) exibido(s)
        </div>
      </div>
    </div>
  );
}

// ─── Section 2: Licensees ─────────────────────────────────────────────────────

function LicenseesSection({ rows }: { rows: LoginRow[] }) {
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const regions = [...new Set(rows.map((r) => r.region).filter(Boolean))];

  const filtered = rows.filter((r) => {
    if (filterRegion !== "all" && r.region !== filterRegion) return false;
    if (filterStatus !== "all") {
      const st = getLicenseeActivityStatus(r.last_login_at, r.orders_last_30_days);
      if (filterStatus === "active" && st.label !== "Ativo") return false;
      if (filterStatus === "passive" && st.label !== "Passivo") return false;
      if (filterStatus === "inactive" && !st.label.startsWith("Inativo")) return false;
    }
    if (search && !r.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar licenciado..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterRegion} onValueChange={setFilterRegion}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Região" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas regiões</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r!} value={r!}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">🟢 Ativo</SelectItem>
            <SelectItem value="passive">🟡 Passivo</SelectItem>
            <SelectItem value="inactive">🔴 Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Licenciado</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Região</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Último login</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Pedidos (30d)</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <EmptyState label="licenciado" />
              ) : (
                filtered.map((row) => {
                  const st = getLicenseeActivityStatus(row.last_login_at, row.orders_last_30_days);
                  return (
                    <tr key={row.user_id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{row.full_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.region || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatLogin(row.last_login_at)}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        {row.orders_last_30_days}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={st.variant} className="text-xs">
                          {st.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {filtered.length} licenciado(s) exibido(s)
        </div>
      </div>
    </div>
  );
}

// ─── Section 3: PDVs (Área Produtos) ─────────────────────────────────────────

function PDVsSection({ rows }: { rows: LoginRow[] }) {
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const regions = [...new Set(rows.map((r) => r.region).filter(Boolean))];

  const filtered = rows.filter((r) => {
    if (filterRegion !== "all" && r.region !== filterRegion) return false;
    if (filterStatus !== "all") {
      const status = getActivityStatus(r.last_login_at);
      const map: Record<string, string> = {
        today: "Hoje",
        week: "Últimos 7 dias",
        over7: "+7 dias",
        over30: "+30 dias",
      };
      if (status.label !== map[filterStatus]) return false;
    }
    if (search && !r.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar PDV..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterRegion} onValueChange={setFilterRegion}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Região" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas regiões</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r!} value={r!}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="today">🟢 Hoje</SelectItem>
            <SelectItem value="week">🟡 Últimos 7 dias</SelectItem>
            <SelectItem value="over7">🔴 +7 dias</SelectItem>
            <SelectItem value="over30">⚫ +30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">PDV</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Região</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Último login</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Última reposição</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase text-xs tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <EmptyState label="PDV" />
              ) : (
                filtered.map((row) => {
                  const status = getActivityStatus(row.last_login_at);
                  return (
                    <tr key={row.user_id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{row.full_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.region || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatLogin(row.last_login_at)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatLogin(row.last_replenishment_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium ${status.color}`}>
                          {status.dot} {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {filtered.length} PDV(s) exibido(s)
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LastLoginTab() {
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["last-login-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_last_login_summary");
      if (error) throw error;
      return (data || []) as LoginRow[];
    },
    refetchInterval: 60_000, // refresh every minute
  });

  const internal = rows?.filter((r) => r.user_area === "internal") ?? [];
  const licensees = rows?.filter((r) => r.user_area === "licensee") ?? [];
  const pdvs = rows?.filter((r) => r.user_area === "produtos") ?? [];

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
        Erro ao carregar dados de acesso. Verifique as permissões.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="text-2xl font-bold">{isLoading ? "—" : internal.length}</p>
            <p className="text-xs text-muted-foreground">Carbo Controle</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-2xl font-bold">{isLoading ? "—" : licensees.length}</p>
            <p className="text-xs text-muted-foreground">Licenciados</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Store className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="text-2xl font-bold">{isLoading ? "—" : pdvs.length}</p>
            <p className="text-xs text-muted-foreground">Lojas</p>
          </div>
        </div>
      </div>

      {/* Tabs per area */}
      <Tabs defaultValue="internal">
        <TabsList>
          <TabsTrigger value="internal" className="gap-2">
            <Building2 className="h-4 w-4" />
            Carbo Controle
          </TabsTrigger>
          <TabsTrigger value="licensees" className="gap-2">
            <Users className="h-4 w-4" />
            Licenciados
          </TabsTrigger>
          <TabsTrigger value="pdvs" className="gap-2">
            <Store className="h-4 w-4" />
            Lojas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="mt-4">
          {isLoading ? (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full"><tbody><SkeletonRows cols={5} /></tbody></table>
            </div>
          ) : (
            <InternalUsersSection rows={internal} />
          )}
        </TabsContent>

        <TabsContent value="licensees" className="mt-4">
          {isLoading ? (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full"><tbody><SkeletonRows cols={5} /></tbody></table>
            </div>
          ) : (
            <LicenseesSection rows={licensees} />
          )}
        </TabsContent>

        <TabsContent value="pdvs" className="mt-4">
          {isLoading ? (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full"><tbody><SkeletonRows cols={5} /></tbody></table>
            </div>
          ) : (
            <PDVsSection rows={pdvs} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
