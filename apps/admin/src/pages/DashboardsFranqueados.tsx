import { Building2, DollarSign, Wrench, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL, monthLabel } from "@/lib/dash-format";
import { useFranqueadosKpis, useFranqueadosRevenueMonthly } from "@/hooks/useDashFranqueados";

// ── Helpers de gráfico (mesma estética do Comercial) ──────────────────────────
const fmtK = (v: number) =>
  v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M`
  : v >= 1000 ? `R$${(v / 1000).toFixed(0)}k`
  : `R$${Math.round(v)}`;

const TooltipBRL = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const main = payload.find((p: any) => p.type === "bar") ?? payload[0];
  return (
    <div style={{ background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 }}>
      <p style={{ color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{label}</p>
      <p style={{ color: "#4ade80" }}>{Number(main.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
    </div>
  );
};

const TooltipServ = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const main = payload.find((p: any) => p.type === "bar") ?? payload[0];
  return (
    <div style={{ background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 }}>
      <p style={{ color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{label}</p>
      <p style={{ color: "#93c5fd" }}>{Number(main.value).toLocaleString("pt-BR")} serviços</p>
    </div>
  );
};

function AccessNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Sem dados do Portal de Licenciados</p>
      <p className="text-xs text-muted-foreground max-w-md">
        Para ver o consolidado dos franqueados, seu usuário precisa ter{" "}
        <code className="font-mono bg-muted px-1 rounded">portal_licenciado</code> liberado em{" "}
        <span className="font-medium">Usuários → Sistemas liberados</span>. Sem essa liberação o
        portal não devolve os números da rede.
      </p>
    </div>
  );
}

export default function DashboardsFranqueados() {
  const { canAdmin } = useAuth();

  const { data: kpis, isLoading: kLoad } = useFranqueadosKpis();
  const { data: months = [] } = useFranqueadosRevenueMonthly(12);

  const chartData = months.map((m) => ({
    mes: monthLabel(m.month_start), faturado: m.revenue, servicos: m.services,
  }));
  const totalFaturado = chartData.reduce((s, d) => s + d.faturado, 0);
  const totalServicos = chartData.reduce((s, d) => s + d.servicos, 0);
  const hasData = Boolean(kpis) && ((kpis!.total_lojas ?? 0) > 0 || (kpis!.total_services ?? 0) > 0);

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <AccessNotice />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={Building2}
        iconColor="blue"
        title="Licenciados — Visão Geral"
        description="Rede de descarbonização CarboVapt · consolidado de todas as lojas"
      />

      {!kLoad && !hasData && <AccessNotice />}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CarboKPI title="Total de lojas" value={kpis?.total_lojas ?? 0} icon={Building2}
          iconColor="blue" loading={kLoad} />
        <CarboKPI title="Lojas ativas" value={kpis?.active_lojas ?? 0} icon={CheckCircle2}
          iconColor="green" loading={kLoad} />
        <CarboKPI title="Serviços no mês" value={kpis?.total_services ?? 0} icon={Wrench}
          iconColor="green" loading={kLoad} />
        <CarboKPI title="Receita no mês" value={fmtBRL(kpis?.total_revenue ?? 0)} icon={DollarSign}
          iconColor="green" loading={kLoad} />
      </div>

      {/* Gráficos no estilo do Comercial */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Faturamento por mês — área/coluna verde + linha */}
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-1 pt-5 px-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Total Faturado por Mês
                </CardTitle>
                <p className="text-xl font-bold text-green-500 leading-none tabular-nums mt-0.5">
                  {fmtK(totalFaturado)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">acumulado</span>
                </p>
              </div>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-green-500/10 text-green-500">R$</span>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<TooltipBRL />} />
                <Bar dataKey="faturado" fill="rgba(26,122,74,0.18)" stroke="#1a7a4a" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                  <LabelList dataKey="faturado" position="top"
                    formatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : v > 0 ? `R$${Math.round(v)}` : ""}
                    style={{ fontSize: 10, fill: "#1a7a4a", fontWeight: 700 }} />
                </Bar>
                <Line type="monotoneX" dataKey="faturado" stroke="#1a7a4a" strokeWidth={2.5}
                  dot={{ r: 3, fill: "#1a7a4a", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Serviços por mês — barras azuis + linha tracejada */}
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-1 pt-5 px-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Serviços por Mês
                </CardTitle>
                <p className="text-xl font-bold text-[#3b6ea5] leading-none tabular-nums mt-0.5">
                  {totalServicos.toLocaleString("pt-BR")}
                  <span className="text-xs font-normal text-muted-foreground ml-1">serviços</span>
                </p>
              </div>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-400">Qtd</span>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<TooltipServ />} />
                <Bar dataKey="servicos" fill="rgba(59,110,165,0.75)" radius={[5, 5, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                  <LabelList dataKey="servicos" position="top"
                    formatter={(v: number) => v > 0 ? String(v) : ""}
                    style={{ fontSize: 11, fill: "#94a3b8", fontWeight: 700 }} />
                </Bar>
                <Line type="monotoneX" dataKey="servicos" stroke="#3b6ea5" strokeWidth={2.5} strokeDasharray="5 3"
                  dot={{ r: 3, fill: "#3b6ea5", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
