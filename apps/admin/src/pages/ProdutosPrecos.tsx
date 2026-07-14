import { useMemo, useState } from "react";
import { Tags, AlertTriangle, Search, Check } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useFinalProducts, useSetProductPrice, type FinalProduct } from "@/hooks/useProductPrices";

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

// Linha editável: mantém o valor local e só habilita "Salvar" quando muda.
function PriceRow({ p }: { p: FinalProduct }) {
  const setPrice = useSetProductPrice();
  const [val, setVal] = useState<string>(p.sale_price == null ? "" : String(p.sale_price));
  const original = p.sale_price == null ? "" : String(p.sale_price);
  const dirty = val.trim() !== original;
  const save = () => setPrice.mutate({ productId: p.id, price: val.trim() === "" ? null : Number(val) });

  return (
    <tr className="border-b last:border-0 hover:bg-accent/40">
      <td className="px-4 py-2">
        <div className="font-medium truncate max-w-[280px]">{p.name}</div>
        <div className="text-[10px] text-muted-foreground font-mono">{p.product_code || "—"}</div>
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground">{p.stock_unit || "—"}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">R$</span>
          <Input type="number" min={0} step="0.01" value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && dirty) save(); }}
            placeholder="—" className="w-28 h-8" />
        </div>
      </td>
      <td className="px-4 py-2 text-[11px] text-muted-foreground whitespace-nowrap">
        {p.sale_price_updated_at ? <>por {p.updated_by_name} · {fmtDate(p.sale_price_updated_at)}</> : "nunca definido"}
      </td>
      <td className="px-4 py-2 text-right">
        <CarboButton size="sm" disabled={!dirty || setPrice.isPending} onClick={save}>
          <Check className="h-3.5 w-3.5 mr-1" /> Salvar
        </CarboButton>
      </td>
    </tr>
  );
}

export default function ProdutosPrecos() {
  const { canAdmin } = useAuth();
  const { data: produtos = [], isLoading } = useFinalProducts();
  const [q, setQ] = useState("");

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return produtos;
    return produtos.filter((p) => p.name.toLowerCase().includes(t) || (p.product_code ?? "").toLowerCase().includes(t));
  }, [produtos, q]);

  const semPreco = produtos.filter((p) => p.sale_price == null).length;

  if (!canAdmin) {
    return <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8"><RestrictedNotice /></main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-5">
      <CarboPageHeader
        icon={Tags}
        title="Tabela de preços"
        description="Preço fixo por produto final. No futuro a tela de venda usará esses valores em vez do preço digitado à mão."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto ou código…" className="pl-9" />
        </div>
        <p className="text-xs text-muted-foreground">
          {produtos.length} produtos{semPreco > 0 ? ` · ${semPreco} sem preço definido` : " · todos com preço"}
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : filtrados.length === 0 ? (
        <CarboEmptyState icon={Tags} title="Nenhum produto" description="Não há produtos finais para o filtro atual." />
      ) : (
        <CarboCard>
          <CarboCardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Unidade</th>
                  <th className="px-4 py-2 font-medium">Preço fixo</th>
                  <th className="px-4 py-2 font-medium">Atualizado</th>
                  <th className="px-4 py-2 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => <PriceRow key={p.id} p={p} />)}
              </tbody>
            </table>
          </CarboCardContent>
        </CarboCard>
      )}
    </main>
  );
}
