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

export type PdvStatus = "active" | "suspended" | "inactive";

export const PDV_STATUS_LABEL: Record<PdvStatus, string> = {
  active: "Ativo",
  suspended: "Pausado",
  inactive: "Inativo",
};

export const PDV_STATUS_VARIANT: Record<PdvStatus, "success" | "warning" | "secondary"> = {
  active: "success",
  suspended: "warning",
  inactive: "secondary",
};

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
  };
}

export function useCreatePdv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PdvInput) => {
      const { error } = await db.from("pdvs").insert({
        ...limpar(input),
        status: input.status ?? "active",
        // pdv_code é gerado por trigger quando vem nulo.
      });
      if (error) throw error;
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
