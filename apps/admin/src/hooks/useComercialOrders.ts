// Tela mãe (fonte de dados): as linhas cruas de carboze_orders que alimentam
// TODOS os gráficos do Dashboard Comercial. Mesma base, mesmos filtros.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerTudo } from "@/lib/lerTudo";

const db = supabase as unknown as { from: (t: string) => any };

export interface ComercialFonteFilters { vendedorId?: string | null; from?: string; to?: string; segmento?: string }

export interface ComercialOrderRow {
  id: string;
  order_number: string | null;
  created_at: string | null;
  customer_name: string | null;
  cnpj: string | null;
  vendedor_name: string | null;
  vendedor_id: string | null;
  segmento: string | null;
  status: string | null;
  total: number | null;
  excluir_metricas: boolean | null;
  external_ref: string | null;
  origem_override: string | null;
  // derivados (mesmas regras dos hooks do dashboard):
  contaPedido: boolean;   // status NOT IN (quote, cancelled)
  contaMetrica: boolean;  // A REGRA (view carbo_vendas_metrica.conta_metrica)
  nf_numero: string | null;
  nf_situacao: string | null;
  nf_valida: boolean;
  motivoFora: string | null;
}

export interface ComercialFonteData {
  rows: ComercialOrderRow[];
  totalRows: number;      // total após filtros
  totalPedidos: number;   // que contam como pedido
  totalBRL: number;       // soma dos que contam pedido
  ticketMedio: number;
  excluidos: number;      // pedido válido que NÃO conta (sem NF, NF inválida ou excluído)
}

const isPedido = (s: string | null) => s !== "quote" && s !== "cancelled";

export function useComercialOrders(filters: ComercialFonteFilters = {}) {
  const { vendedorId, from, to, segmento } = filters;
  return useQuery({
    queryKey: ["comercial-fonte", vendedorId ?? "all", from ?? "", to ?? "", segmento ?? "all"],
    queryFn: async (): Promise<ComercialFonteData> => {
      // ⚠️ `lerTudo`, e NÃO `.limit(5000)`. O teto do PostgREST é 1.000 e ele
      // NÃO avisa: não há erro, não há campo "truncado", a resposta parece
      // completa — o `.limit(5000)` era ignorado e o rodapé da tela dizia
      // "197 de 1000 linhas" com 1.229 pedidos na base. Com `ascending: false`
      // o que sobrevive são os 1.000 MAIS RECENTES, então o histórico caía
      // fora em silêncio, do mês mais velho para o mais novo.
      //
      // ⚠️ O desempate (`id`) é obrigatório ao paginar: `created_at` tem
      // dezenas de empates por dia, e sem ordem estável a mesma linha volta em
      // duas páginas e outra não volta em nenhuma — o erro sairia como número
      // LIGEIRAMENTE errado, que é pior que tela vazia, porque ninguém nota.
      const data = await lerTudo<any>((de, ate) =>
        db
          .from("carbo_vendas_metrica")
          .select("id, order_number, created_at, customer_name, cnpj, vendedor_name, vendedor_id, segmento, status, total, excluir_metricas, external_ref, origem_override, bling_nf_id, nf_numero, nf_situacao, nf_valida, conta_metrica, motivo_fora")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(de, ate),
      );

      const fromTs = from ? new Date(from + "T00:00:00").getTime() : null;
      const toTs = to ? new Date(to + "T23:59:59").getTime() : null;

      const rows: ComercialOrderRow[] = ((data ?? []) as any[])
        .filter((o) => {
          if (vendedorId && o.vendedor_id !== vendedorId) return false;
          if (segmento && segmento !== "all") {
            if (segmento === "none" ? o.segmento != null : o.segmento !== segmento) return false;
          }
          if (fromTs || toTs) {
            const t = new Date(o.created_at ?? "").getTime();
            if (fromTs && t < fromTs) return false;
            if (toTs && t > toTs) return false;
          }
          return true;
        })
        .map((o) => {
          const contaPedido = isPedido(o.status);
          return {
            ...o,
            // conta_metrica vem da VIEW — é a fonte única. Recalcular aqui
            // criaria a 15ª definição de "venda que conta".
            nf_numero: o.nf_numero ?? null,
            nf_situacao: o.nf_situacao ?? null,
            nf_valida: o.nf_valida === true,
            motivoFora: o.motivo_fora ?? null,
            total: Number(o.total) || 0,
            contaPedido,
            contaMetrica: o.conta_metrica === true,
          } as ComercialOrderRow;
        });

      // KPIs somam o que CONTA PARA MÉTRICA, não "todo pedido não cancelado".
      // Antes o hook calculava contaMetrica e somava por contaPedido — o card
      // "Excluídos das métricas" era decorativo e o total incluía os excluídos,
      // os sem NF e os com NF inválida.
      const pedidos = rows.filter((r) => r.contaMetrica);
      const totalBRL = pedidos.reduce((s, r) => s + (r.total || 0), 0);
      return {
        rows,
        totalRows: rows.length,
        totalPedidos: pedidos.length,
        totalBRL,
        ticketMedio: pedidos.length ? totalBRL / pedidos.length : 0,
        // `pedidos` já é só quem conta — os de fora saem da lista completa.
        excluidos: rows.filter((r) => r.contaPedido && !r.contaMetrica).length,
      };
    },
  });
}
