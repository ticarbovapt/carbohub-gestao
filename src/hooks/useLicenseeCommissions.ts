import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LicenseeCommission, CommissionStatement } from "@/types/commission";

// Hook para buscar comissões do licenciado
export function useLicenseeCommissions(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["licensee-commissions", licenseeId],
    queryFn: async () => {
      if (!licenseeId) return [];

      const { data, error } = await supabase
        .from("licensee_commissions")
        .select("*")
        .eq("licensee_id", licenseeId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data.map((c) => ({
        id: c.id,
        licenseeId: c.licensee_id,
        serviceOrderId: c.service_order_id,
        carbozeOrderId: c.carboze_order_id,
        licenseeRequestId: c.licensee_request_id,
        commissionType: c.commission_type as LicenseeCommission['commissionType'],
        baseAmount: c.base_amount,
        commissionRate: c.commission_rate,
        commissionAmount: c.commission_amount,
        bonusAmount: c.bonus_amount,
        totalAmount: c.total_amount,
        status: c.status as LicenseeCommission['status'],
        validatedAt: c.validated_at,
        validatedBy: c.validated_by,
        approvedAt: c.approved_at,
        approvedBy: c.approved_by,
        paidAt: c.paid_at,
        paidBy: c.paid_by,
        referenceMonth: c.reference_month,
        referenceYear: c.reference_year,
        notes: c.notes,
        rejectionReason: c.rejection_reason,
        paymentReference: c.payment_reference,
        createdAt: c.created_at,
      })) as LicenseeCommission[];
    },
    enabled: !!licenseeId,
  });
}

// Hook para buscar extratos mensais
export function useCommissionStatements(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["commission-statements", licenseeId],
    queryFn: async () => {
      if (!licenseeId) return [];

      const { data, error } = await supabase
        .from("licensee_commission_statements")
        .select("*")
        .eq("licensee_id", licenseeId)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });

      if (error) throw error;

      return data.map((s) => ({
        id: s.id,
        licenseeId: s.licensee_id,
        periodYear: s.period_year,
        periodMonth: s.period_month,
        totalOrders: s.total_orders,
        totalOrderCommission: s.total_order_commission,
        totalRecurrenceCommission: s.total_recurrence_commission,
        totalBonus: s.total_bonus,
        grossTotal: s.gross_total,
        status: s.status as CommissionStatement['status'],
        closedAt: s.closed_at,
        paidAt: s.paid_at,
        notes: s.notes,
        createdAt: s.created_at,
      })) as CommissionStatement[];
    },
    enabled: !!licenseeId,
  });
}

// Hook para resumo de comissões
export function useCommissionSummary(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["commission-summary", licenseeId],
    queryFn: async () => {
      if (!licenseeId) return null;

      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      // Get current month commissions
      const { data: currentCommissions, error: commError } = await supabase
        .from("licensee_commissions")
        .select("total_amount, status")
        .eq("licensee_id", licenseeId)
        .eq("reference_month", currentMonth)
        .eq("reference_year", currentYear);

      if (commError) throw commError;

      // Calculate totals
      const pending = currentCommissions
        ?.filter(c => c.status === 'pending')
        .reduce((sum, c) => sum + (c.total_amount || 0), 0) || 0;

      const approved = currentCommissions
        ?.filter(c => c.status === 'approved')
        .reduce((sum, c) => sum + (c.total_amount || 0), 0) || 0;

      const paid = currentCommissions
        ?.filter(c => c.status === 'paid')
        .reduce((sum, c) => sum + (c.total_amount || 0), 0) || 0;

      // Get all-time paid
      const { data: allTimePaid, error: paidError } = await supabase
        .from("licensee_commissions")
        .select("total_amount")
        .eq("licensee_id", licenseeId)
        .eq("status", "paid");

      if (paidError) throw paidError;

      const totalPaidAllTime = allTimePaid?.reduce((sum, c) => sum + (c.total_amount || 0), 0) || 0;

      return {
        currentMonth: {
          pending,
          approved,
          paid,
          total: pending + approved + paid,
        },
        totalPaidAllTime,
      };
    },
    enabled: !!licenseeId,
  });
}
