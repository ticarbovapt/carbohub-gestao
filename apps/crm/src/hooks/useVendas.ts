import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Vendas do Carbo Sales — ADAPTADOR para carboze_orders (fonte única).
// Etapa B: a ilha crm_vendas foi aposentada. Este hook mantém a MESMA API que as
// telas do CRM já usam (VendaRow/NovaVendaInput/…), mas lê/grava em carboze_orders.
// Mapeamento de status: quote↔orcamento, cancelled↔cancelado, demais→pedido.
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type VendaStatus = "orcamento" | "pedido" | "cancelado";
export type VendaTipo = "venda" | "promo";

export interface VendaItemInput { produto: string; quantidade: number; preco_unitario: number; bonificacao?: number; product_id?: string | null; product_code?: string | null; }

export interface NovaVendaInput {
  tipo: VendaTipo; status: VendaStatus;
  customer_name?: string; customer_doc?: string; customer_email?: string; customer_phone?: string; customer_ie?: string;
  is_licenciado?: boolean;
  endereco?: Record<string, unknown> | null; endereco_faturamento?: Record<string, unknown> | null;
  payment_terms?: string; freight_type?: string; total: number; notes?: string;
  subtotal_bruto?: number;   // subtotal antes do desconto
  desconto_tipo?: string;    // 'value' | 'percent'
  desconto_valor?: number;   // R$ de desconto
  desconto_percent?: number; // % efetivo
  desconto_motivo?: string;
  agreed_delivery_date?: string;  // data de entrega combinada; banco calcula PPF/PPE
  internal_notes?: string;   // dados estratégicos + notas internas (nada é descartado)
  vendedor_id?: string;      // gestor pode lançar a venda por outro vendedor
  vendedor_name?: string;
  itens: VendaItemInput[];
}

export interface VendaItemRow { produto: string | null; quantidade: number; preco_unitario: number; bonificacao: number; }

export interface VendaRow {
  id: string; numero: string | null; vendedor_id: string; tipo: VendaTipo; status: VendaStatus;
  customer_name: string | null; customer_doc: string | null; customer_email: string | null; customer_phone: string | null; customer_ie: string | null;
  is_licenciado: boolean; endereco: Record<string, unknown> | null; endereco_faturamento: Record<string, unknown> | null;
  payment_terms: string | null; freight_type: string | null; total: number; notes: string | null;
  sale_date: string | null; extra: Record<string, unknown> | null; created_at: string; updated_at: string; itens?: VendaItemRow[];
}

export interface UpdateVendaInput {
  id: string; status?: VendaStatus; vendedor_id?: string;
  customer_name?: string | null; customer_email?: string | null; customer_phone?: string | null; customer_ie?: string | null;
  is_licenciado?: boolean; endereco?: Record<string, unknown> | null; endereco_faturamento?: Record<string, unknown> | null;
  payment_terms?: string | null; freight_type?: string | null; notes?: string | null; sale_date?: string | null; extra?: Record<string, unknown> | null;
}

// ── mapeamento status ────────────────────────────────────────────────────────
const toCrmStatus = (s: string): VendaStatus =>
  s === "quote" ? "orcamento" : s === "cancelled" ? "cancelado" : "pedido";
const toCarbozeStatus = (s?: VendaStatus): string | undefined =>
  s === "orcamento" ? "quote" : s === "cancelado" ? "cancelled" : s === "pedido" ? "pending" : undefined;

