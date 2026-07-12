import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  ComposedChart, Line, Area, AreaChart, LabelList,
} from "recharts";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { subMonths, differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { usePersistedState } from "@/hooks/usePersistedState";
import { usePurchaseRequests } from "@/hooks/usePurchasing";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { subscriptionMonthlyCost } from "@/types/purchasing";
import {
  useFinAging, useFinForecast, useFinStatusSummary, useFinMonthly, useFinTopSuppliers,
  useFinOnTime, useFinCycleTimes, useFin3Way, useFinSavings,
} from "@/hooks/useFinanceDashboard";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const brlC = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(v || 0);
const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
const today = () => new Date();

const AGING = [
  { key: "vencido_30_mais", label: "Vencido +30d", color: "hsl(0, 72%, 45%)" },
  { key: "vencido_1_30", label: "Vencido ≤30d", color: "hsl(0, 72%, 60%)" },
  { key: "vence_hoje", label: "Vence hoje", color: "hsl(45, 93%, 54%)" },
  { key: "a_vencer_7", label: "A vencer 7d", color: "hsl(207, 77%, 61%)" },
  { key: "a_vencer_30", label: "A vencer 30d", color: "hsl(207, 60%, 45%)" },
  { key: "a_vencer_mais", label: "A vencer +30d", color: "hsl(145, 45%, 45%)" },
];
const STATUS_META: Record<string, { label: string; color: string }> = {
  pago: { label: "Pago", color: "hsl(145, 55%, 51%)" },
  programado: { label: "Programado", color: "hsl(207, 77%, 61%)" },
  atrasado: { label: "Atrasado", color: "hsl(0, 72%, 51%)" },
  cancelado: { label: "Cancelado", color: "hsl(220, 9%, 60%)" },
};

function Kpi({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <CarboCard variant="kpi" padding="sm">
      <CarboCardContent>
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-xl font-bold kpi-number ${tone}`}>{value}</p>
      </CarboCardContent>
    </CarboCard>
  );
}
const empty = <p className="text-muted-foreground text-sm text-center py-12">Sem dados disponíveis</p>;

export function PurchasingDashboard() {
  const [source, setSource] = usePersistedState<string>("compras.dash.source", "all");
  const [meses, setMeses] = usePersistedState<number>("compras.dash.meses", 12);
  const periodo = useMemo(() => {
    const to = today().toISOString().slice(0, 10);
    const from = meses > 0 ? subMonths(today(), meses).toISOString().slice(0, 10) : undefined;
    return { from, to: meses > 0 ? to : undefined };
  }, [meses]);

  const { data: aging = [] } = useFinAging(source);
  const { data: forecast = [] } = useFinForecast(source, 8);
  const { data: statusSum = [] } = useFinStatusSummary(source, periodo.from, periodo.to);
  const { data: monthly = [] } = useFinMonthly(source, periodo.from, periodo.to);
  const { data: suppliers = [] } = useFinTopSuppliers(source, periodo.from, periodo.to, 8);
  const { data: onTime } = useFinOnTime(source, periodo.from, periodo.to);
  const { data: cycle = [] } = useFinCycleTimes();
  const { data: threeWay } = useFin3Way();
  const { data: savings } = useFinSavings();
  const { data: pendentes = [] } = usePurchaseRequests({ status: "aguardando_aprovacao" });
  const { data: subs = [] } = useSubscriptions();

  // ── Derivados ──────────────────────────────────────────────────────────────
  const agingData = useMemo(() => {
    const by = new Map(aging.map((a) => [a.bucket, Number(a.total)]));
    return AGING.map((b) => ({ label: b.label, valor: by.get(b.key) ?? 0, color: b.color }));
  }, [aging]);
  const totalVencido = useMemo(() => aging.filter((a) => a.bucket.startsWith("vencido")).reduce((s, a) => s + Number(a.total), 0), [aging]);
  const aVencer30 = useMemo(() => aging.filter((a) => a.bucket === "vence_hoje" || a.bucket === "a_vencer_7" || a.bucket === "a_vencer_30").reduce((s, a) => s + Number(a.total), 0), [aging]);

  const forecastData = useMemo(() => forecast.map((f) => ({
    semana: format(new Date(f.semana), "dd/MM", { locale: ptBR }), valor: Number(f.total),
  })), [forecast]);

  const statusData = useMemo(() => statusSum
    .filter((s) => s.status_efetivo !== "cancelado")
    .map((s) => ({ name: STATUS_META[s.status_efetivo]?.label ?? s.status_efetivo, value: Number(s.total), color: STATUS_META[s.status_efetivo]?.color ?? "hsl(220,9%,60%)" })), [statusSum]);

  const monthlyData = useMemo(() => monthly.map((m) => ({
    mes: format(new Date(m.mes), "MMM/yy", { locale: ptBR }), Pago: Number(m.pago), "Em aberto": Number(m.aberto),
  })), [monthly]);

  // Curva ABC (Pareto): barra de gasto + linha de % acumulado.
  const abcData = useMemo(() => {
    const totalGeral = suppliers.reduce((s, x) => s + Number(x.total), 0) || 1;
    let acc = 0;
    return suppliers.map((x) => {
      acc += Number(x.total);
      return {
        nome: x.supplier_name.length > 16 ? x.supplier_name.slice(0, 16) + "…" : x.supplier_name,
        valor: Number(x.total), acumulado: Math.round((acc / totalGeral) * 100),
      };
    });
  }, [suppliers]);

  const cycleData = useMemo(() => cycle.map((c) => ({ etapa: c.etapa, dias: Number(c.p50_dias), n: c.n })), [cycle]);

  const subsData = useMemo(() => {
    const acc: Record<string, { setor: string; BRL: number; USD: number }> = {};
    (subs ?? []).forEach((s) => {
      if (s.status !== "ativa") return;
      const setor = s.departamento || "Sem setor";
      acc[setor] = acc[setor] ?? { setor, BRL: 0, USD: 0 };
      const m = subscriptionMonthlyCost(s);
      if (s.currency === "USD") acc[setor].USD += m; else acc[setor].BRL += m;
    });
    return Object.values(acc).sort((a, b) => (b.BRL + b.USD) - (a.BRL + a.USD));
  }, [subs]);
  const hasUSD = subsData.some((d) => d.USD > 0);

  const renovacoes = useMemo(() => (subs ?? [])
    .filter((s) => s.status === "ativa" && s.proximo_vencimento && differenceInCalendarDays(new Date(s.proximo_vencimento), today()) <= 60)
    .sort((a, b) => new Date(a.proximo_vencimento!).getTime() - new Date(b.proximo_vencimento!).getTime())
    .slice(0, 8), [subs]);

  return (
    <div className="space-y-6">
      {/* Filtros globais */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {[["all", "Todas"], ["interno", "Sistema"], ["bling", "Bling"]].map(([v, l]) => (
            <button key={v} onClick={() => setSource(v)} aria-pressed={source === v}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${source === v ? "bg-carbo-green text-white" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {[[6, "6 meses"], [12, "12 meses"], [0, "Tudo"]].map(([v, l]) => (
            <button key={v} onClick={() => setMeses(v as number)} aria-pressed={meses === v}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${meses === v ? "bg-carbo-green text-white" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">Contas a pagar em BRL. Assinaturas em BRL/USD separadas. Origem "{source === "all" ? "todas" : source}".</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Vencido (em aberto)" value={brl(totalVencido)} tone={totalVencido > 0 ? "text-destructive" : ""} />
        <Kpi label="A vencer (30 dias)" value={brl(aVencer30)} />
        <Kpi label="Pago no prazo" value={onTime?.pct_no_prazo != null ? `${onTime.pct_no_prazo}%` : "—"} tone={(onTime?.pct_no_prazo ?? 100) < 80 ? "text-warning" : "text-success"} />
        <Kpi label="3-way OK" value={threeWay?.pct_ok != null ? `${threeWay.pct_ok}%` : "—"} />
      </div>

      {/* Seção Caixa */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Aging — contas a pagar em aberto</CarboCardTitle></CarboCardHeader>
          <CarboCardContent>
            {agingData.every((d) => d.valor === 0) ? empty : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={agingData} margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tickFormatter={brlC} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                    {agingData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Previsão de desembolso — próximas 8 semanas</CarboCardTitle></CarboCardHeader>
          <CarboCardContent>
            {forecastData.length === 0 ? empty : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={forecastData} margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={brlC} />
                  <Tooltip formatter={(v: number) => brl(v)} labelFormatter={(l) => `Semana de ${l}`} />
                  <Bar dataKey="valor" fill="hsl(207, 77%, 61%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CarboCardContent>
        </CarboCard>
      </div>

      {/* Seção Pagamento + Spend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Contas a pagar por status</CarboCardTitle></CarboCardHeader>
          <CarboCardContent>
            {statusData.length === 0 ? empty : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${brlC(value)}`}>
                    {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(v: number) => brl(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
            {onTime && onTime.pagos > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">No período: {onTime.no_prazo} pagas no prazo · {onTime.atrasados} com atraso ({onTime.pct_no_prazo}% em dia).</p>
            )}
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Evolução mensal do desembolso</CarboCardTitle></CarboCardHeader>
          <CarboCardContent>
            {monthlyData.length === 0 ? empty : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthlyData} margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={brlC} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="Pago" stackId="1" stroke="hsl(145, 55%, 51%)" fill="hsl(145, 55%, 51%)" fillOpacity={0.5} />
                  <Area type="monotone" dataKey="Em aberto" stackId="1" stroke="hsl(207, 77%, 61%)" fill="hsl(207, 77%, 61%)" fillOpacity={0.5} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CarboCardContent>
        </CarboCard>
      </div>

      {/* Curva ABC */}
      <CarboCard>
        <CarboCardHeader><CarboCardTitle>Concentração por fornecedor (curva ABC)</CarboCardTitle></CarboCardHeader>
        <CarboCardContent>
          {abcData.length === 0 ? empty : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={abcData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis yAxisId="l" tickFormatter={brlC} />
                <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip formatter={(v: number, n: string) => n === "% acumulado" ? `${v}%` : brl(v)} />
                <Bar yAxisId="l" dataKey="valor" name="Gasto" fill="hsl(145, 55%, 51%)" radius={[4, 4, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="acumulado" name="% acumulado" stroke="hsl(45, 93%, 54%)" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CarboCardContent>
      </CarboCard>

      {/* Seção Processo P2P */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Tempo de ciclo por etapa (dias, mediana)</CarboCardTitle></CarboCardHeader>
          <CarboCardContent>
            {cycleData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-12">Sem histórico do fluxo interno ainda</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={cycleData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => `${v}d`} />
                  <YAxis type="category" dataKey="etapa" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `${v} dias`} />
                  <Bar dataKey="dias" fill="hsl(207, 77%, 61%)" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="dias" position="right" formatter={(v: number) => `${v}d`} className="fill-foreground text-xs" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {threeWay && threeWay.total > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">3-way match: {threeWay.ok}/{threeWay.total} NFs OK · {threeWay.divergentes} com divergência.</p>
            )}
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="flex items-center gap-2">
              RCs paradas em aprovação
              {pendentes.length > 0 && <CarboBadge variant="warning" className="text-[10px]">{pendentes.length}</CarboBadge>}
            </CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent>
            {pendentes.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-12">Nenhuma RC aguardando aprovação 🎉</p>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto">
                {pendentes.slice(0, 12).map((rc) => {
                  const dias = differenceInCalendarDays(today(), new Date(rc.submitted_at ?? rc.created_at));
                  return (
                    <div key={rc.id} className="flex items-center justify-between text-sm border-b border-border pb-1.5">
                      <div className="min-w-0">
                        <p className="font-mono truncate">{rc.rc_number}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{rc.cost_center} · {brl(rc.estimated_value)}</p>
                      </div>
                      <CarboBadge variant={dias >= 3 ? "destructive" : "secondary"} className="text-[10px] shrink-0">{dias}d parada</CarboBadge>
                    </div>
                  );
                })}
              </div>
            )}
            {savings && savings.n > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2 border-t border-border pt-2">
                Economia de cotação: <strong className="text-carbo-green">{brl(savings.economia)}</strong> (estimado {brlC(savings.total_estimado)} → cotado {brlC(savings.total_escolhido)}, {savings.n} RCs).
              </p>
            )}
          </CarboCardContent>
        </CarboCard>
      </div>

      {/* Seção Assinaturas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Assinaturas ativas — custo mensal por setor</CarboCardTitle></CarboCardHeader>
          <CarboCardContent>
            {subsData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-12">Nenhuma assinatura ativa</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, subsData.length * 46)}>
                <BarChart data={subsData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={brlC} />
                  <YAxis type="category" dataKey="setor" width={110} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number, n: string) => n === "USD/mês" ? usd(v) : brl(v)} />
                  <Legend />
                  <Bar dataKey="BRL" name="BRL/mês" fill="hsl(145, 55%, 51%)" radius={[0, 4, 4, 0]} />
                  {hasUSD && <Bar dataKey="USD" name="USD/mês" fill="hsl(207, 77%, 61%)" radius={[0, 4, 4, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">Normalizado por mês. BRL e USD separados — nunca somados.</p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Próximas renovações (60 dias)</CarboCardTitle></CarboCardHeader>
          <CarboCardContent>
            {renovacoes.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-12">Nada renovando nos próximos 60 dias</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {renovacoes.map((s) => {
                  const dias = differenceInCalendarDays(new Date(s.proximo_vencimento!), today());
                  const money = s.currency === "USD" ? usd : brl;
                  return (
                    <div key={s.id} className="flex items-center justify-between text-sm border-b border-border pb-1.5">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.nome}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{s.departamento || "—"} · {money(Number(s.valor))} · {s.cobranca === "manual" ? "manual" : "automática"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs">{format(new Date(s.proximo_vencimento!), "dd/MM", { locale: ptBR })}</p>
                        <CarboBadge variant={dias <= 7 && s.cobranca === "manual" ? "destructive" : "secondary"} className="text-[10px]">{dias <= 0 ? "hoje/venc." : `${dias}d`}</CarboBadge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CarboCardContent>
        </CarboCard>
      </div>
    </div>
  );
}
