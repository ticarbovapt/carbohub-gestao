import { CarboButton } from "@/components/ui/carbo-button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNfeLinks } from "@/hooks/useNfeLinks";

// Botão reutilizável de "Baixar NF": busca o PDF (DANFE) da NF no Bling sob demanda
// e abre em nova aba. Usado no Faturamento e reaproveitável onde a NF já está
// vinculada (bling_nf_id). Não faz nada além de abrir o PDF — sem risco de escrita.
//
// ⚠️ `conta` decide ONDE a nota mora: a busca ao vivo (`bling-sync` nfe_links)
// só conhece a MATRIZ — mandar um id da filial para lá acharia nada ou a nota
// de outra empresa com o mesmo id. A filial abre o link que o espelho dela
// (`bling2_nfe`) já guardou; sem link ainda, diz isso em vez de errar de conta.
export function BaixarNFButton({
  blingNfId,
  numero,
  label,
  size = "sm",
  conta = 1,
  pdfUrl,
  xmlUrl,
}: {
  blingNfId: number;
  numero?: string | null;
  label?: string;
  size?: "sm" | "default" | "lg" | "icon";
  conta?: 1 | 2;
  pdfUrl?: string | null;
  xmlUrl?: string | null;
}) {
  const links = useNfeLinks();
  const handle = () => {
    if (pdfUrl) { window.open(pdfUrl, "_blank", "noopener"); return; }
    if (conta === 2) {
      if (xmlUrl) { window.open(xmlUrl, "_blank", "noopener"); return; }
      toast.error("A nota da filial ainda não tem arquivo no espelho do Bling 2. Tente de novo em alguns minutos.");
      return;
    }
    links.mutate(blingNfId, {
      onSuccess: ({ pdf, keys, situacao }) => {
        if (pdf) { window.open(pdf, "_blank", "noopener"); return; }
        // Sem PDF: mostra os campos que o Bling devolveu (diagnóstico do nome do link).
        const campos = Array.isArray(keys) ? keys.join(", ") : "—";
        toast.error(`Bling não devolveu link de PDF. situacao=${JSON.stringify(situacao)} · campos: ${campos}`, { duration: 15000 });
      },
      onError: (e: Error) => toast.error("Erro ao buscar a NF: " + e.message),
    });
  };

  return (
    <CarboButton variant="outline" size={size} onClick={handle} disabled={links.isPending}>
      {links.isPending
        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
        : <Download className="h-3.5 w-3.5 mr-1" />}
      {label ?? `Baixar NF${numero ? ` ${numero}` : ""}`}
    </CarboButton>
  );
}