// carboze_orders row → VendaRow (formato que as telas do CRM esperam)
function toVenda(row: any): VendaRow {
  const items = Array.isArray(row.items) ? row.items : [];
  const e = row.delivery_address || row.delivery_city || row.delivery_zip
    ? { logradouro: row.delivery_address ?? "", cidade: row.delivery_city ?? "", uf: row.delivery_state ?? "", cep: row.delivery_zip ?? "" }
    : null;
  return {
    id: row.id, numero: row.order_number ?? null, vendedor_id: row.vendedor_id ?? "", tipo: "venda",
    status: toCrmStatus(row.status),
    customer_name: row.customer_name ?? null, customer_doc: row.cnpj ?? null,
    customer_email: row.customer_email ?? null, customer_phone: row.customer_phone ?? null, customer_ie: row.customer_ie ?? null,
    is_licenciado: false, endereco: e, endereco_faturamento: (row.billing_address ?? null),
    payment_terms: row.payment_terms ?? null, freight_type: row.freight_type ?? null,
    total: Number(row.total || 0), notes: row.notes ?? null, sale_date: row.sale_date ?? null,
    // Preserva o status carboze CRU (7 estados) p/ o EditPedido exibir/gravar sem rebaixar.
    extra: { status_detalhado: row.status },
    created_at: row.created_at, updated_at: row.updated_at,
    itens: items.map((i: any) => ({
      produto: i.name ?? i.produto ?? null,
      quantidade: Number(i.quantity ?? i.quantidade ?? 0),
      preco_unitario: Number(i.unit_price ?? i.preco_unitario ?? 0),
      bonificacao: Number(i.bonificacao ?? 0),
    })),
  };
}

/** Lista de vendas (carboze_orders). RLS decide o escopo. */
export function useVendas(status?: VendaStatus | "all") {
  return useQuery({
    queryKey: ["crm_vendas", status ?? "all"],
    queryFn: async (): Promise<VendaRow[]> => {
      let q = db.from("carboze_orders").select("*").order("created_at", { ascending: false });
      if (status && status !== "all") {
        if (status === "orcamento") q = q.eq("status", "quote");
        else if (status === "cancelado") q = q.eq("status", "cancelled");
        else q = q.not("status", "in", "(quote,cancelled)");
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(toVenda);
    },
  });
}

/** Uma venda específica (carboze_orders). */
export function useVenda(id: string | null) {
  return useQuery({
    queryKey: ["crm_venda", id],
    enabled: !!id,
    queryFn: async (): Promise<VendaRow | null> => {
      const { data, error } = await db.from("carboze_orders").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? toVenda(data) : null;
    },
  });
}

/** Atualiza o status (converter orçamento → pedido, cancelar…). */
export function useUpdateVendaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: VendaStatus }) => {
      const { error } = await db.from("carboze_orders").update({ status: toCarbozeStatus(status) }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_vendas"] }),
  });
}

/** Edita campos da venda (tela "Editar Pedido") — mapeia p/ colunas de carboze_orders. */
export function useUpdateVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateVendaInput) => {
      const upd: Record<string, unknown> = {};
      // Se veio o status carboze cru (EditPedido: extra.status_detalhado), grava ele
      // direto (7 estados, sem rebaixar). Senão, mapeia o 3-estados → carboze.
      const detalhado = (patch.extra as Record<string, unknown> | null | undefined)?.status_detalhado as string | undefined;
      if (detalhado) upd.status = detalhado;
      else if (patch.status !== undefined) upd.status = toCarbozeStatus(patch.status);
      if (patch.vendedor_id !== undefined) upd.vendedor_id = patch.vendedor_id;
      if (patch.customer_name !== undefined) upd.customer_name = patch.customer_name;
      if (patch.customer_email !== undefined) upd.customer_email = patch.customer_email;
      if (patch.customer_phone !== undefined) upd.customer_phone = patch.customer_phone;
      if (patch.customer_ie !== undefined) upd.customer_ie = patch.customer_ie;
      if (patch.payment_terms !== undefined) upd.payment_terms = patch.payment_terms;
      if (patch.freight_type !== undefined) upd.freight_type = patch.freight_type;
      if (patch.notes !== undefined) upd.notes = patch.notes;
      if (patch.sale_date !== undefined) upd.sale_date = patch.sale_date;
      if (patch.endereco_faturamento !== undefined) upd.billing_address = patch.endereco_faturamento;
      if (patch.endereco !== undefined && patch.endereco) {
        const e = patch.endereco as Record<string, string>;
        upd.delivery_address = [e.logradouro, e.numero].filter(Boolean).join(", ") + (e.bairro ? ` - ${e.bairro}` : "");
        upd.delivery_city = e.cidade ?? null;
        upd.delivery_state = e.uf ?? e.estado ?? null;
        upd.delivery_zip = e.cep ?? null;
      }
      const { error } = await db.from("carboze_orders").update(upd).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["crm_vendas"] });
      qc.invalidateQueries({ queryKey: ["crm_venda", vars.id] });
    },
  });
}

