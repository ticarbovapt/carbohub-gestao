import { useMemo } from "react";
import {
  TrendingUp, ShoppingCart, DollarSign, BarChart3, ArrowUpRight, ArrowDownRight, Receipt,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";

// ⚠️ PORT VISUAL — dados MOCK. TODO: ligar nas vendas reais (Supabase) na fase de lógica.

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthly = MESES.map((m, i) => {
  const base = 38000 + i * 4200 + (i % 3) * 6000;
  return { mes: m, faturamento: base, pedidos: 40 + i * 5 + (i % 4) * 8 };
});
const porProduto = [
  { produto: "CarboZé 100ml", valor: 182000 },
  { produto: "CarboZé 1L", valor: 124000 },
  { produto: "CarboPRO", valor: 96000 },
  { produto: "CarboVapt", valor: 61000 },
  { produto: "Sachê 10ml", valor: 38000 },
];

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtK = (n: number) => (n >= 1000 ? `R$ ${(n / 1000).toFixed(0)}k` : brl(n));

export default function DashboardComercial() {
  const { totalFat, totalPedidos, ticket, growth } = useMemo(() => {
    const totalFat = monthly.reduce((s, m) => s + m.faturamento, 0);
    const totalPedidos = monthly.reduce((s, m) => s + m.pedidos, 0);
    const last = monthly[monthly.length - 1].faturamento;
    const prev = monthly[monthly.length - 2].faturamento;
    return {
      totalFat, totalPedidos,
      ticket: totalFat / totalPedidos,
      growth: ((last - prev) / prev) * 100,
    };
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <CarboPageHeader title="Dashboard — Comercial" description="Visão geral das vendas" icon={BarChart3} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <CarboKPI title="Faturamento" value={brl(totalFat)} icon={DollarSign} iconColor="green" delay={50} />
        <CarboKPI title="Pedidos" value={totalPedidos} icon={ShoppingCart} iconColor="blue" delay={100} />
        <CarboKPI title="Ticket médio" value={brl(ticket)} icon={Receipt} iconColor="blue" delay={150} />
        <CarboCard>
          <CarboCardContent className="p-4">
            <p className="text-xs text-muted-foreground">Crescimento (mês)</p>
            <div className="flex items-center gap-1.5 mt-1">
              {growth >= 0 ? <ArrowUpRight className="h-5 w-5 text-success" /> : <ArrowDownRight className="h-5 w-5 text-destructive" />}
              <span className={`text-2xl font-bold ${growth >= 0 ? "text-success" : "text-destructive"}`}>
                {growth >= 0 ? "+" : ""}{growth.toFixed(1)}%
              </span>
            </div>
          </CarboCardContent>
        </CarboCard>
      </div>

      {/* Faturamento mensal (barras) + pedidos (linha) */}
      <CarboCard>
        <CarboCardContent className="p-4">
          <h2 className="font-semibold flex items-center gap-2 mb-4"><TrendingUp className="h-4 w-4 text-carbo-green" /> Faturamento e pedidos por mês</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="left" tickFormatter={fmtK} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={48} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={32} />
                <Tooltip
                  formatter={(v: number, n) => (n === "faturamento" ? brl(v) : `${v} pedidos`)}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="faturamento" name="Faturamento" fill="hsl(var(--carbo-green))" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Line yAxisId="right" dataKey="pedidos" name="Pedidos" stroke="hsl(var(--carbo-blue))" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CarboCardContent>
      </CarboCard>

      {/* Vendas por produto */}
      <CarboCard>
        <CarboCardContent className="p-4">
          <h2 className="font-semibold flex items-center gap-2 mb-4"><BarChart3 className="h-4 w-4 text-carbo-green" /> Vendas por produto</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porProduto} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="produto" tick={{ fontSize: 12 }} width={110} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(v: number) => brl(v)}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="valor" name="Faturamento" fill="hsl(var(--carbo-green))" radius={[0, 6, 6, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CarboCardContent>
      </CarboCard>

      <p className="text-xs text-muted-foreground text-center">
        Tela em port visual — números de exemplo. Os dados reais de vendas entram na fase de lógica.
      </p>
    </div>
  );
}
