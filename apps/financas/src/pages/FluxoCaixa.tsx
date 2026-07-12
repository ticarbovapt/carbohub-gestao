import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, Cell,
} from "recharts";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useFinAging } from "@/hooks/useFinanceDashboard";
import { useFinCashflow, useFinReceivablesAging, useFinReceivablesOnTime } from "@/hooks/useReceivables";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const brlC = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(v || 0);

const AGING = [
  { key: "vencido_30_mais", label: "Vencido +30d", color: "hsl(0, 72%, 45%)" },
  { key: "vencido_1_30", label: "Vencido ≤30d", color: "hsl(0, 72%, 60%)" },
  { key: "vence_hoje", label: "Vence hoje", color: "hsl(45, 93%, 54%)" },
  { key: "a_vencer_7", label: "A vencer 7d", color: "hsl(207, 77%, 61%)" },
  { key: "a_vencer_30", label: "A vencer 30d", color: "hsl(207, 60%, 45%)" },
  { key: "a_vencer_mais", label: "A vencer +30d", color: "hsl(145, 45%, 45%)" },
];
const agingChart = (rows: { bucket: string; total: number }[]) => {
  const by = new Map(rows.map((a) => [a.bucket, Number(a.total)]));
  return AGING.map((b) => ({ label: b.label, valor: by.get(b.key) ?? 0, color: b.color }));
};
const empty = <p className="text-muted-foreground text-sm text-center py-12">Sem dados</p>;

export default function FluxoCaixa() {
  const [source, setSource] = usePersistedState<string>("fin.caixa.source", "all");
  const { data: cashflow = [] } = useFinCashflow(source, 8);
  const { data: payAging = [] } = useFinAging(source);
  const { data: recAging = [] } = useFinReceivablesAging(source);
  const { data: onTime } = useFinReceivablesOnTime(source);

  // Fluxo semanal: entrada, saída e saldo ACUMULADO ao longo das semanas.
  const cashData = useMemo(() => {
    let acc = 0;
    return cashflow.map((c) => {
      const net = Number(c.entrada) - Number(c.saida);
      acc += net;
      return {
        semana: format(parseISO(c.semana), "dd/MM", { locale: ptBR }),
        Entrada: Number(c.entrada), Saída: -Number(c.saida), saldo: acc,
      };
    });
  }, [cashflow]);

  const totalEntrada = cashflow.reduce((s, c) => s + Number(c.entrada), 0);
  const totalSaida = cashflow.reduce((s, c) => s + Number(c.saida), 0);
  const saldo8s = totalEntrada - totalSaida;
  const inadimplencia = recAging.filter((a) => a.bucket.startsWith("vencido")).reduce((s, a) => s + Number(a.total), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {[["all", "Todas"], ["interno", "Sistema"], ["bling", "Bling"]].map(([v, l]) => (
            <button key={v} onClick={() => setSource(v)} aria-pressed={source === v}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${source === v ? "bg-carbo-green text-white" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">Contas em BRL. Origem "{source === "all" ? "todas" : source}".</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CarboCard variant="kpi" padding="sm"><CarboCardContent><p className="text-xs text-muted-foreground mb-1">Entradas (8 sem.)</p><p className="text-lg font-bold kpi-number text-success">{brl(totalEntrada)}</p></CarboCardContent></CarboCard>
        <CarboCard variant="kpi" padding="sm"><CarboCardContent><p className="text-xs text-muted-foreground mb-1">Saídas (8 sem.)</p><p className="text-lg font-bold kpi-number text-destructive">{brl(totalSaida)}</p></CarboCardContent></CarboCard>
        <CarboCard variant="kpi" padding="sm"><CarboCardContent><p className="text-xs text-muted-foreground mb-1">Saldo projetado (8 sem.)</p><p className={`text-lg font-bold kpi-number ${saldo8s < 0 ? "text-destructive" : "text-success"}`}>{brl(saldo8s)}</p></CarboCardContent></CarboCard>
        <CarboCard variant="kpi" padding="sm"><CarboCardContent><p className="text-xs text-muted-foreground mb-1">Inadimplência (vencido a receber)</p><p className="text-lg font-bold kpi-number text-destructive">{brl(inadimplencia)}</p></CarboCardContent></CarboCard>
      </div>

      <CarboCard>
        <CarboCardHeader><CarboCardTitle>Projeção de caixa — próximas 8 semanas</CarboCardTitle></CarboCardHeader>
        <CarboCardContent>
          {cashData.length === 0 ? empty : (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={cashData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={brlC} />
                <Tooltip formatter={(v: number, n: string) => [brl(Math.abs(v)), n === "saldo" ? "Saldo acumulado" : n]} labelFormatter={(l) => `Semana de ${l}`} />
                <Legend />
                <Bar dataKey="Entrada" fill="hsl(145, 55%, 51%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Saída" fill="hsl(0, 72%, 55%)" radius={[0, 0, 4, 4]} />
                <Line type="monotone" dataKey="saldo" name="Saldo acumulado" stroke="hsl(45, 93%, 54%)" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          {onTime && onTime.recebidos > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">Recebimento no prazo: {onTime.pct_no_prazo}% ({onTime.no_prazo}/{onTime.recebidos}).</p>
          )}
        </CarboCardContent>
      </CarboCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Aging de clientes (a receber)</CarboCardTitle></CarboCardHeader>
          <CarboCardContent>
            {agingChart(recAging).every((d) => d.valor === 0) ? empty : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={agingChart(recAging)} margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tickFormatter={brlC} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="valor" radius={[4, 4, 0, 0]}>{agingChart(recAging).map((d, i) => <Cell key={i} fill={d.color} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardHeader><CarboCardTitle>Aging de fornecedores (a pagar)</CarboCardTitle></CarboCardHeader>
          <CarboCardContent>
            {agingChart(payAging).every((d) => d.valor === 0) ? empty : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={agingChart(payAging)} margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tickFormatter={brlC} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="valor" radius={[4, 4, 0, 0]}>{agingChart(payAging).map((d, i) => <Cell key={i} fill={d.color} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CarboCardContent>
        </CarboCard>
      </div>
    </div>
  );
}
