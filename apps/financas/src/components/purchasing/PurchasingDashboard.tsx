import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { usePurchasePayables, usePurchaseOrders } from "@/hooks/usePurchasing";

const COLORS = ["hsl(145, 55%, 51%)", "hsl(207, 77%, 61%)", "hsl(45, 93%, 54%)", "hsl(0, 72%, 51%)", "hsl(280, 60%, 55%)"];

export function PurchasingDashboard() {
  const { data: payables } = usePurchasePayables();
  const { data: orders } = usePurchaseOrders();

  // Cost by status (pie chart)
  const statusData = (() => {
    if (!payables) return [];
    const byStatus: Record<string, number> = {};
    payables.forEach((p) => {
      const label = p.status === "programado" ? "Programado" : p.status === "pago" ? "Pago" : p.status === "atrasado" ? "Atrasado" : "Cancelado";
      byStatus[label] = (byStatus[label] || 0) + Number(p.amount);
    });
    return Object.entries(byStatus).map(([name, value]) => ({ name, value }));
  })();

  // Cost by cost center (bar chart) - from orders
  const costCenterData = (() => {
    if (!orders) return [];
    // We don't have cost_center on purchase_orders directly, so we show by supplier
    const bySupplier: Record<string, number> = {};
    orders.forEach((o) => {
      if (o.status !== "cancelada") {
        bySupplier[o.supplier_name] = (bySupplier[o.supplier_name] || 0) + Number(o.total_value);
      }
    });
    return Object.entries(bySupplier)
      .map(([name, valor]) => ({ name: name.length > 15 ? name.slice(0, 15) + "…" : name, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  })();

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(val);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <CarboCard>
        <CarboCardHeader>
          <CarboCardTitle>Contas a Pagar por Status</CarboCardTitle>
        </CarboCardHeader>
        <CarboCardContent>
          {statusData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-12">Sem dados disponíveis</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${formatCurrency(value)}`}>
                  {statusData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CarboCardContent>
      </CarboCard>

      <CarboCard>
        <CarboCardHeader>
          <CarboCardTitle>Custo por Fornecedor (Top 8)</CarboCardTitle>
        </CarboCardHeader>
        <CarboCardContent>
          {costCenterData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-12">Sem dados disponíveis</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costCenterData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={formatCurrency} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="valor" fill="hsl(145, 55%, 51%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CarboCardContent>
      </CarboCard>
    </div>
  );
}
