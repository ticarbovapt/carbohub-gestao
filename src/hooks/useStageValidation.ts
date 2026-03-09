import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type OsWorkflowStage = 
  | "comercial" 
  | "operacoes" 
  | "logistica" 
  | "administrativo" 
  | "fiscal" 
  | "financeiro" 
  | "pos_venda";

export interface ChecklistItem {
  id: string;
  label: string;
  type: "checkbox" | "text" | "textarea" | "select" | "date" | "file" | "number";
  required: boolean;
  options?: string[];
  value?: string | boolean | number;
}

export interface StageConfig {
  id: string;
  stage: OsWorkflowStage;
  stage_label: string;
  status_label: string;
  responsible_role: string;
  display_order: number;
  is_optional: boolean;
  description: string;
  default_items: ChecklistItem[];
}

export interface StageValidation {
  id: string;
  service_order_id: string;
  stage: OsWorkflowStage;
  checklist_responses: ChecklistItem[];
  is_complete: boolean;
  validated_by: string | null;
  validated_at: string | null;
  validation_notes: string | null;
  skipped: boolean;
  skip_reason: string | null;
}

// Fetch all stage configurations
export function useStageConfigs() {
  return useQuery({
    queryKey: ["stage-configs"],
    queryFn: async (): Promise<StageConfig[]> => {
      const { data, error } = await supabase
        .from("checklist_stage_config")
        .select("*")
        .order("display_order");

      if (error) throw error;
      
      return (data || []).map(d => ({
        ...d,
        default_items: Array.isArray(d.default_items) 
          ? d.default_items as unknown as ChecklistItem[]
          : JSON.parse(d.default_items as string) as ChecklistItem[]
      }));
    },
  });
}

// Fetch validations for a specific OS
export function useOsStageValidations(osId: string | undefined) {
  return useQuery({
    queryKey: ["os-stage-validations", osId],
    queryFn: async (): Promise<StageValidation[]> => {
      if (!osId) return [];

      const { data, error } = await supabase
        .from("os_stage_validations")
        .select("*")
        .eq("service_order_id", osId)
        .order("created_at");

      if (error) throw error;
      
      return (data || []).map(d => ({
        ...d,
        checklist_responses: Array.isArray(d.checklist_responses)
          ? d.checklist_responses as unknown as ChecklistItem[]
          : JSON.parse(d.checklist_responses as string) as ChecklistItem[]
      }));
    },
    enabled: !!osId,
  });
}

// Get current stage for an OS
export function useCurrentOsStage(osId: string | undefined) {
  const { data: validations } = useOsStageValidations(osId);
  const { data: configs } = useStageConfigs();

  if (!validations || !configs) return "comercial" as OsWorkflowStage;

  // Find last completed stage
  const completedStages = validations
    .filter(v => v.is_complete || v.skipped)
    .map(v => v.stage);

  if (completedStages.length === 0) return "comercial" as OsWorkflowStage;

  // Get the last completed stage's order
  const lastCompletedOrder = Math.max(
    ...completedStages.map(stage => 
      configs.find(c => c.stage === stage)?.display_order || 0
    )
  );

  // Find next stage
  const nextStage = configs.find(c => c.display_order === lastCompletedOrder + 1);
  
  return nextStage?.stage || completedStages[completedStages.length - 1];
}

// Check if user can validate a stage
export function useCanValidateStage(stage: OsWorkflowStage) {
  const { user, isCeo, isGestorAdm, isGestorFin, isGestorCompras, isOperadorFiscal, isOperador } = useAuth();

  const roleMapping: Record<string, boolean> = {
    ceo: isCeo,
    gestor_adm: isGestorAdm,
    gestor_fin: isGestorFin,
    gestor_compras: isGestorCompras,
    operador_fiscal: isOperadorFiscal,
    operador: isOperador,
  };

  const stageRoles: Record<OsWorkflowStage, string[]> = {
    comercial: ["operador", "ceo"],
    operacoes: ["operador", "ceo"],
    logistica: ["gestor_compras", "ceo"],
    administrativo: ["gestor_adm", "ceo"],
    fiscal: ["operador_fiscal", "ceo"],
    financeiro: ["gestor_fin", "ceo"],
    pos_venda: ["operador", "ceo"],
  };

  const allowedRoles = stageRoles[stage] || [];
  return allowedRoles.some(role => roleMapping[role]);
}

