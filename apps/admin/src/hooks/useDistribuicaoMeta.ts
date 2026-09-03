import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Distribuição de meta: define o total do mês e reparte entre vendedores
// (canal `revenda`) ou plataformas (canal `online`).
//
// ⚠️ O TOTAL É GUARDADO, NÃO DERIVADO — e isso reverte uma decisão anterior.
//
// `useMetaEcommerce.useUpsertMetaTarget` recusa gravar o total dizendo "a meta
// total é a soma das metas por plataforma". Aqui é o contrário, de propósito: a
// diretoria define o total primeiro e distribui depois.
//
// Total derivado da soma não sabe responder "faltam R$ 22.000 para distribuir",
// e faz editar UM vendedor mudar a meta da empresa em silêncio. O preço é ter
// dois números que podem divergir — e a tela paga esse preço MOSTRANDO a
// diferença, nunca corrigindo sozinha.
//
// A gravação inteira é uma chamada de RPC (`carbo_distribuir_meta`): total e
// linhas na MESMA transação. Ver a migração 20260974.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type EscopoMeta = "vendedores" | "ecommerce";

/** O canal em `canal_metas` que corresponde a cada escopo. */
const CANAL: Record<EscopoMeta, string> = {
  vendedores: "revenda",
  ecommerce: "online",
};

// ── A matemática vive em `lib/distribuirMeta.ts` ────────────────────────────
// Separada porque este arquivo importa o cliente Supabase (que depende de
// `import.meta.env` e só existe no browser) e a conta do arredondamento precisa
// rodar em Node para ser verificável. Reexportada aqui para quem já importava.

export {
  distribuirPorPeso,
  distribuirIgual,
  distribuirProporcional,
  redistribuirDestravados,
} from "@/lib/distribuirMeta";
export type { ItemDistribuivel } from "@/lib/distribuirMeta";

// ── Leitura da meta geral ───────────────────────────────────────────────────

export function useMetaGeral(escopo: EscopoMeta, mes: Date) {
  const inicio = startOfMonth(mes);
  const ano = inicio.getFullYear();
  const numeroMes = inicio.getMonth() + 1;

  return useQuery({
    queryKey: ["meta-geral", escopo, ano, numeroMes],
    queryFn: async (): Promise<number> => {
      const { data, error } = await db
        .from("canal_metas")
        .select("valor")
        .eq("ano", ano)
        .eq("mes", numeroMes)
        .eq("canal", CANAL[escopo])
        .maybeSingle();
      if (error) throw error;
      return Number(data?.valor ?? 0);
    },
  });
}

// ── Gravação ────────────────────────────────────────────────────────────────

export interface DistribuicaoResultado {
  mes: string;
  escopo: EscopoMeta;
  total: number;
  distribuido: number;
  residual: number;
  gravados: number;
  removidos: number;
}

export interface DistribuicaoPayload {
  escopo: EscopoMeta;
  mes: Date;
  total: number;
  /** O estado FINAL da distribuição. Quem não estiver aqui é apagado do mês. */
  itens: Array<{ id: string; valor: number }>;
}

export function useDistribuirMeta() {
  const qc = useQueryClient();

  return useMutation<DistribuicaoResultado, Error, DistribuicaoPayload>({
    mutationFn: async ({ escopo, mes, total, itens }) => {
      const { data, error } = await db.rpc("carbo_distribuir_meta", {
        p_escopo: escopo,
        p_mes: startOfMonth(mes).toISOString().slice(0, 10),
        p_total: total,
        p_itens: itens,
      });
      if (error) throw new Error(error.message ?? "Falha ao distribuir a meta.");
      return data as DistribuicaoResultado;
    },
    onSuccess: (r) => {
      // Invalida largo de propósito: a meta alimenta placar, dashboards e a
      // própria tela. Errar para mais aqui custa um refetch; errar para menos
      // deixa número velho na tela de quem acabou de mudá-lo.
      qc.invalidateQueries({ queryKey: ["meta-geral"] });
      qc.invalidateQueries({ queryKey: ["sales_targets"] });
      qc.invalidateQueries({ queryKey: ["sales-targets-progress"] });
      qc.invalidateQueries({ queryKey: ["meta_ecommerce_targets"] });
      qc.invalidateQueries({ queryKey: ["canal_metas"] });

      if (r.residual === 0) {
        toast.success("Meta distribuída — a soma fecha com o total.");
      } else if (r.residual > 0) {
        toast.warning(
          `Salvo, mas faltam ${fmtBRL(r.residual)} para distribuir.`,
        );
      } else {
        toast.warning(
          `Salvo, mas a distribuição passou ${fmtBRL(Math.abs(r.residual))} do total.`,
        );
      }
    },
    onError: (e) => {
      toast.error(e.message || "Não foi possível salvar a distribuição.");
    },
  });
}

export function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", {
    style: "currency", currency: "BRL",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
}
