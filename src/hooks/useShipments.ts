import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Shipment, ShipmentStatus, ShipmentItem } from "@/types/shipment";
import { toast } from "sonner";

function mapRow(row: any): Shipment {
  return {
    ...row,
    items: (row.items as ShipmentItem[]) || [],
    delivery_evidence: (row.delivery_evidence as any[]) || [],
    service_order: row.service_orders
      ? {
          os_number: row.service_orders.os_number,
          title: row.service_orders.title,
          status: row.service_orders.status,
          current_department: row.service_orders.current_department,
          customer: row.service_orders.customers
            ? { name: row.service_orders.customers.name }
            : null,
        }
      : undefined,
  };
}

export function useShipments(filters?: {
  status?: ShipmentStatus[];
  search?: string;
}) {
  return useQuery({
    queryKey: ["shipments", filters],
    queryFn: async () => {
      let query = supabase
        .from("os_shipments")
        .select(
          `*, service_orders!inner(os_number, title, status, current_department, customers(name))`
        )
        .order("created_at", { ascending: false });

      if (filters?.status?.length) {
        query = query.in("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapRow);
    },
  });
}

export function useShipmentsByOS(osId: string | undefined) {
  return useQuery({
    queryKey: ["shipments-by-os", osId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("os_shipments")
        .select("*")
        .eq("service_order_id", osId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map((r) => ({
        ...r,
        items: (r.items as unknown as ShipmentItem[]) || [],
        delivery_evidence: (r.delivery_evidence as any[]) || [],
      })) as Shipment[];
    },
    enabled: !!osId,
  });
}

export function useCreateShipment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      service_order_id: string;
      items: ShipmentItem[];
      destination?: string;
    }) => {
      const { data: result, error } = await supabase
        .from("os_shipments")
        .insert({
          service_order_id: data.service_order_id,
          items: data.items as any,
          destination: data.destination || null,
          created_by: user?.id,
          status: "separacao_pendente" as any,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast.success("Envio criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      queryClient.invalidateQueries({ queryKey: ["shipments-by-os"] });
    },
    onError: (e: Error) => toast.error("Erro ao criar envio: " + e.message),
  });
}

export function useUpdateShipmentStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      extra,
    }: {
      id: string;
      status: ShipmentStatus;
      extra?: Record<string, any>;
    }) => {
      const updateData: Record<string, any> = {
        status: status as any,
        ...extra,
      };

      // Auto-fill timestamps
      if (status === "separando" || status === "separado") {
        updateData.separated_by = updateData.separated_by || user?.id;
        if (status === "separado") {
          updateData.separated_at =
            updateData.separated_at || new Date().toISOString();
        }
      }
      if (status === "em_transporte") {
        updateData.shipped_by = updateData.shipped_by || user?.id;
        updateData.shipped_at =
          updateData.shipped_at || new Date().toISOString();
      }
      if (status === "entregue") {
        updateData.delivered_by = updateData.delivered_by || user?.id;
        updateData.delivered_at =
          updateData.delivered_at || new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("os_shipments")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Status atualizado!");
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      queryClient.invalidateQueries({ queryKey: ["shipments-by-os"] });
    },
    onError: (e: Error) =>
      toast.error("Erro ao atualizar status: " + e.message),
  });
}
