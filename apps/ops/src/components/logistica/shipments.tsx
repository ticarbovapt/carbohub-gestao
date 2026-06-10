import { Clock, Truck, CheckCircle2, AlertTriangle } from "lucide-react";

// ⚠️ MOCK compartilhado da Logística (fiel ao Controle: types/shipment + LogisticsKanban/KPIs).

export type ShipmentStatus = "separacao_pendente" | "separando" | "separado" | "em_transporte" | "entregue" | "cancelado";

export const SHIPMENT_STATUS_CONFIG: Record<ShipmentStatus, { label: string; color: string; icon: string }> = {
  separacao_pendente: { label: "Aguardando Separação", color: "#F59E0B", icon: "📋" },
  separando: { label: "Em Separação", color: "#3B82F6", icon: "📦" },
  separado: { label: "Separado", color: "#8B5CF6", icon: "✅" },
  em_transporte: { label: "Em Transporte", color: "#06B6D4", icon: "🚚" },
  entregue: { label: "Entregue", color: "#10B981", icon: "🎯" },
  cancelado: { label: "Cancelado", color: "#EF4444", icon: "❌" },
};

const KANBAN_COLUMNS: ShipmentStatus[] = ["separacao_pendente", "separando", "separado", "em_transporte", "entregue"];

export interface Shipment {
  id: string; order_number: string; destination: string; customer: string;
  carrier_name: string | null; tracking_code: string | null; status: ShipmentStatus; items: number;
}

export const MOCK_SHIPMENTS: Shipment[] = [
  { id: "1", order_number: "VND-2042", destination: "Natal/RN", customer: "Posto Shell Centro", carrier_name: null, tracking_code: null, status: "separacao_pendente", items: 2 },
  { id: "2", order_number: "VND-2041", destination: "São Paulo/SP", customer: "Auto Posto Bandeirantes", carrier_name: "Jadlog", tracking_code: null, status: "separando", items: 3 },
  { id: "3", order_number: "VND-2040", destination: "Recife/PE", customer: "Rede ABC", carrier_name: "Correios", tracking_code: "BR123456789", status: "separado", items: 1 },
  { id: "4", order_number: "VND-2039", destination: "Curitiba/PR", customer: "Posto Ipiranga Sul", carrier_name: "Braspress", tracking_code: "BP998877", status: "em_transporte", items: 1 },
  { id: "5", order_number: "VND-2038", destination: "Natal/RN", customer: "Oficina do Zé", carrier_name: "Correios", tracking_code: "BR555444", status: "entregue", items: 2 },
  { id: "6", order_number: "VND-2037", destination: "Fortaleza/CE", customer: "Transportadora Veloz", carrier_name: "Jadlog", tracking_code: null, status: "separacao_pendente", items: 4 },
];

export function ShipmentsKanban({ shipments, onView }: { shipments: Shipment[]; onView?: (s: Shipment) => void }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {KANBAN_COLUMNS.map((status) => {
        const cfg = SHIPMENT_STATUS_CONFIG[status];
        const items = shipments.filter((s) => s.status === status);
        return (
          <div key={status} className="w-64 shrink-0 rounded-2xl border border-border bg-board-surface/40 flex flex-col">
            <div className="rounded-t-2xl px-3 py-2.5 border-b border-border flex items-center justify-between" style={{ background: cfg.color + "12" }}>
              <span className="text-sm font-semibold flex items-center gap-1.5">{cfg.icon} {cfg.label}</span>
              <span className="text-xs font-bold rounded-full px-2 py-0.5" style={{ background: cfg.color + "20", color: cfg.color }}>{items.length}</span>
            </div>
            <div className="p-2 space-y-2 min-h-[80px]">
              {items.map((s) => (
                <button key={s.id} onClick={() => onView?.(s)} className="w-full text-left rounded-xl border border-border bg-card p-3 hover:shadow-md transition-all relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: cfg.color }} />
                  <div className="pl-1.5">
                    <span className="font-mono text-xs font-medium text-carbo-green">{s.order_number}</span>
                    <p className="text-sm font-semibold mt-0.5 truncate">{s.customer}</p>
                    <p className="text-xs text-muted-foreground">{s.destination} · {s.items} {s.items === 1 ? "item" : "itens"}</p>
                    {s.carrier_name && <p className="text-[10px] text-muted-foreground mt-1">{s.carrier_name}{s.tracking_code ? ` · ${s.tracking_code}` : ""}</p>}
                  </div>
                </button>
              ))}
              {items.length === 0 && <p className="text-[11px] text-muted-foreground/50 text-center py-4">Vazio</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LogisticsKpis({ shipments }: { shipments: Shipment[] }) {
  const pending = shipments.filter((s) => s.status === "separacao_pendente" || s.status === "separando").length;
  const inTransit = shipments.filter((s) => s.status === "em_transporte").length;
  const delivered = shipments.filter((s) => s.status === "entregue").length;
  const overdue = 1;
  const kpis = [
    { label: "Pendentes", value: pending, icon: Clock, color: "text-warning" },
    { label: "Em Transporte", value: inTransit, icon: Truck, color: "text-carbo-blue" },
    { label: "Entregues", value: delivered, icon: CheckCircle2, color: "text-success" },
    { label: "Atrasados", value: overdue, icon: AlertTriangle, color: "text-destructive" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((k) => (
        <div key={k.label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center ${k.color}`}><k.icon className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold text-foreground">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
        </div>
      ))}
    </div>
  );
}
