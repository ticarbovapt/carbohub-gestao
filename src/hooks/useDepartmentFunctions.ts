import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface DepartmentFunction {
  id: string;
  department: string;
  function_key: string;
  label: string;
  hierarchy_order: number;
  reports_to_key: string | null;
  is_active: boolean;
}

export function useDepartmentFunctions(department?: string) {
  return useQuery({
    queryKey: ["department-functions", department],
    queryFn: async () => {
      let q = (supabase as any)
        .from("department_functions")
        .select("*")
        .eq("is_active", true)
        .order("hierarchy_order");
      if (department) q = q.eq("department", department);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as DepartmentFunction[];
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
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
}
