import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { KPICard } from "@/components/board/KPICard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck, AlertTriangle, CheckCircle, TrendingUp, Factory, Loader2 } from "lucide-react";
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useProductionDashboard } from "@/hooks/useProductionDashboard";

const TOOLTIP = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" } as const;

export default function DashboardProducao() {
  const { data, isLoading } = useProductionDashboard();

  const taxaConclusao = data && data.checklistsTotal > 0
    ? Math.round((data.checklistsCompletos / data.checklistsTotal) * 100) : 0;

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-8 max-w-[1500px] mx-auto">
        <CarboPageHeader title="Dashboard — Produção" description="Ordens de Produção e checklists operacionais" icon={Factory} />

        {isLoading || !data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
        ) : (
        <>
        {/* KPIs */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <KPICard title="OP Ativas" value={String(data.opAtivas)} subtitle={`${data.opConcluidas} concluídas de ${data.opTotal}`} icon={<TrendingUp className="h-6 w-6" />} variant="success" />
          <KPICard title="OPs Concluídas" value={String(data.opConcluidas)} subtitle="Confirmadas / concluídas" icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <KPICard title="Taxa de Conclusão" value={`${taxaConclusao}%`} subtitle={`${data.checklistsCompletos} de ${data.checklistsTotal} checklists`} icon={<ClipboardCheck className="h-6 w-6" />} />
          <KPICard title="Etapas Pendentes" value={String(data.etapasPendentes)} subtitle="Em checklists abertos" icon={<AlertTriangle className="h-6 w-6" />} />
        </div>

        {/* Gráficos */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Ordens de Produção — Últimos 7 dias</CardTitle>
              <CardDescription>Criadas vs. concluídas por dia</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={data.opTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gCriadas" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(217, 91%, 50%)" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(217, 91%, 50%)" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gConcl" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP} labelStyle={{ color: "hsl(var(--foreground))" }} />
                  <Legend />
                  <Area type="monotone" dataKey="criadas" name="Criadas" stroke="hsl(217, 91%, 50%)" fillOpacity={1} fill="url(#gCriadas)" strokeWidth={2} />
                  <Area type="monotone" dataKey="concluidas" name="Concluídas" stroke="hsl(142, 76%, 36%)" fillOpacity={1} fill="url(#gConcl)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">OPs por Status</CardTitle>
              <CardDescription>Distribuição atual</CardDescription>
            </CardHeader>
            <CardContent>
              {data.opByStatus.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Sem ordens de produção</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={data.opByStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="count" nameKey="label">
                      {data.opByStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP} formatter={(v: number) => [`${v} OP`, ""]} />
                    <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Checklists recentes */}
        <div className="rounded-xl border border-border bg-board-surface overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold text-board-text">Checklists Recentes</h2>
            <p className="text-sm text-board-muted">Últimos checklists atualizados</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  {["Checklist", "Departamento", "Progresso", "Status"].map((h, i) => (
                    <th key={i} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-board-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.recentChecklists.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-board-muted">Nenhum checklist</td></tr>
                )}
                {data.recentChecklists.map((c) => {
                  const completo = c.total > 0 && c.done === c.total;
                  return (
                    <tr key={c.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-board-text">{c.nome}</td>
                      <td className="px-6 py-4 text-sm text-board-muted">{c.departamento}</td>
                      <td className="px-6 py-4 text-sm text-board-muted">{c.done}/{c.total}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${completo ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}`}>
                          {completo ? "Concluído" : "Em andamento"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
