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
  customer_name: string | null;
  segmento: string | null;
  excluir_metricas: boolean | null;
}

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

export function useComercialCanais() {
  return useQuery({
    queryKey: ["comercial-canais"],
    queryFn: async (): Promise<ComercialCanaisData> => {
      const year = new Date().getFullYear();
      const { data, error } = await db
        .from("carboze_orders")
        .select("total, status, created_at, customer_name, segmento, excluir_metricas")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const orders = ((data ?? []) as OrderRow[]).filter((o) => o.excluir_metricas !== true);
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
        if (!o.created_at) continue;
        const [y, m] = o.created_at.slice(0, 7).split("-").map(Number);
        if (y !== year || !m) continue;
        if (o.segmento === "consumo" || o.segmento === "revenda" || o.segmento === "online") {
          realByCanal[o.segmento][m] += Number(o.total ?? 0);
        }
      }

      // ── 13) Clientes por canal (ativos/novos/acumulado), últimos 12 meses ──
      const channels: CanalKey[] = ["consumo", "revenda", "online"];
      const activeSet: Record<CanalKey, Record<string, Set<string>>> = { consumo: {}, revenda: {}, online: {} };
      const firstMonth: Record<CanalKey, Record<string, string>> = { consumo: {}, revenda: {}, online: {} };
      for (const o of active) {
        if (!o.created_at || !o.segmento) continue;
        const ch = o.segmento as CanalKey;
        if (!channels.includes(ch)) continue;
        const name = (o.customer_name || "").trim().toLowerCase();
        if (!name) continue;
        const key = o.created_at.slice(0, 7);
        (activeSet[ch][key] ??= new Set()).add(name);
        const fm = firstMonth[ch][name];
        if (!fm || key < fm) firstMonth[ch][name] = key;
      }
      const novos: Record<CanalKey, Record<string, number>> = { consumo: {}, revenda: {}, online: {} };
      for (const ch of channels) for (const fm of Object.values(firstMonth[ch])) novos[ch][fm] = (novos[ch][fm] ?? 0) + 1;
      const allKeys = Array.from(new Set(channels.flatMap((ch) => Object.keys(activeSet[ch])))).sort();
      const cumul: Record<CanalKey, number> = { consumo: 0, revenda: 0, online: 0 };
      const clientes: ClientesRow[] = allKeys.map((key) => {
        const [y, m] = key.split("-").map(Number);
        const row: any = { mes: mesLbl(y, m) };
        for (const ch of channels) {
          cumul[ch] += novos[ch][key] ?? 0;
          row[`${ch}_ativos`] = activeSet[ch][key]?.size ?? 0;
          row[`${ch}_novos`] = novos[ch][key] ?? 0;
          row[`${ch}_acum`] = cumul[ch];
        }
        return row as ClientesRow;
      }).slice(-12);

      return { segmentacao, clientes, realByCanal, year };
    },
  });
}
