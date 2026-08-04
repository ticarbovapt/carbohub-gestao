// Análise por Canal do Dashboard Comercial (elementos 12–14 do controle),
// recriado sem legado. Lê carboze_orders (segmento) e agrega no cliente.
// Fonte de verdade única = carboze_orders. Canal vem da coluna `segmento`.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const db = supabase as unknown as { from: (t: string) => any };

export type CanalKey = "consumo" | "revenda" | "online";

interface OrderRow {
  total: number | null;
  status: string | null;
  created_at: string | null;
  sale_date: string | null;
  customer_name: string | null;
  cnpj: string | null;
  segmento: string | null;
  vendedor_id: string | null;
  excluir_metricas: boolean | null;
  conta_metrica: boolean | null;
}

interface PdvSerieRow {
  mes: string;          // 'YYYY-MM-01'
  base: number;         // PDVs abertos até o mês
  novos: number;        // abriram no mês
  ativos: number;       // compraram no mês
}

/** Identidade do cliente = DOCUMENTO, nunca o nome.
 *  Contar por nome inflava a base: "Emmily Pereira da Silva Moreira" e
 *  "Emmily Moreira" são o mesmo CPF e contavam como duas clientes. Sem
 *  documento cai no nome, que é o melhor disponível. */
const chaveCliente = (o: OrderRow) => {
  const doc = (o.cnpj ?? "").replace(/\D/g, "");
  if (doc.length === 11 || doc.length === 14) return doc;
  return "nome:" + (o.customer_name ?? "").trim().toLowerCase();
};

/** Mês da venda: sale_date quando existe, senão created_at. Mesma regra de
 *  `data_efetiva` da carbo_vendas_metrica — o gráfico usava só created_at e
 *  jogava a venda no mês em que o pedido foi digitado, não no da venda. */
const mesDaVenda = (o: OrderRow) => (o.sale_date ?? o.created_at ?? "").slice(0, 7);

export interface CanaisFilters { vendedorId?: string | null; from?: string; to?: string }

// Ativo = não cancelado (unifica os dois vocabulários; corrige o bug do legado
// que só olhava 'cancelled').
const isActive = (s: string | null) => s !== "cancelled" && s !== "cancelado";
const mesLbl = (y: number, m: number) => format(new Date(y, m - 1, 1), "MMM/yy", { locale: ptBR });

export interface SegmentoBucket { qtd: number; brl: number }
export interface Segmentacao {
  consumo: SegmentoBucket; revenda: SegmentoBucket; online: SegmentoBucket; naoClassificado: SegmentoBucket;
  totalBRL: number;
  pct: (v: number) => number;
}

export interface ClientesRow {
  mes: string;
  consumo_ativos: number; consumo_novos: number; consumo_acum: number;
  revenda_ativos: number; revenda_novos: number; revenda_acum: number;
  online_ativos: number;  online_novos: number;  online_acum: number;
}

export interface ComercialCanaisData {
  segmentacao: Segmentacao;
  clientes: ClientesRow[];
  // real[canal][mes 1..12] do ano corrente (para cruzar com metas no componente).
  realByCanal: Record<CanalKey, number[]>;
  year: number;
}

