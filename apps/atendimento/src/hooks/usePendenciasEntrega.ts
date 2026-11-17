import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Pós-venda (`/pos-venda`, ex-Pendências de entrega). Desde 17/11/2026 a tela
// lê `carbo_posvenda(de, ate)` (20261172): TODO pedido do período — entregue e
// cancelado inclusive —, menos o ML Full. Quem decide o que é problema continua
// sendo o banco (a MESMA régua da `carbo_entrega_pendencias`, 20261154); a tela
// só filtra, conta e desenha. O trato (`carbo_entrega_trato`) é anotação de
// quem atende — não move card da esteira.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

export type Problema =
  | "transportadora" | "vencida" | "cancelada" | "nao_postado"
  | "atrasado" | "sem_etiqueta" | "sem_nf";

export type SituacaoTrato =
  | "aberto" | "em_contato" | "reenviado" | "reembolsado" | "resolvido" | "sem_solucao";

/** Na ordem da gravidade — é a ordem das pílulas. */
export const PROBLEMAS: { id: Problema; rotulo: string; cor: string }[] = [
  { id: "transportadora", rotulo: "Problema na transportadora", cor: "#dc2626" },
  { id: "vencida",        rotulo: "Etiqueta vencida",           cor: "#ea580c" },
  { id: "cancelada",      rotulo: "Etiqueta cancelada",         cor: "#d97706" },
  { id: "nao_postado",    rotulo: "Nunca postado",              cor: "#ca8a04" },
  { id: "atrasado",       rotulo: "Atrasado na entrega",        cor: "#7c3aed" },
  { id: "sem_etiqueta",   rotulo: "Sem etiqueta",               cor: "#2563eb" },
  { id: "sem_nf",         rotulo: "Sem NF",                     cor: "#0891b2" },
];
export const ROTULO_PROBLEMA = Object.fromEntries(PROBLEMAS.map((p) => [p.id, p.rotulo])) as Record<Problema, string>;
export const COR_PROBLEMA = Object.fromEntries(PROBLEMAS.map((p) => [p.id, p.cor])) as Record<Problema, string>;

export const SITUACOES: { id: SituacaoTrato; rotulo: string; final: boolean }[] = [
  { id: "aberto",      rotulo: "Em aberto",               final: false },
  { id: "em_contato",  rotulo: "Em contato com o cliente", final: false },
  { id: "reenviado",   rotulo: "Reenviado",               final: false },
  { id: "reembolsado", rotulo: "Reembolsado",             final: true },
  { id: "resolvido",   rotulo: "Resolvido",               final: true },
  { id: "sem_solucao", rotulo: "Sem solução",             final: true },
];
export const ROTULO_SITUACAO = Object.fromEntries(SITUACOES.map((s) => [s.id, s.rotulo])) as Record<SituacaoTrato, string>;
export const ehFinal = (s: SituacaoTrato | null | undefined) => !!s && SITUACOES.some((x) => x.id === s && x.final);

export const ETAPA_ROTULO: Record<string, string> = {
  confirmado: "Confirmado", nf_emitida: "NF emitida", etiqueta: "Etiqueta", em_transito: "Em trânsito",
  entregue: "Entregue", cancelado: "Cancelado",
};

export interface Trato {
  situacao: SituacaoTrato;
  observacao: string | null;
  em: string;
  por: string | null;
}

export interface Pendencia {
  bling_id: number;
  pedido_numero: string | null;
  pedido_loja: string | null;
  pedido_codigo: string | null;
  canal: string | null;
  data_pedido: string;
  total: number | null;
  cliente: string | null;
  cliente_fone: string | null;
  cidade: string | null;
  uf: string | null;
  etapa: string;
  /** Nulo = sem problema (inclusive entregue e cancelado). */
  problema: Problema | null;
  desde: string | null;
  previsao: string | null;
  entregue_em?: string | null;
  rastreio_status: string | null;
  transportadora: string | null;
  rastreio: string | null;
  url_rastreio: string | null;
  nf_numero: string | null;
  antes_do_corte: boolean;
  trato: Trato | null;
}

