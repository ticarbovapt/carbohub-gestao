// ─────────────────────────────────────────────────────────────────────────────
// Follow-up a partir dos Dados Comerciais → cria card no funil f10 (Follow up)
// do Carbo Sales. Escreve em public.crm_sales_leads (tabela nova, fora dos tipos
// gerados → cliente sem tipo). RLS de INSERT exige created_by = auth.uid().
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ComercialOrderRow } from "@/hooks/useComercialOrders";

const db = supabase as unknown as { from: (t: string) => any };

// Shape mínimo necessário do RowVM da tela de Clientes (estruturalmente compatível).
export interface FollowupRow {
  nome: string;
  cnpjs: string[];
  pedidos: number;
  totalBRL: number;
  primeira: string | null;
  ultima: string | null;
  orders: ComercialOrderRow[];
}

interface ItemHist { produto: string; qtd: number; valor: number }
interface PedidoHist {
  order_number: string | null;
  created_at: string | null;
  total: number;
  itens: ItemHist[];
}

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Já existe follow-up (f10) para este CNPJ? enabled só com cnpjDigits. */
export function useFollowupLeadStatus(cnpjDigits: string | null) {
  return useQuery({
    queryKey: ["followup-lead-status", cnpjDigits],
    enabled: !!cnpjDigits,
    queryFn: async (): Promise<{ exists: boolean; id: string | null }> => {
      const { data, error } = await db
        .from("crm_sales_leads")
        .select("id, stage")
        .eq("funnel_type", "f10")
        .eq("cnpj", cnpjDigits)
        .limit(1);
      if (error) throw error;
      const first = (data ?? [])[0];
      return { exists: !!first, id: first?.id ?? null };
    },
  });
}

function normalizeItems(items: any): ItemHist[] {
  if (!Array.isArray(items)) return [];
  return items.map((it: any) => ({
    produto: it?.name ?? it?.product_code ?? "Produto",
    qtd: Number(it?.quantity) || 0,
    valor: Number(it?.unit_price) || 0,
  }));
}

function montarNotes(row: FollowupRow, pedidos: PedidoHist[]): string {
  const header =
    `Cliente reativação — ${row.pedidos} pedido${row.pedidos === 1 ? "" : "s"} · ` +
    `Total histórico ${brl(row.totalBRL)} · 1ª compra ${dia(row.primeira)} · Última ${dia(row.ultima)}`;
  const blocos = pedidos.map((p) => {
    const linhas = p.itens.length
      ? p.itens.map((i) => `  • ${i.produto} × ${i.qtd} (${brl(i.valor)})`).join("\n")
      : "  • (sem itens registrados)";
    return `${dia(p.created_at)} — ${brl(p.total)}\n${linhas}`;
  });
  return [header, "", ...blocos].join("\n");
}

/** Cria o card f10/a_reativar com o histórico completo do cliente em Observações. */
export function useCreateFollowupLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, assignedToOverride }: { row: FollowupRow; assignedToOverride?: string }) => {
      const ids = row.orders.map((o) => o.id).filter(Boolean);
      if (!ids.length) throw new Error("Cliente sem pedidos.");

      // Query extra: itens de TODOS os pedidos (o hook-mãe não traz `items`).
      const { data: raw, error: qErr } = await db
        .from("carboze_orders")
        .select("id, order_number, created_at, total, items, cnpj, customer_name, delivery_city, delivery_state, vendedor_id")
        .in("id", ids);
      if (qErr) throw qErr;

      const pedidos: PedidoHist[] = ((raw ?? []) as any[])
        .map((o) => ({
          order_number: o.order_number ?? null,
          created_at: o.created_at ?? null,
          total: Number(o.total) || 0,
          itens: normalizeItems(o.items),
          cnpj: o.cnpj as string | null,
          customer_name: o.customer_name as string | null,
          city: o.delivery_city as string | null,
          state: o.delivery_state as string | null,
          vendedor_id: o.vendedor_id as string | null,
        }))
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

      const last = pedidos[0] as (PedidoHist & {
        cnpj: string | null; customer_name: string | null; city: string | null; state: string | null; vendedor_id: string | null;
      }) | undefined;

      const cnpjDigits = digits(last?.cnpj) || row.cnpjs[0] || null;
      const nome = last?.customer_name?.trim() || row.nome || null;
      const assignedTo = assignedToOverride ?? last?.vendedor_id ?? null;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Usuário não autenticado.");

      const notes = montarNotes(row, pedidos.map((p) => ({
        order_number: p.order_number, created_at: p.created_at, total: p.total, itens: p.itens,
      })));

      const payload = {
        funnel_type: "f10",
        stage: "a_reativar",
        legal_name: nome,
        trade_name: nome,
        cnpj: cnpjDigits,
        city: last?.city ?? null,
        state: last?.state ?? null,
        estimated_revenue: row.totalBRL,
        temperature: "frio",
        source: "Follow up (base comercial)",
        assigned_to: assignedTo,
        last_contact_at: last?.created_at ?? null,
        next_follow_up_at: null,
        created_by: user.id,
        notes,
        custom_fields: {
          origem_followup: "dados_comerciais",
          historico: pedidos.map((p) => ({
            data: p.created_at, total: p.total,
            itens: p.itens.map((i) => ({ produto: i.produto, qtd: i.qtd, valor: i.valor })),
          })),
        },
      };

      const { data, error } = await db.from("crm_sales_leads").insert(payload).select("id").single();
      if (error) throw error;
      return { id: data?.id as string, cnpj: cnpjDigits };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["followup-lead-status", res.cnpj] });
      qc.invalidateQueries({ queryKey: ["followup-lead-status"] });
      toast.success("Follow-up criado no funil Follow up (f10).");
    },
    onError: (e: Error) => toast.error("Erro ao criar follow-up: " + e.message),
  });
}
