import { useState } from "react";
import { Check, Send } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { dataHoraBR } from "@/lib/datas";
import { avisarBaixaNoBling, enviarAoBling, vaiAoBling, type BaixaBlingConfig, type TipoConta } from "@/lib/blingBaixa";

// ─────────────────────────────────────────────────────────────────────────────
// A situação da baixa NO BLING, na linha do título (contas a pagar e a receber).
//
// Só aparece em título do Bling 1 já baixado AQUI no sistema:
//   erro gravado      → "Bling recusou" (o motivo no tooltip) + "Tentar de novo"
//   baixa enviada     → "no Bling ✓", com o instante no tooltip
//   baixado aqui, sem envio nem erro → "Enviar ao Bling" (baixa de antes de
//                                       ligar o interruptor)
// ⚠️ "Baixado aqui" = `paid_by`/`received_by` preenchido. Nulo num título pago
// significa que a baixa foi feita NO Bling e veio pelo espelho — não há o que
// enviar, e o botão não aparece.
// ⚠️ Os botões só existem com o interruptor (ou o id de teste) liberando o
// título. Desligado, a linha mostra só o que já aconteceu.
// ─────────────────────────────────────────────────────────────────────────────

export interface TituloBaixaBling {
  id: string;
  source?: string | null;
  bling_id?: number | string | null;
  bling_baixa_em?: string | null;
  bling_baixa_erro?: string | null;
}

export function BaixaNoBling({
  titulo, tipo, cfg, pago, baixadoAqui, onDepois,
}: {
  titulo: TituloBaixaBling;
  tipo: TipoConta;
  cfg: BaixaBlingConfig | undefined;
  /** Status pago/recebido. Título em aberto não tem baixa para mostrar. */
  pago: boolean;
  baixadoAqui: boolean;
  /** Recarrega a lista (as colunas `bling_baixa_*` mudam no servidor). */
  onDepois: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  if (titulo.source !== "bling" || !titulo.bling_id || !pago) return null;
  const permite = vaiAoBling(cfg, titulo);

  const enviar = async () => {
    setEnviando(true);
    try {
      avisarBaixaNoBling(await enviarAoBling("baixar", tipo, titulo.id));
    } finally {
      setEnviando(false);
      onDepois();
    }
  };

  if (titulo.bling_baixa_erro) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <CarboBadge variant="destructive" size="sm" title={titulo.bling_baixa_erro}>Bling recusou</CarboBadge>
        {permite && (
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" disabled={enviando} onClick={enviar}>
            {enviando ? "Enviando…" : "Tentar de novo"}
          </Button>
        )}
      </div>
    );
  }
  if (titulo.bling_baixa_em) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" title={`Baixa enviada ao Bling em ${dataHoraBR(titulo.bling_baixa_em)}`}>
        no Bling <Check className="h-3 w-3" />
      </span>
    );
  }
  if (baixadoAqui && permite) {
    return (
      <Button
        variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
        disabled={enviando} onClick={enviar} title="Baixa feita só aqui"
      >
        <Send className="h-3 w-3" /> {enviando ? "Enviando…" : "Enviar ao Bling"}
      </Button>
    );
  }
  return null;
}
