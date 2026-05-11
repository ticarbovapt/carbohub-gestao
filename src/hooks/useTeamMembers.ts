import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type DepartmentType = Database["public"]["Enums"]["department_type"];

export interface TeamMember {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: DepartmentType | null;
  status: string;
  requested_role: string | null;
  roles: AppRole[];
  carbo_roles: string[];
  email?: string;
  username: string | null;
  password_must_change: boolean;
  created_by_manager: string | null;
  last_access: string | null;
  temp_password_sent_at: string | null;
  allowed_interfaces: string[];
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      // Fetch profiles with status approved or pending
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name");

      if (profilesError) throw profilesError;

      // Fetch all roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Fetch carbo_user_roles
      const { data: carboRolesData } = await supabase
        .from("carbo_user_roles")
        .select("user_id, role");

      // Map roles to users
      const rolesByUser = roles?.reduce((acc, r) => {
        if (!acc[r.user_id]) acc[r.user_id] = [];
        acc[r.user_id].push(r.role);
        return acc;
      }, {} as Record<string, AppRole[]>) || {};

      const carboRolesByUser = (carboRolesData || []).reduce((acc, r) => {
        if (!acc[r.user_id]) acc[r.user_id] = [];
        acc[r.user_id].push(r.role as string);
        return acc;
      }, {} as Record<string, string[]>);

      const members: TeamMember[] = (profiles || []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        department: p.department,
        status: p.status || "pending",
        requested_role: p.requested_role,
        roles: rolesByUser[p.id] || [],
        carbo_roles: carboRolesByUser[p.id] || [],
        email: (p as any).email || undefined,
        username: p.username || null,
        password_must_change: p.password_must_change || false,
        created_by_manager: p.created_by_manager || null,
        last_access: p.last_access || null,
        temp_password_sent_at: p.temp_password_sent_at || null,
        allowed_interfaces: (p as any).allowed_interfaces || [],
      }));

      return members;
    },
  });
}

export function useApproveUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // Update profile status to approved
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ status: "approved" })
        .eq("id", userId);

      if (profileError) throw profileError;

      // Update user role (delete old operator role if exists, add new role)
      await supabase.from("user_roles").delete().eq("user_id", userId);

      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });

      if (roleError) throw roleError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useRejectUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "rejected" })
        .eq("id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // Delete existing roles
      await supabase.from("user_roles").delete().eq("user_id", userId);

      // Add new role
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Nível de acesso atualizado!");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar acesso: " + e.message),
  });
}

/** Substitui TODOS os carbo_roles do usuário (delete + insert atomicamente) */
export function useReplaceCarboRoles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, roles }: { userId: string; roles: string[] }) => {
      // Remove todos os roles atuais do usuário
      const { error: delError } = await supabase
        .from("carbo_user_roles")
        .delete()
        .eq("user_id", userId);
      if (delError) throw delError;
      // Insere os novos roles (pode ser array vazio — resultado: sem roles)
      if (roles.length > 0) {
        const rows = roles.map((role) => ({ user_id: userId, role }));
        const { error: insError } = await (supabase as any)
          .from("carbo_user_roles")
          .insert(rows);
        if (insError) throw insError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Funções de acesso atualizadas!");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar funções: " + e.message),
  });
}

export function useUpdateUserDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      department,
    }: {
      userId: string;
      department: DepartmentType | null;
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ department })
        .eq("id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useUpdateAllowedInterfaces() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      allowed_interfaces,
    }: {
      userId: string;
      allowed_interfaces: string[];
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ allowed_interfaces } as any)
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Interfaces de acesso atualizadas!");
    },
    onError: (e: Error) => toast.error("Erro ao salvar: " + e.message),
  });
}
