import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import type {
  PurchaseRequest,
  PurchaseOrder,
  PurchaseReceiving,
  PurchaseInvoice,
  PurchasePayable,
  ApprovalConfig,
  PurchaseRequestItem,
  ReceivedItem,
} from "@/types/purchasing";

// ---- Purchase Requests ----

export function usePurchaseRequests(filters?: { status?: string; costCenter?: string }) {
  return useQuery({
    queryKey: ["purchase-requests", filters],
    queryFn: async () => {
      let query = supabase
        .from("purchase_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (filters?.status) query = query.eq("status", filters.status as any);
      if (filters?.costCenter) query = query.eq("cost_center", filters.costCenter);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as PurchaseRequest[];
    },
  });
}

export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (values: {
      service_order_id?: string;
      cost_center: string;
      purchase_type: string;
      suggested_supplier?: string;
      estimated_value: number;
      justification: string;
      operational_impact?: string;
      items: PurchaseRequestItem[];
      status?: string;
    }) => {
      const { data, error } = await supabase
        .from("purchase_requests")
        .insert({
          rc_number: "TEMP",
          requested_by: user!.id,
          cost_center: values.cost_center,
          purchase_type: values.purchase_type as any,
          suggested_supplier: values.suggested_supplier || null,
          estimated_value: values.estimated_value,
          justification: values.justification,
          operational_impact: values.operational_impact || null,
          items: values.items as any,
          service_order_id: values.service_order_id || null,
          status: (values.status || "rascunho") as any,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      toast({ title: "Requisição criada com sucesso" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar requisição", description: err.message, variant: "destructive" });
    },
  });
}

export function useApprovePurchaseRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, approved, rejection_reason }: { id: string; approved: boolean; rejection_reason?: string }) => {
      const updates: any = {
        status: approved ? "aprovada" : "rejeitada",
        approved_by: user!.id,
        approved_at: new Date().toISOString(),
      };
      if (!approved && rejection_reason) updates.rejection_reason = rejection_reason;

      const { error } = await supabase.from("purchase_requests").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      toast({ title: variables.approved ? "RC aprovada" : "RC rejeitada" });
    },
    onError: (err: any) => {
      toast({ title: "Erro na aprovação", description: err.message, variant: "destructive" });
    },
  });
}

// ---- Purchase Orders ----

