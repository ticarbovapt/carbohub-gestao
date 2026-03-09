import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DepartmentType = Database["public"]["Enums"]["department_type"];
type AppRole = Database["public"]["Enums"]["app_role"];

interface CreateMemberParams {
  email: string;
  fullName: string;
  department: DepartmentType;
  role: AppRole;
}

interface CreateMemberResult {
  userId: string;
  username: string;
  email: string;
  emailSent: boolean;
}

export function useCreateTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateMemberParams): Promise<CreateMemberResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Você precisa estar logado para criar membros");
      }

      // Get current user profile for manager name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .single();

      const response = await supabase.functions.invoke("create-team-member", {
        body: {
          ...params,
          managerName: profile?.full_name || "Gestor",
          platformUrl: window.location.origin,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Erro ao criar membro");
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Erro ao criar membro");
      }

      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useResendWelcomeEmail() {
  return useMutation({
    mutationFn: async ({ 
      userId,
      email, 
      fullName, 
      username 
    }: { 
      userId: string;
      email?: string; 
      fullName: string; 
      username: string;
    }) => {
      // Generate a new temporary password
      const { data: tempPassword, error: passError } = await supabase.rpc("generate_temp_password");
      
      if (passError || !tempPassword) {
        throw new Error("Erro ao gerar nova senha temporária");
      }

      // We need to update the user's password via admin API (edge function)
      const response = await supabase.functions.invoke("send-welcome-email", {
        body: {
          userId,
          email: email || undefined,
          fullName,
          username,
          tempPassword,
          platformUrl: window.location.origin,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Erro ao reenviar e-mail");
      }

      if (!response.data?.success || response.data?.data?.error) {
        const providerError = response.data?.data?.error?.message;
        throw new Error(providerError || response.data?.error || "Erro ao reenviar e-mail");
      }

      return response.data;
    },
  });
}
