import { useMutation, useQueryClient } from "@tanstack/react-query";
import { rpcCompras } from "@/hooks/usePurchasing";
import { toast } from "sonner";
import type { PurchaseRequestStatus } from "@/types/purchasing";

// ─────────────────────────────────────────────────────────────────────────────
// Saídas da requisição que não são aprovar/rejeitar: enviar o rascunho para a
// aprovação e cancelar.
//
// ⚠️ Pelo BANCO (`fin_rc_enviar`, `fin_rc_cancelar`, migração 20261126): a
// função trava a linha e confere o status de ORIGEM — duas abas, ou o gestor
// aprovando enquanto o solicitante cancela, não passam uma por cima da outra.
//
// ⚠️ Toast pelo `sonner`, que é o Toaster montado no `main.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

const CANCELAVEIS: PurchaseRequestStatus[] = ["rascunho", "aguardando_aprovacao", "rejeitada"];

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
    mutationFn: (id: string) => rpcCompras("fin_rc_enviar", { p_id: id }),
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
      await rpcCompras("fin_rc_cancelar", { p_id: id });
    },
    onSuccess: () => toast.success("Requisição cancelada."),
    onError: (e: Error) => toast.error("Não foi possível cancelar", { description: e.message }),
    onSettled: invalidar,
  });
}

export const podeCancelarRequisicao = (status: PurchaseRequestStatus) => CANCELAVEIS.includes(status);
