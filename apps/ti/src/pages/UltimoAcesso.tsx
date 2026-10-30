import { useParamUrl } from "@carbo/shell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Users, Store, Building2, Search, Clock, Activity, Ban, ChevronDown, ChevronRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

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
  // ⚠️ Faltavam os apps mais novos, e o fallback mostrava a chave crua
  // ("carbo_atendimento"). Entram junto com o Pré-Vendas (06/10/2026).
  portal_micro: "Microdistribuidores",
  carbo_ti: "Carbo TI",
  carbo_atendimento: "Carbo Atendimento",
  carbo_prevendas: "Carbo Pré-Vendas",
};
const appLabel = (a: string | null) => (a ? APP_LABEL[a] ?? a : null);
const pretty = (s: string | null) => (s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—");

// Recência = dias de CALENDÁRIO em Brasília entre hoje e o último acesso
// ("Ontem" é ontem, mesmo que tenha sido há 3 horas). O rótulo diz os dias
// exatos; a COR diz a faixa (pedido do dono do processo, 30/10/2026).
const diaBrasilia = (d: Date) => {
  const [a, m, dd] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d).split("-").map(Number);
  return Date.UTC(a, m - 1, dd);
};
const diasDesde = (dt: string) => Math.max(0, Math.round((diaBrasilia(new Date()) - diaBrasilia(new Date(dt))) / 86_400_000));

type Faixa = "verde" | "amarelo" | "laranja" | "vermelho" | "nunca";
const FAIXAS: Record<Faixa, { filtro: string; color: string; dot: string }> = {
  verde:    { filtro: "Hoje ou ontem",     color: "text-emerald-600", dot: "bg-emerald-500" },
  amarelo:  { filtro: "2 a 3 dias",        color: "text-amber-600",   dot: "bg-amber-400" },
  laranja:  { filtro: "4 a 7 dias",        color: "text-orange-600",  dot: "bg-orange-500" },
  vermelho: { filtro: "Mais de 7 dias",    color: "text-red-600",     dot: "bg-red-500" },
  nunca:    { filtro: "Nunca acessou",     color: "text-muted-foreground", dot: "bg-muted-foreground/40" },
};
// Filtros antigos na URL (favorito, link) continuam abrindo algo coerente.
const FILTRO_ANTIGO: Record<string, Faixa> = { hoje: "verde", semana: "amarelo", mais7: "vermelho", mais30: "vermelho" };

function getActivityStatus(dt: string | null) {
  if (!dt) return { faixa: "nunca" as Faixa, label: "Nunca acessou", ...FAIXAS.nunca };
  const dias = diasDesde(dt);
  const faixa: Faixa = dias <= 1 ? "verde" : dias <= 3 ? "amarelo" : dias <= 7 ? "laranja" : "vermelho";
  const label = dias === 0 ? "Hoje" : dias === 1 ? "Ontem" : `${dias} dias`;
  return { faixa, label, ...FAIXAS[faixa] };
}
// O status olha o MESMO instante que a coluna "Último acesso" mostra: o mais
// recente entre login e abertura de sistema (pelo SSO a pessoa abre o app sem
// logar de novo, e o status dizia "dias" ao lado de uma data de ontem).
const ultimoInstante = (r: LoginRow) =>
  [r.last_app_at, r.last_login_at].filter(Boolean).sort().pop() ?? null;