export function usePurchaseOrders(filters?: { status?: string }) {
  return useQuery({
    queryKey: ["purchase-orders", filters],
    queryFn: async () => {
      let query = supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (filters?.status) query = query.eq("status", filters.status as any);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as PurchaseOrder[];
    },
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (values: {
      purchase_request_id: string;
      service_order_id?: string;
      supplier_name: string;
      supplier_document?: string;
      supplier_contact?: string;
      items: PurchaseRequestItem[];
      total_value: number;
      payment_condition?: string;
      expected_delivery?: string;
    }) => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .insert({
          oc_number: "TEMP",
          purchase_request_id: values.purchase_request_id,
          service_order_id: values.service_order_id || null,
          supplier_name: values.supplier_name,
          supplier_document: values.supplier_document || null,
          supplier_contact: values.supplier_contact || null,
          items: values.items as any,
          total_value: values.total_value,
          payment_condition: values.payment_condition || null,
          expected_delivery: values.expected_delivery || null,
          generated_by: user!.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      toast({ title: "Ordem de Compra gerada com sucesso" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao gerar OC", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdatePurchaseOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status: status as any })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Status da OC atualizado" });
    },
  });
}

// ---- Receivings ----

export function usePurchaseReceivings(purchaseOrderId?: string) {
  return useQuery({
    queryKey: ["purchase-receivings", purchaseOrderId],
    queryFn: async () => {
      let query = supabase
        .from("purchase_receivings")
        .select("*")
        .order("created_at", { ascending: false });

      if (purchaseOrderId) query = query.eq("purchase_order_id", purchaseOrderId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as PurchaseReceiving[];
    },
  });
}

export function useCreateReceiving() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (values: {
      purchase_order_id: string;
      items_received: ReceivedItem[];
      has_divergence: boolean;
      divergence_notes?: string;
    }) => {
      const status = values.has_divergence ? "conferido_divergencia" : "conferido_ok";
      const { data, error } = await supabase
        .from("purchase_receivings")
        .insert({
          purchase_order_id: values.purchase_order_id,
          received_by: user!.id,
          items_received: values.items_received as any,
          status: status as any,
          has_divergence: values.has_divergence,
          divergence_notes: values.divergence_notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Update OC status
      const allReceived = !values.has_divergence;
      await supabase
        .from("purchase_orders")
        .update({ status: (allReceived ? "recebida" : "parcialmente_recebida") as any })
        .eq("id", values.purchase_order_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-receivings"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Recebimento registrado" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao registrar recebimento", description: err.message, variant: "destructive" });
    },
  });
}

// ---- Invoices ----

export function usePurchaseInvoices(purchaseOrderId?: string) {
  return useQuery({
    queryKey: ["purchase-invoices", purchaseOrderId],
    queryFn: async () => {
      let query = supabase
        .from("purchase_invoices")
        .select("*")
        .order("created_at", { ascending: false });

      if (purchaseOrderId) query = query.eq("purchase_order_id", purchaseOrderId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as PurchaseInvoice[];
    },
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (values: {
      purchase_order_id: string;
      receiving_id?: string;
      invoice_number: string;
      invoice_date: string;
      invoice_value: number;
      file_url?: string;
      oc_match: boolean;
      receiving_match: boolean;
      value_match: boolean;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .insert({
          purchase_order_id: values.purchase_order_id,
          receiving_id: values.receiving_id || null,
          invoice_number: values.invoice_number,
          invoice_date: values.invoice_date,
          invoice_value: values.invoice_value,
          file_url: values.file_url || null,
          oc_match: values.oc_match,
          receiving_match: values.receiving_match,
          value_match: values.value_match,
          verified_by: user!.id,
          verified_at: new Date().toISOString(),
          notes: values.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
      toast({ title: "Nota fiscal registrada" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao registrar NF", description: err.message, variant: "destructive" });
    },
  });
}

// ---- Payables ----

export function usePurchasePayables(filters?: { status?: string }) {
  return useQuery({
    queryKey: ["purchase-payables", filters],
    queryFn: async () => {
      let query = supabase
        .from("purchase_payables")
        .select("*")
        .order("due_date", { ascending: true });

      if (filters?.status) query = query.eq("status", filters.status as any);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as PurchasePayable[];
    },
  });
}

export function useCreatePayable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: {
      invoice_id?: string;
      purchase_order_id: string;
      service_order_id?: string;
      supplier_name: string;
      amount: number;
      due_date: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("purchase_payables")
        .insert({
          invoice_id: values.invoice_id || null,
          purchase_order_id: values.purchase_order_id,
          service_order_id: values.service_order_id || null,
          supplier_name: values.supplier_name,
          amount: values.amount,
          due_date: values.due_date,
          notes: values.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-payables"] });
      toast({ title: "Conta a pagar criada" });
    },
  });
}

export function useUpdatePayableStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status, payment_proof_url }: { id: string; status: string; payment_proof_url?: string }) => {
      const updates: any = { status };
      if (status === "pago") {
        updates.paid_at = new Date().toISOString();
        updates.paid_by = user!.id;
      }
      if (payment_proof_url) updates.payment_proof_url = payment_proof_url;

      const { error } = await supabase.from("purchase_payables").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-payables"] });
      toast({ title: "Status atualizado" });
    },
  });
}

// ---- Approval Config ----

export function useApprovalConfig() {
  return useQuery({
    queryKey: ["purchase-approval-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_approval_config")
        .select("*")
        .order("max_value", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ApprovalConfig[];
    },
  });
}

// ---- KPIs ----

export function usePurchasingKPIs() {
  return useQuery({
    queryKey: ["purchasing-kpis"],
    queryFn: async () => {
      const [reqRes, ordRes, payRes] = await Promise.all([
        supabase.from("purchase_requests").select("id, status, estimated_value"),
        supabase.from("purchase_orders").select("id, status, total_value"),
        supabase.from("purchase_payables").select("id, status, amount, due_date"),
      ]);

      const requests = (reqRes.data || []) as any[];
      const orders = (ordRes.data || []) as any[];
      const payables = (payRes.data || []) as any[];

      const today = new Date().toISOString().split("T")[0];

      return {
        rcPendentes: requests.filter((r) => r.status === "aguardando_aprovacao").length,
        ocAbertas: orders.filter((o) => ["gerada", "enviada_fornecedor"].includes(o.status)).length,
        pagamentosAtrasados: payables.filter((p) => p.status === "programado" && p.due_date < today).length,
        totalComprometido: orders
          .filter((o) => o.status !== "cancelada")
          .reduce((sum: number, o: any) => sum + (Number(o.total_value) || 0), 0),
        totalAPagar: payables
          .filter((p) => p.status === "programado")
          .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0),
      };
    },
  });
}
