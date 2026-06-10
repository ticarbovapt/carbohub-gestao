import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Wallet, CalendarRange } from "lucide-react";

// ⚠️ PORT VISUAL FIEL ao Controle (/dashboards/financeiro → PurchasingDashboard) — dados MOCK.

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const statusData = [
  { name: "A pagar", value: 23600, color: "#f59e0b" },
  { name: "Pago", value: 41200, color: "#22c55e" },
  { name: "Atrasado", value: 4700, color: "#ef4444" },
];
const costBySupplier = [
  { name: "QuímicaSul", valor: 38900 },
  { name: "EmbaNorte", valor: 15300 },
  { name: "InsumosBR", valor: 9400 },
  { name: "BioReagentes", valor: 6100 },
].sort((a, b) => b.valor - a.valor);

export default function DashboardFinanceiro() {
  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <CarboPageHeader title="Dashboard Financeiro" description="Contas a pagar, ordens de compra e fluxo financeiro" icon={Wallet} />
          <div className="flex items-end gap-2 shrink-0">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><CalendarRange className="h-3 w-3" /> Período</Label>
              <div className="flex items-center gap-1">
                <Input type="date" className="h-8 w-[130px] text-xs" /><span className="text-xs text-muted-foreground">até</span><Input type="date" className="h-8 w-[130px] text-xs" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <CarboCard>
            <CarboCardHeader><CarboCardTitle>Contas a Pagar por Status</CarboCardTitle></CarboCardHeader>
            <CarboCardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${brl(value as number)}`}>
                    {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>

          <CarboCard>
            <CarboCardHeader><CarboCardTitle>Custo por Fornecedor (Top 8)</CarboCardTitle></CarboCardHeader>
            <CarboCardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costBySupplier} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => brl(v)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="valor" name="Custo" fill="hsl(var(--carbo-green))" radius={[0, 6, 6, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        </div>
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. Fluxo financeiro real entra na fase de lógica.</p>
      </div>
    </div>
  );
}
