import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { CarboRole, MacroFlow, OsStageAccess, CarboUserRole } from "@/types/carboRoles";

/**
 * Hook para gerenciar roles do Grupo Carbo
 */
export function useCarboRoles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Buscar roles do usuário atual
  const {
    data: userRoles,
    isLoading: isLoadingRoles,
    error: rolesError,
  } = useQuery({
    queryKey: ["carbo-user-roles", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("carbo_user_roles")
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;

      return (data || []).map((r) => ({
        id: r.id,
        userId: r.user_id,
        role: r.role as CarboRole,
        scopeDepartments: r.scope_departments || [],
        scopeMacroFlows: r.scope_macro_flows || [],
        createdAt: r.created_at,
        createdBy: r.created_by,
      })) as CarboUserRole[];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  // Buscar matriz de acesso por etapa
  const {
    data: stageAccess,
    isLoading: isLoadingAccess,
  } = useQuery({
    queryKey: ["os-stage-access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("os_stage_access")
        .select("*");

      if (error) throw error;

      return (data || []).map((a) => ({
        role: a.role as CarboRole,
        departmentType: a.department_type,
        canView: a.can_view,
        canExecute: a.can_execute,
        canValidate: a.can_validate,
      })) as OsStageAccess[];
    },
    staleTime: 10 * 60 * 1000, // 10 minutos
  });

  // Buscar mapeamento departamento -> macrofluxo
  const { data: macroFlowMapping } = useQuery({
    queryKey: ["department-macro-flow-mapping"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_macro_flow_mapping")
        .select("*")
        .order("display_order");

      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 60 * 1000, // 30 minutos
  });

  // Verificações de role
  const roles = userRoles?.map((r) => r.role) || [];
  
  const isCeo = roles.includes("ceo");
  const isGestorAdm = roles.includes("gestor_adm") || isCeo;
  const isGestorFin = roles.includes("gestor_fin") || isCeo;
  const isGestorCompras = roles.includes("gestor_compras") || isCeo;
  const isOperadorFiscal = roles.includes("operador_fiscal");
  const isOperador = roles.includes("operador");

  const isAnyGestor = isCeo || isGestorAdm || isGestorFin || isGestorCompras;
  const isAnyOperador = isOperadorFiscal || isOperador;

  // Obter role principal (o de maior hierarquia)
  const getPrimaryRole = (): CarboRole | null => {
    if (isCeo) return "ceo";
    if (isGestorAdm) return "gestor_adm";
    if (isGestorFin) return "gestor_fin";
    if (isGestorCompras) return "gestor_compras";
    if (isOperadorFiscal) return "operador_fiscal";
    if (isOperador) return "operador";
    return null;
  };

  // Verificar se pode acessar um departamento
  const canAccessDepartment = (departmentType: string): boolean => {
    if (isCeo) return true;
    
    const userAccess = stageAccess?.filter((a) =>
      roles.includes(a.role) && a.departmentType === departmentType
    );
    
    return userAccess?.some((a) => a.canView) || false;
  };

  // Verificar se pode executar em um departamento
  const canExecuteInDepartment = (departmentType: string): boolean => {
    if (isCeo) return true;
    
    const userAccess = stageAccess?.filter((a) =>
      roles.includes(a.role) && a.departmentType === departmentType
    );
    
    return userAccess?.some((a) => a.canExecute) || false;
  };

  // Verificar se pode validar em um departamento
  const canValidateInDepartment = (departmentType: string): boolean => {
    if (isCeo) return true;
    
    const userAccess = stageAccess?.filter((a) =>
      roles.includes(a.role) && a.departmentType === departmentType
    );
    
    return userAccess?.some((a) => a.canValidate) || false;
  };

  // Verificar acesso a macrofluxo
  const canAccessMacroFlow = (macroFlow: MacroFlow): boolean => {
    if (isCeo) return true;
    
    const userRole = userRoles?.find((r) => 
      r.scopeMacroFlows?.includes(macroFlow)
    );
    
    return !!userRole;
  };

  // Obter departamentos acessíveis
  const getAccessibleDepartments = (): string[] => {
    if (isCeo) {
      return macroFlowMapping?.map((m) => m.department_type) || [];
    }
    
    const accessible = stageAccess
      ?.filter((a) => roles.includes(a.role) && a.canView)
      .map((a) => a.departmentType) || [];
    
    return [...new Set(accessible)];
  };

  // Obter macrofluxos acessíveis
  const getAccessibleMacroFlows = (): MacroFlow[] => {
    if (isCeo) {
      return ["comercial", "operacional", "adm_financeiro"];
    }
    
    const depts = getAccessibleDepartments();
    const flows = macroFlowMapping
      ?.filter((m) => depts.includes(m.department_type))
      .map((m) => m.macro_flow as MacroFlow) || [];
    
    return [...new Set(flows)];
  };

  return {
    // Dados
    userRoles,
    stageAccess,
    macroFlowMapping,
    
    // Loading states
    isLoading: isLoadingRoles || isLoadingAccess,
    error: rolesError,
    
    // Role checks
    roles,
    isCeo,
    isGestorAdm,
    isGestorFin,
    isGestorCompras,
    isOperadorFiscal,
    isOperador,
    isAnyGestor,
    isAnyOperador,
    getPrimaryRole,
    
    // Access checks
    canAccessDepartment,
    canExecuteInDepartment,
    canValidateInDepartment,
    canAccessMacroFlow,
    getAccessibleDepartments,
    getAccessibleMacroFlows,
  };
}

/**
 * Hook para atribuir roles (apenas CEO e Gestor Adm)
 */
export function useAssignCarboRole() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      userId,
      role,
      scopeDepartments = [],
      scopeMacroFlows = [],
    }: {
      userId: string;
      role: CarboRole;
      scopeDepartments?: string[];
      scopeMacroFlows?: MacroFlow[];
    }) => {
      const { data, error } = await supabase
        .from("carbo_user_roles")
        .insert([{
          user_id: userId,
          role: role as "ceo" | "gestor_adm" | "gestor_fin" | "gestor_compras" | "operador_fiscal" | "operador",
          scope_departments: scopeDepartments as ("venda" | "preparacao" | "expedicao" | "operacao" | "pos_venda")[],
          scope_macro_flows: scopeMacroFlows as ("comercial" | "operacional" | "adm_financeiro")[],
          created_by: user?.id,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carbo-user-roles"] });
    },
  });
}
