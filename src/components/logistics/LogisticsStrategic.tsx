import { Shipment } from "@/types/shipment";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Package, AlertTriangle, DollarSign } from "lucide-react";

interface LogisticsStrategicProps {
  shipments: Shipment[];
}

export function LogisticsStrategic({ shipments }: LogisticsStrategicProps) {
  // Items in transit
  const inTransitShipments = shipments.filter(
    (s) => s.status === "em_transporte"
  );
  const totalItemsInTransit = inTransitShipments.reduce(
    (sum, s) => sum + s.items.reduce((is, i) => is + i.quantidade, 0),
    0
  );

  // Items near expiry in route
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const nearExpiryItems = inTransitShipments.flatMap((s) =>
    s.items.filter((i) => {
      if (!i.validade) return false;
      const exp = new Date(i.validade);
      return exp <= thirtyDays;
    })
  );

  // Financial risk (estimated based on overdue)
  const overdueShipments = shipments.filter((s) => {
    if (s.status === "entregue" || s.status === "cancelado") return false;
    if (!s.estimated_delivery) return false;
    return new Date(s.estimated_delivery) < now;
  });

  const cards = [
    {
      title: "Estoque em Trânsito",
      description: "Total de itens em rota ativa",
      value: `${totalItemsInTransit} un.`,
      sub: `${inTransitShipments.length} envio(s)`,
      icon: Package,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
    {
      title: "Itens Próximos do Vencimento",
      description: "Em rota com validade < 30 dias",
      value: `${nearExpiryItems.length}`,
      sub: nearExpiryItems.length > 0 ? "Atenção requerida" : "Nenhum alerta",
      icon: AlertTriangle,
      color:
        nearExpiryItems.length > 0 ? "text-destructive" : "text-emerald-500",
      bg:
        nearExpiryItems.length > 0
          ? "bg-destructive/10"
          : "bg-emerald-500/10",
    },
    {
      title: "Risco Financeiro",
      description: "Envios atrasados sem entrega",
      value: `${overdueShipments.length}`,
      sub: overdueShipments.length > 0 ? "Envios atrasados" : "Sem risco",
      icon: DollarSign,
      color:
        overdueShipments.length > 0 ? "text-amber-500" : "text-emerald-500",
      bg:
        overdueShipments.length > 0
          ? "bg-amber-500/10"
          : "bg-emerald-500/10",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 rounded-lg flex items-center justify-center ${card.bg}`}
              >
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div>
                <CardTitle className="text-sm">{card.title}</CardTitle>
                <CardDescription className="text-xs">
                  {card.description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
