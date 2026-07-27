import { useState } from "react";
import { Truck, AlertCircle, ChevronDown, Info } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { JAMEF_FAIXA_LABEL, type JamefQuote } from "@/hooks/useJamefQuote";

// ─────────────────────────────────────────────────────────────────────────────
// Linha de resultado da JAMEF — com a quebra do preço aberta a um clique.
//
// A quebra existe porque este preço não vem de API: vem da tabela de contrato.
// Quando o número for questionado (e vai ser), quem atende precisa mostrar de
// onde saiu cada centavo sem abrir planilha.
// ─────────────────────────────────────────────────────────────────────────────

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const kg = (v: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v)} kg`;

export function JamefQuoteCard({ quote, maisBarato }: { quote: JamefQuote; maisBarato: boolean }) {
  const [aberto, setAberto] = useState(false);

  if (!quote.ok) {
    return (
      <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span><strong>Jamef · contrato</strong> — {quote.motivo}</span>
      </div>
    );
  }

  const c = quote.componentes;
  const cubouMais = quote.peso.cubado > quote.peso.real;

  const linhas: [string, number | null, string?][] = [
    ["Frete peso", c.frete_peso, `${quote.destino.sigla} · faixa ${JAMEF_FAIXA_LABEL[quote.peso.faixa] ?? quote.peso.faixa}`],
    ["Ad valorem", c.ad_valorem, "% sobre o valor da NF"],
    ["GRIS", c.gris, "0,11% da NF (mín. R$ 4,79)"],
    ["Pedágio", c.pedagio, "R$ 16,14 por 100 kg ou fração"],
    ["TAS", c.tas, c.tas > 0 ? "interestadual" : "não se aplica (mesmo estado)"],
    ["Taxa CTRC", c.taxa_ctrc],
    ["ICMS", c.icms, quote.icms_aliquota != null
      ? `${(quote.icms_aliquota * 100).toFixed(0)}% por dentro`
      : "sem alíquota cadastrada"],
  ];

  return (
    <div className="rounded-lg border border-green-500/40 bg-green-500/[0.06]">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        aria-expanded={aberto}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Jamef</span>
            <span className="text-xs text-muted-foreground">· {quote.servico}</span>
            {maisBarato && <CarboBadge variant="success" size="sm">Mais barato</CarboBadge>}
            <CarboBadge variant="secondary" size="sm">Tabela do contrato</CarboBadge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {quote.destino.municipio}/{quote.destino.uf} · {quote.destino.tarifario}
            {" · "}
            <span className="text-amber-600 dark:text-amber-400">prazo a consultar</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold tabular-nums">{brl(quote.total)}</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
        </div>
      </button>

      {aberto && (
        <div className="border-t border-green-500/25 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Info className="h-3 w-3 shrink-0" />
            <span>
              Peso real {kg(quote.peso.real)} · cubado {kg(quote.peso.cubado)} →
              {" "}<strong className="text-foreground">taxado {kg(quote.peso.taxavel)}</strong>
              {cubouMais && " (cubagem maior que o peso)"}
            </span>
          </div>

          <div className="space-y-1">
            {linhas.map(([label, valor, nota]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  {label}
                  {nota && <span className="ml-1.5 text-[10px] opacity-70">{nota}</span>}
                </span>
                <span className="tabular-nums shrink-0">
                  {valor == null ? "—" : brl(valor)}
                </span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-border/50 pt-1.5 text-xs font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{brl(quote.total)}</span>
            </div>
          </div>

          {quote.avisos?.length > 0 && (
            <div className="space-y-1 pt-1">
              {quote.avisos.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground pt-0.5">
            {quote.tabela} · origem {quote.origem} · vigência{" "}
            {new Date(quote.vigencia + "T00:00:00").toLocaleDateString("pt-BR")}
          </p>
        </div>
      )}
    </div>
  );
}
