import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Casos do pós-venda (20261173). LEITURA direto das tabelas (RLS: time
// interno); ESCRITA só pelas funções `carbo_posvenda_caso_*` — o histórico não
// pode ser escrito pela API. O roteiro mora em `lib/posvendaCasos.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

export interface Caso {
  id: string;
  bling_id: number;
  tipo: string;
  passo: string;
  status: "aberto" | "encerrado";
  desfecho: string | null;
  valor: number | null;
  aberto_em: string;
  aberto_por: string | null;
  atualizado_em: string;
  encerrado_em: string | null;
  /** Ausentes antes da 20261182. */
  responsavel?: string | null;
  estado?: "em_atendimento" | "aguardando_cliente" | "aguardando_terceiro" | null;
  estado_em?: string | null;
  responsavel_nome?: string | null;
}

export interface HistCaso {
  id: number;
  caso_id: string;
  acao: "abriu" | "respondeu" | "mudou_tipo" | "voltou" | "nota" | "encerrou" | "atribuiu" | "estado";
  tipo: string | null;
  passo: string | null;
  opcao: string | null;
  proximo: string | null;
  desfecho: string | null;
  valor: number | null;
  nota: string | null;
  campos: Record<string, string> | null;
  desfaz: number | null;
  por: string | null;
  em: string;
}

/** O pedido de reembolso ao Financeiro (20261175). */
export interface Reembolso {
  id: string;
  caso_id: string;
  tipo: "parcial" | "integral";
  valor: number;
  forma: "pix" | "estorno" | "transferencia";
  dados: string | null;
  nota: string | null;
  status: "solicitado" | "pago" | "devolvido" | "cancelado";
  passo_aguarda: string;
  passo_depois: string;
  solicitado_por: string | null;
  solicitado_em: string;
  pago_por: string | null;
  pago_em: string | null;
  valor_pago: number | null;
  comprovante_path: string | null;
  nota_financeiro: string | null;
  devolvido_em: string | null;
  motivo_devolucao: string | null;
}

export interface CasosDoPedido { casos: Caso[]; hist: HistCaso[]; reembolsos: Reembolso[] }

export function useCasosDoPedido(blingId: number | null) {
  return useQuery({
    queryKey: ["posvenda_casos", blingId],
    enabled: blingId != null,
    queryFn: async (): Promise<CasosDoPedido> => {
      // Janela DECLARADA: os casos de UM pedido (poucos) e o histórico deles.
      const { data: casos, error } = await db.from("carbo_posvenda_casos")
        // `*`: o caso continua abrindo no intervalo entre o front e a 20261182.
        .select("*")
        .eq("bling_id", blingId).order("aberto_em", { ascending: false }).order("id").limit(50);
      if (error) throw error;
      const lista = (casos ?? []) as Caso[];
      if (!lista.length) return { casos: [], hist: [], reembolsos: [] };
      const ids_casos = lista.map((c) => c.id);
      const [h, rb] = await Promise.all([
        db.from("carbo_posvenda_caso_hist")
          .select("id, caso_id, acao, tipo, passo, opcao, proximo, desfecho, valor, nota, campos, desfaz, por, em")
          .in("caso_id", ids_casos).order("id", { ascending: true }).limit(900),
        db.from("carbo_posvenda_reembolsos")
          .select("id, caso_id, tipo, valor, forma, dados, nota, status, passo_aguarda, passo_depois, solicitado_por, solicitado_em, pago_por, pago_em, valor_pago, comprovante_path, nota_financeiro, devolvido_em, motivo_devolucao")
          .in("caso_id", ids_casos).order("solicitado_em", { ascending: false }).order("id").limit(100),
      ]);
      if (h.error) throw h.error;
      // Sem a migração 20261175 a tabela não existe: o caso continua abrindo.
      const reembolsos = (rb.error ? [] : (rb.data ?? [])) as Reembolso[];
      if (rb.error && !["42P01", "PGRST205"].includes(rb.error.code ?? "")) throw rb.error;
      const linhas = (h.data ?? []) as HistCaso[];
      // "atribuiu" guarda os ids de quem saiu e de quem entrou (20261182).
      const deAtribuir = linhas.filter((l) => l.acao === "atribuiu").flatMap((l) => [l.campos?.de, l.campos?.para]);
      const ids = [...new Set([...linhas.map((l) => l.por), ...deAtribuir, ...lista.map((c) => c.responsavel),
        ...reembolsos.flatMap((r) => [r.solicitado_por, r.pago_por])].filter(Boolean))] as string[];
      const nomes = new Map<string, string>();
      if (ids.length) {
        const { data: ps } = await db.from("profiles").select("id, full_name").in("id", ids);
        for (const p of (ps ?? []) as { id: string; full_name: string | null }[]) {
          if (p.full_name) nomes.set(p.id, p.full_name);
        }
      }
      const nome = (id: string | null) => (id ? nomes.get(id) ?? null : null);
      return {
        casos: lista.map((c) => ({ ...c, responsavel_nome: nome(c.responsavel ?? null) })),
        hist: linhas.map((l) => ({
          ...l, por: nome(l.por),
          campos: l.acao === "atribuiu" && l.campos
            ? { de: nome(l.campos.de ?? null) ?? "", para: nome(l.campos.para ?? null) ?? "" } : l.campos,
        })),
        reembolsos: reembolsos.map((r) => ({ ...r, solicitado_por: nome(r.solicitado_por), pago_por: nome(r.pago_por) })),
      };
    },
  });
}

/** As respostas que ainda valem (sem as desfeitas pelo "voltar"). */
export function trilhaValida(hist: HistCaso[]): HistCaso[] {
  const desfeitas = new Set(hist.filter((h) => h.acao === "voltou" && h.desfaz != null).map((h) => h.desfaz));
  return hist.filter((h) => h.acao !== "voltou" && !desfeitas.has(h.id));
}

function useMutacaoCaso<V>(fn: (v: V) => Promise<void>, blingId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["posvenda_casos", blingId] });
      qc.invalidateQueries({ queryKey: ["posvenda"] });
      qc.invalidateQueries({ queryKey: ["entrega_trato_hist", blingId] });
      qc.invalidateQueries({ queryKey: ["posvenda_cliente"] });
      qc.invalidateQueries({ queryKey: ["posvenda_painel"] });
    },
  });
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { error } = await db.rpc(fn, args);
  if (error) throw error;
}

