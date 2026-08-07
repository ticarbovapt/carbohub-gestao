import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Esteira do e-commerce — espelho puro.
 *
 * Lê `public.bling2_esteira`, que já entrega a etapa calculada. A tela NÃO
 * recalcula etapa: se a regra mudar, muda na view e todas as pontas mudam
 * juntas. Foi assim que "conta como venda" virou regra duplicada em quinze
 * lugares antes.
 *
 * Nenhum card é arrastável, de propósito. Cada etapa tem uma fonte externa que
 * a prova (Bling, NF, etiqueta, plataforma); um card que alguém pudesse mover à
 * mão passaria a mentir no minuto seguinte, quando o sync trouxesse a verdade.
 */

export type EtapaEsteira =
  | "confirmado" | "nf_emitida" | "etiqueta" | "em_transito" | "entregue" | "cancelado";

export interface EsteiraRow {
  bling_id: number;
  pedido_numero: string | null;
  pedido_loja: string | null;
  canal: string | null;
  loja_id: number | null;
  data_pedido: string | null;
  total: number;
  cliente: string | null;
  cliente_doc: string | null;
  cliente_fone: string | null;
  entrega_endereco: string | null;
  entrega_bairro: string | null;
  entrega_cidade: string | null;
  entrega_uf: string | null;
  entrega_cep: string | null;
  nf_numero: string | null;
  nf_chave: string | null;
  nf_situacao: string | null;
  nf_data: string | null;
  nf_pdf: string | null;
  transportadora: string | null;
  servico: string | null;
  rastreio: string | null;
  volumes: number | null;
  peso_kg: number | null;
  items: unknown;
  carboze_order_id: string | null;
  carboze_order_number: string | null;
  etapa: EtapaEsteira;
  tem_status_da_plataforma: boolean;
}

/** As colunas do quadro, na ordem do fluxo. `cancelado` fica fora: não é etapa
 *  da esteira, é saída dela — aparece num contador à parte. */
export const ETAPAS: Array<{ key: EtapaEsteira; label: string; descricao: string; color: string }> = [
  { key: "confirmado",  label: "Confirmado",   descricao: "pedido atendido no Bling",           color: "#9333ea" },
  { key: "nf_emitida",  label: "NF emitida",   descricao: "nota autorizada",                    color: "#14b8a6" },
  { key: "etiqueta",    label: "Etiqueta",     descricao: "rastreio gerado, aguardando coleta", color: "#0ea5e9" },
  { key: "em_transito", label: "Em trânsito",  descricao: "a plataforma confirmou o envio",     color: "#06b6d4" },
  { key: "entregue",    label: "Entregue",     descricao: "a plataforma confirmou a entrega",   color: "#10b981" },
];

export function useEsteiraOnline(dias = 30) {
  return useQuery({
    queryKey: ["esteira-online", dias],
    queryFn: async (): Promise<EsteiraRow[]> => {
      const desde = new Date();
      desde.setDate(desde.getDate() - dias);
      const { data, error } = await (supabase as any)
        .from("bling2_esteira")
        .select("*")
        .gte("data_pedido", desde.toISOString().slice(0, 10))
        .order("data_pedido", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as EsteiraRow[];
    },
    // A esteira anda sozinha (sync :15/:45, ponte :25/:55). Recarregar de 2 em
    // 2 min mantém a tela viva sem transformar um painel em polling agressivo.
    refetchInterval: 120_000,
  });
}
