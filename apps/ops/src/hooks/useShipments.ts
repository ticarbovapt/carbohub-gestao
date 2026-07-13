import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Shipment, ShipmentStatus } from "@/components/logistica/shipments";

// ─────────────────────────────────────────────────────────────────────────────
// Remessas (ops_shipments) — tabela interna do Carbo Ops. RLS: authenticated.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export function useShipments() {
  return useQuery({
    queryKey: ["ops", "shipments"],
    queryFn: async (): Promise<Shipment[]> => {
      const res = await db.from("ops_shipments").select("*").order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []).map((s: any) => ({
        id: s.id,
        order_number: s.order_number ?? "—",
        destination: s.destination ?? "—",
        customer: s.customer ?? "—",
        carrier_name: s.carrier_name ?? null,
        tracking_code: s.tracking_code ?? null,
        status: (s.status ?? "separacao_pendente") as ShipmentStatus,
        items: Number(s.items) || 0,
        order_id: s.order_id ?? null,
      }));
    },
  });
}

export interface CreateShipmentInput {
  orderNumber: string;
  customer: string;
  destination: string;
  items: number;
  carrierName: string;
  trackingCode: string;
}

export function useShipmentMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ops", "shipments"] });

  const create = useMutation({
    mutationFn: async (p: CreateShipmentInput) => {
      if (!p.orderNumber.trim()) throw new Error("Informe o número do pedido.");
      if (!p.customer.trim()) throw new Error("Informe o cliente.");
      const { data: auth } = await db.auth.getUser();
      const res = await db.from("ops_shipments").insert({
        order_number: p.orderNumber.trim(),
        customer: p.customer.trim(),
        destination: p.destination.trim() || null,
        items: Number(p.items) || 0,
        carrier_name: p.carrierName.trim() || null,
        tracking_code: p.trackingCode.trim() || null,
        status: "separacao_pendente",
        created_by: auth?.user?.id ?? null,
      });
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (p: { id: string; status?: ShipmentStatus; carrierName?: string; trackingCode?: string }) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (p.status) updates.status = p.status;
      if (p.carrierName !== undefined) updates.carrier_name = p.carrierName.trim() || null;
      if (p.trackingCode !== undefined) updates.tracking_code = p.trackingCode.trim() || null;
      const res = await db.from("ops_shipments").update(updates).eq("id", p.id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("ops_shipments").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
