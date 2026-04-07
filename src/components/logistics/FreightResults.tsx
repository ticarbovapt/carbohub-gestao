import { Truck, Save, Clock, DollarSign, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type FreightQuoteResult, type FreightCarrier } from "@/hooks/useFreightQuote";

// ── helpers ───────────────────────────────────────────────────────────────────
function EnvBadge({ env }: { env: "sandbox" | "production" | "mock" }) {
  if (env === "production")
    return <Badge className="bg-green-600 text-white text-[10px]">🟢 Produção</Badge>;
  if (env === "sandbox")
    return <Badge className="bg-amber-500 text-white text-[10px]">🟡 Sandbox</Badge>;
  return <Badge variant="outline" className="text-[10px]">⚪ Mock (demonstração)</Badge>;
}

function formatDays(min: number | null, max: number | null) {
  if (min == null && max == null) return "—";
  if (min === max || max == null) return `${min} dia${min !== 1 ? "s" : ""} úteis`;
  return `${min}–${max} dias úteis`;
}

function formatPrice(price: number) {
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface FreightResultsProps {
  result: FreightQuoteResult | null;
  note?: string;
  onSave: (carrier: FreightCarrier) => void;
  isSaving?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FreightResults({ result, note, onSave, isSaving }: FreightResultsProps) {
  if (!result) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-board-surface p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[200px]">
        <Truck className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          Preencha o formulário e clique em <strong>Calcular Frete</strong> para ver as opções de entrega.
        </p>
      </div>
    );
  }

  if (result.carriers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-board-surface p-6 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500" />
        <p className="text-sm text-muted-foreground">
          Nenhuma transportadora disponível para este CEP/produto.
        </p>
        <EnvBadge env={result.env} />
      </div>
    );
  }

  const cheapest = result.carriers[0]?.custom_price ?? result.carriers[0]?.price;

  return (
    <div className="rounded-xl border border-border bg-board-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-board-text flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          {result.carriers.length} opções de frete
        </h3>
        <EnvBadge env={result.env} />
      </div>

      {/* Mock note */}
      {note && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 text-[11px] text-amber-700 dark:text-amber-400 border-b border-amber-200 dark:border-amber-800">
          ⚠️ {note}
        </div>
      )}

      {/* Carrier rows */}
      <div className="divide-y divide-border">
        {result.carriers.map((carrier) => {
          const price = carrier.custom_price ?? carrier.price;
          const isCheapest = price === cheapest;

          return (
            <div
              key={`${carrier.id}-${carrier.name}`}
              className={cn(
                "flex items-center justify-between px-4 py-3 gap-3",
                isCheapest && "bg-green-500/5"
              )}
            >
              {/* Logo + name */}
              <div className="flex items-center gap-3 min-w-0">
                {carrier.logo ? (
                  <img
                    src={carrier.logo}
                    alt={carrier.company}
                    className="h-8 w-8 object-contain rounded"
                  />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-board-text truncate">
                    {carrier.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{carrier.company}</p>
                </div>
              </div>

              {/* Delivery time */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Clock className="h-3 w-3" />
                {formatDays(carrier.delivery_min, carrier.delivery_max)}
              </div>

              {/* Price + save */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <p className={cn("text-sm font-bold", isCheapest ? "text-green-600" : "text-board-text")}>
                    {formatPrice(price)}
                  </p>
                  {carrier.discount > 0 && (
                    <p className="text-[10px] text-muted-foreground line-through">
                      {formatPrice(carrier.price)}
                    </p>
                  )}
                </div>

                {isCheapest && (
                  <Badge className="bg-green-600 text-white text-[9px] px-1.5 py-0 shrink-0">
                    Melhor
                  </Badge>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs gap-1 shrink-0"
                  disabled={isSaving}
                  onClick={() => onSave(carrier)}
                >
                  <Save className="h-3 w-3" />
                  Salvar
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
