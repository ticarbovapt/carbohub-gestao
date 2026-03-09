import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { RCRequest, RCQuotation, RCAnalysis, RCApprovalLog } from "@/types/rcPurchasing";

// ---- RC Requests ----
export function useRCRequests(filters?: { status?: string }) {
  return useQuery({
    queryKey: ["rc-requests", filters],
    queryFn: async () => {
      let query = supabase
        .from("rc_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (filters?.status) query = query.eq("status", filters.status);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as RCRequest[];
    },
  });
}

export function useCreateRC() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      produto_id?: string;
      produto_nome: string;
      quantidade: number;
      unidade: string;
      justificativa: string;
      centro_custo: string;
      valor_estimado: number;
      service_order_id?: string;
    }) => {
      const { data, error } = await supabase
        .from("rc_requests")
        .insert({
          solicitante_id: user!.id,
          produto_id: values.produto_id || null,
          produto_nome: values.produto_nome,
          quantidade: values.quantidade,
          unidade: values.unidade,
          justificativa: values.justificativa,
          centro_custo: values.centro_custo,
          valor_estimado: values.valor_estimado,
          service_order_id: values.service_order_id || null,
          status: 'rascunho',
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rc-requests"] });
      toast.success("Requisição de Compra criada");
    },
    onError: (e: any) => toast.error("Erro ao criar RC", { description: e.message }),
  });
}

export function useUpdateRCStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, fornecedor_selecionado_id }: { id: string; status: string; fornecedor_selecionado_id?: string }) => {
      const updates: any = { status };
      if (fornecedor_selecionado_id) updates.fornecedor_selecionado_id = fornecedor_selecionado_id;
      const { error } = await supabase.from("rc_requests").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rc-requests"] });
      toast.success("Status da RC atualizado");
    },
  });
}

// ---- Quotations ----
export function useRCQuotations(rcId?: string) {
  return useQuery({
    queryKey: ["rc-quotations", rcId],
    enabled: !!rcId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rc_quotations")
        .select("*")
        .eq("rc_id", rcId!)
        .order("preco", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as RCQuotation[];
    },
  });
}

export function useCreateQuotation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      rc_id: string;
      fornecedor_id?: string;
      fornecedor_nome: string;
      preco: number;
      prazo_entrega_dias: number;
      condicao_pagamento?: string;
      observacoes?: string;
    }) => {
      const { data, error } = await supabase
        .from("rc_quotations")
        .insert({
          ...values,
          fornecedor_id: values.fornecedor_id || null,
          condicao_pagamento: values.condicao_pagamento || null,
          observacoes: values.observacoes || null,
          created_by: user!.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["rc-quotations", vars.rc_id] });
      toast.success("Cotação adicionada");
    },
    onError: (e: any) => toast.error("Erro ao adicionar cotação", { description: e.message }),
  });
}

// ---- Analysis ----
export function useRCAnalysis(rcId?: string) {
  return useQuery({
    queryKey: ["rc-analysis", rcId],
    enabled: !!rcId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rc_analysis")
        .select("*")
        .eq("rc_id", rcId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as RCAnalysis | null;
    },
  });
}

export function useRunIAAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rcId: string) => {
      const { data, error } = await supabase.functions.invoke("analyze-rc-quotations", {
        body: { rc_id: rcId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, rcId) => {
      qc.invalidateQueries({ queryKey: ["rc-analysis", rcId] });
      qc.invalidateQueries({ queryKey: ["rc-requests"] });
      toast.success("Análise IA concluída");
    },
    onError: (e: any) => toast.error("Erro na análise IA", { description: e.message }),
  });
}

// ---- Approval Logs ----
export function useRCApprovalLogs(rcId?: string) {
  return useQuery({
    queryKey: ["rc-approval-logs", rcId],
    enabled: !!rcId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rc_approval_logs")
        .select("*")
        .eq("rc_id", rcId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as RCApprovalLog[];
    },
  });
}

export function useApproveRC() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ rc_id, approved, justificativa, nivel }: {
      rc_id: string;
      approved: boolean;
      justificativa?: string;
      nivel: number;
    }) => {
      // Log approval
      const { error: logErr } = await supabase.from("rc_approval_logs").insert({
        rc_id,
        approver_id: user!.id,
        action: approved ? 'approved' : 'rejected',
        justificativa: justificativa || null,
        nivel,
      } as any);
      if (logErr) throw logErr;

      // Update RC status
      const newStatus = approved ? 'aprovada' : 'rejeitada';
      const { error } = await supabase.from("rc_requests").update({ status: newStatus }).eq("id", rc_id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["rc-requests"] });
      qc.invalidateQueries({ queryKey: ["rc-approval-logs", vars.rc_id] });
      toast.success(vars.approved ? "RC aprovada" : "RC rejeitada");
    },
    onError: (e: any) => toast.error("Erro na aprovação", { description: e.message }),
  });
}

// ---- Convert RC to PC ----
export function useConvertRCtoPC() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (rc: RCRequest) => {
      // Create purchase order linked to RC
      const { data, error } = await supabase.from("purchase_orders").insert({
        oc_number: `PC-${Date.now()}`,
        purchase_request_id: rc.id,
        rc_id: rc.id,
        supplier_name: rc.produto_nome || 'A definir',
        items: [{ descricao: rc.produto_nome, quantidade: rc.quantidade, unidade: rc.unidade, valor_unitario: rc.valor_estimado / rc.quantidade }] as any,
        total_value: rc.valor_estimado,
        generated_by: user!.id,
        status: 'gerada' as any,
      } as any).select().single();
      if (error) throw error;

      // Update RC status
      await supabase.from("rc_requests").update({ status: 'convertida_pc' }).eq("id", rc.id);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rc-requests"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Pedido de Compra gerado com sucesso");
    },
    onError: (e: any) => toast.error("Erro ao gerar PC", { description: e.message }),
  });
}

// ---- KPIs ----
export function useFinanceiroKPIs() {
  return useQuery({
    queryKey: ["financeiro-kpis"],
    queryFn: async () => {
      const [rcRes, payRes] = await Promise.all([
        supabase.from("rc_requests").select("id, status, valor_estimado"),
        supabase.from("purchase_payables").select("id, status, amount, due_date"),
      ]);
      const rcs = (rcRes.data || []) as any[];
      const payables = (payRes.data || []) as any[];
      const today = new Date().toISOString().split("T")[0];

      return {
        rcPendentes: rcs.filter(r => r.status === 'aguardando_aprovacao').length,
        rcEmCotacao: rcs.filter(r => r.status === 'em_cotacao').length,
        totalRCs: rcs.length,
        pagamentosAtrasados: payables.filter(p => p.status === 'programado' && p.due_date < today).length,
        totalAPagar: payables.filter(p => p.status === 'programado').reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0),
      };
    },
  });
}
