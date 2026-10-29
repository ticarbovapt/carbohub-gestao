import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FaturamentoOrder } from "@/hooks/useFaturamento";

// ─────────────────────────────────────────────────────────────────────────────
// A nota de VENDA de cada pedido da página — de qual conta, número, SÉRIE e
// os links. Pedido do dono do processo (29/10/2026): a aba NF Online dizia
// "Sem NF" para venda que tem nota, e o número sozinho não diz qual nota é —
// "a 450 pode ser da série 1, da 2 ou da 10".
//
// ⚠️ A nota mora em lugares DIFERENTES conforme a origem do pedido:
//   pedido nosso, filial    carboze_orders.bling2_nf_id  → bling2_nfe
//   pedido nosso, matriz    carboze_orders.bling_nf_id   → bling_nfe
//   importado da filial     external_ref 'bling2-<id>' → bling2_orders.nf_bling_id → bling2_nfe
//   importado da matriz     bling_nfe.order_id = o pedido (o casamento grava)
// O pedido importado (BLING-/BLING2-, quase todo on-line) NUNCA ganha as
// colunas de nota: a ponte não as grava, de propósito (`20260861`). Olhar só
// elas é o que fazia a aba inteira dizer "Sem NF".
//
// ⚠️ As duas contas numeram do zero: o id de uma não pode ser procurado no
// espelho da outra — acharia a nota de OUTRA empresa com o mesmo id.
// ─────────────────────────────────────────────────────────────────────────────

export interface NotaDoPedido {
  conta: 1 | 2;
  blingId: number;
  numero: string | null;
  serie: string | null;
  situacao: string | null;
  pdf_url: string | null;
  xml_url: string | null;
}

const db = supabase as unknown as { from: (t: string) => any };
const COLS = "bling_id, numero, serie, situacao, pdf_url, xml_url, chave_acesso";

/**
 * A SÉRIE da nota. ⚠️ A coluna `serie` dos espelhos vem VAZIA do sync do Bling
 * (medido em produção, 29/10/2026), então quem responde é a CHAVE DE ACESSO:
 * 44 dígitos, a série nas posições 23–25 (`55 001 000000232` → série 1). É
 * identidade da nota, não palpite. Sem coluna e sem chave, `null` — nunca "1".
 */
export function serieDaNota(serie: unknown, chave: unknown): string | null {
  if (serie != null && String(serie).trim() !== "") return String(serie).trim();
  const d = String(chave ?? "").replace(/\D/g, "");
  return d.length === 44 ? String(Number(d.slice(22, 25))) : null;
}

const nota = (conta: 1 | 2, r: any): NotaDoPedido => ({
  conta,
  blingId: Number(r.bling_id),
  numero: r.numero ?? null,
  serie: serieDaNota(r.serie, r.chave_acesso),
  situacao: r.situacao != null ? String(r.situacao) : null,
  pdf_url: r.pdf_url ?? null,
  xml_url: r.xml_url ?? null,
});

/** Situação que NÃO vale como nota (cancelada, denegada…): o chip fica vermelho. */
export const notaInvalida = (n: NotaDoPedido | null | undefined) =>
  !!n?.situacao && /cancel|deneg|rejeit|inutil/i.test(n.situacao);

export function useNotasDosPedidos(rows: FaturamentoOrder[]) {
  const ids = rows.map((o) => o.id).sort();
  return useQuery({
    queryKey: ["faturamento", "notas", ids],
    enabled: rows.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, NotaDoPedido>> => {
      const out: Record<string, NotaDoPedido> = {};

      // 1. Filial: o id da nota vem da coluna do pedido ou do pedido do Bling 2.
      const porNota2 = new Map<number, string[]>();
      const pedidosBling2 = new Map<number, string>();
      // 2. Matriz: pelo id da coluna, ou pelo casamento gravado na nota.
      const porNota1 = new Map<number, string[]>();
      const semNada: string[] = [];
      const add = (m: Map<number, string[]>, k: number, v: string) => m.set(k, [...(m.get(k) ?? []), v]);

      for (const o of rows) {
        const ref = o.external_ref ?? "";
        if (o.bling2_nf_id) add(porNota2, Number(o.bling2_nf_id), o.id);
        else if (o.bling_nf_id) add(porNota1, Number(o.bling_nf_id), o.id);
        else if (/^bling2-\d+$/.test(ref)) pedidosBling2.set(Number(ref.slice(7)), o.id);
        else semNada.push(o.id);
      }

      if (pedidosBling2.size) {
        const { data, error } = await db.from("bling2_orders")
          .select("bling_id, nf_bling_id").in("bling_id", [...pedidosBling2.keys()]);
        if (error) throw error;
        for (const r of data ?? []) {
          const pedido = pedidosBling2.get(Number(r.bling_id));
          if (pedido && r.nf_bling_id) add(porNota2, Number(r.nf_bling_id), pedido);
        }
      }

      const ler = async (tabela: string, conta: 1 | 2, m: Map<number, string[]>) => {
        if (!m.size) return;
        const { data, error } = await db.from(tabela).select(COLS).in("bling_id", [...m.keys()]);
        if (error) throw error;
        for (const r of data ?? []) for (const pedido of m.get(Number(r.bling_id)) ?? []) out[pedido] = nota(conta, r);
      };
      await ler("bling2_nfe", 2, porNota2);
      await ler("bling_nfe", 1, porNota1);

      // Importado da matriz: a nota que o casamento ligou ao pedido. A remessa
      // de bonificação (se houver) tem coluna própria no pedido e fica de fora.
      if (semNada.length) {
        const bonif = new Map(rows.map((o) => [o.id, o.bling_nf_bonificacao_id ? Number(o.bling_nf_bonificacao_id) : null]));
        const { data, error } = await db.from("bling_nfe")
          .select(`${COLS}, order_id`).in("order_id", semNada).order("bling_id");
        if (error) throw error;
        for (const r of data ?? []) {
          if (out[r.order_id] || bonif.get(r.order_id) === Number(r.bling_id)) continue;
          out[r.order_id] = nota(1, r);
        }
      }
      return out;
    },
  });
}
