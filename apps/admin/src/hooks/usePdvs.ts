import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Pontos de Venda (PDVs) — cadastro + movimento.
//
// Lê da view carbo_pdvs_painel, que já traz o agregado de compras junto do
// cadastro. Escreve direto em public.pdvs.
//
// ⚠️ Este arquivo é IDÊNTICO no admin e no crm. Se mexer em um, copie no
// outro — foi a duplicação sem sincronia que fez o /vender divergir em 3
// versões diferentes.
//
// "Desativar" aqui é status, nunca DELETE: o PDV tem histórico de pedidos
// atrelado por CNPJ e some do cadastro não apaga o passado.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

// "registered" = cadastrado, ainda não vendeu. Fica FORA da contagem de
// ativos de propósito: é esse número que a diretoria olha como pontos
// operando, e somar ponto que nunca vendeu infla a régua.
export type PdvStatus = "active" | "suspended" | "inactive" | "registered";

export const PDV_STATUS_LABEL: Record<PdvStatus, string> = {
  active: "Ativo",
  suspended: "Pausado",
  inactive: "Inativo",
  registered: "Cadastrado",
};

export const PDV_STATUS_VARIANT: Record<PdvStatus, "success" | "warning" | "secondary" | "outline"> = {
  active: "success",
  suspended: "warning",
  inactive: "secondary",
  registered: "outline",
};

export type PdvProduto = "10ml" | "100ml" | "1l";

export const PDV_PRODUTO_LABEL: Record<PdvProduto, string> = {
  "10ml": "Carbozé 10ml (sachê)",
  "100ml": "Carbozé 100ml",
  "1l": "Carbozé 1L",
};

/** Três estados, não booleano: "não vende" e "ninguém checou" são coisas
 *  diferentes, e é a segunda que diz onde falta trabalho de campo. */
export type PdvOferece = "sim" | "nao" | "a_confirmar";

export const PDV_OFERECE_LABEL: Record<PdvOferece, string> = {
  sim: "Vende",
  nao: "Não vende",
  a_confirmar: "A confirmar",
};

export interface PdvMixItem {
  oferece: PdvOferece;
  /** Preço ao consumidor final. Nulo com oferece="sim" é normal: vende, mas
   *  o preço não foi registrado — nunca exibir como R$ 0,00. */
  preco: number | null;
}

export interface PdvRow {
  id: string;
  pdv_code: string;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  cnpj_digits: string;
  address_city: string | null;
  address_state: string | null;
  address_street: string | null;
  address_zip: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  email: string | null;
  status: PdvStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  opened_at: string | null;
  owner_seller_id: string | null;
  owner_seller_name: string | null;
  mix: Partial<Record<PdvProduto, PdvMixItem>>;
  pedidos: number;
  total_comprado: number;
  ultima_compra: string | null;
  primeira_compra: string | null;
  sem_documento: boolean;
}

export function usePdvs() {
  return useQuery({
    queryKey: ["pdvs", "painel"],
    queryFn: async (): Promise<PdvRow[]> => {
      const { data, error } = await db
        .from("carbo_pdvs_painel")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as PdvRow[]).map((p) => ({
        ...p,
        pedidos: Number(p.pedidos) || 0,
        total_comprado: Number(p.total_comprado) || 0,
        // A view devolve '{}' quando o PDV não tem mix; o ?? cobre o caso de
        // a coluna vir nula por uma view antiga ainda em cache.
        mix: p.mix ?? {},
      }));
    },
  });
}

export interface PdvInput {
  name: string;
  legal_name?: string | null;
  cnpj?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_street?: string | null;
  address_zip?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  email?: string | null;
  status?: PdvStatus;
  notes?: string | null;
  opened_at?: string | null;
  owner_seller_id?: string | null;
}

/** Guarda o CNPJ só com dígitos — é assim que o trigger de canal compara. */
const soDigitos = (v?: string | null) => {
  const d = (v ?? "").replace(/\D/g, "");
  return d ? d : null;
};

function limpar(input: PdvInput) {
  const t = (v?: string | null) => {
    const s = (v ?? "").trim();
    return s ? s : null;
  };
  return {
    name: input.name.trim(),
    legal_name: t(input.legal_name),
    cnpj: soDigitos(input.cnpj),
    address_city: t(input.address_city),
    address_state: t(input.address_state)?.toUpperCase() ?? null,
    address_street: t(input.address_street),
    address_zip: soDigitos(input.address_zip),
    contact_name: t(input.contact_name),
    contact_phone: t(input.contact_phone),
    email: t(input.email),
    notes: t(input.notes),
    opened_at: t(input.opened_at),
    owner_seller_id: t(input.owner_seller_id),
  };
}

