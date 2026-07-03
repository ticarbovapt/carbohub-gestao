import { useMemo, useState } from "react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StockProgressBar } from "@/components/estoque/StockProgressBar";
import { Search, Tag, Package, Pencil, Plus, Loader2, ChevronDown } from "lucide-react";
import { minStockStatus, minForHub, type Hub } from "@/components/estoque/stockData";
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

  // ── Agrupamento por categoria (Insumo, Produto Final, …) ───────────────────
  const CAT_ORDER = ["Insumo", "Matéria-Prima", "Produto Final", "Embalagem"];
  const grupos = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const cat = p.category || "Sem categoria";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(p);
    }
    return Array.from(m.keys())
      .sort((a, b) => {
        const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.localeCompare(b);
      })
      .map((cat) => {
        const items = m.get(cat)!;
        const low = items.filter((p) => (p.hubs[hub.id] ?? 0) < minForHub(p, hub.id)).length;
        return { category: cat, items, low };
      });
  }, [filtered, hub.id]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("ops_estoque_cats_collapsed") || "{}"); } catch { return {}; }
  });
  const persistCollapsed = (next: Record<string, boolean>) => {
    setCollapsed(next);
    try { localStorage.setItem("ops_estoque_cats_collapsed", JSON.stringify(next)); } catch { /* ignore */ }
  };
  const toggleCat = (cat: string) => persistCollapsed({ ...collapsed, [cat]: !collapsed[cat] });
  const setAllCats = (val: boolean) => persistCollapsed(Object.fromEntries(grupos.map((g) => [g.category, val])));

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
      ) : filtered.length === 0 ? (
        <CarboCard className="sm:col-span-2 xl:col-span-3"><CarboCardContent><CarboEmptyState icon={Package} title="Sem dados" description="Nenhum produto em estoque para este hub." /></CarboCardContent></CarboCard>
      ) : (
      <div className="space-y-5">
        <div className="flex justify-end gap-3 text-xs">
          <button onClick={() => setAllCats(false)} className="text-muted-foreground hover:text-foreground transition-colors">Expandir tudo</button>
          <span className="text-muted-foreground/40">·</span>
          <button onClick={() => setAllCats(true)} className="text-muted-foreground hover:text-foreground transition-colors">Recolher tudo</button>
        </div>
        {grupos.map((g) => (
          <div key={g.category}>
            <button onClick={() => toggleCat(g.category)} className="w-full flex items-center gap-2 py-2 border-b border-border text-left">
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed[g.category] ? "-rotate-90" : ""}`} />
              <span className="font-semibold text-sm text-foreground">{g.category}</span>
              <span className="text-xs text-muted-foreground">
                {g.items.length} {g.items.length === 1 ? "item" : "itens"}
                {g.low > 0 && <span className="text-destructive font-medium"> · {g.low} em baixa</span>}
              </span>
            </button>
            {!collapsed[g.category] && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mt-3">
                {g.items.map((p) => {
          const qty = p.hubs[hub.id] ?? 0;
          const min = minForHub(p, hub.id);
          const status = minStockStatus(qty, min);
          return (
            <CarboCard key={p.id} variant="default" padding="none">
              <CarboCardContent>
                <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="font-semibold text-sm text-foreground leading-tight truncate">{p.name}</h3>
                      <CarboBadge variant={status.variant} size="sm">{status.label}</CarboBadge>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono tracking-wide">{p.product_code}<span className="ml-2 font-sans">· {p.category}</span></p>
                  </div>
                  {editable && <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setAjuste({ id: p.id, name: p.name, product_code: p.product_code, current: qty, unit: p.stock_unit })}><Pencil className="h-3.5 w-3.5" /></Button>}
                </div>

                <div className="text-center px-5 pb-3">
                  <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{qty.toLocaleString("pt-BR")}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{p.stock_unit} em {hub.label} · Mínimo: {min.toLocaleString("pt-BR")} {p.stock_unit}</p>
                </div>

                <div className="border-t border-border px-5 py-4">
                  <StockProgressBar current={qty} safety={min} hubName={hub.label} unit={p.stock_unit} onClick={editable ? () => setAjuste({ id: p.id, name: p.name, product_code: p.product_code, current: qty, unit: p.stock_unit }) : undefined} />
                </div>
              </CarboCardContent>
            </CarboCard>
          );
                })}
              </div>
            )}
          </div>
        ))}
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