// Save checklist responses (partial save)
export function useSaveChecklistResponses() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      osId: string;
      stage: OsWorkflowStage;
      responses: ChecklistItem[];
    }) => {
      // Check if validation exists
      const { data: existing } = await supabase
        .from("os_stage_validations")
        .select("id")
        .eq("service_order_id", params.osId)
        .eq("stage", params.stage)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("os_stage_validations")
          .update({
            checklist_responses: JSON.parse(JSON.stringify(params.responses)),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("os_stage_validations")
          .insert({
            service_order_id: params.osId,
            stage: params.stage,
            checklist_responses: JSON.parse(JSON.stringify(params.responses)),
          });

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["os-stage-validations", variables.osId] 
      });
    },
  });
}

// Validate and complete a stage
export function useValidateStage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      osId: string;
      stage: OsWorkflowStage;
      responses: ChecklistItem[];
      notes?: string;
    }) => {
      // Validate all required items are filled
      const requiredItems = params.responses.filter(r => r.required);
      const missingItems = requiredItems.filter(r => {
        if (r.type === "checkbox") return r.value !== true;
        return !r.value;
      });

      if (missingItems.length > 0) {
        throw new Error(`Campos obrigatórios pendentes: ${missingItems.map(m => m.label).join(", ")}`);
      }

      // Check if validation exists
      const { data: existing } = await supabase
        .from("os_stage_validations")
        .select("id")
        .eq("service_order_id", params.osId)
        .eq("stage", params.stage)
        .single();

      const validationData = {
        checklist_responses: JSON.parse(JSON.stringify(params.responses)),
        is_complete: true,
        validated_by: user?.id,
        validated_at: new Date().toISOString(),
        validation_notes: params.notes || null,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from("os_stage_validations")
          .update(validationData)
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("os_stage_validations")
          .insert({
            service_order_id: params.osId,
            stage: params.stage,
            ...validationData,
          });

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["os-stage-validations", variables.osId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ["service-order", variables.osId] 
      });
      toast.success("Etapa validada com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao validar etapa");
    },
  });
}

// Skip an optional stage
export function useSkipStage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      osId: string;
      stage: OsWorkflowStage;
      reason: string;
    }) => {
      const { data: existing } = await supabase
        .from("os_stage_validations")
        .select("id")
        .eq("service_order_id", params.osId)
        .eq("stage", params.stage)
        .single();

      const skipData = {
        skipped: true,
        skip_reason: params.reason,
        validated_by: user?.id,
        validated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from("os_stage_validations")
          .update(skipData)
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("os_stage_validations")
          .insert({
            service_order_id: params.osId,
            stage: params.stage,
            checklist_responses: [],
            ...skipData,
          });

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["os-stage-validations", variables.osId] 
      });
      toast.success("Etapa ignorada");
    },
  });
}

// Get stage progress summary
export function useStageProgress(osId: string | undefined) {
  const { data: validations } = useOsStageValidations(osId);
  const { data: configs } = useStageConfigs();

  if (!configs || !validations) {
    return {
      total: 7,
      completed: 0,
      current: "comercial" as OsWorkflowStage,
      percentage: 0,
    };
  }

  const completed = validations.filter(v => v.is_complete || v.skipped).length;
  const total = configs.filter(c => !c.is_optional).length;
  
  // Find current stage
  const completedStages = validations
    .filter(v => v.is_complete || v.skipped)
    .map(v => v.stage);

  let currentStage: OsWorkflowStage = "comercial";
  
  if (completedStages.length > 0) {
    const lastCompletedOrder = Math.max(
      ...completedStages.map(stage => 
        configs.find(c => c.stage === stage)?.display_order || 0
      )
    );
    const nextConfig = configs.find(c => c.display_order === lastCompletedOrder + 1);
    currentStage = nextConfig?.stage || completedStages[completedStages.length - 1];
  }

  return {
    total,
    completed,
    current: currentStage,
    percentage: Math.round((completed / total) * 100),
  };
}