export interface PosVenda {
  gerado_em: string;
  corte: string;
  de: string;
  ate: string;
  /** Dia do pedido mais antigo (o limite do "‹"). */
  primeiro: string | null;
  /** Problemas sem trato final, no histórico todo — o selo das abas. */
  abertos: { antes: number; novos: number };
  /** Onde estão os problemas em aberto: o domingo da semana. */
  semanas: { semana: string; antes: boolean; n: number }[];
  itens: Pendencia[];
}

export type ErroPendencias = { tipo: "sem_funcao" | "sem_permissao" | "outro"; mensagem: string };

export function lerErro(e: any): ErroPendencias {
  const code = e?.code ?? "";
  const msg = String(e?.message ?? e ?? "Erro desconhecido");
  if (code === "PGRST202" || code === "42883") return { tipo: "sem_funcao", mensagem: msg };
  if (code === "42501") return { tipo: "sem_permissao", mensagem: msg };
  return { tipo: "outro", mensagem: msg };
}

/** A página da tela: um período (semana, mês ou intervalo). Nulo = nada a ler. */
export function usePosVenda(periodo: { de: string; ate: string } | null) {
  return useQuery({
    queryKey: ["posvenda", periodo?.de ?? null, periodo?.ate ?? null],
    enabled: !!periodo,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    // Trocar de semana não esvazia a tela: a anterior fica até a nova chegar.
    placeholderData: (anterior) => anterior,
    retry: (n, e: any) => n < 1 && lerErro(e).tipo === "outro",
    queryFn: async (): Promise<PosVenda> => {
      const { data, error } = await db.rpc("carbo_posvenda", { p_de: periodo!.de, p_ate: periodo!.ate });
      if (error) throw error;
      return data as PosVenda;
    },
  });
}

export interface HistTrato { id: number; situacao: SituacaoTrato; observacao: string | null; em: string; por: string | null }

export function useHistoricoTrato(blingId: number | null) {
  return useQuery({
    queryKey: ["entrega_trato_hist", blingId],
    enabled: blingId != null,
    queryFn: async (): Promise<HistTrato[]> => {
      // Janela DECLARADA: o histórico de UM pedido.
      const { data, error } = await db.from("carbo_entrega_trato_hist")
        .select("id, situacao, observacao, em, por")
        .eq("bling_id", blingId).order("em", { ascending: false }).order("id", { ascending: false })
        .limit(50);
      if (error) throw error;
      const linhas = (data ?? []) as Array<Omit<HistTrato, "por"> & { por: string | null }>;
      const ids = [...new Set(linhas.map((l) => l.por).filter(Boolean))] as string[];
      const nomes = new Map<string, string>();
      if (ids.length) {
        const { data: ps } = await db.from("profiles").select("id, full_name").in("id", ids);
        for (const p of (ps ?? []) as { id: string; full_name: string | null }[]) {
          if (p.full_name) nomes.set(p.id, p.full_name);
        }
      }
      return linhas.map((l) => ({ ...l, por: l.por ? nomes.get(l.por) ?? null : null }));
    },
  });
}

export function useSalvarTrato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { bling_id: number; situacao: SituacaoTrato; observacao: string | null }) => {
      const { error } = await db.from("carbo_entrega_trato")
        .upsert({ bling_id: v.bling_id, situacao: v.situacao, observacao: v.observacao }, { onConflict: "bling_id" });
      if (error) throw error;
    },
    // Muda a lista NO CLIQUE; a releitura vem depois, em segundo plano.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["posvenda"] });
      const antes = qc.getQueriesData<PosVenda>({ queryKey: ["posvenda"] });
      qc.setQueriesData<PosVenda>({ queryKey: ["posvenda"] }, (d) => d && ({
        ...d,
        itens: d.itens.map((i) => i.bling_id !== v.bling_id ? i : {
          ...i,
          trato: { situacao: v.situacao, observacao: v.observacao, em: new Date().toISOString(), por: i.trato?.por ?? null },
        }),
      }));
      return { antes };
    },
    onError: (_e, _v, ctx) => { for (const [k, d] of ctx?.antes ?? []) qc.setQueryData(k, d); },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ["posvenda"] });
      qc.invalidateQueries({ queryKey: ["entrega_trato_hist", v.bling_id] });
    },
  });
}
