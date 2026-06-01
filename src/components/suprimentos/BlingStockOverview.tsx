import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CarboButton } from "@/components/ui/carbo-button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Search, Lock, Cloud } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useBlingStock, useSyncBlingStock } from "@/hooks/useBlingStock";

/**
 * CD virtual "CD Bling" — espelho SOMENTE LEITURA do estoque NO BLING.
 * Mostra os produtos exatamente como vêm do Bling (bling_products), com o
 * saldo do Bling. NÃO é o estoque do sistema — é um reflexo fiel do Bling.
 */
export function BlingStockOverview() {
  const [search, setSearch] = useState("");
  const { data: bling, isLoading } = useBlingStock();
  const syncStock = useSyncBlingStock();

  const allRows = bling?.rows ?? [];
  const rows = allRows.filter((r) =>
    !search ||
    (r.nome || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.codigo || "").toLowerCase().includes(search.toLowerCase()),
  );

  const totalSaldo = rows.reduce((s, r) => s + (Number(r.estoque_atual) || 0), 0);
  const totalReservado = rows.reduce((s, r) => s + (Number(r.estoque_reservado) || 0), 0);

  return (
    <div className="space-y-4">
      {/* Cabeçalho: aviso read-only + sync */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <Cloud className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              CD Bling — espelho do estoque no Bling
              <Badge variant="secondary" className="gap-1 text-[10px]"><Lock className="h-3 w-3" /> Somente leitura</Badge>
            </p>
            <p className="text-xs text-muted-foreground">
              Reflete os produtos e saldos do Bling. {bling?.lastSynced
                ? `Última sincronização: ${format(new Date(bling.lastSynced), "dd/MM/yy HH:mm", { locale: ptBR })}`
                : "Ainda não sincronizado."}
            </p>
          </div>
        </div>
        <CarboButton
          size="sm"
          variant="outline"
          disabled={syncStock.isPending}
          onClick={() => syncStock.mutate()}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncStock.isPending ? "animate-spin" : ""}`} />
          Sincronizar estoque do Bling
        </CarboButton>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Produtos no Bling</p>
          <p className="text-xl font-bold">{isLoading ? "—" : rows.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Saldo total (Bling)</p>
          <p className="text-xl font-bold">{isLoading ? "—" : totalSaldo}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Reservado (Bling)</p>
          <p className="text-xl font-bold">{isLoading ? "—" : totalReservado}</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produto no Bling…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : allRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-10 text-center">
          <Cloud className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium">Nenhum produto sincronizado do Bling ainda.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Clique em "Sincronizar estoque do Bling" para puxar os produtos e saldos de lá.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum produto encontrado para esta busca.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => (
            <div key={r.bling_id} className="rounded-xl border border-border bg-card p-4">
              <div className="min-w-0">
                <p className="font-semibold truncate">{r.nome || "—"}</p>
                <p className="text-xs text-muted-foreground">{r.codigo || "sem código"}</p>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold tabular-nums">{Number(r.estoque_atual) || 0}</p>
                  <p className="text-[11px] text-muted-foreground">saldo no Bling</p>
                </div>
                {(Number(r.estoque_reservado) || 0) > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    reservado: <span className="font-medium text-foreground">{r.estoque_reservado}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
