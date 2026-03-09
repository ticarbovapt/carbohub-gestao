import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PasswordResetRequest {
  id: string;
  user_id: string;
  manager_user_id: string;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  new_temp_password_set: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  user_name?: string;
  manager_name?: string;
}

export function usePasswordResetRequests() {
  return useQuery({
    queryKey: ["password-reset-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("password_reset_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as PasswordResetRequest[];
    },
  });
}

export function useCreatePasswordResetRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, managerUserId }: { userId: string; managerUserId: string }) => {
      const { data, error } = await supabase
        .from("password_reset_requests")
        .insert({
          user_id: userId,
          manager_user_id: managerUserId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["password-reset-requests"] });
    },
  });
}

export function useResolvePasswordResetRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      status,
      notes,
    }: {
      requestId: string;
      status: "approved" | "rejected";
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("password_reset_requests")
        .update({
          status,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          notes: notes || null,
        })
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["password-reset-requests"] });
    },
  });
}
