import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerSemTeto } from "@carbo/shell";

// ─────────────────────────────────────────────────────────────────────────────
// Resultados do Pré-Vendas — o que aconteceu com cada lead repassado.
//
// Quem recorta é o BANCO (`carbo_prevendas_repasses`, migração 20261050):
// gestor vê todos, SDR os que repassou, closer os que pegou. Ler
// `crm_sales_leads` direto contaria, para o SDR, os repasses dos OUTROS que
// ainda estão na fila aberta (a RLS mostra a fila a todo mundo), e não traria
// nem o nome do closer nem o valor vendido.
//
// ⚠️ O período é a DATA DO REPASSE (coorte): "dos que repassei em outubro,
// quantos fecharam" — mesmo que tenham fechado em novembro. É o que mantém a
// conversão entre 0 e 100%.
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface Repasse {
  lead_id: string;
  origem_id: string | null;
  cliente: string;
  repassado_em: string;
  sdr_id: string | null;
  sdr_nome: string | null;
  closer_id: string | null;
  closer_nome: string | null;
  etapa: string;
  ganho_em: string | null;
  perdido_em: string | null;
  motivo_perda: string | null;
  valor_vendido: number;
  pedidos: number;
}

/** O recorte: as duas pontas em `AAAA-MM-DD`, inclusivas (calendário local).
 *  Vem do seletor de período da tela (`PeriodoFiltro`). */
export interface Recorte { de: string; ate: string }

export function useRepasses({ de, ate }: Recorte, userId?: string) {
  return useQuery({
    queryKey: ["prevendas-repasses", de, ate, userId],
    enabled: !!userId,
    queryFn: async (): Promise<Repasse[]> => {
      const { data, error } = await db.rpc("carbo_prevendas_repasses", { p_de: de, p_ate: ate });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ ...r, valor_vendido: Number(r.valor_vendido ?? 0) }));
    },
  });
}

/** O trabalho ANTES do repasse: os cards do SDR (f14) criados no período. */
export interface LeadSdr {
  id: string;
  stage: string;
  created_by: string | null;
  assigned_to: string | null;
}

export function useLeadsSdr({ de, ate }: Recorte, userId?: string) {
  return useQuery({
    queryKey: ["prevendas-leads-sdr", de, ate, userId],
    enabled: !!userId,
    queryFn: async (): Promise<LeadSdr[]> => {
      // Limites em Brasília: "criado em outubro" é outubro aqui, não em UTC.
      // É CONTADO na tela: paginado, para o teto de 1.000 não encolher o mês.
      return await lerSemTeto<LeadSdr>(() => db
        .from("crm_sales_leads")
        .select("id, stage, created_by, assigned_to")
        .eq("funnel_type", "f14")
        .gte("created_at", `${de}T00:00:00-03:00`)
        .lte("created_at", `${ate}T23:59:59.999-03:00`)
        .order("id"));
    },
  });
}
