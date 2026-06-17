import { useMemo, useState } from "react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StockProgressBar } from "@/components/estoque/StockProgressBar";
import { Search, Tag, Activity, Shield, Calendar, Package, Pencil, Plus, Loader2 } from "lucide-react";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { coverageStatus, type Hub } from "@/components/estoque/stockData";
import { useStock } from "@/hooks/useStock";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { NovaEntradaDialog } from "@/components/estoque/NovaEntradaDialog";
import { AjustarEstoqueDialog, type AjusteTarget } from "@/components/estoque/AjustarEstoqueDialog";

// Visão de estoque de UM hub. `editable` decide se mostra ações de edição
// (Suprimentos) ou se é só leitura (Estoque).
export function StockView({ hub, editable }: { hub: Hub; editable: boolean }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [novaEntradaOpen, setNovaEntradaOpen] = useState(false);
  const [ajuste, setAjuste] = useState<AjusteTarget | null>(null);

  const { data: products = [], isLoading, error } = useStock();

  const filtered = useMemo(() => products.filter((p) => {
    if (category !== "all" && p.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.product_code.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [products, search, category]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[170px]"><Tag className="h-4 w-4 mr-2 text-muted-foreground" /><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            <SelectItem value="Produto Final">Produto Final</SelectItem>
            <SelectItem value="Insumo">Insumo</SelectItem>
            <SelectItem value="Embalagem">Embalagem</SelectItem>
            <SelectItem value="Carbonatação">Carbonatação</SelectItem>
          </SelectContent>
        </Select>
        {editable && <Button size="sm" className="gap-1.5 ml-auto bg-carbo-green hover:bg-carbo-green/90 text-white" onClick={() => setNovaEntradaOpen(true)}><Plus className="h-4 w-4" /> Nova Entrada</Button>}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando estoque…</div>
      ) : error ? (
        <CarboCard><CarboCardContent><CarboEmptyState icon={Package} title="Erro ao carregar" description="Não foi possível buscar o estoque." /></CarboCardContent></CarboCard>
      ) : (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => {
          const qty = p.hubs[hub.id] ?? 0;
          const cobertura = p.giroMedio > 0 ? Math.round(qty / p.giroMedio) : null;
          const ruptura = p.giroMedio > 0 && cobertura !== null ? addDays(new Date(), cobertura) : null;
          const cov = coverageStatus(cobertura);
          return (
            <CarboCard key={p.id} variant="default" padding="none">
              <CarboCardContent>
                <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="font-semibold text-sm text-foreground leading-tight truncate">{p.name}</h3>
                      <CarboBadge variant={cov.variant} size="sm">{cov.label}</CarboBadge>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono tracking-wide">{p.product_code}<span className="ml-2 font-sans">· {p.category}</span></p>
                  </div>
                  {editable && <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setAjuste({ name: p.name, product_code: p.product_code, current: qty, unit: p.stock_unit })}><Pencil className="h-3.5 w-3.5" /></Button>}
                </div>

                <div className="text-center px-5 pb-3">
                  <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{qty.toLocaleString("pt-BR")}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{p.stock_unit} em {hub.label} · Segurança: {p.safety_stock_qty.toLocaleString("pt-BR")} {p.stock_unit}</p>
                </div>

                <div className="grid grid-cols-3 gap-px bg-border mx-5 rounded-lg overflow-hidden mb-4">
                  <div className="bg-card px-3 py-2.5 text-center"><div className="flex items-center justify-center gap-1 mb-0.5"><Activity className="h-3 w-3 text-muted-foreground" /></div><p className="text-sm font-bold tabular-nums">{p.giroMedio > 0 ? p.giroMedio.toFixed(1) : "—"}</p><p className="text-[9px] text-muted-foreground leading-tight">un/dia</p></div>
                  <div className="bg-card px-3 py-2.5 text-center"><div className="flex items-center justify-center gap-1 mb-0.5"><Shield className="h-3 w-3 text-muted-foreground" /></div><p className="text-sm font-bold tabular-nums">{cobertura !== null ? `${cobertura}d` : "—"}</p><p className="text-[9px] text-muted-foreground leading-tight">cobertura</p></div>
                  <div className="bg-card px-3 py-2.5 text-center"><div className="flex items-center justify-center gap-1 mb-0.5"><Calendar className="h-3 w-3 text-muted-foreground" /></div><p className="text-sm font-bold tabular-nums">{ruptura ? format(ruptura, "dd/MM", { locale: ptBR }) : "—"}</p><p className="text-[9px] text-muted-foreground leading-tight">ruptura</p></div>
                </div>

                <div className="border-t border-border px-5 py-4">
                  <StockProgressBar current={qty} safety={p.safety_stock_qty} hubName={hub.label} unit={p.stock_unit} onClick={editable ? () => setAjuste({ name: p.name, product_code: p.product_code, current: qty, unit: p.stock_unit }) : undefined} />
                </div>
              </CarboCardContent>
            </CarboCard>
          );
        })}
        {filtered.length === 0 && <CarboCard className="sm:col-span-2 xl:col-span-3"><CarboCardContent><CarboEmptyState icon={Package} title="Sem dados" description="Nenhum produto em estoque para este hub." /></CarboCardContent></CarboCard>}
      </div>
      )}

      {editable && (
        <>
          <NovaEntradaDialog hub={hub} open={novaEntradaOpen} onOpenChange={setNovaEntradaOpen} />
          <AjustarEstoqueDialog target={ajuste} hub={hub} open={ajuste !== null} onOpenChange={(v) => !v && setAjuste(null)} />
        </>
      )}
    </div>
  );
}
