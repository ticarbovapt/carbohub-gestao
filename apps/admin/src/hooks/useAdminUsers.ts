import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  department: string | null;
  funcao: string | null;
  status: string | null;
  allowed_interfaces: string[] | null;
  created_at: string | null;
}

export interface DeptFunction {
  function_key: string;
  label: string;
  hierarchy_order: number;
}

export interface CreateUserParams {
  fullName: string;
  department: string;
  role: string;            // app_role: operator | manager | admin
  funcao?: string;
  escopo?: string;
  managerUserId?: string;
  allowedInterfaces: string[];
}

export interface CreateUserResult {
  userId: string;
  username: string;
}

/** Lista de perfis (usuários já existentes). */
export function useProfiles() {
  return useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async (): Promise<AdminProfile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username, department, funcao, status, allowed_interfaces, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AdminProfile[];
    },
  });
}

/** Funções de um departamento (department_functions). */
export function useDeptFunctions(department?: string) {
  return useQuery({
    queryKey: ["admin", "dept-functions", department],
    enabled: !!department,
    queryFn: async (): Promise<DeptFunction[]> => {
      const { data, error } = await supabase
        .from("department_functions")
        .select("function_key, label, hierarchy_order")
        .eq("is_active", true)
        .eq("department", department!)
        .order("hierarchy_order");
      if (error) throw error;
      return (data ?? []) as DeptFunction[];
    },
  });
}

/** Cria usuário reusando a edge function compartilhada create-team-member. */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: CreateUserParams): Promise<CreateUserResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await supabase.functions.invoke("create-team-member", {
        body: { ...params, platformUrl: window.location.origin },
      });
      if (res.error) throw new Error(res.error.message || "Erro ao criar usuário");
      if (!res.data?.success) throw new Error(res.data?.error || "Erro ao criar usuário");
      return res.data.data as CreateUserResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
    },
  });
}
