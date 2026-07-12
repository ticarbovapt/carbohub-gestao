import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { usePurchasePayables, usePurchaseOrders } from "@/hooks/usePurchasing";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { subscriptionMonthlyCost } from "@/types/purchasing";

const COLORS = ["hsl(145, 55%, 51%)", "hsl(207, 77%, 61%)", "hsl(45, 93%, 54%)", "hsl(0, 72%, 51%)", "hsl(280, 60%, 55%)"];

export function PurchasingDashboard() {
  const { data: payables } = usePurchasePayables();
  const { data: orders } = usePurchaseOrders();
  const { data: subscriptions } = useSubscriptions();

  // Custo mensal de assinaturas ATIVAS por setor, separado por moeda (BRL/USD
  // não se somam). Normaliza anual/trimestral pra mês.
  const subsData = (() => {
    const acc: Record<string, { setor: string; BRL: number; USD: number }> = {};
    (subscriptions ?? []).forEach((s) => {
      if (s.status !== "ativa") return;
      const setor = s.departamento || "Sem setor";
      acc[setor] = acc[setor] ?? { setor, BRL: 0, USD: 0 };
      const m = subscriptionMonthlyCost(s);
      if (s.currency === "USD") acc[setor].USD += m; else acc[setor].BRL += m;
    });
    return Object.values(acc).sort((a, b) => (b.BRL + b.USD) - (a.BRL + a.USD));
  })();
  const hasUSD = subsData.some((d) => d.USD > 0);

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

  // Custo por fornecedor. Fonte preferencial: purchase_orders. Como o Bling
  // costuma trazer poucos/nenhum pedido de compra, caímos para purchase_payables
  // (contas a pagar) agrupado por fornecedor — que vem populado do sync.
  const costCenterData = (() => {
    // Agrupa por supplier_id quando existe (evita "Acme" vs "Acme LTDA"); senão
    // cai pro nome normalizado. O rótulo é o nome do fornecedor.
    const acc: Record<string, { name: string; valor: number }> = {};
    const add = (id: string | null | undefined, name: string | null, valor: number) => {
      if (!name) return;
      const key = id || name.trim().toLowerCase();
      acc[key] = { name: acc[key]?.name ?? name, valor: (acc[key]?.valor ?? 0) + valor };
    };

    if (orders && orders.length > 0) {
      orders.forEach((o) => { if (o.status !== "cancelada") add((o as any).supplier_id, o.supplier_name, Number(o.total_value)); });
    } else if (payables && payables.length > 0) {
      payables.forEach((p) => { if (p.status !== "cancelado") add((p as any).supplier_id, p.supplier_name, Number(p.amount)); });
    }

    return Object.values(acc)
      .map(({ name, valor }) => ({ name: name.length > 15 ? name.slice(0, 15) + "…" : name, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  })();

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(val);

  const brlFull = (val: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  const usdFull = (val: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  return (
    <div className="space-y-6">
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

      <CarboCard>
        <CarboCardHeader>
          <CarboCardTitle>Assinaturas ativas — custo mensal por setor</CarboCardTitle>
        </CarboCardHeader>
        <CarboCardContent>
          {subsData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-12">Nenhuma assinatura ativa</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, subsData.length * 48)}>
              <BarChart data={subsData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v: number) => formatCurrency(v)} />
                <YAxis type="category" dataKey="setor" width={120} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number, name: string) => name === "USD" ? usdFull(value) : brlFull(value)} />
                <Legend />
                <Bar dataKey="BRL" name="BRL/mês" fill="hsl(145, 55%, 51%)" radius={[0, 4, 4, 0]} />
                {hasUSD && <Bar dataKey="USD" name="USD/mês" fill="hsl(207, 77%, 61%)" radius={[0, 4, 4, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">Valores normalizados por mês (anual/trimestral divididos). BRL e USD são exibidos separados — não somados.</p>
        </CarboCardContent>
      </CarboCard>
    </div>
  );
}
