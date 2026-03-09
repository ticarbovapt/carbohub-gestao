import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type EventType = "os_creation" | "os_delivery" | "meeting" | "deadline" | "general";
export type EventStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface ScheduledEvent {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  all_day: boolean;
  service_order_id: string | null;
  event_type: EventType;
  created_by: string;
  assigned_to: string | null;
  status: EventStatus;
  color: string | null;
  reminder_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  service_order?: {
    id: string;
    os_number: string;
    title: string;
  } | null;
  creator?: {
    id: string;
    full_name: string | null;
  } | null;
  assignee?: {
    id: string;
    full_name: string | null;
  } | null;
}

export interface CreateEventData {
  title: string;
  description?: string;
  start_date: Date;
  end_date?: Date;
  all_day?: boolean;
  service_order_id?: string;
  event_type: EventType;
  assigned_to?: string;
  color?: string;
  reminder_at?: Date;
}

export interface UpdateEventData extends Partial<CreateEventData> {
  status?: EventStatus;
}

export function useScheduledEvents(month?: Date) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["scheduled-events", month?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("scheduled_events")
        .select(`
          *,
          service_order:service_orders(id, os_number, title)
        `)
        .order("start_date", { ascending: true });

      // Filter by month if provided
      if (month) {
        const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
        const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
        query = query
          .gte("start_date", startOfMonth.toISOString())
          .lte("start_date", endOfMonth.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching events:", error);
        throw error;
      }

      // Fetch profiles for creators and assignees
      const events = data || [];
      const userIds = new Set<string>();
      events.forEach((e) => {
        if (e.created_by) userIds.add(e.created_by);
        if (e.assigned_to) userIds.add(e.assigned_to);
      });

      let profiles: Record<string, { id: string; full_name: string | null }> = {};
      if (userIds.size > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", Array.from(userIds));
        
        if (profilesData) {
          profiles = profilesData.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {} as Record<string, { id: string; full_name: string | null }>);
        }
      }

      // Map events with profile data
      return events.map((event) => ({
        ...event,
        event_type: event.event_type as EventType,
        status: event.status as EventStatus,
        creator: event.created_by ? profiles[event.created_by] || null : null,
        assignee: event.assigned_to ? profiles[event.assigned_to] || null : null,
      })) as ScheduledEvent[];
    },
    enabled: !!user,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (eventData: CreateEventData) => {
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("scheduled_events")
        .insert({
          title: eventData.title,
          description: eventData.description || null,
          start_date: eventData.start_date.toISOString(),
          end_date: eventData.end_date?.toISOString() || null,
          all_day: eventData.all_day || false,
          service_order_id: eventData.service_order_id || null,
          event_type: eventData.event_type,
          created_by: user.id,
          assigned_to: eventData.assigned_to || null,
          color: eventData.color || "#3B82F6",
          reminder_at: eventData.reminder_at?.toISOString() || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-events"] });
      toast.success("Evento criado com sucesso!");
    },
    onError: (error) => {
      console.error("Error creating event:", error);
      toast.error("Erro ao criar evento");
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, data }: { eventId: string; data: UpdateEventData }) => {
      const updateData: Record<string, unknown> = {};

      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.start_date !== undefined) updateData.start_date = data.start_date.toISOString();
      if (data.end_date !== undefined) updateData.end_date = data.end_date?.toISOString() || null;
      if (data.all_day !== undefined) updateData.all_day = data.all_day;
      if (data.service_order_id !== undefined) updateData.service_order_id = data.service_order_id || null;
      if (data.event_type !== undefined) updateData.event_type = data.event_type;
      if (data.assigned_to !== undefined) updateData.assigned_to = data.assigned_to || null;
      if (data.color !== undefined) updateData.color = data.color;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.reminder_at !== undefined) updateData.reminder_at = data.reminder_at?.toISOString() || null;

      const { data: result, error } = await supabase
        .from("scheduled_events")
        .update(updateData)
        .eq("id", eventId)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-events"] });
      toast.success("Evento atualizado!");
    },
    onError: (error) => {
      console.error("Error updating event:", error);
      toast.error("Erro ao atualizar evento");
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("scheduled_events")
        .delete()
        .eq("id", eventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-events"] });
      toast.success("Evento removido!");
    },
    onError: (error) => {
      console.error("Error deleting event:", error);
      toast.error("Erro ao remover evento");
    },
  });
}
