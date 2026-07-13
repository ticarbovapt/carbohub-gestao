import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Shipment, ShipmentStatus } from "@/components/logistica/shipments";

// Etapas do pedido em que a NF já está resolvida (portão fiscal).
const NF_OK_STAGES = ["nf_finalizada", "em_transporte", "entregue"];

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
      const avancandoExpedicao = p.status === "em_transporte" || p.status === "entregue";
      // Pedido ligado (para portão fiscal e espelho de status).
      let orderId: string | null | undefined;
      if (avancandoExpedicao) {
        const sh = await db.from("ops_shipments").select("order_id").eq("id", p.id).maybeSingle();
        orderId = sh.data?.order_id as string | null | undefined;
        // Portão fiscal: mesma regra do Rastreio — não deixa despachar/entregar
        // sem NF. Vale nos DOIS lados (aqui abortamos antes de mover a remessa).
        if (orderId) {
          const ord = await db.from("carboze_orders")
            .select("bling_nf_id, invoice_number, fulfillment_stage").eq("id", orderId).maybeSingle();
          const o = ord.data;
          const hasNF = !!o?.bling_nf_id || !!o?.invoice_number || NF_OK_STAGES.includes(o?.fulfillment_stage);
          if (o && !hasNF) {
            throw new Error("Pedido sem nota fiscal: emita a NF antes de enviar/entregar esta remessa.");
          }
        }
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (p.status) updates.status = p.status;
      if (p.carrierName !== undefined) updates.carrier_name = p.carrierName.trim() || null;
      if (p.trackingCode !== undefined) updates.tracking_code = p.trackingCode.trim() || null;
      const res = await db.from("ops_shipments").update(updates).eq("id", p.id);
      if (res.error) throw res.error;

      // Espelha no pedido ligado só os status de expedição para frente.
      // Cancelamento NÃO é sincronizado por aqui: cancelar precisa estornar o
      // estoque, o que só acontece no fluxo do pedido (Rastreio de venda).
      if (avancandoExpedicao && orderId) {
        const ou = await db.from("carboze_orders")
          .update({ fulfillment_stage: p.status, updated_at: new Date().toISOString() })
          .eq("id", orderId);
        if (ou.error) console.error("[shipments] falha ao sincronizar pedido:", ou.error);
      }
    },
    onSuccess: (_d, p) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["ops", "pos-venda"] });
      // Cancelamento não é espelhado no pedido (estorno de estoque só no fluxo
      // do pedido) — avisa pra não deixar o pedido vivo sem querer.
      if (p.status === "cancelado") {
        toast("Remessa cancelada — o pedido de venda NÃO foi cancelado.", {
          description: "Se quiser cancelar o pedido, faça no Rastreio de venda (lá o estoque é estornado).",
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
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
