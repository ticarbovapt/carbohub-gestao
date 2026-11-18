import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Reembolsos de pós-venda (20261175). Quem atende PEDE no Atendimento; aqui o
// Financeiro paga e confirma COM O COMPROVANTE, ou devolve para corrigir. O
// caso volta ao atendente sozinho (é o banco que o move).
//
// A fila vem de `carbo_posvenda_reembolsos_lista` (jsonb, paginada). Escrita só
// pelas funções `carbo_posvenda_reembolso_pagar/_devolver`.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { rpc: (fn: string, args?: any) => any; storage: any };

export type StatusReembolso = "solicitado" | "pago" | "devolvido" | "cancelado";

export interface ReembolsoFin {
  id: string;
  caso_id: string;
  bling_id: number;
  tipo: "parcial" | "integral";
  valor: number;
  forma: "pix" | "estorno" | "transferencia";
  dados: string | null;
  nota: string | null;
  status: StatusReembolso;
  solicitado_em: string;
  solicitado_por: string | null;
  pago_em: string | null;
  valor_pago: number | null;
  comprovante_path: string | null;
  nota_financeiro: string | null;
  pago_por: string | null;
  pago_registrado_em: string | null;
  devolvido_em: string | null;
  motivo_devolucao: string | null;
  devolvido_por: string | null;
  cancelado_em: string | null;
  caso_tipo: string;
  caso_status: "aberto" | "encerrado";
  caso_desfecho: string | null;
  caso_encerrado_em: string | null;
  pedido_codigo: string | null;
  pedido_numero: string | null;
  pedido_loja: string | null;
  canal: string | null;
  data_pedido: string | null;
  total: number | null;
  cliente: string | null;
  cliente_fone: string | null;
  nf_numero: string | null;
}

export interface FilaReembolsos {
  itens: ReembolsoFin[];
  total: number;
  contagem: Partial<Record<StatusReembolso, number>>;
}

// Sem a 20261176 a função não conhece p_id/p_busca (PGRST202): a tela segue
// com a assinatura antiga — a busca não filtra e o reembolso é procurado na fila.
const semParametroNovo = (e: any) => ["PGRST202", "42883"].includes(e?.code ?? "");

async function lerLista(args: Record<string, unknown>): Promise<FilaReembolsos> {
  const { data, error } = await db.rpc("carbo_posvenda_reembolsos_lista", args);
  if (error) throw error;
  return data as FilaReembolsos;
}

export function useReembolsos(status: StatusReembolso | null, pagina: number, porPagina: number, busca = "") {
  return useQuery({
    queryKey: ["posvenda_reembolsos", status, pagina, porPagina, busca],
    placeholderData: (anterior) => anterior,
    refetchInterval: 120_000,
    queryFn: async (): Promise<FilaReembolsos> => {
      const base = { p_status: status, p_limite: porPagina, p_offset: pagina * porPagina };
      if (!busca.trim()) return lerLista(base);
      try { return await lerLista({ ...base, p_busca: busca.trim() }); }
      catch (e) { if (semParametroNovo(e)) return lerLista(base); throw e; }
    },
  });
}

/** UM reembolso, em qualquer situação — o que o `?reembolso=` abre. */
export function useReembolso(id: string | null, inicial: ReembolsoFin | null = null) {
  return useQuery({
    queryKey: ["posvenda_reembolsos", "um", id],
    enabled: !!id,
    initialData: inicial ?? undefined,
    queryFn: async (): Promise<ReembolsoFin | null> => {
      try {
        const r = await lerLista({ p_status: null, p_limite: 1, p_offset: 0, p_id: id });
        return r.itens[0] ?? null;
      } catch (e) {
        if (!semParametroNovo(e)) throw e;
        // Reserva: procura nos 200 mais recentes de todas as situações.
        const r = await lerLista({ p_status: null, p_limite: 200, p_offset: 0 });
        return r.itens.find((x) => x.id === id) ?? null;
      }
    },
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["posvenda_reembolsos"] });
}

/** Sobe o comprovante (bucket privado, pasta do reembolso) e confirma o pagamento. */
export function usePagarReembolso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; valor: number; pagoEm: string; arquivo: File; nota: string | null }) => {
      const limpo = v.arquivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `${v.id}/${Date.now()}-${limpo || "comprovante"}`;
      const up = await db.storage.from("posvenda-comprovantes").upload(path, v.arquivo, {
        contentType: v.arquivo.type || undefined, upsert: false,
      });
      if (up.error) throw up.error;
      const { error } = await db.rpc("carbo_posvenda_reembolso_pagar", {
        p_id: v.id, p_valor: v.valor, p_pago_em: v.pagoEm, p_comprovante: path, p_nota: v.nota,
      });
      if (error) throw error;
    },
    onSettled: () => invalidar(qc),
  });
}

export function useDevolverReembolso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; motivo: string }) => {
      const { error } = await db.rpc("carbo_posvenda_reembolso_devolver", { p_id: v.id, p_motivo: v.motivo });
      if (error) throw error;
    },
    onSettled: () => invalidar(qc),
  });
}

export async function linkDoComprovante(path: string): Promise<string> {
  const { data, error } = await db.storage.from("posvenda-comprovantes").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw error ?? new Error("Não foi possível abrir o comprovante");
  return data.signedUrl as string;
}

export function mensagemDoErro(e: any): string {
  const code = e?.code ?? "";
  if (code === "PGRST202" || code === "42883") return "Os reembolsos ainda não foram instalados no banco.";
  if (code === "42501") return "Só quem tem o Finanças confirma reembolso.";
  return String(e?.message ?? e ?? "Erro desconhecido");
}