export function useAbrirCaso(blingId: number) {
  return useMutacaoCaso((v: { tipo: string; passo: string }) =>
    rpc("carbo_posvenda_caso_abrir", { p_bling_id: blingId, p_tipo: v.tipo, p_passo: v.passo }), blingId);
}

export interface Resposta {
  caso: string;
  passo: string;
  opcao: string;
  proximo?: string | null;
  desfecho?: string | null;
  tipo?: string | null;
  nota?: string | null;
  campos?: Record<string, string> | null;
  valor?: number | null;
}

export function useResponderCaso(blingId: number) {
  return useMutacaoCaso((v: Resposta) => rpc("carbo_posvenda_caso_responder", {
    p_caso: v.caso, p_passo: v.passo, p_opcao: v.opcao,
    p_proximo: v.proximo ?? null, p_desfecho: v.desfecho ?? null, p_tipo: v.tipo ?? null,
    p_nota: v.nota ?? null, p_campos: v.campos && Object.keys(v.campos).length ? v.campos : null,
    p_valor: v.valor ?? null,
  }), blingId);
}

export interface PedidoReembolso {
  caso: string;
  passo: string;
  opcao: string;
  tipo: "parcial" | "integral";
  valor: number;
  forma: string;
  dados: string | null;
  nota: string | null;
  aguarda: string;
  depois: string;
}