export function useCreatePdv() {
  const qc = useQueryClient();
  return useMutation({
    // Devolve o id: o mix de produto mora em outra tabela e só pode ser
    // gravado depois que o PDV existe. Sem o id de volta, o mix do PDV recém
    // criado se perderia — a tela salvaria "com sucesso" e o mix sumiria.
    mutationFn: async (input: PdvInput): Promise<string> => {
      const { data, error } = await db
        .from("pdvs")
        .insert({
          ...limpar(input),
          status: input.status ?? "active",
          // pdv_code é gerado por trigger quando vem nulo.
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdvs"] });
      toast.success("PDV cadastrado!");
    },
    onError: (e: { message?: string }) => {
      // O CNPJ tem índice único; sem traduzir, o vendedor vê texto do Postgres.
      const msg = e?.message ?? "";
      toast.error(
        /uq_pdvs_cnpj|duplicate key/i.test(msg)
          ? "Já existe um PDV com este CNPJ."
          : "Erro ao cadastrar: " + (msg || "tente de novo"),
      );
    },
  });
}

export function useUpdatePdv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: PdvInput & { id: string }) => {
      const { data, error } = await db
        .from("pdvs")
        .update({ ...limpar(input), ...(input.status ? { status: input.status } : {}), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      // Zero linhas = RLS barrou. Sem isto a tela diria "salvo" com o banco intacto.
      if (!data || data.length === 0) throw new Error("Sem permissão para editar este PDV.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdvs"] });
      toast.success("PDV atualizado!");
    },
    onError: (e: { message?: string }) => {
      const msg = e?.message ?? "";
      toast.error(
        /uq_pdvs_cnpj|duplicate key/i.test(msg)
          ? "Já existe outro PDV com este CNPJ."
          : "Erro ao salvar: " + (msg || "tente de novo"),
      );
    },
  });
}

/** Pausar / reativar / desativar — status, nunca DELETE. */
export function useSetPdvStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PdvStatus }) => {
      const { data, error } = await db
        .from("pdvs")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Sem permissão para alterar este PDV.");
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["pdvs"] });
      toast.success(`PDV ${PDV_STATUS_LABEL[v.status].toLowerCase()}.`);
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}

/** Mix de produto de um PDV. Grava as 3 linhas de uma vez. */
export function useUpsertPdvMix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pdvId,
      mix,
    }: {
      pdvId: string;
      mix: Partial<Record<PdvProduto, PdvMixItem>>;
    }) => {
      const linhas = (Object.keys(mix) as PdvProduto[]).map((produto) => ({
        pdv_id: pdvId,
        produto,
        oferece: mix[produto]!.oferece,
        // Preço vazio guarda NULO, nunca 0 — zero diria "revende de graça".
        preco_revenda: mix[produto]!.preco ?? null,
        updated_at: new Date().toISOString(),
      }));
      if (linhas.length === 0) return;
      const { data, error } = await db
        .from("pdv_produto_mix")
        .upsert(linhas, { onConflict: "pdv_id,produto" })
        .select("id");
      if (error) throw error;
      // Só gestor escreve nesta tabela; zero linhas = RLS barrou em silêncio.
      if (!data || data.length === 0) throw new Error("Sem permissão para editar o mix deste PDV.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdvs"] });
      toast.success("Mix atualizado!");
    },
    onError: (e: Error) => toast.error("Erro ao salvar mix: " + e.message),
  });
}

/** Vendedores para o seletor de dono da carteira. */
export function usePdvVendedores() {
  return useQuery({
    queryKey: ["pdvs", "vendedores"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("id, full_name")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });
}

/** Pedidos de um PDV — carregado só quando o detalhe abre. */
export function usePdvPedidos(cnpjDigits: string | null) {
  return useQuery({
    queryKey: ["pdvs", "pedidos", cnpjDigits],
    enabled: !!cnpjDigits && cnpjDigits.length >= 11,
    queryFn: async () => {
      // RPC, não filtro no front: o CNPJ do PEDIDO pode ter pontuação e o do
      // PDV é só-dígitos. Um .eq("cnpj", ...) não acharia nada, em silêncio.
      const { data, error } = await db.rpc("carbo_pdv_pedidos", { p_cnpj: cnpjDigits });
      if (error) throw error;
      return (data ?? []) as {
        id: string; order_number: string | null; created_at: string; sale_date: string | null;
        total: number; status: string; segmento: string | null;
        nf_numero: string | null; nf_situacao: string | null;
        vendedor_name: string | null; conta_metrica: boolean;
      }[];
    },
  });
}
