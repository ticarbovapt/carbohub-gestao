export type PurchaseRequestType = 'estoque' | 'uso_direto' | 'investimento';
export type PurchaseRequestStatus = 'rascunho' | 'aguardando_aprovacao' | 'aprovada' | 'rejeitada' | 'cancelada';
export type PurchaseOrderStatus = 'gerada' | 'enviada_fornecedor' | 'parcialmente_recebida' | 'recebida' | 'cancelada';
export type ReceivingStatus = 'pendente' | 'conferido_ok' | 'conferido_divergencia';
export type PayableStatus = 'programado' | 'pago' | 'atrasado' | 'cancelado';

export interface PurchaseRequestItem {
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario: number;
}

export interface ReceivedItem {
  descricao: string;
  qtd_esperada: number;
  qtd_recebida: number;
  status_qualidade: 'ok' | 'rejeitado' | 'parcial';
}

export interface PurchaseRequest {
  id: string;
  rc_number: string;
  service_order_id: string | null;
  requested_by: string;
  cost_center: string;
  purchase_type: PurchaseRequestType;
  suggested_supplier: string | null;
  estimated_value: number;
  justification: string;
  operational_impact: string | null;
  items: PurchaseRequestItem[];
  status: PurchaseRequestStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  oc_number: string;
  purchase_request_id: string;
  service_order_id: string | null;
  supplier_name: string;
  supplier_document: string | null;
  supplier_contact: string | null;
  items: PurchaseRequestItem[];
  total_value: number;
  payment_condition: string | null;
  expected_delivery: string | null;
  status: PurchaseOrderStatus;
  generated_by: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseReceiving {
  id: string;
  purchase_order_id: string;
  received_by: string;
  received_at: string;
  items_received: ReceivedItem[];
  status: ReceivingStatus;
  has_divergence: boolean;
  divergence_notes: string | null;
  stock_updated: boolean;
  created_at: string;
  updated_at: string;
}

export interface PurchaseInvoice {
  id: string;
  purchase_order_id: string;
  receiving_id: string | null;
  invoice_number: string;
  invoice_date: string;
  invoice_value: number;
  file_url: string | null;
  oc_match: boolean;
  receiving_match: boolean;
  value_match: boolean;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchasePayable {
  id: string;
  invoice_id: string | null;
  purchase_order_id: string;
  service_order_id: string | null;
  supplier_name: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  paid_by: string | null;
  payment_proof_url: string | null;
  status: PayableStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalConfig {
  id: string;
  max_value: number;
  approver_role: string;
  requires_ceo: boolean;
  created_at: string;
  updated_at: string;
}

export const PURCHASE_TYPE_LABELS: Record<PurchaseRequestType, string> = {
  estoque: 'Estoque',
  uso_direto: 'Uso Direto',
  investimento: 'Investimento',
};

export const REQUEST_STATUS_LABELS: Record<PurchaseRequestStatus, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando Aprovação',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
};

export const ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  gerada: 'Gerada',
  enviada_fornecedor: 'Enviada ao Fornecedor',
  parcialmente_recebida: 'Parcialmente Recebida',
  recebida: 'Recebida',
  cancelada: 'Cancelada',
};

export const RECEIVING_STATUS_LABELS: Record<ReceivingStatus, string> = {
  pendente: 'Pendente',
  conferido_ok: 'Conferido OK',
  conferido_divergencia: 'Divergência',
};

export const PAYABLE_STATUS_LABELS: Record<PayableStatus, string> = {
  programado: 'Programado',
  pago: 'Pago',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado',
};
