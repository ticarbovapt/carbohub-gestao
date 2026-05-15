import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { DEPARTMENTS as DEPT_CONFIG, type DataScope } from "@/constants/functionAccessConfig";

export interface DepartmentFunction {
  id: string;
  department: string;
  function_key: string;
  label: string;
  hierarchy_order: number;
  reports_to_key: string | null;
  data_scope: DataScope;
  is_active: boolean;
}

function configFallback(department: string): DepartmentFunction[] {
  const dept = DEPT_CONFIG.find(d => d.key === department);
  return (dept?.functions ?? []).map((f, i) => ({
    id: `config-${department}-${f.key}`,
    department,
    function_key: f.key,
    label: f.label,
    hierarchy_order: i + 1,
    reports_to_key: null,
    data_scope: f.scope,
    is_active: true,
  }));
}

export function useDepartmentFunctions(department?: string) {
  return useQuery({
    queryKey: ["department-functions", department],
    queryFn: async () => {
      try {
        let q = (supabase as any)
          .from("department_functions")
          .select("*")
          .eq("is_active", true)
          .order("hierarchy_order");
        if (department) q = q.eq("department", department);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []) as DepartmentFunction[];
        // If DB has data for this dept, use it; otherwise fall back to config
        if (rows.length > 0) return rows;
        if (department) return configFallback(department);
        // All depts: merge config for each dept not represented in DB
        const dbDepts = new Set(rows.map((r: DepartmentFunction) => r.department));
        const fallbacks = DEPT_CONFIG
          .filter(d => !dbDepts.has(d.key))
          .flatMap(d => configFallback(d.key));
        return [...rows, ...fallbacks];
      } catch {
        // Table doesn't exist or unreachable — return full config fallback
        if (department) return configFallback(department);
        return DEPT_CONFIG.flatMap(d => configFallback(d.key));
      }
    },
  });
}

export function useCreateDepartmentFunction() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      department: string;
      function_key: string;
      label: string;
      hierarchy_order: number;
      reports_to_key?: string | null;
    }) => {
      const { error } = await (supabase as any)
        .from("department_functions")
        .insert({ ...values, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["department-functions"] });
      qc.invalidateQueries({ queryKey: ["department-functions", v.department] });
      toast.success("Função criada com sucesso!");
    },
    onError: (e: any) => toast.error("Erro ao criar função: " + e.message),
  });
}

export function useUpdateFunctionScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      department: string;
      function_key: string;
      data_scope: DataScope;
    }) => {
      const { error } = await (supabase as any)
        .from("department_functions")
        .update({ data_scope: values.data_scope })
        .eq("department", values.department)
        .eq("function_key", values.function_key);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["department-functions"] });
      qc.invalidateQueries({ queryKey: ["department-functions", v.department] });
    },
    onError: (e: any) => toast.error("Erro ao salvar escopo: " + e.message),
  });
}