export interface VendedorDir {
  id: string; full_name: string | null; avatar_url: string | null;
  department: string | null; secondary_department: string | null; is_vendedor: boolean;
}

/** Diretório de vendedores (RPC crm_list_vendedores) — profiles, não toca vendas. */
export function useVendedoresDir() {
  return useQuery({
    queryKey: ["crm_list_vendedores"],
    queryFn: async (): Promise<VendedorDir[]> => {
      const { data, error } = await db.rpc("crm_list_vendedores");
      if (error) throw error;
      return (data ?? []) as VendedorDir[];
    },
  });
}

/** Mapa id→nome dos vendedores (mesmo diretório). */
export function useVendedorNomes() {
  return useQuery({
    queryKey: ["crm_vendedor_nomes"],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await db.rpc("crm_list_vendedores");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of (data ?? []) as VendedorDir[]) map[p.id] = p.full_name || "—";
      return map;
    },
  });
}

/** Cria a venda em carboze_orders (V-AAAA-MM-XXXX pelo trigger + vendedor logado).
 *  Orçamento persiste como status 'quote'; pedido como 'pending'. */
export function useCreateVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovaVendaInput): Promise<{ id: string; numero: string | null }> => {
      const e = (input.endereco ?? {}) as Record<string, string>;
      const deliveryAddr = ([e.logradouro, e.numero].filter(Boolean).join(", ") + (e.bairro ? ` - ${e.bairro}` : "")).trim();
      const items = (input.itens ?? [])
        .filter((i) => i.produto && i.quantidade > 0)
        .map((i) => ({
          name: i.produto, quantity: i.quantidade, unit_price: i.preco_unitario,
          bonificacao: i.bonificacao ?? 0, total: i.quantidade * i.preco_unitario,
          // Vínculo com o catálogo (mrp_products) → habilita checagem de estoque
          // no pós-venda e casamento de produto no Bling.
          product_id: i.product_id ?? null, product_code: i.product_code ?? null,
        }));
      const { data: u } = await supabase.auth.getUser();
      // Vendedor: usa o override (gestor pode lançar por outro); senão o logado.
      const vendedorId = input.vendedor_id || u?.user?.id || null;
      let vendedorName: string | null = input.vendedor_name || null;
      if (!vendedorName && vendedorId) {
        const { data: prof } = await db.from("profiles").select("full_name").eq("id", vendedorId).maybeSingle();
        vendedorName = (prof as { full_name?: string } | null)?.full_name ?? null;
      }
      const { data: result, error } = await db
        .from("carboze_orders")
        .insert({
          order_number: "", // trigger gera V-AAAA-MM-XXXX
          status: input.status === "orcamento" ? "quote" : "pending",
          customer_name: input.customer_name || "",
          customer_email: input.customer_email || null,
          customer_phone: input.customer_phone || null,
          cnpj: input.customer_doc || null,
          customer_ie: input.customer_ie || null,
          delivery_address: deliveryAddr || null,
          delivery_city: e.cidade || null,
          delivery_state: e.uf || e.estado || null,
          delivery_zip: e.cep || null,
          billing_address: input.endereco_faturamento ?? null,
          payment_terms: input.payment_terms || null,
          freight_type: input.freight_type || null,
          items, subtotal: input.subtotal_bruto ?? input.total, shipping_cost: 0,
          discount: input.desconto_valor ?? 0, total: input.total,
          // Intenção do desconto; o trigger define o status/alçada de forma autoritativa.
          discount_type: input.desconto_tipo ?? "none",
          discount_percent: input.desconto_percent ?? 0,
          discount_reason: input.desconto_motivo ?? null,
          discount_requested_by: vendedorId,
          agreed_delivery_date: input.agreed_delivery_date ?? null,
          notes: input.notes || null, internal_notes: input.internal_notes || null,
          vendedor_id: vendedorId, vendedor_name: vendedorName,
        })
        .select("id, order_number")
        .single();
      if (error) throw error;
      return { id: result.id, numero: result.order_number ?? null };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_vendas"] }),
  });
}
