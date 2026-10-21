import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PurchaseRequestStatus } from "@/types/purchasing";

// ─────────────────────────────────────────────────────────────────────────────
// Saídas da requisição que não são aprovar/rejeitar: o RASCUNHO não tinha
// caminho nenhum para a aprovação, e nenhuma RC podia ser cancelada.
//
// ⚠️ Toda troca de status vai com `.eq("status", <origem>)` e confere que UMA
// linha mudou. Sem isso, duas abas (ou o gestor aprovando enquanto o
// solicitante cancela) passariam uma por cima da outra, caladas. Zero linhas é
// "o status mudou enquanto você olhava" OU "sem permissão" (a RLS devolve zero,
// não erro) — a mensagem diz as duas, porque a tela não sabe qual foi.
//
// ⚠️ Toast pelo `sonner`, que é o Toaster montado no `main.tsx`. O
// `@/hooks/use-toast` (shadcn) não tem `<Toaster/>` montado neste app.
// ─────────────────────────────────────────────────────────────────────────────

const CANCELAVEIS: PurchaseRequestStatus[] = ["rascunho", "aguardando_aprovacao", "rejeitada"];

async function trocarStatus(
  id: string,
  de: PurchaseRequestStatus,
  campos: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .update(campos as any)
    .eq("id", id)
    .eq("status", de as any)
    .select("id");
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error(
      "Nada foi alterado: a requisição mudou de status enquanto a tela estava aberta, ou você não tem permissão. Recarregue e confira.",
    );
  }
}

// Coluna inexistente: 42703 no Postgres, PGRST204 no cache de esquema do PostgREST.
const ehColunaInexistente = (e: any) =>
  e?.code === "42703" || e?.code === "PGRST204" || /submitted_at/.test(String(e?.message ?? ""));

function useInvalidarRequisicoes() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["purchase-requests"] });
    qc.invalidateQueries({ queryKey: ["purchasing-badges"] });
    qc.invalidateQueries({ queryKey: ["purchasing-kpis"] });
  };
}

/** Rascunho → aguardando aprovação, carimbando `submitted_at`. */
export function useEnviarParaAprovacao() {
  const invalidar = useInvalidarRequisicoes();
  return useMutation({
    mutationFn: async (id: string) => {
      const status = "aguardando_aprovacao";
      try {
        await trocarStatus(id, "rascunho", { status, submitted_at: new Date().toISOString() });
      } catch (e) {
        if (!ehColunaInexistente(e)) throw e;
        await trocarStatus(id, "rascunho", { status });
      }
    },
    onSuccess: () => toast.success("Requisição enviada para aprovação."),
    onError: (e: Error) => toast.error("Não foi possível enviar para aprovação", { description: e.message }),
    onSettled: invalidar,
  });
}

/** Cancela a RC — só de rascunho, aguardando aprovação ou rejeitada. */
export function useCancelarRequisicao() {
  const invalidar = useInvalidarRequisicoes();
  return useMutation({
    mutationFn: async ({ id, de }: { id: string; de: PurchaseRequestStatus }) => {
      if (!CANCELAVEIS.includes(de)) {
        throw new Error("Só dá para cancelar requisição em rascunho, aguardando aprovação ou rejeitada.");
      }
      await trocarStatus(id, de, { status: "cancelada" });
    },
    onSuccess: () => toast.success("Requisição cancelada."),
    onError: (e: Error) => toast.error("Não foi possível cancelar", { description: e.message }),
    onSettled: invalidar,
  });
}

export const podeCancelarRequisicao = (status: PurchaseRequestStatus) => CANCELAVEIS.includes(status);
