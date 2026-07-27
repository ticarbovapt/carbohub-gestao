import { useMemo, useState } from "react";
import { Building2, DollarSign, Wrench, AlertTriangle, Trophy, Gauge, Receipt, Store } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL, fmtBRLc, delta } from "@/lib/dash-format";
import { PeriodPicker, presetRange, rangeLabel, type PeriodRange } from "@/components/ui/PeriodPicker";
import {
  useFranqueadosKpis, useFranqueadosKpisPrev,
  useFranqueadosRanking, useFranqueadosPorte, useFranqueadosRecentServices,
  useTicketMedio, useLicenseesTimeseries,
} from "@/hooks/useDashFranqueados";

const LOJAS_POR_PAGINA = 10;
const PORTE_COLORS = ["#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b", "#14b8a6", "#ef4444"];

// Compacto — só para eixos e rótulos DENTRO de gráfico. Valores de card e de
// lista usam fmtBRL/fmtBRLc, para não perder precisão (um ticket de R$1.480
// não pode virar "R$1k").
const fmtK = (v: number) =>
  v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M`
  : v >= 1000 ? `R$${(v / 1000).toFixed(0)}k`
  : `R$${Math.round(v)}`;

// Tooltip do Recharts com as cores do tema (os tokens são tripletes HSL, então
// precisam do wrapper hsl(); `var(--background)` cru é CSS inválido).
const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
} as const;
const AXIS_TICK = { fontSize: 10, fill: "hsl(var(--muted-foreground))" } as const;

function AccessNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Sem acesso aos dados da rede</p>
      <p className="text-xs text-muted-foreground max-w-md">
        Seu usuário precisa ter o Portal de Licenciados liberado em{" "}
        <span className="font-medium">Usuários → Sistemas liberados</span> para ver o consolidado da rede.
      </p>
    </div>
  );
}

function ErrorNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive/70" />
      <p className="text-sm font-medium">Não foi possível carregar os dados da rede</p>
      <p className="text-xs text-muted-foreground">A consulta falhou. Tente novamente em alguns instantes.</p>
      <button
        onClick={onRetry}
        className="mt-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
      >
        Tentar de novo
      </button>
    </div>
  );
}

type Metrica = "receita" | "servicos";
type Granularidade = "dia" | "mes";

export default function DashboardsFranqueados() {
  const { canAdmin } = useAuth();

  // Filtro de período — governa TODOS os blocos da tela, sem exceção.
  const [range, setRange] = useState<PeriodRange>(() => presetRange("month"));

  const kpisQ = useFranqueadosKpis(range);
  const prevQ = useFranqueadosKpisPrev(range);
  const rankingQ = useFranqueadosRanking(range);
  const porteQ = useFranqueadosPorte(range);
  const recentesQ = useFranqueadosRecentServices(10);
  const ticketQ = useTicketMedio(range);
  const dailyQ = useLicenseesTimeseries(range);

  const kpis = kpisQ.data;
  const prev = prevQ.data;
  const ranking = rankingQ.data ?? [];
  // "Top" só faz sentido para quem registrou algo no período.
  const topLicenciados = ranking.filter((r) => r.services > 0);
  const porte = porteQ.data ?? [];
  const recentes = recentesQ.data ?? [];
  const daily = dailyQ.data ?? [];

  // Gráfico único: métrica (receita | serviços) × granularidade (dia | mês).
  // A granularidade começa automática pelo tamanho do período selecionado.
  const spanDias = useMemo(() => {
    const ms = new Date(`${range.to}T23:59:59`).getTime() - new Date(`${range.from}T00:00:00`).getTime();
    return Math.max(1, Math.round(ms / 86400000));
  }, [range]);
  const [metrica, setMetrica] = useState<Metrica>("receita");
  const [granul, setGranul] = useState<Granularidade | null>(null);
  const granularidade: Granularidade = granul ?? (spanDias > 62 ? "mes" : "dia");

  const serie = useMemo(() => {
    if (granularidade === "dia") {
      return daily.map((d) => ({
        label: new Date(d.day + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        receita: d.revenue, servicos: d.total_services,
      }));
    }
    const porMes = new Map<string, { receita: number; servicos: number }>();
    for (const d of daily) {
      const key = d.day.slice(0, 7);
      const acc = porMes.get(key) ?? { receita: 0, servicos: 0 };
      acc.receita += d.revenue; acc.servicos += d.total_services;
      porMes.set(key, acc);
    }
    return Array.from(porMes.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({
      label: new Date(`${key}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", ""),
      ...v,
    }));
  }, [daily, granularidade]);

  const totalSerie = serie.reduce((s, d) => s + (metrica === "receita" ? d.receita : d.servicos), 0);

  // Lojas ativas, ordenadas por descarbonizações do período (quem registra primeiro).
  const [lojasVisiveis, setLojasVisiveis] = useState(LOJAS_POR_PAGINA);
  const lojas = ranking.filter((l) => l.active);
  const lojasSemRegistro = lojas.filter((l) => l.services === 0).length;

  const carregando = kpisQ.isLoading;
  const falhou = kpisQ.isError || rankingQ.isError || dailyQ.isError;
  const semAcesso = !carregando && !falhou && Boolean(kpis)
    && (kpis!.total_lojas ?? 0) === 0 && (kpis!.total_services ?? 0) === 0;

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <AccessNotice />
      </main>
    );
  }

  // Sem período anterior comparável, não mostramos variação — "0%" seria mentira.
  const temComparativo = Boolean(prev) && ((prev!.total_revenue ?? 0) > 0 || (prev!.total_services ?? 0) > 0);
  const dRevenue = temComparativo ? delta(kpis?.total_revenue ?? 0, prev!.total_revenue ?? 0) : null;
  const dServices = temComparativo ? delta(kpis?.total_services ?? 0, prev!.total_services ?? 0) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={Building2}
        iconColor="blue"
        title="Licenciados — Visão Geral"
        description={`Rede de descarbonização CarboVapt · ${rangeLabel(range)}`}
        actions={<PeriodPicker value={range} onChange={setRange} />}
      />

      {falhou ? (
        <ErrorNotice onRetry={() => { kpisQ.refetch(); rankingQ.refetch(); dailyQ.refetch(); porteQ.refetch(); }} />
      ) : (
        <>
          {semAcesso && <AccessNotice />}

          {/* KPIs — 4 cards, com variação vs período anterior */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <CarboKPI title="Receita no período" value={fmtBRL(kpis?.total_revenue ?? 0)} icon={DollarSign}
              iconColor="green" loading={carregando}
              trend={dRevenue ? { ...dRevenue, label: "vs período anterior" } : undefined} />
            <CarboKPI title="Serviços no período" value={kpis?.total_services ?? 0} icon={Wrench}
              iconColor="green" loading={carregando}
              trend={dServices ? { ...dServices, label: "vs período anterior" } : undefined} />
            <CarboKPI title="Ticket médio" value={fmtBRLc(ticketQ.data ?? 0)} icon={Receipt}
              iconColor="green" loading={carregando || ticketQ.isLoading} />
            <CarboKPI title="Lojas ativas" value={`${kpis?.active_lojas ?? 0} / ${kpis?.total_lojas ?? 0}`} icon={Store}
              iconColor="blue" loading={carregando} />
          </div>

          {/* Gráfico único — métrica × granularidade, sempre no período filtrado */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-1 pt-5 px-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {metrica === "receita" ? "Receita no período" : "Serviços no período"}
                  </CardTitle>
                  <p className={`text-xl font-bold leading-none tabular-nums mt-0.5 ${metrica === "receita" ? "text-green-500" : "text-[#3b6ea5]"}`}>
                    {metrica === "receita" ? fmtBRL(totalSerie) : totalSerie.toLocaleString("pt-BR")}
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      {metrica === "receita" ? "acumulado" : "serviços"}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
                    {(["receita", "servicos"] as Metrica[]).map((m) => (
                      <button key={m} onClick={() => setMetrica(m)}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${metrica === m ? "bg-carbo-green text-white" : "text-muted-foreground hover:text-foreground"}`}>
                        {m === "receita" ? "Receita" : "Serviços"}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
                    {(["dia", "mes"] as Granularidade[]).map((g) => (
                      <button key={g} onClick={() => setGranul(g)}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${granularidade === g ? "bg-carbo-green text-white" : "text-muted-foreground hover:text-foreground"}`}>
                        {g === "dia" ? "Dia" : "Mês"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              {carregando || dailyQ.isLoading ? (
                <div className="h-[280px] animate-pulse rounded-xl bg-muted/30" />
              ) : serie.length === 0 ? (
                <p className="px-3 py-24 text-center text-sm text-muted-foreground">Sem atividade no período selecionado.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={serie} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} allowDecimals={false}
                      tickFormatter={(v: number) => metrica === "receita"
                        ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))
                        : String(v)} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(148,163,184,0.08)" }}
                      formatter={(v: number) => [metrica === "receita" ? fmtBRL(v) : `${v} serviços`, ""]} />
                    <Bar dataKey={metrica === "receita" ? "receita" : "servicos"}
                      fill={metrica === "receita" ? "rgba(26,122,74,0.25)" : "rgba(59,110,165,0.6)"}
                      stroke={metrica === "receita" ? "#1a7a4a" : "#3b6ea5"} strokeWidth={1.5}
                      radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                    <Line type="monotoneX" dataKey={metrica === "receita" ? "receita" : "servicos"}
                      stroke={metrica === "receita" ? "#1a7a4a" : "#3b6ea5"} strokeWidth={2.5}
                      dot={{ r: 2.5 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Diagnóstico — duas colunas de mesma altura */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-2 pt-5 px-5">
                <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" /> Top Licenciados
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 h-[280px] overflow-y-auto">
                {rankingQ.isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/30" />)}</div>
                ) : topLicenciados.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">Nenhuma loja registrou serviço no período.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {topLicenciados.slice(0, 6).map((r, idx) => (
                      <div key={r.loja_id} className="flex items-center justify-between py-2.5 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-5 text-center shrink-0 text-xs font-bold text-muted-foreground tabular-nums">{idx + 1}º</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {[r.city, r.state].filter(Boolean).join(" · ") || "—"} · {r.services} serviço{r.services !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">{fmtBRL(r.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-2 pt-5 px-5">
                <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Gauge className="h-3.5 w-3.5 text-primary" /> Serviços por Porte
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4 h-[280px]">
                {porteQ.isLoading ? (
                  <div className="h-full animate-pulse rounded-xl bg-muted/30" />
                ) : porte.length === 0 ? (
                  <p className="py-24 text-center text-sm text-muted-foreground">Sem serviços no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={porte} dataKey="total" nameKey="porte" cx="50%" cy="50%"
                        innerRadius={48} outerRadius={82} paddingAngle={2} isAnimationActive={false}>
                        {porte.map((_, i) => <Cell key={i} fill={PORTE_COLORS[i % PORTE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} serviços`, ""]} />
                      <Legend formatter={(v) => <span className="text-xs capitalize">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Últimos serviços */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <Wrench className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Últimos serviços</h2>
            </div>
            <div className="divide-y divide-border">
              {recentesQ.isLoading ? (
                <div className="px-5 py-8"><div className="h-10 animate-pulse rounded-lg bg-muted/30" /></div>
              ) : recentes.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum serviço registrado recentemente.</p>
              ) : recentes.map((s) => (
                <div key={s.service_id} className="flex items-center justify-between px-5 py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.loja_name}</p>
                    <p className="text-xs text-muted-foreground truncate capitalize">
                      {[s.porte, s.fuel_type].filter(Boolean).join(" · ") || "—"}
                      {s.performed_at ? ` · ${new Date(s.performed_at).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">{fmtBRL(s.total_value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lojas ativas — amostragem de 10, quem registra primeiro */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Lojas ativas</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                {lojas.length} loja{lojas.length !== 1 ? "s" : ""}
                {lojasSemRegistro > 0 && ` · ${lojasSemRegistro} sem registro no período`}
              </span>
            </div>
            <div className="overflow-x-auto">
              {rankingQ.isLoading ? (
                <div className="px-5 py-8 space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted/30" />)}</div>
              ) : lojas.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhuma loja ativa.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-secondary/30">
                    <tr>
                      <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loja</th>
                      <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cidade</th>
                      <th scope="col" className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">UF</th>
                      <th scope="col" className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descarbonizações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lojas.slice(0, lojasVisiveis).map((l) => (
                      <tr key={l.loja_id} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-5 py-3 font-medium text-foreground">{l.name}</td>
                        <td className="px-5 py-3 text-muted-foreground">{l.city || "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground">{l.state || "—"}</td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          {l.services > 0
                            ? <span className="font-semibold text-foreground">{l.services}</span>
                            : <span className="text-xs text-muted-foreground">sem registro</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {lojas.length > LOJAS_POR_PAGINA && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
                <span className="text-xs text-muted-foreground">
                  Mostrando {Math.min(lojasVisiveis, lojas.length)} de {lojas.length}
                </span>
                <div className="flex items-center gap-2">
                  {lojasVisiveis > LOJAS_POR_PAGINA && (
                    <button onClick={() => setLojasVisiveis(LOJAS_POR_PAGINA)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      Recolher
                    </button>
                  )}
                  {lojasVisiveis < lojas.length && (
                    <button onClick={() => setLojasVisiveis((n) => n + LOJAS_POR_PAGINA)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
                      Mostrar mais {Math.min(LOJAS_POR_PAGINA, lojas.length - lojasVisiveis)}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
