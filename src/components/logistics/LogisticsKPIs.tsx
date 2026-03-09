import { Shipment } from "@/types/shipment";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Truck, Clock, AlertTriangle } from "lucide-react";

interface LogisticsKPIsProps {
  shipments: Shipment[];
}

export function LogisticsKPIs({ shipments }: LogisticsKPIsProps) {
  const pending = shipments.filter(
    (s) => s.status === "separacao_pendente" || s.status === "separando"
  ).length;
  const inTransit = shipments.filter(
    (s) => s.status === "em_transporte"
  ).length;
  const delivered = shipments.filter((s) => s.status === "entregue").length;

  const overdue = shipments.filter((s) => {
    if (s.status === "entregue" || s.status === "cancelado") return false;
    if (!s.estimated_delivery) return false;
    return new Date(s.estimated_delivery) < new Date();
  }).length;

  const kpis = [
    {
      label: "Pendentes",
      value: pending,
      icon: Package,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Em Transporte",
      value: inTransit,
      icon: Truck,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
    {
      label: "Entregues",
      value: delivered,
      icon: Clock,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Atrasados",
      value: overdue,
      icon: AlertTriangle,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${kpi.bg}`}>
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
