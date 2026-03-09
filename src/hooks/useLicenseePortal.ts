import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  SubscriptionPlan,
  LicenseeSubscription,
  LicenseeWallet,
  CreditTransaction,
  ServiceCatalogItem,
  LicenseeRequest,
  OperationType,
} from "@/types/licenseePortal";

// Hook para verificar se o usuário é um licenciado
export function useLicenseeStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["licensee-status", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("licensee_users")
        .select(`
          *,
          licensee:licensees(*)
        `)
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!user,
  });
}

// Hook para buscar a assinatura do licenciado
export function useLicenseeSubscription(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["licensee-subscription", licenseeId],
    queryFn: async () => {
      if (!licenseeId) return null;

      const { data, error } = await supabase
        .from("licensee_subscriptions")
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq("licensee_id", licenseeId)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (!data) return null;

      return {
        id: data.id,
        licenseeId: data.licensee_id,
        planId: data.plan_id,
        status: data.status,
        startedAt: data.started_at,
        expiresAt: data.expires_at,
        cancelledAt: data.cancelled_at,
        vaptUsed: data.vapt_used,
        zeUsed: data.ze_used,
        billingCycleStart: data.billing_cycle_start,
        notes: data.notes,
        plan: data.plan ? {
          id: data.plan.id,
          name: data.plan.name,
          slug: data.plan.slug,
          description: data.plan.description,
          slaLevel: data.plan.sla_level,
          maxVaptOperations: data.plan.max_vapt_operations,
          maxZeOrders: data.plan.max_ze_orders,
          includedCredits: data.plan.included_credits,
          slaResponseHours: data.plan.sla_response_hours,
          slaExecutionHours: data.plan.sla_execution_hours,
          monthlyPrice: data.plan.monthly_price,
          pricePerVapt: data.plan.price_per_vapt,
          pricePerZeOrder: data.plan.price_per_ze_order,
          isActive: data.plan.is_active,
          isFeatured: data.plan.is_featured,
          features: data.plan.features as string[],
          createdAt: data.plan.created_at,
        } : undefined,
      } as LicenseeSubscription;
    },
    enabled: !!licenseeId,
  });
}

// Hook para buscar a wallet do licenciado
export function useLicenseeWallet(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["licensee-wallet", licenseeId],
    queryFn: async () => {
      if (!licenseeId) return null;

      const { data, error } = await supabase
        .from("licensee_wallets")
        .select("*")
        .eq("licensee_id", licenseeId)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (!data) return null;

      return {
        id: data.id,
        licenseeId: data.licensee_id,
        balance: data.balance,
        totalEarned: data.total_earned,
        totalSpent: data.total_spent,
        updatedAt: data.updated_at,
      } as LicenseeWallet;
    },
    enabled: !!licenseeId,
  });
}

