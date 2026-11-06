import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Boleto Bradesco (híbrido: boleto + Pix) do contas a receber.
// Quem fala com o banco é a edge function `bradesco-cobranca`; aqui só se lê
// `fin_boletos` e se chama a função. Migração: 20261150000000_boleto_bradesco.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

export type BoletoStatus = "enviando" | "registrado" | "rejeitado" | "falha" | "indeterminado" | "pago" | "cancelado";

/** O título a que o boleto pertence: matriz (receivables) OU filial (Bling 2). */
export type RefTitulo = { receivable_id: string } | { bling2_conta_id: number };

export interface FinBoleto {
  id: string;
  ambiente: "sandbox" | "producao";
  empresa: "matriz" | "filial";
  receivable_id: string | null;
  bling2_conta_id: number | null;
  nosso_numero: number;
  nosso_numero_banco: string | null;
  seu_numero: string;
  valor: number;
  emissao: string;
  vencimento: string;
  multa_cent: number | null;
  juros_dia_cent: number | null;
  pagador: Record<string, string | null>;
  status: BoletoStatus;
  status_banco: string | null;
  linha_digitavel: string | null;
  codigo_barras: string | null;
  txid: string | null;
  pix_copia_cola: string | null;
  erro: string | null;
  pago_em: string | null;
  valor_pago: number | null;
  email_para: string | null;
  email_enviado_em: string | null;
  criado_em: string;
  enviado_em: string;
  carteira: { cnpj: string; beneficiario_nome: string | null; carteira: number; negociacao: string } | null;
}

/** Boleto que ainda vale (ou pode valer): bloqueia emitir outro. */
export const BOLETO_VIVO: BoletoStatus[] = ["enviando", "registrado", "indeterminado", "pago"];
export const ehVivo = (b: FinBoleto | null | undefined) => !!b && BOLETO_VIVO.includes(b.status);

const COLUNAS =
  "id, ambiente, empresa, receivable_id, bling2_conta_id, nosso_numero, nosso_numero_banco, seu_numero, valor, emissao, vencimento, " +
  "multa_cent, juros_dia_cent, pagador, status, status_banco, linha_digitavel, codigo_barras, txid, pix_copia_cola, erro, pago_em, valor_pago, " +
  "email_para, email_enviado_em, criado_em, enviado_em, carteira:fin_cobranca_carteiras(cnpj, beneficiario_nome, carteira, negociacao)";

/** Tabela ainda não existe (front no ar antes do SQL): a tela segue sem boleto, nunca quebra. */
const ehTabelaAusente = (e: any) => !!e && ["42P01", "PGRST205", "PGRST200"].includes(e.code);

/**
 * O boleto de cada título da PÁGINA. Por título vale o VIVO; sem vivo, o mais
 * recente (para a tela dizer "a última tentativa foi recusada").
 */
export function useBoletosDosTitulos(campo: "receivable_id" | "bling2_conta_id", ids: Array<string | number>) {
  const chave = ids.map(String).sort().join(",");
  return useQuery({
    queryKey: ["fin_boletos", campo, chave],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, FinBoleto>> => {
      const { data, error } = await db.from("fin_boletos").select(COLUNAS)
        .in(campo, ids).order("criado_em", { ascending: false }).order("id");
      if (error) {
        if (ehTabelaAusente(error)) return new Map();
        throw error;
      }
      const m = new Map<string, FinBoleto>();
      for (const b of (data ?? []) as FinBoleto[]) {
        const k = String(b[campo]);
        const atual = m.get(k);
        if (!atual || (!ehVivo(atual) && ehVivo(b))) m.set(k, b);
      }
      return m;
    },
  });
}

export function useBoleto(id: string | null) {
  return useQuery({
    queryKey: ["fin_boletos", "um", id],
    enabled: !!id,
    queryFn: async (): Promise<FinBoleto | null> => {
      const { data, error } = await db.from("fin_boletos").select(COLUNAS).eq("id", id).maybeSingle();
      if (error) throw error;
      return data as FinBoleto | null;
    },
  });
}

export interface BoletoPreparo {
  titulo: {
    empresa: "matriz" | "filial"; valor: number; nome: string | null; documento: string | null;
    numero: string | null; vencimento: string | null; aberto: boolean; situacao: string | null;
  };
  carteira: { ambiente: "sandbox" | "producao"; multa_pct: number; juros_mes_pct: number } | null;
  sugestao: Record<string, string | null> | null;
}

export function useBoletoPreparo(ref: RefTitulo | null) {
  const rec = ref && "receivable_id" in ref ? ref.receivable_id : null;
  const b2 = ref && "bling2_conta_id" in ref ? ref.bling2_conta_id : null;
  return useQuery({
    queryKey: ["fin_boleto_preparo", rec, b2],
    enabled: !!ref,
    queryFn: async (): Promise<BoletoPreparo> => {
      const { data, error } = await db.rpc("fin_boleto_preparar", { p_receivable: rec, p_bling2: b2 });
      if (error) throw error;
      return data as BoletoPreparo;
    },
  });
}

// ── A função ─────────────────────────────────────────────────────────────────
export interface PagadorTela {
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string;
  cidade: string; uf: string; email: string; fone: string; documento: string;
}
export type AcaoCobranca =
  | ({ acao: "emitir"; vencimento: string; pagador: PagadorTela } & ({ receivable_id: string } | { bling2_conta_id: number }))
  | { acao: "consultar"; boleto_id: string }
  | { acao: "cancelar"; boleto_id: string };

export interface RespostaCobranca {
  ok: boolean; erro?: string | null; boleto_id?: string; status?: BoletoStatus | string;
  linha_digitavel?: string | null; ambiente?: string; pago_em?: string | null; valor_pago?: number | null;
}

/** `functions.invoke` em não-2xx só diz "non-2xx": o motivo está no CORPO. */
async function erroDaFuncao(error: any): Promise<string> {
  const ctx = error?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const b = await ctx.clone().json();
      if (b?.erro) return String(b.erro);
    } catch { /* corpo não-JSON */ }
  }
  return error?.message || "Erro ao falar com o banco";
}

export function useCobranca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AcaoCobranca): Promise<RespostaCobranca> => {
      const { data, error } = await supabase.functions.invoke("bradesco-cobranca", { body });
      if (error) return { ok: false, erro: await erroDaFuncao(error) };
      return data as RespostaCobranca;
    },
    // ⚠️ Recarrega TAMBÉM na recusa: a reserva grava a tentativa (rejeitada,
    // sem resposta) e a tela precisa mostrá-la.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["fin_boletos"] });
      qc.invalidateQueries({ queryKey: ["fin_boleto_preparo"] });
    },
  });
}

export async function registrarEmail(id: string, para: string) {
  const { error } = await db.rpc("fin_boleto_email_registrar", { p_id: id, p_para: para });
  if (error) throw error;
}
