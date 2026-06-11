import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  department: string | null;
  funcao: string | null;
  secondary_department: string | null;
  secondary_funcao: string | null;
  escopo: string | null;
  manager_user_id: string | null;
  status: string | null;
  allowed_interfaces: string[] | null;
  is_vendedor: boolean | null;
  created_at: string | null;
}

export interface UpdateUserParams {
  userId: string;
  fullName?: string;
  department?: string;
  funcao?: string;
  secondaryDepartment?: string;
  secondaryFuncao?: string;
  escopo?: string;
  managerUserId?: string;
  allowedInterfaces?: string[];
}

export interface DeptFunction {
  id?: string;
  department?: string;
  function_key: string;
  label: string;
  hierarchy_order: number;
  access_level: "gestor" | "colaborador";
}

export interface CreateUserParams {
  fullName: string;
  department: string;
  role: string;            // app_role: operator | manager | admin
  funcao?: string;
  secondaryDepartment?: string;
  secondaryFuncao?: string;
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
        .select("id, full_name, username, department, funcao, secondary_department, secondary_funcao, escopo, manager_user_id, status, allowed_interfaces, is_vendedor, created_at")
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
        .from("carbo_functions")
        .select("id, department, function_key, label, hierarchy_order, access_level")
        .eq("is_active", true)
        .eq("department", department!)
        .order("hierarchy_order");
      if (error) throw error;
      return (data ?? []) as DeptFunction[];
    },
  });
}

/** TODAS as funções ativas — usado pra resolver o nível (gestor/colaborador). */
export function useAllDeptFunctions() {
  return useQuery({
    queryKey: ["admin", "dept-functions", "all"],
    queryFn: async (): Promise<DeptFunction[]> => {
      const { data, error } = await supabase
        .from("carbo_functions")
        .select("id, department, function_key, label, hierarchy_order, access_level")
        .eq("is_active", true)
        .order("hierarchy_order");
      if (error) throw error;
      return (data ?? []) as DeptFunction[];
    },
  });
}

/** Cria uma função num departamento (RLS aberta — escrita direta). */
export function useCreateFunction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { department: string; label: string; accessLevel: "gestor" | "colaborador" }) => {
      const function_key = slugifyFunctionKey(p.label);
      if (!function_key) throw new Error("Nome inválido");
      // hierarchy_order = fim da lista do departamento
      const { data: existing } = await supabase
        .from("carbo_functions")
        .select("hierarchy_order")
        .eq("department", p.department)
        .order("hierarchy_order", { ascending: false })
        .limit(1);
      const nextOrder = ((existing?.[0]?.hierarchy_order as number) ?? 0) + 1;
      const { error } = await supabase.from("carbo_functions").upsert({
        department: p.department,
        function_key,
        label: p.label.trim(),
        hierarchy_order: nextOrder,
        access_level: p.accessLevel,
        is_active: true,
      }, { onConflict: "department,function_key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "dept-functions"] }),
  });
}

/** Apaga (desativa) uma função — soft delete pra não orfanar usuários. */
export function useDeleteFunction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("carbo_functions")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "dept-functions"] }),
  });
}

/** label → function_key estável (sem acento, minúsculo, _). */
function slugifyFunctionKey(label: string): string {
  return label
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

/** Edita um usuário existente (action update_user na mesma edge function). */
/** Marca/desmarca o usuário como vendedor (RPC dedicada; só gestor). */
export function useSetIsVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: boolean }): Promise<void> => {
      const { error } = await (supabase as unknown as { rpc: (fn: string, args: unknown) => Promise<{ error: unknown }> })
        .rpc("set_is_vendedor", { p_user_id: userId, p_value: value });
      if (error) throw error as Error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: UpdateUserParams): Promise<void> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await supabase.functions.invoke("create-team-member", {
        body: { action: "update_user", ...params, platformUrl: window.location.origin },
      });
      if (res.error) throw new Error(res.error.message || "Erro ao salvar");
      if (!res.data?.success) throw new Error(res.data?.error || "Erro ao salvar");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
    },
  });
}