export function useComercialCanais(filters: CanaisFilters = {}) {
  const { vendedorId, from, to } = filters;
  return useQuery({
    queryKey: ["comercial-canais", vendedorId ?? "all", from ?? "", to ?? ""],
    queryFn: async (): Promise<ComercialCanaisData> => {
      const year = new Date().getFullYear();
      const { data, error } = await db
        .from("carbo_vendas_metrica")
        .select("total, status, created_at, sale_date, customer_name, cnpj, segmento, vendedor_id, excluir_metricas, conta_metrica")
        .order("created_at", { ascending: true });
      if (error) throw error;

      // A linha PDV do gráfico NÃO sai de pedido: sai da tabela `pdvs`, com a
      // data de abertura real. Contar "cliente com pedido revenda" dava 110
      // onde existem 73 pontos — o backfill de canal etiqueta revendedor que
      // nunca foi cadastrado como PDV.
      const { data: pdvSerie, error: errPdv } = await db
        .from("carbo_pdvs_serie_mensal")
        .select("mes, base, novos, ativos")
        .order("mes", { ascending: true });
      if (errPdv) throw errPdv;
      const porMesPdv = new Map<string, PdvSerieRow>();
      for (const r of (pdvSerie ?? []) as PdvSerieRow[]) {
        porMesPdv.set(String(r.mes).slice(0, 7), r);
      }
      const fromTs = from ? new Date(from + "T00:00:00").getTime() : null;
      const toTs = to ? new Date(to + "T23:59:59").getTime() : null;
      const orders = ((data ?? []) as OrderRow[]).filter((o) => {
        // Mesma regra dos KPIs do topo. Antes esta aba contava ORÇAMENTO como
        // venda enquanto os KPIs da MESMA tela excluíam — o total e a soma dos
        // canais não fechavam.
        if (o.conta_metrica !== true) return false;
        if (vendedorId && o.vendedor_id !== vendedorId) return false;
        if (fromTs || toTs) {
          // Mesma data que decide o mês nos gráficos — filtrar por created_at
          // e agrupar por mesDaVenda faria a venda faturada no mês seguinte
          // entrar no filtro de um mês e no gráfico de outro.
          const t = new Date(mesDaVenda(o) ? (o.sale_date ?? o.created_at ?? "").slice(0, 10) + "T12:00:00" : "").getTime();
          if (fromTs && t < fromTs) return false;
          if (toTs && t > toTs) return false;
        }
        return true;
      });
      const active = orders.filter((o) => isActive(o.status));

      // ── 12) Segmentação (Consumo/Revenda/Online/Não classificado) ──
      const seg = {
        consumo: { qtd: 0, brl: 0 }, revenda: { qtd: 0, brl: 0 },
        online: { qtd: 0, brl: 0 }, naoClassificado: { qtd: 0, brl: 0 },
      };
      for (const o of active) {
        const b = o.segmento === "consumo" ? seg.consumo
          : o.segmento === "revenda" ? seg.revenda
          : o.segmento === "online" ? seg.online
          : seg.naoClassificado;
        b.qtd++; b.brl += Number(o.total ?? 0);
      }
      const totalBRL = seg.consumo.brl + seg.revenda.brl + seg.online.brl + seg.naoClassificado.brl;
      const segmentacao: Segmentacao = { ...seg, totalBRL, pct: (v) => (totalBRL > 0 ? (v / totalBRL) * 100 : 0) };

      // ── 14) real por canal (ano corrente, índice = mês 1..12) ──
      const realByCanal: Record<CanalKey, number[]> = {
        consumo: Array(13).fill(0), revenda: Array(13).fill(0), online: Array(13).fill(0),
      };
      for (const o of active) {
        const ym = mesDaVenda(o);
        if (!ym) continue;
        const [y, m] = ym.split("-").map(Number);
        if (y !== year || !m) continue;
        if (o.segmento === "consumo" || o.segmento === "revenda" || o.segmento === "online") {
          realByCanal[o.segmento][m] += Number(o.total ?? 0);
        }
      }

      // ── 13) Clientes por canal (ativos/novos/acumulado), últimos 12 meses ──
      //
      // Consumo e On-line saem do pedido, agregados por DOCUMENTO. Revenda
      // NÃO: sai da view carbo_pdvs_serie_mensal, porque a pergunta ali é
      // "quantos pontos de venda temos", e ponto de venda é uma coisa que se
      // cadastra — não se deduz de um pedido etiquetado.
      const channels: CanalKey[] = ["consumo", "online"];
      const activeSet: Record<string, Record<string, Set<string>>> = { consumo: {}, online: {} };
      const firstMonth: Record<string, Record<string, string>> = { consumo: {}, online: {} };
      for (const o of active) {
        const ch = o.segmento as CanalKey;
        if (!o.segmento || !channels.includes(ch)) continue;
        const key = mesDaVenda(o);
        if (!key) continue;
        const id = chaveCliente(o);
        if (id === "nome:") continue;
        (activeSet[ch][key] ??= new Set()).add(id);
        const fm = firstMonth[ch][id];
        if (!fm || key < fm) firstMonth[ch][id] = key;
      }
      const novos: Record<string, Record<string, number>> = { consumo: {}, online: {} };
      for (const ch of channels) for (const fm of Object.values(firstMonth[ch])) novos[ch][fm] = (novos[ch][fm] ?? 0) + 1;

      // Os meses vêm da união dos dois lados: um mês em que só houve abertura
      // de PDV (sem venda nenhuma) tem de aparecer no gráfico do mesmo jeito.
      const allKeys = Array.from(new Set([
        ...channels.flatMap((ch) => Object.keys(activeSet[ch])),
        ...porMesPdv.keys(),
      ])).sort();
      const cumul: Record<string, number> = { consumo: 0, online: 0 };
      const clientes: ClientesRow[] = allKeys.map((key) => {
        const [y, m] = key.split("-").map(Number);
        const row: any = { mes: mesLbl(y, m) };
        for (const ch of channels) {
          cumul[ch] += novos[ch][key] ?? 0;
          row[`${ch}_ativos`] = activeSet[ch][key]?.size ?? 0;
          row[`${ch}_novos`] = novos[ch][key] ?? 0;
          row[`${ch}_acum`] = cumul[ch];
        }
        // `base` já é acumulado no banco — não somar aqui.
        const p = porMesPdv.get(key);
        row.revenda_ativos = p?.ativos ?? 0;
        row.revenda_novos = p?.novos ?? 0;
        row.revenda_acum = p?.base ?? 0;
        return row as ClientesRow;
      }).slice(-12);

      return { segmentacao, clientes, realByCanal, year };
    },
  });
}