/** O atendente pede o reembolso ao Financeiro (20261175): o caso passa a esperar. */
export function useSolicitarReembolso(blingId: number) {
  return useMutacaoCaso((v: PedidoReembolso) => rpc("carbo_posvenda_reembolso_solicitar", {
    p_caso: v.caso, p_passo: v.passo, p_opcao: v.opcao, p_tipo: v.tipo, p_valor: v.valor,
    p_forma: v.forma, p_dados: v.dados, p_nota: v.nota, p_aguarda: v.aguarda, p_depois: v.depois,
  }), blingId);
}

/** O comprovante do Financeiro (bucket privado): link de 1 h, ou o arquivo para mandar no chat. */
export async function linkDoComprovante(path: string): Promise<string> {
  const { data, error } = await (supabase as any).storage.from("posvenda-comprovantes").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw error ?? new Error("Não foi possível abrir o comprovante");
  return data.signedUrl as string;
}

export async function arquivoDoComprovante(path: string): Promise<File> {
  const { data, error } = await (supabase as any).storage.from("posvenda-comprovantes").download(path);
  if (error || !data) throw error ?? new Error("Não foi possível baixar o comprovante");
  const nome = path.split("/").pop() || "comprovante";
  return new File([data as Blob], nome.replace(/^\d+-/, ""), { type: (data as Blob).type || "application/pdf" });
}

/** "Pegar" (pessoa nula = eu) ou passar o caso a alguém (20261182). */
export function useAtribuirCaso(blingId: number) {
  return useMutacaoCaso((v: { caso: string; pessoa?: string | null }) =>
    rpc("carbo_posvenda_caso_atribuir", { p_caso: v.caso, p_pessoa: v.pessoa ?? null }), blingId);
}

/** Com quem está a bola: em atendimento, aguardando cliente, aguardando terceiro (20261182). */
export function useEstadoCaso(blingId: number) {
  return useMutacaoCaso((v: { caso: string; estado: string }) =>
    rpc("carbo_posvenda_caso_estado", { p_caso: v.caso, p_estado: v.estado }), blingId);
}

export function useVoltarCaso(blingId: number) {
  return useMutacaoCaso((caso: string) => rpc("carbo_posvenda_caso_voltar", { p_caso: caso }), blingId);
}

export function useEncerrarCaso(blingId: number) {
  return useMutacaoCaso((v: { caso: string; desfecho: "sem_retorno" | "cancelado"; nota?: string | null }) =>
    rpc("carbo_posvenda_caso_encerrar", { p_caso: v.caso, p_desfecho: v.desfecho, p_nota: v.nota ?? null }), blingId);
}

export function useAnotarCaso(blingId: number) {
  return useMutacaoCaso((v: { caso: string; nota: string }) =>
    rpc("carbo_posvenda_caso_anotar", { p_caso: v.caso, p_nota: v.nota }), blingId);
}

/** Erro do banco em português de gente. */
export function mensagemDoErro(e: any): string {
  const code = e?.code ?? "";
  if (code === "PGRST202" || code === "42883") return "Os casos ainda não foram instalados no banco.";
  if (code === "42501") return "Sem acesso.";
  return String(e?.message ?? e ?? "Erro desconhecido");
}

export interface PedidoDoCliente {
  bling_id: number;
  pedido_codigo: string | null;
  pedido_numero: string | null;
  canal: string | null;
  data_pedido: string;
  total: number | null;
  etapa: string;
  caso: { id: string; tipo: string; passo: string; status: "aberto" | "encerrado"; desfecho: string | null; aberto_em: string } | null;
}

/** Os pedidos do telefone da conversa (os 10 mais recentes), com o caso de cada um (20261174). */
export function usePosVendaDoCliente(waId: string | null) {
  return useQuery({
    queryKey: ["posvenda_cliente", waId],
    enabled: !!waId,
    staleTime: 60_000,
    retry: (n, e: any) => n < 1 && !["PGRST202", "42883", "42501"].includes(e?.code ?? ""),
    queryFn: async (): Promise<PedidoDoCliente[]> => {
      const { data, error } = await db.rpc("carbo_posvenda_do_cliente", { p_wa_id: waId });
      if (error) throw error;
      return (data ?? []) as PedidoDoCliente[];
    },
  });
}
