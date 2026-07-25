import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Clock, Loader2, CheckCircle2, AlertTriangle, UserX, Hand,
  ArrowRight, Inbox, Bug, Lightbulb,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAllBugReports, type BugReport } from "@/hooks/useBugReports";
import { STAGES, PRIOS, prioOf, stageLabel, isAberta, daysSince, agingOf, dFmt } from "@/lib/demandas";

const brandTip = {
  contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 },
};

// Linha compacta de demanda — usada nas listas operacionais.
function DemandaLine({ d, onClick }: { d: BugReport; onClick: () => void }) {
  const p = prioOf(d.priority);
  const aging = agingOf(d.updated_at || d.created_at);
  return (
    <button onClick={onClick}
      className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors">
      <span className={`h-2 w-2 rounded-full shrink-0 ${p.dot}`} title={p.label} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm truncate">{d.title}</span>
        <span className="block text-[11px] text-muted-foreground truncate">
          <span className="uppercase">{d.app}</span> · {stageLabel(d.status)}
          {d.assignee_name ? ` · ${d.assignee_name}` : " · sem responsável"}
        </span>
      </span>
      {aging && (
        <span className={`text-[11px] shrink-0 ${aging === "red" ? "text-destructive" : "text-amber-500"}`}>
          {daysSince(d.updated_at || d.created_at)}d
        </span>
      )}
      {d.kind === "sugestao"
        ? <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        : <Bug className="h-3.5 w-3.5 text-destructive shrink-0" />}
    </button>
  );
}

