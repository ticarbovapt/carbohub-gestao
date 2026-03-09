// RC (Requisição de Compra) flow types

export type RCStatus = 
  | 'rascunho' 
  | 'em_cotacao' 
  | 'em_analise_ia' 
  | 'aguardando_aprovacao' 
  | 'aprovada' 
  | 'rejeitada' 
  | 'convertida_pc';

export type PCStatus = 
  | 'emitida' 
  | 'enviada' 
  | 'confirmada' 
  | 'parcialmente_recebida' 
  | 'recebida' 
  | 'finalizada';

export type StockMovementType = 'entrada' | 'saida';
export type StockMovementOrigin = 'PC' | 'OP' | 'ajuste';

export interface RCRequest {
  id: string;
  solicitante_id: string;
  produto_id: string | null;
  produto_nome: string | null;
  quantidade: number;
  unidade: string;
  justificativa: string;
  centro_custo: string;
  valor_estimado: number;
  status: RCStatus;
  service_order_id: string | null;
  fornecedor_selecionado_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  solicitante_nome?: string;
  quotations_count?: number;
}

export interface RCQuotation {
  id: string;
  rc_id: string;
  fornecedor_id: string | null;
  fornecedor_nome: string;
  preco: number;
  prazo_entrega_dias: number;
  condicao_pagamento: string | null;
  observacoes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface RCAnalysis {
  id: string;
  rc_id: string;
  fornecedor_recomendado_id: string | null;
  fornecedor_recomendado_nome: string | null;
  score: number;
  ranking: Array<{
    fornecedor_nome: string;
    score: number;
    preco_score: number;
    prazo_score: number;
    condicao_score: number;
    historico_score: number;
  }>;
  justificativa: string;
  criterios: Record<string, number>;
  created_at: string;
}

export interface RCApprovalLog {
  id: string;
  rc_id: string;
  approver_id: string;
  action: 'approved' | 'rejected';
  justificativa: string | null;
  nivel: number;
  created_at: string;
  approver_nome?: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  tipo: StockMovementType;
  quantidade: number;
  origem: StockMovementOrigin;
  origem_id: string | null;
  custo_unitario: number;
  custo_medio_anterior: number;
  custo_medio_novo: number;
  observacoes: string | null;
  created_by: string | null;
  created_at: string;
  // Joined
  product_name?: string;
  product_code?: string;
}

export const RC_STATUS_LABELS: Record<RCStatus, string> = {
  rascunho: 'Rascunho',
  em_cotacao: 'Em Cotação',
  em_analise_ia: 'Em Análise IA',
  aguardando_aprovacao: 'Aguardando Aprovação',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  convertida_pc: 'Convertida em PC',
};

export const RC_STATUS_COLORS: Record<RCStatus, string> = {
  rascunho: 'secondary',
  em_cotacao: 'warning',
  em_analise_ia: 'info',
  aguardando_aprovacao: 'warning',
  aprovada: 'success',
  rejeitada: 'destructive',
  convertida_pc: 'default',
};

export const PC_STATUS_LABELS: Record<PCStatus, string> = {
  emitida: 'Emitida',
  enviada: 'Enviada',
  confirmada: 'Confirmada',
  parcialmente_recebida: 'Parcialmente Recebida',
  recebida: 'Recebida',
  finalizada: 'Finalizada',
};

export const CENTROS_CUSTO = [
  'Operações', 'Manutenção', 'Logística', 'Administrativo',
  'Comercial', 'TI', 'Marketing', 'Qualidade',
  'Financeiro', 'RH', 'Jurídico', 'P&D', 'Compras', 'Produção',
] as const;

export const RC_FLOW_STEPS = [
  { key: 'rascunho', label: 'RC Criada', description: 'Requisição criada pelo solicitante' },
  { key: 'em_cotacao', label: 'Cotação', description: 'Comprador adiciona cotações (mín. 3)' },
  { key: 'em_analise_ia', label: 'Análise IA', description: 'IA analisa cotações e recomenda' },
  { key: 'aguardando_aprovacao', label: 'Aprovação', description: 'Aguardando aprovação por alçada' },
  { key: 'aprovada', label: 'Aprovada', description: 'RC aprovada para geração de PC' },
  { key: 'convertida_pc', label: 'PC Gerada', description: 'Pedido de compra gerado' },
] as const;
