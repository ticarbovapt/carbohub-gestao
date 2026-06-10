import { useMemo } from "react";
import {
  Globe, ShoppingCart, DollarSign, Receipt, XCircle,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";

// ⚠️ PORT VISUAL — dados MOCK. TODO: ligar nos canais reais (Bling/Nuvemshop/marketplaces).

const CANAIS = [
  { canal: "Mercado Livre", pedidos: 420, receita: 86400, cor: "#facc15" },
  { canal: "Amazon", pedidos: 260, receita: 61200, cor: "#f59e0b" },
  { canal: "Nuvemshop", pedidos: 180, receita: 39800, cor: "#22c55e" },
  { canal: "Site próprio", pedidos: 95, receita: 24500, cor: "#0ea5e9" },
];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];
const evolucao = MESES.map((m, i) => ({ mes: m, receita: 24000 + i * 6500 + (i % 2) * 4000 }));

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("pt-BR");

export default function Ecommerce() {
  const { totalReceita, totalPedidos, ticket, cancelados } = useMemo(() => {
    const totalReceita = CANAIS.reduce((s, c) => s + c.receita, 0);
    const totalPedidos = CANAIS.reduce((s, c) => s + c.pedidos, 0);
    return { totalReceita, totalPedidos, ticket: totalReceita / totalPedidos, cancelados: 23 };
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <CarboPageHeader title="E-commerce — Vendas online" description="Visão consolidada dos canais online" icon={Globe} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <CarboKPI title="Receita" value={brl(totalReceita)} icon={DollarSign} iconColor="green" delay={50} />
        <CarboKPI title="Pedidos" value={num(totalPedidos)} icon={ShoppingCart} iconColor="blue" delay={100} />
        <CarboKPI title="Ticket médio" value={brl(ticket)} icon={Receipt} iconColor="blue" delay={150} />
        <CarboKPI title="Cancelados" value={num(cancelados)} icon={XCircle} iconColor="destructive" delay={200} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Receita por canal (pizza) */}
        <CarboCard>
          <CarboCardContent className="p-4">
            <h2 className="font-semibold mb-4">Receita por canal</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={CANAIS} dataKey="receita" nameKey="canal" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {CANAIS.map((c) => <Cell key={c.canal} fill={c.cor} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => brl(v)}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* Evolução da receita (área) */}
        <CarboCard>
          <CarboCardContent className="p-4">
            <h2 className="font-semibold mb-4">Evolução da receita</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={evolucao} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ecomFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--carbo-green))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--carbo-green))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tickFormatter={(v) => `${v / 1000}k`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={40} />
                  <Tooltip
                    formatter={(v: number) => brl(v)}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                  />
                  <Area dataKey="receita" name="Receita" stroke="hsl(var(--carbo-green))" strokeWidth={2.5} fill="url(#ecomFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CarboCardContent>
        </CarboCard>
      </div>

      {/* Tabela por canal */}
      <CarboCard>
        <CarboCardContent className="p-0">
          <div className="overflow-x-auto">
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Canal</CarboTableHead>
                  <CarboTableHead className="text-right">Pedidos</CarboTableHead>
                  <CarboTableHead className="text-right">Receita</CarboTableHead>
                  <CarboTableHead className="text-right">Ticket médio</CarboTableHead>
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {CANAIS.map((c) => (
                  <CarboTableRow key={c.canal}>
                    <CarboTableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />{c.canal}
                      </span>
                    </CarboTableCell>
                    <CarboTableCell className="text-right tabular-nums">{num(c.pedidos)}</CarboTableCell>
                    <CarboTableCell className="text-right tabular-nums font-semibold">{brl(c.receita)}</CarboTableCell>
                    <CarboTableCell className="text-right tabular-nums">{brl(c.receita / c.pedidos)}</CarboTableCell>
                  </CarboTableRow>
                ))}
                <CarboTableRow className="font-semibold border-t">
                  <CarboTableCell>Total</CarboTableCell>
                  <CarboTableCell className="text-right tabular-nums">{num(totalPedidos)}</CarboTableCell>
                  <CarboTableCell className="text-right tabular-nums">{brl(totalReceita)}</CarboTableCell>
                  <CarboTableCell className="text-right tabular-nums">{brl(ticket)}</CarboTableCell>
                </CarboTableRow>
              </CarboTableBody>
            </CarboTable>
          </div>
        </CarboCardContent>
      </CarboCard>

      <p className="text-xs text-muted-foreground text-center">
        Tela em port visual — dados de exemplo. A integração com os canais (marketplaces / loja) entra na fase de lógica.
      </p>
    </div>
  );
}
