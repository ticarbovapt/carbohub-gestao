import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CarboButton } from "@/components/ui/carbo-button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Search, Lock, Cloud } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useBlingStock, useSyncBlingStock } from "@/hooks/useBlingStock";

interface MrpProduct {
  id: string;
  product_code: string | null;
  name: string;
  category: string | null;
}

/**
 * CD virtual "CD Bling" — espelho SOMENTE LEITURA do estoque no Bling.
 * Mostra os produtos do sistema (mrp_products) com o saldo vindo do Bling,
 * casando por código (mrp_products.product_code = bling_products.codigo).
 */
export function BlingStockOverview() {
  const [search, setSearch] = useState("");
  const { data: bling, isLoading: blingLoading } = useBlingStock();
  const syncStock = useSyncBlingStock();

  const { data: products, isLoading: prodLoading } = useQuery({
    queryKey: ["mrp-products-for-bling"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mrp_products")
        .select("id, product_code, name, category")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as MrpProduct[];
    },
  });

  const isLoading = blingLoading || prodLoading;
  const byCode = bling?.byCode;

  const rows = (products || [])
    .map((p) => {
      const match = p.product_code ? byCode?.get(p.product_code.toUpperCase().trim()) : undefined;
      return { ...p, bling: match };
    })
    .filter((r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.product_code || "").toLowerCase().includes(search.toLowerCase()),
    );

  const totalSaldo = rows.reduce((s, r) => s + (r.bling?.estoque_atual ?? 0), 0);
  const semBling = rows.filter((r) => !r.bling).length;

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
              CD Bling — espelho do estoque
              <Badge variant="secondary" className="gap-1 text-[10px]"><Lock className="h-3 w-3" /> Somente leitura</Badge>
            </p>
            <p className="text-xs text-muted-foreground">
              Reflete o saldo do Bling. {bling?.lastSynced
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
          <p className="text-xs text-muted-foreground">Produtos</p>
          <p className="text-xl font-bold">{isLoading ? "—" : rows.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Saldo total (Bling)</p>
          <p className="text-xl font-bold">{isLoading ? "—" : totalSaldo}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Sem vínculo no Bling</p>
          <p className="text-xl font-bold text-amber-500">{isLoading ? "—" : semBling}</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produto…"
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
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhum produto encontrado.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.product_code || "—"}{r.category ? ` · ${r.category}` : ""}
                  </p>
                </div>
                {!r.bling && (
                  <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 shrink-0">
                    Sem Bling
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold tabular-nums">{r.bling?.estoque_atual ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">saldo no Bling</p>
                </div>
                {r.bling && (r.bling.estoque_reservado ?? 0) > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    reservado: <span className="font-medium text-foreground">{r.bling.estoque_reservado}</span>
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
