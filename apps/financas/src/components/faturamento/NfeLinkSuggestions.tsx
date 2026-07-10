import { useState } from "react";
import { Sparkles, Link2, ChevronDown, ChevronRight, ArrowRight, X, CheckCircle2 } from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import {
  useNfeLinkSuggestions,
  useLinkNFeToOrder,
  type NfeLinkSuggestion,
  type SuggestionConfidence,
} from "@/hooks/useNfeLinking";

const fmtBRL = (v: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = s.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s;
};

const CONF_STYLE: Record<SuggestionConfidence, { label: string; cls: string }> = {
  alta:  { label: "Alta confiança",  cls: "text-green-500 border-green-500/30 bg-green-500/10" },
  media: { label: "Média confiança", cls: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
  baixa: { label: "Baixa confiança", cls: "text-muted-foreground border-border bg-muted/40" },
};

function SuggestionRow({ s, dismiss }: { s: NfeLinkSuggestion; dismiss: (id: string) => void }) {
  const link = useLinkNFeToOrder();
  const conf = CONF_STYLE[s.confidence];
  const handleConfirm = () =>
    link.mutate({ nfeId: s.nfeId, orderNumber: s.orderNumber }, { onSuccess: () => dismiss(s.orderId) });

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${conf.cls}`}>{conf.label}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {s.reasons.map((r, i) => (
            <span key={i} className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">{r}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm flex-wrap">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold">{s.orderNumber}</p>
          <p className="text-xs truncate max-w-[200px]">{s.orderCustomer || "—"}</p>
          <p className="text-[11px] text-muted-foreground">{fmtBRL(s.orderTotal)} · {fmtDate(s.orderDate)}</p>
        </div>

        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-carbo-green">NF {s.nfeNumero || "—"}</p>
          <p className="text-xs truncate max-w-[200px]">{s.nfeContato || "—"}</p>
          <p className="text-[11px] text-muted-foreground">{fmtBRL(s.nfeValor)} · {fmtDate(s.nfeData)}</p>
        </div>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <CarboButton size="sm" className="gap-1.5" onClick={handleConfirm} disabled={link.isPending}>
            <Link2 className="h-3.5 w-3.5" />
            {link.isPending ? "Vinculando…" : "Confirmar vínculo"}
          </CarboButton>
          <CarboButton size="icon" variant="ghost" className="text-muted-foreground" title="Ignorar esta sugestão" onClick={() => dismiss(s.orderId)}>
            <X className="h-4 w-4" />
          </CarboButton>
        </div>
      </div>
    </div>
  );
}

export function NfeLinkSuggestions() {
  const { data: suggestions = [], isLoading } = useNfeLinkSuggestions();
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const dismiss = (orderId: string) => setDismissed((prev) => new Set(prev).add(orderId));
  const visible = suggestions.filter((s) => !dismissed.has(s.orderId));

  if (isLoading || visible.length === 0) return null;

  return (
    <CarboCard className="border-carbo-green/30">
      <CarboCardContent className="p-0">
        <button
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/10 transition-colors rounded-xl"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Sparkles className="h-4 w-4 text-carbo-green" />
          <span className="font-semibold text-sm">Sugestões de vínculo NF ↔ pedido</span>
          <span className="text-xs text-muted-foreground">
            ({visible.length} recomendaç{visible.length === 1 ? "ão" : "ões"} — você confirma cada uma)
          </span>
        </button>

        {open && (
          <div className="px-4 pb-4 space-y-2">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" />
              Recomendado por cliente, valor e data. Confira antes de confirmar — o vínculo só é aplicado quando você clica.
            </p>
            {visible.map((s) => <SuggestionRow key={s.orderId} s={s} dismiss={dismiss} />)}
          </div>
        )}
      </CarboCardContent>
    </CarboCard>
  );
}
