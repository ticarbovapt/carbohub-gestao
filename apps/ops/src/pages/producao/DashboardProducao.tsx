import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { KPICard } from "@/components/board/KPICard";
import { StatusBadge } from "@/components/board/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardCheck, AlertTriangle, TrendingUp, Clock, Building2, Calendar, Download,
  Filter, MoreHorizontal, Factory,
} from "lucide-react";
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ⚠️ PORT VISUAL FIEL ao Controle (/dashboards/producao → DashboardProducao) — dados MOCK.

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const checklistTrend = DAYS.map((label, i) => ({ label, completed: 8 + ((i * 3) % 6), pending: 2 + (i % 3) }));
const osTrend = DAYS.map((label, i) => ({ label, completed: 4 + ((i * 2) % 5), pending: 1 + (i % 2) }));
const deptDistribution = [
  { label: "Preparação", count: 18, color: "#3b82f6" },
  { label: "Operação", count: 14, color: "#8b5cf6" },
  { label: "Expedição", count: 9, color: "#22c55e" },
  { label: "Pós-Venda", count: 5, color: "#f59e0b" },
];

const DEPARTMENT_LABELS: Record<string, string> = {
  venda: "Venda", preparacao: "Preparação", expedicao: "Expedição", operacao: "Operação", pos_venda: "Pós-Venda",
};

interface ChecklistRow { id: string; department: string; os_number: string; os_title: string; completed_by_name: string | null; completed_at: string | null; is_completed: boolean; }
const recentChecklists: ChecklistRow[] = [
  { id: "1", department: "preparacao", os_number: "OS-1042", os_title: "Preparação lote CarboZé 100ml", completed_by_name: "João Silva", completed_at: "2026-06-10T09:12:00", is_completed: true },
  { id: "2", department: "operacao", os_number: "OS-1041", os_title: "Operação envase 1L", completed_by_name: "Maria Souza", completed_at: "2026-06-10T08:40:00", is_completed: true },
  { id: "3", department: "expedicao", os_number: "OS-1040", os_title: "Expedição pedido #2041", completed_by_name: null, completed_at: null, is_completed: false },
  { id: "4", department: "pos_venda", os_number: "OS-1039", os_title: "Pós-venda acompanhamento", completed_by_name: "Carlos Lima", completed_at: "2026-06-09T17:05:00", is_completed: true },
  { id: "5", department: "preparacao", os_number: "OS-1038", os_title: "Preparação CarboPRO", completed_by_name: null, completed_at: null, is_completed: false },
];

const TREND_TOOLTIP = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" } as const;

function TrendChart({ title, description, data, variant }: { title: string; description: string; data: typeof checklistTrend; variant: "checklist" | "os" }) {
  const completedColor = variant === "checklist" ? "hsl(142, 76%, 36%)" : "hsl(217, 91%, 40%)";
  const pendingColor = "hsl(45, 93%, 47%)";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`cC${variant}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={completedColor} stopOpacity={0.3} /><stop offset="95%" stopColor={completedColor} stopOpacity={0} /></linearGradient>
              <linearGradient id={`cP${variant}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={pendingColor} stopOpacity={0.3} /><stop offset="95%" stopColor={pendingColor} stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TREND_TOOLTIP} labelStyle={{ color: "hsl(var(--foreground))" }} />
            <Legend />
            <Area type="monotone" dataKey="completed" name="Concluídos" stroke={completedColor} fillOpacity={1} fill={`url(#cC${variant})`} strokeWidth={2} />
            <Area type="monotone" dataKey="pending" name="Pendentes" stroke={pendingColor} fillOpacity={1} fill={`url(#cP${variant})`} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

const formatTime = (m: number) => (m < 60 ? `${m}min` : `${Math.floor(m / 60)}h ${m % 60}min`);
const fmtHora = (s: string | null) => (s ? new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

export default function DashboardProducao() {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-8 max-w-[1500px] mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <CarboPageHeader title="Dashboard — Produção" description="Checklists, Ordens de Produção e eficiência operacional" icon={Factory} />
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-40"><Calendar className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-44"><Building2 className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas unidades</SelectItem>
                {Object.entries(DEPARTMENT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline"><Download className="h-4 w-4 mr-1" /> Exportar</Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <KPICard title="Taxa de Conclusão" value="92%" subtitle="46 de 50 checklists" icon={<ClipboardCheck className="h-6 w-6" />} variant="success" />
          <KPICard title="Alertas Pendentes" value="4" subtitle="Checklists pendentes" icon={<AlertTriangle className="h-6 w-6" />} />
          <KPICard title="Tempo Médio" value={formatTime(38)} subtitle="Por checklist" icon={<Clock className="h-6 w-6" />} />
          <KPICard title="OP Ativas" value="12" subtitle="37 concluídas de 49" icon={<TrendingUp className="h-6 w-6" />} variant="success" />
        </div>

        {/* Gráficos */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <TrendChart title="Checklists — Últimos 7 dias" description="Evolução de conclusão de checklists" data={checklistTrend} variant="checklist" />
          <TrendChart title="Ordens de Produção — Últimos 7 dias" description="Evolução de criação e conclusão de OP" data={osTrend} variant="os" />
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Distribuição por Departamento</CardTitle>
              <CardDescription>OP por área de atuação</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={deptDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="count" nameKey="label">
                    {deptDistribution.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TREND_TOOLTIP} formatter={(v: number) => [`${v} OS`, ""]} />
                  <Legend formatter={(v) => <span className="text-sm">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Checklists recentes */}
        <div className="rounded-xl border border-border bg-board-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-board-text">Checklists Recentes</h2>
              <p className="text-sm text-board-muted">Últimas atividades registradas</p>
            </div>
            <Button variant="ghost" size="sm"><Filter className="h-4 w-4 mr-1" /> Filtrar</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  {["Departamento", "OS", "Operador", "Horário", "Status", ""].map((h, i) => (
                    <th key={i} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-board-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentChecklists.map((item) => (
                  <tr key={item.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-board-text">{DEPARTMENT_LABELS[item.department] || item.department}</td>
                    <td className="px-6 py-4 text-sm text-board-muted">
                      <div>
                        <span className="font-medium text-board-text">{item.os_number}</span>
                        <p className="text-xs text-board-muted truncate max-w-[200px]">{item.os_title}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-board-muted">{item.completed_by_name || "—"}</td>
                    <td className="px-6 py-4 text-sm text-board-muted">{fmtHora(item.completed_at)}</td>
                    <td className="px-6 py-4"><StatusBadge status={item.is_completed ? "completed" : "pending"} /></td>
                    <td className="px-6 py-4"><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <p className="text-sm text-board-muted">Mostrando {recentChecklists.length} checklists recentes</p>
            <Button variant="ghost" size="sm">Ver todos</Button>
          </div>
        </div>

        {/* Assistente de Anomalias */}
        <div className="rounded-xl border border-board-blue/20 bg-gradient-to-r from-board-blue/5 to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-board-blue/10 text-board-blue"><span className="text-2xl">🤖</span></div>
            <div>
              <h3 className="font-semibold text-board-text">Assistente de Anomalias</h3>
              <p className="mt-1 text-sm text-board-muted">Existem 4 checklists pendentes que precisam de atenção.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm">Ver detalhes</Button>
                <Button variant="ghost" size="sm">Dispensar</Button>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Tela em port visual — dados de exemplo. Os dados reais entram na fase de lógica.
        </p>
      </div>
    </div>
  );
}
