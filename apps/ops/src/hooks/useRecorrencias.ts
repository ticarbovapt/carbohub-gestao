import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as db } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { POSVENDA_STAGES, type FulfillmentStage } from "@/hooks/usePosVenda";

/**
 * Contratos de recorrência, agrupados.
 *
 * Por que tela própria: as parcelas de um contrato ficam espalhadas pelos meses
 * futuros, e /vendas filtra por período — então em agosto você vê a parcela de
 * agosto, e as de set/out/nov só aparecem quando você navega até o mês delas.
 * Para acompanhar o CONTRATO (o que já produziu, o que falta, onde cada parcela
 * está) é preciso vê-las juntas.
 *
 * Nada de novo é criado aqui: são os mesmos carboze_orders, mesma edição
 * (/vender?edit=), mesmas RPCs de cancelar e excluir. Só reunidos por contrato.
 */

export interface ParcelaRow {
  id: string;
  order_number: string | null;
  status: string;
  fulfillment_stage: FulfillmentStage;
  scheduled_month: string | null;
  recurrence_index: number | null;
  total: number;
  invoice_number: string | null;
  nf_access_key: string | null;
  bling_nf_id: number | null;
  agreed_delivery_date: string | null;
  ppf_date: string | null;   // produzir até
  ppe_date: string | null;   // enviar até
  items: unknown;
}

export interface ContratoRow {
  contrato_id: string;
  customer_name: string | null;
  vendedor_name: string | null;
  recurrence_period: string | null;
  recurrence_total: number | null;
  valor_parcela: number;
  valor_contrato: number;
  parcelas: ParcelaRow[];
  /** Quantas já viraram venda (saíram de 'agendado'). */
  ativadas: number;
  /** Quantas já têm nota. */
  faturadas: number;
}

const temNota = (p: ParcelaRow) =>
  !!p.invoice_number || !!p.nf_access_key || !!p.bling_nf_id ||
  ["invoiced", "shipped", "delivered"].includes(p.status);

export function useRecorrencias() {
  return useQuery({
    queryKey: ["ops", "recorrencias"],
    queryFn: async (): Promise<ContratoRow[]> => {
      const { data, error } = await (db as any)
        .from("carboze_orders")
        .select(
          "id, order_number, customer_name, vendedor_name, status, fulfillment_stage, " +
          "scheduled_month, recurrence_index, recurrence_total, recurrence_period, " +
          "parent_order_id, recurrence_group_id, total, invoice_number, nf_access_key, bling_nf_id, " +
          "agreed_delivery_date, ppf_date, ppe_date, items",
        )
        .not("recurrence_total", "is", null)
        .order("recurrence_index", { ascending: true })
        .limit(2000);
      if (error) throw error;

      const porContrato = new Map<string, ContratoRow>();
      for (const r of (data ?? []) as any[]) {
        // recurrence_group_id é a identidade do CONTRATO e sobrevive à exclusão
        // de qualquer parcela. Antes agrupávamos por coalesce(parent_order_id,
        // id): apagar a parcela 1 disparava o ON DELETE SET NULL da FK e o
        // contrato se partia em vários de uma parcela cada. Os dois fallbacks
        // cobrem linha antiga que ainda não passou pelo backfill.
        const key = (r.recurrence_group_id as string | null)
          ?? (r.parent_order_id as string | null)
          ?? (r.id as string);
        const parcela: ParcelaRow = {
          id: r.id,
          order_number: r.order_number ?? null,
          status: r.status ?? "",
          fulfillment_stage: (r.fulfillment_stage ?? "nova_venda") as FulfillmentStage,
          scheduled_month: r.scheduled_month ?? null,
          recurrence_index: r.recurrence_index ?? null,
          total: Number(r.total ?? 0),
          invoice_number: r.invoice_number ?? null,
          nf_access_key: r.nf_access_key ?? null,
          bling_nf_id: r.bling_nf_id ?? null,
          agreed_delivery_date: r.agreed_delivery_date ?? null,
          ppf_date: r.ppf_date ?? null,
          ppe_date: r.ppe_date ?? null,
          items: r.items,
        };
        const cur = porContrato.get(key);
        if (cur) {
          cur.parcelas.push(parcela);
        } else {
          porContrato.set(key, {
            contrato_id: key,
            customer_name: r.customer_name ?? null,
            vendedor_name: r.vendedor_name ?? null,
            recurrence_period: r.recurrence_period ?? null,
            recurrence_total: r.recurrence_total ?? null,
            valor_parcela: Number(r.total ?? 0),
            valor_contrato: 0,
            parcelas: [parcela],
            ativadas: 0,
            faturadas: 0,
          });
        }
      }

      return Array.from(porContrato.values())
        .map((c) => {
          c.parcelas.sort((a, b) => (a.recurrence_index ?? 0) - (b.recurrence_index ?? 0));
          c.valor_contrato = c.parcelas.reduce((s, p) => s + p.total, 0);
          c.ativadas = c.parcelas.filter((p) => p.status !== "agendado").length;
          c.faturadas = c.parcelas.filter(temNota).length;
          // O nome/vendedor vêm da 1ª parcela, não da ordem de chegada do map.
          const primeira = c.parcelas[0];
          if (primeira) c.valor_parcela = primeira.total;
          return c;
        })
        .sort((a, b) => (a.customer_name ?? "").localeCompare(b.customer_name ?? ""));
    },
  });
}

/** Exclui uma parcela. Mesma RPC do /vendas — nada de caminho paralelo. */
export function useExcluirParcela() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      const { error } = await (db as any).rpc("carboze_order_delete", {
        p_id: id, p_reason: motivo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "recorrencias"] });
      qc.invalidateQueries({ queryKey: ["ops", "pos-venda"] });
      qc.invalidateQueries({ queryKey: ["parcelas_agendadas"] });
      toast.success("Parcela excluída.");
    },
    onError: (e: Error) => toast.error("Não foi possível excluir: " + e.message),
  });
}

/** Cancela uma parcela (estorna estoque e marca a etapa). Mesma RPC do /vendas. */
export function useCancelarParcela() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      const { error } = await (db as any).rpc("carboze_order_cancel", {
        p_id: id, p_reason: motivo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "recorrencias"] });
      qc.invalidateQueries({ queryKey: ["ops", "pos-venda"] });
      qc.invalidateQueries({ queryKey: ["parcelas_agendadas"] });
      toast.success("Parcela cancelada.");
    },
    onError: (e: Error) => toast.error("Não foi possível cancelar: " + e.message),
  });
}

/** Rótulo da etapa. Mesma lista do quadro (packages/posvenda). */
export const stageLabel = (k: FulfillmentStage | string): string =>
  POSVENDA_STAGES.find((s) => s.key === k)?.label ?? String(k);

export { temNota };
