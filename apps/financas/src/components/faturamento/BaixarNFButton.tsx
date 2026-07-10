import { CarboButton } from "@/components/ui/carbo-button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNfeLinks } from "@/hooks/useNfeLinks";

// Botão reutilizável de "Baixar NF": busca o PDF (DANFE) da NF no Bling sob demanda
// e abre em nova aba. Usado no Faturamento e reaproveitável onde a NF já está
// vinculada (bling_nf_id). Não faz nada além de abrir o PDF — sem risco de escrita.
export function BaixarNFButton({
  blingNfId,
  numero,
  label,
  size = "sm",
}: {
  blingNfId: number;
  numero?: string | null;
  label?: string;
  size?: "sm" | "default" | "lg" | "icon";
}) {
  const links = useNfeLinks();
  const handle = () =>
    links.mutate(blingNfId, {
      onSuccess: ({ pdf, keys, situacao }) => {
        if (pdf) { window.open(pdf, "_blank", "noopener"); return; }
        // Sem PDF: mostra os campos que o Bling devolveu (diagnóstico do nome do link).
        const campos = Array.isArray(keys) ? keys.join(", ") : "—";
        toast.error(`Bling não devolveu link de PDF. situacao=${JSON.stringify(situacao)} · campos: ${campos}`, { duration: 15000 });
      },
      onError: (e: Error) => toast.error("Erro ao buscar a NF: " + e.message),
    });

  return (
    <CarboButton variant="outline" size={size} onClick={handle} disabled={links.isPending}>
      {links.isPending
        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
        : <Download className="h-3.5 w-3.5 mr-1" />}
      {label ?? `Baixar NF${numero ? ` ${numero}` : ""}`}
    </CarboButton>
  );
}
