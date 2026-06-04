import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      // Soft delete: marca o perfil como 'deleted'. Papéis legados não existem mais.
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ status: "deleted" })
        .eq("id", userId);

      if (profileError) throw profileError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}