function Bloco({ title, icon: Icon, hint, children, action }: {
  title: string; icon: typeof Clock; hint?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <CarboCard>
      <CarboCardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Icon className="h-4 w-4 text-carbo-green shrink-0" /> {title}
            </h3>
            {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
          </div>
          {action}
        </div>
        {children}
      </CarboCardContent>
    </CarboCard>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: all = [], isLoading } = useAllBugReports();

  const abertas = useMemo(() => all.filter((d) => isAberta(d.status)), [all]);

  const kpis = useMemo(() => ({
    fila: abertas.length,
    andamento: all.filter((d) => d.status === "in_progress").length,
    semDono: abertas.filter((d) => !d.assignee_id).length,
    criticas: abertas.filter((d) => d.priority === "critica").length,
  }), [all, abertas]);

  // "O que falta": fila priorizada (mais urgente e mais antiga primeiro).
  const fila = useMemo(() => [...abertas].sort((a, b) => {
    const w = prioOf(b.priority).weight - prioOf(a.priority).weight;
    return w !== 0 ? w : +new Date(a.created_at) - +new Date(b.created_at);
  }), [abertas]);

  const minhas = useMemo(() => fila.filter((d) => d.assignee_id === user?.id), [fila, user?.id]);
  const semDono = useMemo(() => fila.filter((d) => !d.assignee_id), [fila]);
  const paradas = useMemo(
    () => fila.filter((d) => daysSince(d.updated_at || d.created_at) > 7)
      .sort((a, b) => daysSince(b.updated_at || b.created_at) - daysSince(a.updated_at || a.created_at)),
    [fila],
  );
  const recentes = useMemo(
    () => [...all].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 6),
    [all],
  );

  // ── Indicadores ────────────────────────────────────────────────────────────
  const porEtapa = useMemo(
    () => STAGES.map((s) => ({ name: s.label, value: all.filter((d) => d.status === s.id).length, color: s.color }))
      .filter((x) => x.value > 0),
    [all],
  );
  const porPrioridade = useMemo(
    () => PRIOS.map((p) => ({ name: p.label, value: abertas.filter((d) => d.priority === p.key).length })),
    [abertas],
  );
  const porApp = useMemo(() => {
    const m = new Map<string, { name: string; abertas: number; total: number }>();
    for (const d of all) {
      const e = m.get(d.app) ?? { name: d.app.toUpperCase(), abertas: 0, total: 0 };
      e.total++; if (isAberta(d.status)) e.abertas++;
      m.set(d.app, e);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [all]);

  // Tempo médio de resolução (dias) das concluídas.
  const tempoMedio = useMemo(() => {
    const done = all.filter((d) => d.status === "resolved");
    if (!done.length) return null;
    const soma = done.reduce((s, d) => s + Math.max(0, (+new Date(d.updated_at) - +new Date(d.created_at)) / 86_400_000), 0);
    return (soma / done.length).toFixed(1);
  }, [all]);

  const irParaDemandas = () => navigate("/demandas");
  const primeiroNome = (profile?.full_name ?? "").split(" ")[0];

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
        <div className="h-20 rounded-xl bg-muted/40 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />)}
        </div>
        <div className="h-64 rounded-xl bg-muted/40 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1400px] mx-auto">
        <CarboPageHeader
          title={primeiroNome ? `Olá, ${primeiroNome}` : "Visão geral do TI"}
          description="O que chegou, o que falta resolver e como está o andamento das demandas."
          icon={LayoutDashboard}
          actions={
            <Button onClick={irParaDemandas} className="gap-1.5">
              Abrir quadro <ArrowRight className="h-4 w-4" />
            </Button>
          }
        />

        {/* KPIs — o essencial de "o que falta" */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <CarboKPI title="Na fila (não resolvidas)" value={kpis.fila} icon={Clock} iconColor="warning" onClick={irParaDemandas} />
          <CarboKPI title="Em andamento" value={kpis.andamento} icon={Loader2} iconColor="blue" onClick={irParaDemandas} />
          <CarboKPI title="Sem responsável" value={kpis.semDono} icon={UserX} iconColor={kpis.semDono > 0 ? "destructive" : "muted"} onClick={irParaDemandas} />
          <CarboKPI title="Críticas abertas" value={kpis.criticas} icon={AlertTriangle} iconColor={kpis.criticas > 0 ? "destructive" : "muted"} onClick={irParaDemandas} />
        </div>

        {/* ── Operacional: o que fazer agora ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Bloco title="Minhas demandas" icon={Hand} hint="Atribuídas a você e ainda não entregues">
            {minhas.length === 0
              ? <CarboEmptyState icon={CheckCircle2} title="Nada na sua fila" description="Você não tem demandas em aberto." />
              : <div className="space-y-0.5">{minhas.slice(0, 6).map((d) => <DemandaLine key={d.id} d={d} onClick={irParaDemandas} />)}</div>}
          </Bloco>

          <Bloco title="Sem responsável" icon={UserX} hint="Precisam de alguém pra assumir"
            action={semDono.length > 0 ? <span className="text-xs font-semibold text-destructive shrink-0">{semDono.length}</span> : undefined}>
            {semDono.length === 0
              ? <CarboEmptyState icon={CheckCircle2} title="Tudo com dono" description="Nenhuma demanda órfã." />
              : <div className="space-y-0.5">{semDono.slice(0, 6).map((d) => <DemandaLine key={d.id} d={d} onClick={irParaDemandas} />)}</div>}
          </Bloco>

          <Bloco title="Paradas há mais de 7 dias" icon={AlertTriangle} hint="Sem movimentação — risco de esquecer"
            action={paradas.length > 0 ? <span className="text-xs font-semibold text-amber-500 shrink-0">{paradas.length}</span> : undefined}>
            {paradas.length === 0
              ? <CarboEmptyState icon={CheckCircle2} title="Nada parado" description="Tudo teve movimentação recente." />
              : <div className="space-y-0.5">{paradas.slice(0, 6).map((d) => <DemandaLine key={d.id} d={d} onClick={irParaDemandas} />)}</div>}
          </Bloco>
        </div>

        {/* ── Indicadores ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Bloco title="Por etapa" icon={LayoutDashboard} hint="Distribuição no fluxo">
            {porEtapa.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados.</p>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={porEtapa} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {porEtapa.map((e) => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                  <Tooltip {...brandTip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Bloco>

          <Bloco title="Fila por prioridade" icon={AlertTriangle} hint="Só o que ainda não foi entregue">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={porPrioridade}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip {...brandTip} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                <Bar dataKey="value" name="Demandas" radius={[6, 6, 0, 0]}>
                  {porPrioridade.map((_, i) => (
                    <Cell key={i} fill={["#ef4444", "#f97316", "#f59e0b", "#94a3b8"][i] ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Bloco>

          <Bloco title="Por sistema" icon={Inbox} hint="De onde vêm as demandas">
            {porApp.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados.</p>
            ) : (
              <div className="space-y-2 pt-1">
                {porApp.map((a) => {
                  const pct = a.total ? Math.round((a.abertas / a.total) * 100) : 0;
                  return (
                    <div key={a.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{a.name}</span>
                        <span className="text-muted-foreground">{a.abertas} aberta(s) de {a.total}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-carbo-green rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {tempoMedio && (
                  <p className="text-[11px] text-muted-foreground pt-2 border-t">
                    Tempo médio de resolução: <strong className="text-foreground">{tempoMedio} dias</strong>
                  </p>
                )}
              </div>
            )}
          </Bloco>
        </div>

        {/* Últimas que chegaram */}
        <Bloco title="Chegaram por último" icon={Inbox} hint="As entradas mais recentes"
          action={<Button variant="ghost" size="sm" onClick={irParaDemandas} className="gap-1 text-xs">Ver todas <ArrowRight className="h-3 w-3" /></Button>}>
          {recentes.length === 0
            ? <CarboEmptyState icon={Inbox} title="Nenhuma demanda ainda" description="Os reportes dos apps aparecem aqui." />
            : (
              <div className="space-y-0.5">
                {recentes.map((d) => (
                  <button key={d.id} onClick={irParaDemandas}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${prioOf(d.priority).dot}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate">{d.title}</span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {d.reporter_name || "—"} · <span className="uppercase">{d.app}</span> · {dFmt(d.created_at)}
                      </span>
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{stageLabel(d.status)}</span>
                  </button>
                ))}
              </div>
            )}
        </Bloco>
      </div>
    </div>
  );
}
