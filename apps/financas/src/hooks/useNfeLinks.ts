import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Link do DANFE (PDF) / XML de uma NF do Bling, sob demanda. A lista do Bling NÃO
// traz o PDF — só o detalhe GET /nfe/{id}. A edge function "bling-sync" (entity
// nfe_links) busca e cacheia em bling_nfe.pdf_url. Reaproveitado do Controle;
// aqui é o ponto único do Finanças pra baixar a NF (reutilizável em várias telas).
// ─────────────────────────────────────────────────────────────────────────────
export function useNfeLinks() {
  return useMutation({
    mutationFn: async (blingNfId: number): Promise<{ pdf: string | null; xml: string | null; keys?: string[]; situacao?: unknown }> => {
      const res = await supabase.functions.invoke("bling-sync", {
        body: { entity: "nfe_links", bling_nf_id: blingNfId },
      });
      if (!res.data?.success) throw new Error(res.data?.error || "Falha ao buscar a NF no Bling");
      // `keys`/`situacao` são diagnóstico: quando não vem PDF, mostram quais campos
      // o Bling devolveu de fato (pra mapear o nome certo do link do DANFE).
      return { pdf: res.data.pdf ?? null, xml: res.data.xml ?? null, keys: res.data.keys, situacao: res.data.situacao };
    },
  });
}
