export type ShipmentStatus =
  | "separacao_pendente"
  | "separando"
  | "separado"
  | "em_transporte"
  | "entregue"
  | "cancelado";

export interface ShipmentItem {
  nome: string;
  quantidade: number;
  lote?: string;
  validade?: string;
}

export interface DeliveryEvidence {
  tipo: "foto" | "assinatura";
  url: string;
  timestamp: string;
}

export interface Shipment {
  id: string;
  service_order_id: string;
  status: ShipmentStatus;

  // Separação
  items: ShipmentItem[];
  separated_by: string | null;
  separated_at: string | null;
  destination: string | null;

  // Envio
  transport_mode: string | null;
  carrier_name: string | null;
  shipped_at: string | null;
  shipped_by: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  estimated_delivery: string | null;

  // Entrega
  delivered_at: string | null;
  delivered_by: string | null;
  delivery_evidence: DeliveryEvidence[];
  delivery_notes: string | null;

  created_at: string;
  updated_at: string;
  created_by: string | null;

  // Joined
  service_order?: {
    os_number: string;
    title: string;
    status: string;
    current_department: string;
    customer?: { name: string } | null;
  };
}

export const SHIPMENT_STATUS_CONFIG: Record<
  ShipmentStatus,
  { label: string; color: string; icon: string }
> = {
  separacao_pendente: {
    label: "Aguardando Separação",
    color: "#F59E0B",
    icon: "📋",
  },
  separando: {
    label: "Em Separação",
    color: "#3B82F6",
    icon: "📦",
  },
  separado: {
    label: "Separado",
    color: "#8B5CF6",
    icon: "✅",
  },
  em_transporte: {
    label: "Em Transporte",
    color: "#06B6D4",
    icon: "🚚",
  },
  entregue: {
    label: "Entregue",
    color: "#10B981",
    icon: "🎯",
  },
  cancelado: {
    label: "Cancelado",
    color: "#EF4444",
    icon: "❌",
  },
};

export const TRANSPORT_MODES = [
  { value: "proprio", label: "Próprio" },
  { value: "transportadora", label: "Transportadora" },
  { value: "correios", label: "Correios" },
  { value: "motoboy", label: "Motoboy" },
] as const;
