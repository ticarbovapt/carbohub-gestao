import { useState, useMemo } from "react";
import { Download, History, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useFreightQuotesHistory, type FreightQuoteRecord } from "@/hooks/useFreightQuote";

// ── helpers ───────────────────────────────────────────────────────────────────
type DateRange = "7d" | "30d" | "all";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrice(price: number | null) {
  if (price == null) return "—";
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function withinRange(iso: string, range: DateRange) {
  if (range === "all") return true;
  const days = range === "7d" ? 7 : 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(iso) >= cutoff;
}

function exportCsv(records: FreightQuoteRecord[]) {
  const header = [
    "Data",
    "CEP Destino",
    "Produto",
    "Qtd",
    "Transportadora",
    "Preço (R$)",
    "Prazo (dias)",
    "Notas",
  ].join(",");

  const rows = records.map((r) =>
    [
      `"${formatDate(r.created_at)}"`,
      r.to_cep,
      `"${r.product_ref ?? ""}"`,
      r.quantity ?? "",
      `"${r.selected_carrier ?? ""}"`,
      r.selected_price != null ? r.selected_price.toFixed(2).replace(".", ",") : "",
      r.selected_days ?? "",
      `"${r.notes ?? ""}"`,
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `cotacoes_frete_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FreightReports() {
  const { data: records = [], isLoading } = useFreightQuotesHistory(100);
  const [range, setRange] = useState<DateRange>("30d");

  const filtered = useMemo(
    () => records.filter((r) => withinRange(r.created_at, range)),
    [records, range]
  );

  const RANGES: { value: DateRange; label: string }[] = [
    { value: "7d",  label: "Últimos 7 dias" },
    { value: "30d", label: "Últimos 30 dias" },
    { value: "all", label: "Todos" },
  ];

  return (
    <div className="rounded-xl border border-border bg-board-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-3 flex-wrap">
        <h3 className="font-semibold text-board-text flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Histórico de Cotações
          {!isLoading && (
            <Badge variant="secondary" className="text-[10px]">
              {filtered.length}
            </Badge>
          )}
        </h3>

        <div className="flex items-center gap-2 ml-auto">
          {/* Range filter */}
          <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  range === r.value
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 gap-1 text-xs"
            disabled={filtered.length === 0}
            onClick={() => exportCsv(filtered)}
          >
            <Download className="h-3 w-3" />
            CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-40 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Truck className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Nenhuma cotação salva no período selecionado.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Data
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  CEP Destino
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Produto
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Qtd
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Transportadora
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Preço
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Prazo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono">
                    {r.to_cep.length === 8
                      ? `${r.to_cep.slice(0, 5)}-${r.to_cep.slice(5)}`
                      : r.to_cep}
                    {r.to_city && (
                      <span className="ml-1 text-muted-foreground font-sans">
                        ({r.to_city}/{r.to_state})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs max-w-[160px] truncate">
                    {r.product_ref ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-center">{r.quantity ?? 1}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {r.selected_carrier ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {r.selected_carrier}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-right">
                    {formatPrice(r.selected_price)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground text-right whitespace-nowrap">
                    {r.selected_days != null ? `${r.selected_days}d` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