// Hook para buscar transações de crédito
export function useCreditTransactions(walletId: string | undefined) {
  return useQuery({
    queryKey: ["credit-transactions", walletId],
    queryFn: async () => {
      if (!walletId) return [];

      const { data, error } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("wallet_id", walletId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      return data.map((t) => ({
        id: t.id,
        walletId: t.wallet_id,
        amount: t.amount,
        balanceAfter: t.balance_after,
        type: t.type,
        description: t.description,
        serviceOrderId: t.service_order_id,
        orderId: t.order_id,
        expiresAt: t.expires_at,
        createdAt: t.created_at,
      })) as CreditTransaction[];
    },
    enabled: !!walletId,
  });
}

// Hook para buscar o catálogo de serviços
export function useServiceCatalog(operationType?: OperationType) {
  return useQuery({
    queryKey: ["service-catalog", operationType],
    queryFn: async () => {
      let query = supabase
        .from("service_catalog")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (operationType) {
        query = query.eq("operation_type", operationType);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data.map((s) => ({
        id: s.id,
        operationType: s.operation_type,
        name: s.name,
        description: s.description,
        creditCost: s.credit_cost,
        basePrice: s.base_price,
        defaultSlaHours: s.default_sla_hours,
        requiresScheduling: s.requires_scheduling,
        isRecurringEligible: s.is_recurring_eligible,
        minLeadTimeHours: s.min_lead_time_hours,
        icon: s.icon,
        displayOrder: s.display_order,
        isActive: s.is_active,
        metadata: s.metadata as Record<string, unknown>,
      })) as ServiceCatalogItem[];
    },
  });
}

// Hook para buscar solicitações do licenciado
export function useLicenseeRequests(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["licensee-requests", licenseeId],
    queryFn: async () => {
      if (!licenseeId) return [];

      const { data, error } = await supabase
        .from("licensee_requests")
        .select(`
          *,
          service:service_catalog(*)
        `)
        .eq("licensee_id", licenseeId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data.map((r) => ({
        id: r.id,
        licenseeId: r.licensee_id,
        serviceId: r.service_id,
        requestNumber: r.request_number,
        operationType: r.operation_type,
        status: r.status,
        operationAddress: r.operation_address,
        operationCity: r.operation_city,
        operationState: r.operation_state,
        operationZip: r.operation_zip,
        preferredDate: r.preferred_date,
        preferredTimeStart: r.preferred_time_start,
        preferredTimeEnd: r.preferred_time_end,
        scheduledDate: r.scheduled_date,
        paymentMethod: r.payment_method,
        creditsUsed: r.credits_used,
        amountCharged: r.amount_charged,
        slaDeadline: r.sla_deadline,
        slaBreached: r.sla_breached,
        serviceOrderId: r.service_order_id,
        carbozeOrderId: r.carboze_order_id,
        isRecurring: r.is_recurring,
        recurrenceIntervalDays: r.recurrence_interval_days,
        notes: r.notes,
        createdAt: r.created_at,
        service: r.service ? {
          id: r.service.id,
          operationType: r.service.operation_type,
          name: r.service.name,
          description: r.service.description,
          creditCost: r.service.credit_cost,
          basePrice: r.service.base_price,
          defaultSlaHours: r.service.default_sla_hours,
          requiresScheduling: r.service.requires_scheduling,
          isRecurringEligible: r.service.is_recurring_eligible,
          minLeadTimeHours: r.service.min_lead_time_hours,
          icon: r.service.icon,
          displayOrder: r.service.display_order,
          isActive: r.service.is_active,
          metadata: r.service.metadata as Record<string, unknown>,
        } : undefined,
      })) as LicenseeRequest[];
    },
    enabled: !!licenseeId,
  });
}

// Hook para criar uma nova solicitação
export function useCreateRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: {
      licenseeId: string;
      serviceId: string;
      operationType: OperationType;
      operationAddress?: string;
      operationCity?: string;
      operationState?: string;
      operationZip?: string;
      preferredDate?: string;
      preferredTimeStart?: string;
      preferredTimeEnd?: string;
      paymentMethod: 'credits' | 'invoice' | 'plan';
      creditsUsed?: number;
      amountCharged?: number;
      isRecurring?: boolean;
      recurrenceIntervalDays?: number;
      notes?: string;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      
      const insertData = {
        licensee_id: request.licenseeId,
        service_id: request.serviceId,
        operation_type: request.operationType,
        request_number: 'TEMP', // Will be overwritten by trigger
        operation_address: request.operationAddress || null,
        operation_city: request.operationCity || null,
        operation_state: request.operationState || null,
        operation_zip: request.operationZip || null,
        preferred_date: request.preferredDate || null,
        preferred_time_start: request.preferredTimeStart || null,
        preferred_time_end: request.preferredTimeEnd || null,
        payment_method: request.paymentMethod,
        credits_used: request.creditsUsed || 0,
        amount_charged: request.amountCharged || 0,
        is_recurring: request.isRecurring || false,
        recurrence_interval_days: request.recurrenceIntervalDays || null,
        notes: request.notes || null,
        created_by: user?.id || null,
      };

      const { data, error } = await supabase
        .from("licensee_requests")
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["licensee-requests", variables.licenseeId] });
      queryClient.invalidateQueries({ queryKey: ["licensee-wallet"] });
      queryClient.invalidateQueries({ queryKey: ["licensee-subscription"] });
    },
  });
}
