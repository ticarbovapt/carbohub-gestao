import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";

type ActionPriority = Database["public"]["Enums"]["action_priority"];
type ActionStatus = Database["public"]["Enums"]["action_status"];

export interface OsAction {
  id: string;
  service_order_id: string;
  message_id: string | null;
  assigned_to: string;
  assigned_by: string;
  description: string;
  priority: ActionPriority;
  status: ActionStatus;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  assignee?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  assigner?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export function useOsActions(serviceOrderId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const actionsQuery = useQuery({
    queryKey: ["os-actions", serviceOrderId],
    queryFn: async () => {
      // First fetch actions
      const { data: actions, error } = await supabase
        .from("os_actions")
        .select("*")
        .eq("service_order_id", serviceOrderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!actions || actions.length === 0) return [];

      // Get unique user IDs
      const userIds = [...new Set([
        ...actions.map((a) => a.assigned_to),
        ...actions.map((a) => a.assigned_by),
      ])];

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      // Combine data
      return actions.map((a) => ({
        ...a,
        assignee: profileMap.get(a.assigned_to) || undefined,
        assigner: profileMap.get(a.assigned_by) || undefined,
      })) as OsAction[];
    },
    enabled: !!serviceOrderId,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!serviceOrderId) return;

    const channel = supabase
      .channel(`os-actions-${serviceOrderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "os_actions",
          filter: `service_order_id=eq.${serviceOrderId}`,
        },
        () => {
          // Invalidate query to refetch with profile data
          queryClient.invalidateQueries({ queryKey: ["os-actions", serviceOrderId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [serviceOrderId, queryClient]);

  const createActionMutation = useMutation({
    mutationFn: async ({
      description,
      assignedTo,
      priority,
      dueDate,
      messageId,
    }: {
      description: string;
      assignedTo: string;
      priority: ActionPriority;
      dueDate?: string;
      messageId?: string;
    }) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("os_actions")
        .insert({
          service_order_id: serviceOrderId,
          assigned_to: assignedTo,
          assigned_by: user.id,
          description,
          priority,
          due_date: dueDate || null,
          message_id: messageId || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Create notification for assigned user
      await supabase.from("notifications").insert({
        user_id: assignedTo,
        type: "action_assigned",
        title: "Nova ação atribuída",
        body: description.substring(0, 100),
        reference_type: "os_action",
        reference_id: data.id,
      });

      return data;
    },
    onSuccess: () => {
      toast.success("Ação criada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["os-actions", serviceOrderId] });
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar ação: " + error.message);
    },
  });

  const updateActionStatusMutation = useMutation({
    mutationFn: async ({ actionId, status }: { actionId: string; status: ActionStatus }) => {
      const updateData: Record<string, unknown> = { status };
      
      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("os_actions")
        .update(updateData)
        .eq("id", actionId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado!");
      queryClient.invalidateQueries({ queryKey: ["os-actions", serviceOrderId] });
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar status: " + error.message);
    },
  });

  const pendingActions = actionsQuery.data?.filter((a) => a.status === "pending") || [];
  const completedActions = actionsQuery.data?.filter((a) => a.status === "completed") || [];
  const hasActions = (actionsQuery.data?.length || 0) > 0;
  const allActionsCompleted = hasActions && pendingActions.length === 0;

  return {
    actions: actionsQuery.data || [],
    pendingActions,
    completedActions,
    hasActions,
    allActionsCompleted,
    isLoading: actionsQuery.isLoading,
    createAction: createActionMutation.mutate,
    isCreating: createActionMutation.isPending,
    updateStatus: updateActionStatusMutation.mutate,
  };
}
