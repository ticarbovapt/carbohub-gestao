// ============================================================
// ÁREA DO LICENCIADO - Tipos TypeScript
// ============================================================

export type OperationType = 'carbo_vapt' | 'carbo_ze';
export type SlaLevel = 'basic' | 'pro' | 'premium';

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  slaLevel: SlaLevel;
  maxVaptOperations: number | null;
  maxZeOrders: number | null;
  includedCredits: number;
  slaResponseHours: number;
  slaExecutionHours: number;
  monthlyPrice: number;
  pricePerVapt: number;
  pricePerZeOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  features: string[];
  createdAt: string;
}

export interface LicenseeSubscription {
  id: string;
  licenseeId: string;
  planId: string;
  status: 'active' | 'paused' | 'cancelled' | 'expired';
  startedAt: string;
  expiresAt: string | null;
  cancelledAt: string | null;
  vaptUsed: number;
  zeUsed: number;
  billingCycleStart: string;
  notes: string | null;
  plan?: SubscriptionPlan;
}

export interface LicenseeWallet {
  id: string;
  licenseeId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  walletId: string;
  amount: number;
  balanceAfter: number;
  type: 'purchase' | 'consumption' | 'refund' | 'bonus' | 'expiry';
  description: string | null;
  serviceOrderId: string | null;
  orderId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ServiceCatalogItem {
  id: string;
  operationType: OperationType;
  name: string;
  description: string | null;
  creditCost: number;
  basePrice: number;
  defaultSlaHours: number;
  requiresScheduling: boolean;
  isRecurringEligible: boolean;
  minLeadTimeHours: number;
  icon: string;
  displayOrder: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
}

export interface LicenseeRequest {
  id: string;
  licenseeId: string;
  serviceId: string;
  requestNumber: string;
  operationType: OperationType;
  status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';
  operationAddress: string | null;
  operationCity: string | null;
  operationState: string | null;
  operationZip: string | null;
  preferredDate: string | null;
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  scheduledDate: string | null;
  paymentMethod: 'credits' | 'invoice' | 'plan';
  creditsUsed: number;
  amountCharged: number;
  slaDeadline: string | null;
  slaBreached: boolean;
  serviceOrderId: string | null;
  carbozeOrderId: string | null;
  isRecurring: boolean;
  recurrenceIntervalDays: number | null;
  notes: string | null;
  createdAt: string;
  service?: ServiceCatalogItem;
}

export interface LicenseeUser {
  id: string;
  licenseeId: string;
  userId: string;
  isPrimary: boolean;
  canOrder: boolean;
  canViewFinancials: boolean;
  createdAt: string;
}

// SLA Status helpers
export const SLA_LEVEL_INFO: Record<SlaLevel, {
  name: string;
  color: string;
  icon: string;
  badge: string;
}> = {
  basic: {
    name: 'Básico',
    color: '#6B7280',
    icon: '🥉',
    badge: 'bg-muted text-muted-foreground',
  },
  pro: {
    name: 'Pro',
    color: '#3B82F6',
    icon: '🥈',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
  premium: {
    name: 'Premium',
    color: '#F59E0B',
    icon: '🥇',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  },
};

export const REQUEST_STATUS_INFO: Record<LicenseeRequest['status'], {
  label: string;
  color: string;
  icon: string;
}> = {
  pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
  confirmed: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800', icon: '✓' },
  processing: { label: 'Em Execução', color: 'bg-purple-100 text-purple-800', icon: '🔄' },
  completed: { label: 'Concluído', color: 'bg-green-100 text-green-800', icon: '✅' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: '❌' },
};
