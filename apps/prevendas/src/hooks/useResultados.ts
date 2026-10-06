import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

/** Primeiro e último dia do mês, em `AAAA-MM-DD` (calendário local). */
export function limitesDoMes(mes: Date) {
  const a = mes.getFullYear(), m = mes.getMonth() + 1;
  const ultimo = new Date(a, m, 0).getDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return { de: `${a}-${p(m)}-01`, ate: `${a}-${p(m)}-${p(ultimo)}` };
}

export function useRepasses(mes: Date, userId?: string) {
  const { de, ate } = limitesDoMes(mes);
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

/** O trabalho ANTES do repasse: os cards do SDR (f14) criados no mês. */
export interface LeadSdr {
  id: string;
  stage: string;
  created_by: string | null;
  assigned_to: string | null;
}

export function useLeadsSdr(mes: Date, userId?: string) {
  const { de, ate } = limitesDoMes(mes);
  return useQuery({
    queryKey: ["prevendas-leads-sdr", de, ate, userId],
    enabled: !!userId,
    queryFn: async (): Promise<LeadSdr[]> => {
      // Limites em Brasília: "criado em outubro" é outubro aqui, não em UTC.
      const { data, error } = await db
        .from("crm_sales_leads")
        .select("id, stage, created_by, assigned_to")
        .eq("funnel_type", "f14")
        .gte("created_at", `${de}T00:00:00-03:00`)
        .lte("created_at", `${ate}T23:59:59.999-03:00`);
      if (error) throw error;
      return (data ?? []) as LeadSdr[];
    },
  });
}
