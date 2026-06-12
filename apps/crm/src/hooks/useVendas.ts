import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Vendas do Carbo Sales (tabelas crm_vendas / crm_venda_itens).
// Fase inicial: apenas salva/lê a venda. Sem efeitos no resto do sistema.
// As tabelas são novas — os tipos gerados ainda não as conhecem, por isso o
// cliente é tratado como `any` aqui (cast pontual e isolado neste hook).
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type VendaStatus = "orcamento" | "pedido" | "cancelado";
export type VendaTipo = "venda" | "promo";

export interface VendaItemInput {
  produto: string;
  quantidade: number;
  preco_unitario: number;
  bonificacao?: number;
}

export interface NovaVendaInput {
  tipo: VendaTipo;
  status: VendaStatus;
  customer_name?: string;
  customer_doc?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_ie?: string;
  is_licenciado?: boolean;
  endereco?: Record<string, unknown> | null;
  endereco_faturamento?: Record<string, unknown> | null;
  payment_terms?: string;
  freight_type?: string;
  total: number;
  notes?: string;
  itens: VendaItemInput[];
}

export interface VendaItemRow {
  produto: string | null;
  quantidade: number;
  preco_unitario: number;
  bonificacao: number;
}

export interface VendaRow {
  id: string;
  numero: string | null;
  vendedor_id: string;
  tipo: VendaTipo;
  status: VendaStatus;
  customer_name: string | null;
  customer_doc: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_ie: string | null;
  is_licenciado: boolean;
  endereco: Record<string, unknown> | null;
  endereco_faturamento: Record<string, unknown> | null;
  payment_terms: string | null;
  freight_type: string | null;
  total: number;
  notes: string | null;
  sale_date: string | null;
  extra: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  itens?: VendaItemRow[];
}

/** Campos editáveis da venda (tela "Editar Pedido"). Tudo opcional: só os
 *  presentes no objeto são gravados. */
export interface UpdateVendaInput {
  id: string;
  status?: VendaStatus;
  vendedor_id?: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_ie?: string | null;
  is_licenciado?: boolean;
  endereco?: Record<string, unknown> | null;
  endereco_faturamento?: Record<string, unknown> | null;
  payment_terms?: string | null;
  freight_type?: string | null;
  notes?: string | null;
  sale_date?: string | null;
  extra?: Record<string, unknown> | null;
}

/** Lista de vendas (RLS decide o escopo: próprio vendedor ou tudo p/ gestor).
 *  Já traz os itens embutidos (FK crm_venda_itens.venda_id). */
export function useVendas(status?: VendaStatus | "all") {
  return useQuery({
    queryKey: ["crm_vendas", status ?? "all"],
    queryFn: async (): Promise<VendaRow[]> => {
      let q = db
        .from("crm_vendas")
        .select("*, itens:crm_venda_itens(produto, quantidade, preco_unitario, bonificacao)")
        .order("created_at", { ascending: false });
      if (status && status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as VendaRow[];
    },
  });
}

/** Uma venda específica (cabeçalho + itens) — para a tela de detalhes. */
export function useVenda(id: string | null) {
  return useQuery({
    queryKey: ["crm_venda", id],
    enabled: !!id,
    queryFn: async (): Promise<VendaRow | null> => {
      const { data, error } = await db
        .from("crm_vendas")
        .select("*, itens:crm_venda_itens(produto, quantidade, preco_unitario, bonificacao)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as VendaRow | null;
    },
  });
}

/** Atualiza o status de uma venda (ex.: converter orçamento → pedido). */
export function useUpdateVendaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: VendaStatus }) => {
      const { error } = await db.from("crm_vendas").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_vendas"] }),
  });
}

/** Atualiza os campos editáveis de uma venda (tela "Editar Pedido"). */
export function useUpdateVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateVendaInput) => {
      const { error } = await db.from("crm_vendas").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm_vendas"] });
      qc.invalidateQueries({ queryKey: ["crm_venda", vars.id] });
    },
  });
}

/** Vendedor do diretório (RPC crm_list_vendedores). `is_vendedor=false` = avulso
 *  (não entra no quadro de metas), mas ainda pode receber/registrar vendas. */
export interface VendedorDir {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  secondary_department: string | null;
  is_vendedor: boolean;
}

/** Diretório de vendedores via RPC SECURITY DEFINER — contorna a RLS de profiles
 *  (que limitaria ao próprio departamento). Já vem ordenado: com a flag primeiro,
 *  depois os avulsos, por nome. */
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

/** Mapa id→nome dos vendedores — usado para exibir o nome nas listas quando o
 *  gestor vê vendas de vários vendedores. Vem do mesmo diretório (RPC). */
export function useVendedorNomes() {
  return useQuery({
    queryKey: ["crm_vendedor_nomes"],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await db.rpc("crm_list_vendedores");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of (data ?? []) as VendedorDir[]) {
        map[p.id] = p.full_name || "—";
      }
      return map;
    },
  });
}

/** Cria uma venda/orçamento + seus itens. */
export function useCreateVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovaVendaInput) => {
      const { itens, ...header } = input;
      const { data: venda, error } = await db
        .from("crm_vendas")
        .insert(header)
        .select("id, numero")
        .single();
      if (error) throw error;

      const vendaId = (venda as { id: string }).id;
      const rows = itens
        .filter((i) => i.produto && i.quantidade > 0)
        .map((i) => ({
          venda_id: vendaId,
          produto: i.produto,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
          bonificacao: i.bonificacao ?? 0,
          subtotal: i.quantidade * i.preco_unitario,
        }));
      if (rows.length > 0) {
        const { error: itensError } = await db.from("crm_venda_itens").insert(rows);
        if (itensError) throw itensError;
      }
      return { id: vendaId, numero: (venda as { numero: string | null }).numero ?? null };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_vendas"] });
    },
  });
}
