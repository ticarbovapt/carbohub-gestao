import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, Cell,
} from "recharts";
import { Landmark, AlertTriangle } from "lucide-react";
import { useParamUrl } from "@carbo/shell";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFinAging } from "@/hooks/useFinanceDashboard";
import { useFinCashflow, useFinReceivablesAging, useFinReceivablesOnTime } from "@/hooks/useReceivables";
import { dataBR } from "@/lib/datas";

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

const ORIGENS: [string, string][] = [["all", "Todas"], ["interno", "Sistema"], ["bling", "Bling"]];
const SEMANAS = ["4", "8", "12"];

function Segmentado({ opcoes, valor, onChange, rotulo }: {
  opcoes: [string, string][]; valor: string; onChange: (v: string) => void; rotulo: string;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label={rotulo}>
      {opcoes.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={valor === v}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${valor === v ? "bg-carbo-green text-white" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
      ))}
    </div>
  );
}

export default function FluxoCaixa() {
  // Filtros na URL — F5 e link mantêm a mesma pergunta.
  const [origemUrl, setOrigem] = useParamUrl("origem", "all");
  const [semanasUrl, setSemanas] = useParamUrl("semanas", "8");
  const source = ORIGENS.some(([v]) => v === origemUrl) ? origemUrl : "all";
  const semanasTxt = SEMANAS.includes(semanasUrl) ? semanasUrl : "8";
  const semanas = Number(semanasTxt);

  const { data: cashflow = [], isLoading: cashLoading, isError: cashError } = useFinCashflow(source, semanas);
  const { data: payAging = [] } = useFinAging(source);
  const { data: recAging = [], isLoading: recLoading, isError: recError } = useFinReceivablesAging(source);
  const { data: onTime } = useFinReceivablesOnTime(source);

  // Fluxo semanal: entrada, saída e saldo ACUMULADO ao longo das semanas.
  // `semana` é DATE (`AAAA-MM-DD`, a segunda-feira): lida como texto, sem fuso.
  const cashData = useMemo(() => {
    let acc = 0;
    return cashflow.map((c) => {
      acc += Number(c.entrada) - Number(c.saida);
      return { semana: dataBR(c.semana).slice(0, 5), Entrada: Number(c.entrada), Saída: -Number(c.saida), saldo: acc };
    });
  }, [cashflow]);

  const totalEntrada = cashflow.reduce((s, c) => s + Number(c.entrada), 0);
  const totalSaida = cashflow.reduce((s, c) => s + Number(c.saida), 0);
  const saldoPrevisto = totalEntrada - totalSaida;
  const inadimplencia = recAging.filter((a) => a.bucket.startsWith("vencido")).reduce((s, a) => s + Number(a.total), 0);

  return (
    <div className="space-y-6">
      <CarboPageHeader
        title="Fluxo de caixa"
        icon={Landmark}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmentado rotulo="Origem" opcoes={ORIGENS} valor={source} onChange={setOrigem} />
        <Segmentado rotulo="Horizonte" opcoes={SEMANAS.map((s) => [s, `${s} semanas`])} valor={semanasTxt} onChange={setSemanas} />
      </div>

      {/* KPIs — enquanto carrega, esqueleto; se a consulta falha, diz que falhou.
          Mostrar R$ 0,00 nos dois casos se lê como "não houve movimento". */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: `Entradas previstas (${semanas} sem.)`, valor: totalEntrada, cor: "text-success", loading: cashLoading, error: cashError },
          { label: `Saídas previstas (${semanas} sem.)`, valor: totalSaida, cor: "text-destructive", loading: cashLoading, error: cashError },
          {
            label: `Saldo previsto (${semanas} sem.)`, valor: saldoPrevisto, cor: saldoPrevisto < 0 ? "text-destructive" : "text-success",
            loading: cashLoading, error: cashError, sub: "sem saldo em banco",
          },
          { label: "Inadimplência (vencido a receber)", valor: inadimplencia, cor: "text-destructive", loading: recLoading, error: recError },
        ].map((k) => (
          <CarboCard key={k.label} variant="kpi" padding="sm"><CarboCardContent>
            <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
            {k.loading ? <Skeleton className="h-7 w-28" />
              : k.error ? <p className="text-sm text-destructive">Erro ao carregar</p>
              : <p className={`text-lg font-bold kpi-number break-words ${k.cor}`}>{brl(k.valor)}</p>}
            {k.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</p>}
          </CarboCardContent></CarboCard>
        ))}
      </div>

      <CarboCard>
        <CarboCardHeader><CarboCardTitle>Projeção — próximas {semanas} semanas</CarboCardTitle></CarboCardHeader>
        <CarboCardContent>
          {/* ⚠️ A RPC joga TODO o vencido em aberto, de qualquer data, na 1ª semana —
              sem este aviso a primeira barra parece uma semana excepcional. */}
          <p className="mb-2 flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-warning-foreground">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            A 1ª semana inclui todo o vencido em aberto.
          </p>
          {cashData.length === 0 ? empty : (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={cashData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={brlC} />
                <Tooltip formatter={(v: number, n: string) => [brl(Math.abs(v)), n]} labelFormatter={(l) => `Semana de ${l}`} />
                <Legend />
                <Bar dataKey="Entrada" fill="hsl(145, 55%, 51%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Saída" fill="hsl(0, 72%, 55%)" radius={[0, 0, 4, 4]} />
                <Line type="monotone" dataKey="saldo" name="Saldo previsto acumulado" stroke="hsl(45, 93%, 54%)" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          {onTime && onTime.recebidos > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Recebimento no prazo: {onTime.pct_no_prazo}% ({onTime.no_prazo}/{onTime.recebidos}).
            </p>
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
