// ============================================================
// COMISSÕES DE LICENCIADOS - Tipos TypeScript
// ============================================================

export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'cancelled';
export type CommissionType = 'order' | 'recurrence' | 'growth_bonus';

export interface LicenseeCommission {
  id: string;
  licenseeId: string;
  
  // Referências
  serviceOrderId: string | null;
  carbozeOrderId: string | null;
  licenseeRequestId: string | null;
  
  // Tipo
  commissionType: CommissionType;
  
  // Valores
  baseAmount: number;
  commissionRate: number;
  commissionAmount: number;
  bonusAmount: number;
  totalAmount: number;
  
  // Status
  status: CommissionStatus;
  validatedAt: string | null;
  validatedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  paidAt: string | null;
  paidBy: string | null;
  
  // Período
  referenceMonth: number;
  referenceYear: number;
  
  // Meta
  notes: string | null;
  rejectionReason: string | null;
  paymentReference: string | null;
  createdAt: string;
}

export interface CommissionStatement {
  id: string;
  licenseeId: string;
  periodYear: number;
  periodMonth: number;
  
  // Totais
  totalOrders: number;
  totalOrderCommission: number;
  totalRecurrenceCommission: number;
  totalBonus: number;
  grossTotal: number;
  
  // Status
  status: 'open' | 'closed' | 'paid';
  closedAt: string | null;
  paidAt: string | null;
  
  // Meta
  notes: string | null;
  createdAt: string;
}

export const COMMISSION_STATUS_INFO: Record<CommissionStatus, {
  label: string;
  color: string;
  icon: string;
}> = {
  pending: { label: 'Previsto', color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
  approved: { label: 'Aprovado', color: 'bg-blue-100 text-blue-800', icon: '✓' },
  paid: { label: 'Pago', color: 'bg-green-100 text-green-800', icon: '💰' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: '❌' },
};

export const COMMISSION_TYPE_INFO: Record<CommissionType, {
  label: string;
  description: string;
}> = {
  order: { label: 'Pedido', description: 'Comissão por pedido individual' },
  recurrence: { label: 'Recorrência', description: 'Comissão por cliente recorrente' },
  growth_bonus: { label: 'Bônus Crescimento', description: 'Bônus por crescimento mensal' },
};
