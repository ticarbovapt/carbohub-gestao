import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DepartmentType } from "@/types/os";

export interface FlowValidationResult {
  can_advance: boolean;
  block_reason: string | null;
  checklist_complete: boolean;
  sla_status: "ok" | "warning" | "critical" | "breached";
}

export interface SlaConfig {
  id: string;
  department_type: DepartmentType;
  default_sla_hours: number;
  warning_threshold_percent: number;
  requires_checklist: boolean;
  requires_validation: boolean;
}

export interface CapacityCheck {
  has_capacity: boolean;
  available_slots: number;
  max_orders: number;
  scheduled_orders: number;
}

// Hook to check if OS can advance
export function useOsFlowValidation(osId: string | undefined) {
  return useQuery({
    queryKey: ["os-flow-validation", osId],
    queryFn: async (): Promise<FlowValidationResult> => {
      if (!osId) throw new Error("OS ID required");

      const { data, error } = await supabase.rpc("can_os_advance", {
        _os_id: osId,
      });

      if (error) throw error;

      // The function returns an array, we want the first result
      const result = Array.isArray(data) ? data[0] : data;
      
      return {
        can_advance: result?.can_advance ?? false,
        block_reason: result?.block_reason ?? null,
        checklist_complete: result?.checklist_complete ?? false,
        sla_status: (result?.sla_status as FlowValidationResult["sla_status"]) ?? "ok",
      };
    },
    enabled: !!osId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Hook to get SLA configurations
export function useSlaConfigs() {
  return useQuery({
    queryKey: ["sla-configs"],
    queryFn: async (): Promise<SlaConfig[]> => {
      const { data, error } = await supabase
        .from("department_sla_config")
        .select("*")
        .order("department_type");

      if (error) throw error;
      return data as SlaConfig[];
    },
  });
}

// Hook to check operational capacity
export function useOperationalCapacity(
  department: DepartmentType | undefined,
  date?: string
) {
  return useQuery({
    queryKey: ["operational-capacity", department, date],
    queryFn: async (): Promise<CapacityCheck> => {
      if (!department) throw new Error("Department required");

      const { data, error } = await supabase.rpc("check_operational_capacity", {
        _department: department,
        _date: date || new Date().toISOString().split("T")[0],
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;

      return {
        has_capacity: result?.has_capacity ?? true,
        available_slots: result?.available_slots ?? 10,
        max_orders: result?.max_orders ?? 10,
        scheduled_orders: result?.scheduled_orders ?? 0,
      };
    },
    enabled: !!department,
  });
}

// Hook to log flow blocks
export function useLogFlowBlock() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      actionType: string;
      resourceType: string;
      resourceId: string;
      reason: string;
      department?: DepartmentType;
      details?: Record<string, string | number | boolean | null>;
      severity?: "info" | "warning" | "error" | "critical";
    }) => {
      const { error } = await supabase.from("flow_audit_logs").insert([{
        user_id: user?.id || null,
        action_type: params.actionType,
        resource_type: params.resourceType,
        resource_id: params.resourceId,
        reason: params.reason,
        department: params.department || null,
        details: JSON.parse(JSON.stringify(params.details || {})),
        severity: params.severity || "warning",
      }]);

      if (error) throw error;
    },
  });
}

// Hook to validate stage and mark as validated
export function useValidateStage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: { osId: string; notes?: string }) => {
      const { error } = await supabase
        .from("service_orders")
        .update({
          stage_validated_at: new Date().toISOString(),
          stage_validated_by: user?.id,
        })
        .eq("id", params.osId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["service-order", variables.osId] });
      queryClient.invalidateQueries({ queryKey: ["os-flow-validation", variables.osId] });
    },
  });
}

// Calculate SLA status color
export function getSlaStatusColor(status: FlowValidationResult["sla_status"]) {
  switch (status) {
    case "ok":
      return "text-success";
    case "warning":
      return "text-warning";
    case "critical":
      return "text-orange-500";
    case "breached":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

// Calculate SLA status background
export function getSlaStatusBg(status: FlowValidationResult["sla_status"]) {
  switch (status) {
    case "ok":
      return "bg-success/10 border-success/30";
    case "warning":
      return "bg-warning/10 border-warning/30";
    case "critical":
      return "bg-orange-500/10 border-orange-500/30";
    case "breached":
      return "bg-destructive/10 border-destructive/30 animate-pulse";
    default:
      return "bg-muted";
  }
}

// Calculate time remaining as string
export function formatTimeRemaining(deadline: string | null): string {
  if (!deadline) return "Sem prazo";

  const now = new Date();
  const slaDate = new Date(deadline);
  const diffMs = slaDate.getTime() - now.getTime();

  if (diffMs < 0) {
    const hoursLate = Math.abs(Math.floor(diffMs / (1000 * 60 * 60)));
    if (hoursLate < 24) {
      return `${hoursLate}h atrasado`;
    }
    return `${Math.floor(hoursLate / 24)}d atrasado`;
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) {
    return `${hours}h restantes`;
  }
  return `${Math.floor(hours / 24)}d restantes`;
}
