// ─────────────────────────────────────────────────────────────────────────────
// O que o diálogo de baixa precisa: a lista de contas (portadores) do Bling, a
// conta do próprio título, a conta de "quita ou fica parcial" e o espelho da
// matriz (situação e saldo, que a tabela local não guarda).
//
// ⚠️ A conta daqui é só para MOSTRAR antes do clique. Quem decide é o servidor,
// com a MESMA regra das duas empresas (`decidirBaixa`, em
// supabase/functions/_shared/blingContasRegra.ts) — mudou lá, confira aqui.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chamarContasPagar, type ContaBling, type Portador } from "@/lib/contaPagarBling";

const db = supabase as any;

/** O que a pessoa escolheu — vai ao servidor e fica guardado no título (`baixa_ajustes`). */
export interface AjustesTela {
  portador_id: number | null;
  portador_nome: string | null;
  juros: number;
  multa: number;
  desconto: number;
  tarifa: number;
  /** O que saiu/entrou de fato (o "Valor pago" do Bling). */
  valor: number;
  /** O "Histórico" da baixa no Bling — o texto pelo qual o time acha a baixa depois. */
  historico: string | null;
}

/** O limite do campo no Bling ("N de 2.000 caracteres"). Igual a MAX_HISTORICO do servidor. */
export const MAX_HISTORICO = 2000;

/** "1.234,56", "1234,56" ou "1234.56" → número; vazio = 0; inválido = NaN. */
export function lerReais(txt: string): number {
  const t = txt.trim().replace(/\s|R\$/g, "");
  if (!t) return 0;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^\d+(\.\d{1,2})?$/.test(norm) ? Number(norm) : NaN;
}

export const reaisTxt = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cents = (v: number) => Math.round(v * 100);

/**
 * Quita ou fica parcial? O espelho, na tela, de `decidirBaixa`.
 * Devolve o erro (texto) ou o resultado.
 */
export function calcularBaixa(tipo: "pagar" | "receber", saldo: number, a: { juros: number; multa: number; desconto: number; tarifa: number; valor: number }):
  { erro: string } | { parcial: boolean; restante: number } {
  if ([a.juros, a.multa, a.desconto, a.tarifa, a.valor].some((x) => !Number.isFinite(x) || x < 0)) {
    return { erro: "Use valores em reais, sem sinal de menos." };
  }
  if (a.valor <= 0) return { erro: "O valor pago tem de ser maior que zero." };
  if (tipo === "pagar" && a.tarifa > 0) return { erro: "Tarifa só existe no recebimento." };
  // Juros e multa vêm A MAIS no valor; desconto e tarifa (o que foi retido) a menos.
  const principal = cents(a.valor) - cents(a.juros) - cents(a.multa) + cents(a.desconto) + cents(a.tarifa);
  if (principal <= 0) return { erro: "O valor pago não cobre os juros e a multa." };
  if (principal > cents(saldo)) {
    return { erro: `O valor passa do saldo em aberto (R$ ${reaisTxt(saldo)}) — a diferença entra como juros ou multa.` };
  }
  return { parcial: principal < cents(saldo), restante: (cents(saldo) - principal) / 100 };
}

/** As contas financeiras do Bling daquela empresa, as mais usadas primeiro. */
export function usePortadores(conta: ContaBling, ligado: boolean) {
  return useQuery({
    queryKey: ["bling-portadores", conta],
    enabled: ligado,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<{ lista: Portador[]; erro: string | null }> => {
      const r = await chamarContasPagar<{ portadores: Portador[]; erro_portadores: string | null }>("opcoes", conta);
      if (!r.ok) return { lista: [], erro: r.mensagem ?? "Não foi possível ler as contas do Bling." };
      return { lista: r.portadores ?? [], erro: r.erro_portadores ?? null };
    },
  });
}

export type TabelaEspelho = "bling_contas_pagar" | "bling_contas_receber" | "bling2_contas_pagar" | "bling2_contas_receber";

/**
 * A conta (portador) e o histórico que o título já tem no Bling — vêm
 * pré-preenchidos, como na "Baixa de lançamentos" de lá.
 */
export function useDoTituloNoBling(tabela: TabelaEspelho, blingId: number | null | undefined, ligado: boolean) {
  return useQuery({
    queryKey: ["bling-do-titulo", tabela, blingId],
    enabled: ligado && !!blingId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ portador: number | null; historico: string | null }> => {
      const { data, error } = await db.from(tabela).select("historico, portador:detalhe->portador->>id").eq("bling_id", blingId).maybeSingle();
      if (error) return { portador: null, historico: null };
      const id = Number(data?.portador);
      const h = typeof data?.historico === "string" ? data.historico.trim() : "";
      return { portador: id > 0 ? id : null, historico: h || null };
    },
  });
}

export interface EspelhoMatriz { situacao: string | null; saldo: number | null }

/**
 * Situação e saldo do Bling 1 para os títulos da página — a tabela local não
 * guarda o saldo da baixa PARCIAL, e sem ele a linha diria o valor cheio.
 * ⚠️ Falhou a leitura = mapa vazio: a linha mostra o que mostrava antes.
 */
export function useEspelhoMatriz(tipo: "pagar" | "receber", blingIds: (number | string | null | undefined)[]) {
  const ids = [...new Set(blingIds.map(Number).filter((n) => n > 0))].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["espelho-matriz", tipo, ids],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<number, EspelhoMatriz>> => {
      const { data, error } = await db.from(tipo === "pagar" ? "bling_contas_pagar" : "bling_contas_receber")
        .select("bling_id, situacao, saldo").in("bling_id", ids);
      const m = new Map<number, EspelhoMatriz>();
      if (error) return m;
      for (const r of (data ?? []) as any[]) {
        m.set(Number(r.bling_id), { situacao: r.situacao == null ? null : String(r.situacao), saldo: r.saldo == null ? null : Number(r.saldo) });
      }
      return m;
    },
  });
}

/**
 * Guarda (ou limpa) os ajustes no título da matriz. ⚠️ Coluna da 20261133: antes
 * do SQL o update falha, e a baixa NÃO pode falhar por isso — o erro é ignorado.
 */
export async function salvarAjustes(tabela: "purchase_payables" | "receivables", id: string, ajustes: AjustesTela | null) {
  try { await db.from(tabela).update({ baixa_ajustes: ajustes }).eq("id", id); } catch { /* coluna ausente */ }
}

/** "R$ 260,00 · juros 10,00" — a linha embaixo da data quando o valor pago difere do título. */
export function resumoAjustes(aj: Partial<AjustesTela> | null | undefined, valorTitulo: number | null | undefined): string | null {
  if (!aj || aj.valor == null) return null;
  const partes: string[] = [];
  if (Number(aj.juros) > 0) partes.push(`juros ${reaisTxt(Number(aj.juros))}`);
  if (Number(aj.multa) > 0) partes.push(`multa ${reaisTxt(Number(aj.multa))}`);
  if (Number(aj.desconto) > 0) partes.push(`desc. ${reaisTxt(Number(aj.desconto))}`);
  if (Number(aj.tarifa) > 0) partes.push(`tarifa ${reaisTxt(Number(aj.tarifa))}`);
  const difere = valorTitulo == null || Math.abs(Number(aj.valor) - Number(valorTitulo)) > 0.005;
  if (!difere && !partes.length) return null;
  return [`R$ ${reaisTxt(Number(aj.valor))}`, ...partes].join(" · ");
}
