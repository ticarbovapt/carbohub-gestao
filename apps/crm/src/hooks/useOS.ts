import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Ordens de Serviço / Descarbonização do Carbo Sales (tabela crm_os).
// Fase inicial: apenas salva/lê a OS. Sem efeitos no resto do sistema.
// A tabela é nova — os tipos gerados ainda não a conhecem, por isso o cliente é
// tratado como `any` aqui (cast pontual e isolado neste hook).
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
};

export type OsTipo = "b2c" | "b2b" | "frota";
export type OsStage =
  | "nova"
  | "qualificacao"
  | "agendamento"
  | "confirmada"
  | "em_execucao"
  | "pos_servico"
  | "concluida";

export interface NovaOSInput {
  tipo: OsTipo;
  cliente_nome?: string;
  cnpj?: string;
  telefone?: string;
  responsavel?: string;
  placa?: string;
  modelo?: string;
  qtd_veiculos?: number | null;
  recorrencia?: string | null;
  data_prevista?: string | null;
  prioridade?: number;
  titulo?: string;
  observacoes?: string;
}

export interface OSRow {
  id: string;
  numero: string | null;
  criado_por: string;
  tipo: OsTipo;
  stage: OsStage;
  cliente_nome: string | null;
  cnpj: string | null;
  telefone: string | null;
  responsavel: string | null;
  placa: string | null;
  modelo: string | null;
  qtd_veiculos: number | null;
  recorrencia: string | null;
  data_prevista: string | null;
  prioridade: number;
  titulo: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

/** Lista de OS (RLS decide o escopo: próprio criador ou tudo p/ gestor). */
export function useOS() {
  return useQuery({
    queryKey: ["crm_os"],
    queryFn: async (): Promise<OSRow[]> => {
      const { data, error } = await db
        .from("crm_os")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OSRow[];
    },
  });
}

/** Cria uma OS de descarbonização (stage inicial 'nova'). */
export function useCreateOS() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovaOSInput) => {
      const { data, error } = await db
        .from("crm_os")
        .insert({ stage: "nova", ...input })
        .select("id, numero")
        .single();
      if (error) throw error;
      return data as { id: string; numero: string | null };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_os"] });
    },
  });
}
