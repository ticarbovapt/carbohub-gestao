/**
 * useNFSeData — Hooks para leitura e análise dos dados importados de NFS-e
 * Tabela: nfse_imports (ABRASF 2.01, emitidas pela CARBO SOLUCOES LTDA)
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NFSeRecord {
  id: string;
  numero: number;
  codigo_verificacao: string | null;
  data_emissao: string | null;
  competencia: string | null;
  item_lista_servico: string | null;
  discriminacao: string | null;
  outras_informacoes: string | null;
  valor_servicos: number | null;
  valor_pis: number | null;
  valor_cofins: number | null;
  valor_inss: number | null;
  valor_ir: number | null;
  valor_csll: number | null;
  outras_retencoes: number | null;
  base_calculo: number | null;
  iss_retido: boolean | null;
  tomador_cpf_cnpj: string | null;
  tomador_tipo: "cpf" | "cnpj" | null;
  tomador_razao_social: string | null;
  tomador_uf: string | null;
  tomador_municipio: string | null;
  tomador_cep: string | null;
  tomador_telefone: string | null;
  pedido_refs: string[] | null;
  veiculo_descricao: string | null;
  qtd_veiculos: number | null;
  filename: string | null;
  batch_id: string | null;
  imported_at: string | null;
}

export interface NFSeFilters {
  from?: string;   // ISO date
  to?: string;     // ISO date
  uf?: string;
  search?: string; // busca em razao_social
}

/** Lista todas as NFS-e com filtros opcionais */
export function useNFSeData(filters: NFSeFilters = {}) {
  return useQuery({
    queryKey: ["nfse-data", filters],
    queryFn: async () => {
      let q = (supabase as any)
        .from("nfse_imports")
        .select("*");

      if (filters.from)   q = q.gte("data_emissao", filters.from);
      if (filters.to)     q = q.lte("data_emissao", filters.to + "T23:59:59");
      if (filters.uf)     q = q.eq("tomador_uf", filters.uf);
      if (filters.search) q = q.ilike("tomador_razao_social", `%${filters.search}%`);

      q = q.order("data_emissao", { ascending: false });

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as NFSeRecord[];
    },
  });
}

/** KPIs agregados — calculados a partir do array retornado por useNFSeData */
export function calcNFSeStats(records: NFSeRecord[]) {
  const total = records.reduce((s, r) => s + (r.valor_servicos ?? 0), 0);
  const count = records.length;
  const ticket = count > 0 ? total / count : 0;

  // Por mês (YYYY-MM)
  const byMonth: Record<string, { count: number; total: number }> = {};
  for (const r of records) {
    const key = r.data_emissao ? r.data_emissao.slice(0, 7) : "N/A";
    if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 };
    byMonth[key].count++;
    byMonth[key].total += r.valor_servicos ?? 0;
  }

  // Por UF
  const byUF: Record<string, { count: number; total: number }> = {};
  for (const r of records) {
    const key = r.tomador_uf ?? "N/A";
    if (!byUF[key]) byUF[key] = { count: 0, total: 0 };
    byUF[key].count++;
    byUF[key].total += r.valor_servicos ?? 0;
  }

  // Top clientes
  const byCliente: Record<string, { count: number; total: number; uf: string }> = {};
  for (const r of records) {
    const key = r.tomador_razao_social ?? r.tomador_cpf_cnpj ?? "N/A";
    if (!byCliente[key]) byCliente[key] = { count: 0, total: 0, uf: r.tomador_uf ?? "" };
    byCliente[key].count++;
    byCliente[key].total += r.valor_servicos ?? 0;
  }

  return { total, count, ticket, byMonth, byUF, byCliente };
}
