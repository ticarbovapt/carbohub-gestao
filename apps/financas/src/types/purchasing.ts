export type PurchaseRequestType = 'estoque' | 'uso_direto' | 'investimento';
export type PurchaseRequestStatus = 'rascunho' | 'aguardando_aprovacao' | 'aprovada' | 'rejeitada' | 'cancelada' | 'convertida';
export type PurchaseOrderStatus = 'gerada' | 'comprada' | 'enviada_fornecedor' | 'parcialmente_recebida' | 'recebida' | 'cancelada';
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
  escopo?: 'setor' | 'individual' | null;
  motivo?: string | null;
  priority?: 'normal' | 'alta' | 'critica' | null;
  needed_by?: string | null;
  reference_url?: string | null;
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
  // Registro da compra (forma de pagamento / pago)
  payment_method_id: string | null;
  payment_type: string | null;
  purchased_at: string | null;
  is_paid: boolean;
  paid_at: string | null;
  payment_due_date: string | null;
  created_at: string;
  updated_at: string;
}

// Cadastro de Cartões / formas de pagamento. Por PCI, só últimos 4 + bandeira.
export type PaymentMethodType = 'credito' | 'debito' | 'pix' | 'boleto' | 'manual';

export interface PaymentMethod {
  id: string;
  apelido: string;
  tipo: PaymentMethodType;
  bandeira: string | null;
  ultimos4: string | null;
  titular: string | null;
  departamento: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const PAYMENT_METHOD_TYPE_LABELS: Record<PaymentMethodType, string> = {
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  pix: 'Pix',
  boleto: 'Boleto',
  manual: 'Manual / outro',
};

// ── Assinaturas / recorrências ───────────────────────────────────────────────
export type SubscriptionCycle = 'mensal' | 'trimestral' | 'anual';
export type SubscriptionStatus = 'ativa' | 'pausada' | 'cancelada';
export type SubscriptionCharge = 'automatica' | 'manual';

export interface Subscription {
  id: string;
  nome: string;
  departamento: string | null;
  valor: number;
  currency: string;                 // BRL | USD
  ciclo: SubscriptionCycle;
  proximo_vencimento: string | null;
  payment_method_id: string | null;
  cobranca: SubscriptionCharge;
  status: SubscriptionStatus;
  responsavel: string | null;
  url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const SUBSCRIPTION_CYCLE_LABELS: Record<SubscriptionCycle, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  anual: 'Anual',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ativa: 'Ativa',
  pausada: 'Pausada',
  cancelada: 'Cancelada',
};

/** Custo normalizado por mês (pra comparar assinaturas de ciclos diferentes). */
export function subscriptionMonthlyCost(s: Pick<Subscription, 'valor' | 'ciclo'>): number {
  const v = Number(s.valor) || 0;
  return s.ciclo === 'anual' ? v / 12 : s.ciclo === 'trimestral' ? v / 3 : v;
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
  convertida: 'Convertida em OC',
};

// Explicação de cada tipo — pra Ops e Sales escolherem certo no formulário.
export const PURCHASE_TYPE_HINTS: Record<PurchaseRequestType, string> = {
  estoque: 'Reposição de insumo / estoque (não deixar faltar).',
  uso_direto: 'Material de trabalho do dia a dia.',
  investimento: 'Equipamento / bem durável (capex).',
};

// Motivo estruturado (setor + categorias individuais) → rótulo legível.
export const MOTIVO_LABELS: Record<string, string> = {
  reposicao_safety: 'Reposição — estoque de segurança',
  ruptura: 'Ruptura — item em falta',
  demanda: 'Aumento de demanda',
  novo_projeto: 'Novo produto / projeto',
  manutencao: 'Manutenção / operação',
  equipamento: 'Equipamento',
  outro: 'Outro',
  material_escritorio: 'Material de escritório',
  epi: 'EPI / segurança',
  software: 'Software / licença',
};

export const PRIORITY_LABELS: Record<string, string> = { normal: 'Normal', alta: 'Alta', critica: 'Crítica' };

export const ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  gerada: 'Gerada',
  comprada: 'Compra feita',
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