function StatusRecencia({ dt }: { dt: string | null }) {
  const s = getActivityStatus(dt);
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-medium ${s.color}`}>
      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${s.dot}`} />{s.label}
    </span>
  );
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
  // Filtros na URL (`?busca=&departamento=&sistema=&situacao=`): F5 e link
  // ("quem do Ops não entra há 30 dias") abrem a MESMA lista.
  const [filterDept, setFilterDept] = useParamUrl("departamento", "all");
  const [filterApp, setFilterApp] = useParamUrl("sistema", "all");
  const [filterStatus, setFilterStatus] = useParamUrl("situacao", "all");
  const [search, setSearch] = useParamUrl("busca", "", { replace: true });

  const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))] as string[];
  const apps = [...new Set(rows.map((r) => r.last_app).filter(Boolean))] as string[];

  const filtered = rows.filter((r) => {
    if (filterDept !== "all" && r.department !== filterDept) return false;
    if (filterApp !== "all" && r.last_app !== filterApp) return false;
    if (filterStatus !== "all") {
      const faixa = FILTRO_ANTIGO[filterStatus] ?? filterStatus;
      if (getActivityStatus(ultimoInstante(r)).faixa !== faixa) return false;
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
        <Select value={FILTRO_ANTIGO[filterStatus] ?? filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {(Object.keys(FAIXAS) as Faixa[]).map((f) => (
              <SelectItem key={f} value={f}>
                <span className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${FAIXAS[f].dot}`} />{FAIXAS[f].filtro}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b border-border bg-secondary/30">
              <th className={th}>Nome</th><th className={th}>Departamento</th><th className={th}>Função</th>
              <th className={th}>Último sistema</th><th className={th}>Último acesso</th><th className={th}>Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? <EmptyState label="usuário interno" cols={6} /> : filtered.map((row) => {
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
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(ultimoInstante(row))}</td>
                    <td className="px-4 py-3"><StatusRecencia dt={ultimoInstante(row)} /></td>
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
  const [filterRegion, setFilterRegion] = useParamUrl("regiao", "all");
  const [search, setSearch] = useParamUrl("busca", "", { replace: true });
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
          <table className="w-full min-w-[600px] text-sm">
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
  const [filterRegion, setFilterRegion] = useParamUrl("regiao", "all");
  const [search, setSearch] = useParamUrl("busca", "", { replace: true });
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
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="border-b border-border bg-secondary/30">
              <th className={th}>Loja</th><th className={th}>Rede</th><th className={th}>Último acesso</th>
              <th className={th}>Última reposição</th><th className={th}>Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? <EmptyState label="loja" cols={5} /> : filtered.map((row) => {
                return (
                  <tr key={row.user_id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{row.full_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.region || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(row.last_login_at)}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmt(row.last_replenishment_at)}</td>
                    <td className="px-4 py-3"><StatusRecencia dt={row.last_login_at} /></td>
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

// ── Bloqueados ───────────────────────────────────────────────────────────────
// Quem está bloqueado AGORA (auth.users.banned_until — a trava de verdade),
// desde quando, e o que aconteceu DEPOIS do bloqueio:
//   • tentativas de login recusadas — o Auth não as registra; as telas de
//     login (Hub e os oito apps) gravam em carbo_login_bloqueado_tentativas;
//   • acesso de verdade depois do bloqueio — não deveria existir. Aba que
//     ficou aberta pode ainda registrar o sistema por até ~1 h (o token vale
//     até vencer), e isso aparece em âmbar; login depois do bloqueio, em vermelho.
interface Bloqueado {
  user_id: string; nome: string | null; email: string | null;
  departamento: string | null; funcao: string | null;
  bloqueado_ate: string; bloqueado_em: string | null; bloqueado_por: string | null; motivo: string | null;
  ultimo_login: string | null; ultimo_app: string | null; ultimo_app_em: string | null;
  tentativas: number; ultima_tentativa: string | null;
  lista: { em: string; origem: string | null; user_agent: string | null }[];
}
const depois = (a: string | null, b: string | null) => !!a && !!b && new Date(a) > new Date(b);
const navegador = (ua: string | null) => {
  if (!ua) return "—";
  const so = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "";
  const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return so ? `${nav} · ${so}` : nav;
};

function BloqueadosSection({ rows, error }: { rows: Bloqueado[]; error: unknown }) {
  const [search, setSearch] = useParamUrl("busca", "", { replace: true });
  const [aberto, setAberto] = useState<string | null>(null);
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
        Não foi possível ler os bloqueados: {(error as Error).message}
      </div>
    );
  }
  const filtered = rows.filter((r) => !search || (r.nome ?? "").toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border bg-secondary/30">
              <th className={th}>Nome</th><th className={th}>Bloqueado em</th><th className={th}>Tentou entrar depois</th>
              <th className={th}>Último acesso de verdade</th><th className={th}>Situação</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? <EmptyState label="usuário bloqueado" cols={5} /> : filtered.map((r) => {
                const loginDepois = depois(r.ultimo_login, r.bloqueado_em);
                const appDepois = !loginDepois && depois(r.ultimo_app_em, r.bloqueado_em);
                const ultimo = [r.ultimo_app_em, r.ultimo_login].filter(Boolean).sort().pop() ?? null;
                const expandido = aberto === r.user_id;
                return (
                  <Fragment key={r.user_id}>
                    <tr className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.nome || "—"}</p>
                        <p className="text-xs text-muted-foreground">{pretty(r.departamento)}{r.funcao ? ` · ${pretty(r.funcao)}` : ""}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <p className="tabular-nums">{fmt(r.bloqueado_em)}</p>
                        {(r.bloqueado_por || r.motivo) && (
                          <p className="text-xs">{r.bloqueado_por ? `por ${r.bloqueado_por}` : ""}{r.motivo ? ` · ${r.motivo}` : ""}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.tentativas === 0 ? (
                          <span className="text-muted-foreground">Nenhuma tentativa</span>
                        ) : (
                          <button type="button" onClick={() => setAberto(expandido ? null : r.user_id)}
                            className="inline-flex items-center gap-1.5 text-left font-medium text-amber-600 hover:underline">
                            {expandido ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {r.tentativas} {r.tentativas === 1 ? "tentativa" : "tentativas"}
                            <span className="font-normal text-muted-foreground">· última {fmt(r.ultima_tentativa)}</span>
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="tabular-nums text-muted-foreground">{fmt(ultimo)}</p>
                        {r.ultimo_app && <p className="text-xs text-muted-foreground">{appLabel(r.ultimo_app)}</p>}
                        {loginDepois && <p className="text-xs font-medium text-red-600">Entrou depois do bloqueio</p>}
                        {appDepois && <p className="text-xs text-amber-600">Aba que ficou aberta, depois do bloqueio</p>}
                      </td>
                      <td className="px-4 py-3">
                        {loginDepois ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600"><AlertTriangle className="h-4 w-4" /> Conferir</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600" title={`Bloqueado até ${fmt(r.bloqueado_ate)}`}>
                            <ShieldCheck className="h-4 w-4" /> Bloqueado
                          </span>
                        )}
                      </td>
                    </tr>
                    {expandido && (
                      <tr className="bg-secondary/10">
                        <td colSpan={5} className="px-4 py-3">
                          <ul className="space-y-1 text-xs">
                            {r.lista.map((t, i) => (
                              <li key={i} className="flex flex-wrap gap-x-4 gap-y-0.5">
                                <span className="tabular-nums font-medium">{fmt(t.em)}</span>
                                <span className="text-muted-foreground">{t.origem || "—"}</span>
                                <span className="text-muted-foreground">{navegador(t.user_agent)}</span>
                              </li>
                            ))}
                          </ul>
                          {r.tentativas > r.lista.length && (
                            <p className="mt-1 text-xs text-muted-foreground">Mostrando as {r.lista.length} mais recentes.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {filtered.length} bloqueado(s) · tentativas contam as feitas pelo Hub e pelos apps depois do bloqueio
        </div>
      </div>
    </div>
  );
}

export default function UltimoAcesso() {
  // Aba na URL (`?aba=lojas`). Os filtros das três abas dividem as MESMAS
  // chaves (`busca`, `regiao`…), então trocar de aba os limpa — a busca por
  // "Maria" nos internos não pode virar, calada, a busca dos licenciados.
  const [abaUrl, setAba] = useParamUrl("aba", "internos");
  const aba = ["internos", "licenciados", "lojas", "bloqueados"].includes(abaUrl) ? abaUrl : "internos";
  const [, setBusca] = useParamUrl("busca", "", { replace: true });
  const [, setRegiao] = useParamUrl("regiao", "all");
  const [, setDepto] = useParamUrl("departamento", "all");
  const [, setSistema] = useParamUrl("sistema", "all");
  const [, setSituacao] = useParamUrl("situacao", "all");
  const trocarAba = (v: string) => {
    setAba(v); setBusca(null); setRegiao(null); setDepto(null); setSistema(null); setSituacao(null);
  };
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["ultimo-acesso"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_last_login_summary");
      if (error) throw error;
      return (data || []) as LoginRow[];
    },
    refetchInterval: 60_000,
  });

  // Bloqueados: a lista vem da RPC da aba; quem some das outras abas sai da
  // view sobre o Auth (a mesma da tela de Usuários) — assim o front no ar
  // antes do SQL ainda tira o bloqueado das listas.
  // AO VIVO: tentativa nova de bloqueado, ou bloqueio/desbloqueio feito agora,
  // relê a aba na hora. O evento só avisa; quem monta a lista é a RPC. O
  // intervalo de 15 s é a rede de segurança (Realtime fora do ar, aba dormindo).
  const qc = useQueryClient();
  useEffect(() => {
    const reler = () => qc.invalidateQueries({ queryKey: ["ultimo-acesso"] });
    const canal = supabase
      .channel("ultimo-acesso-bloqueados")
      .on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "carbo_login_bloqueado_tentativas" } as never, reler)
      .on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "carbo_usuario_bloqueio_log" } as never, reler)
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [qc]);
  const bloqueadosQ = useQuery({
    queryKey: ["ultimo-acesso", "bloqueados"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("carbo_bloqueados_acessos" as never);
      if (error) throw error;
      return (data ?? []) as unknown as Bloqueado[];
    },
    refetchInterval: 15_000,
  });
  const idsBloqueadosQ = useQuery({
    queryKey: ["ultimo-acesso", "ids-bloqueados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("carbo_usuarios_bloqueados" as never).select("user_id");
      if (error) throw error;
      return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
    },
    refetchInterval: 15_000,
  });
  const ids = new Set<string>([...(idsBloqueadosQ.data ?? []), ...(bloqueadosQ.data ?? []).map((b) => b.user_id)]);
  const livres = rows?.filter((r) => !ids.has(r.user_id)) ?? [];
  const internal = livres.filter((r) => r.user_area === "internal");
  const licensees = livres.filter((r) => r.user_area === "licensee");
  const lojas = livres.filter((r) => r.user_area === "produtos");
  const bloqueados = bloqueadosQ.data ?? [];

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
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><Building2 className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-2xl font-bold">{isLoading ? "—" : internal.length}</p><p className="text-xs text-muted-foreground">Internos</p></div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Users className="h-5 w-5 text-emerald-500" /></div>
              <div><p className="text-2xl font-bold">{isLoading ? "—" : licensees.length}</p><p className="text-xs text-muted-foreground">Licenciados</p></div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><Store className="h-5 w-5 text-amber-500" /></div>
              <div><p className="text-2xl font-bold">{isLoading ? "—" : lojas.length}</p><p className="text-xs text-muted-foreground">Lojas</p></div>
            </div>
          </div>

          <Tabs value={aba} onValueChange={trocarAba}>
            <TabsList>
              <TabsTrigger value="internos" className="gap-2"><Building2 className="h-4 w-4" /> Internos</TabsTrigger>
              <TabsTrigger value="licenciados" className="gap-2"><Users className="h-4 w-4" /> Licenciados</TabsTrigger>
              <TabsTrigger value="lojas" className="gap-2"><Store className="h-4 w-4" /> Lojas</TabsTrigger>
              <TabsTrigger value="bloqueados" className="gap-2">
                <Ban className="h-4 w-4" /> Bloqueados
                {bloqueados.length > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{bloqueados.length}</span>}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="internos" className="mt-4">
              {isLoading ? <div className="rounded-xl border border-border overflow-hidden"><table className="w-full"><tbody><SkeletonRows cols={6} /></tbody></table></div> : <InternalSection rows={internal} />}
            </TabsContent>
            <TabsContent value="licenciados" className="mt-4">
              {isLoading ? <div className="rounded-xl border border-border overflow-hidden"><table className="w-full"><tbody><SkeletonRows cols={5} /></tbody></table></div> : <LicenseesSection rows={licensees} />}
            </TabsContent>
            <TabsContent value="lojas" className="mt-4">
              {isLoading ? <div className="rounded-xl border border-border overflow-hidden"><table className="w-full"><tbody><SkeletonRows cols={5} /></tbody></table></div> : <LojasSection rows={lojas} />}
            </TabsContent>
            <TabsContent value="bloqueados" className="mt-4">
              {bloqueadosQ.isLoading ? <div className="rounded-xl border border-border overflow-hidden"><table className="w-full"><tbody><SkeletonRows cols={5} /></tbody></table></div> : <BloqueadosSection rows={bloqueados} error={bloqueadosQ.error} />}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
