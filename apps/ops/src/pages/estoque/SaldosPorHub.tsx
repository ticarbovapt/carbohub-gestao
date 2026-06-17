import { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse, Search, Tag, Download, Activity, Shield, Calendar, Package, Eye, Loader2 } from "lucide-react";
import { StockProgressBar } from "@/components/estoque/StockProgressBar";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { useStock } from "@/hooks/useStock";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const HUBS = [
  { id: "rn", code: "HUB-RN", name: "Hub Natal", city: "Natal", state: "RN" },
  { id: "sp", code: "HUB-SP", name: "CD SP LogHouse", city: "São Paulo", state: "SP" },
  { id: "spv", code: "HUB-SP-VENDAS", name: "CD SP Vendas", city: "São Paulo", state: "SP" },
];

function coverageStatus(days: number | null): { label: string; variant: "destructive" | "warning" | "success" | "info" | "secondary" } {
  if (days === null) return { label: "Sem consumo", variant: "secondary" };
  if (days < 7) return { label: "Ruptura iminente", variant: "destructive" };
  if (days < 15) return { label: "Atenção", variant: "warning" };
  if (days < 30) return { label: "Estável", variant: "warning" };
  if (days < 60) return { label: "Saudável", variant: "success" };
  return { label: "Excedente", variant: "info" };
}

export default function SaldosPorHub() {
  const [search, setSearch] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { data: products = [], isLoading, error } = useStock();

  const filtered = useMemo(() => products.filter((p) => {
    if (selectedCategory !== "all" && p.category !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.product_code.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [products, search, selectedCategory]);

  const visibleHubs = selectedWarehouse === "all" ? HUBS : HUBS.filter((h) => h.id === selectedWarehouse);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-4 max-w-[1500px] mx-auto">
        <CarboPageHeader title="Estoque — Saldos por Hub" description="Saldo de produtos e insumos por centro de distribuição" icon={Warehouse} />

        {/* Espelho somente leitura — a edição/operação de estoque vive em Suprimentos */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-500">
          <Eye className="h-4 w-4 shrink-0" />
          <span>Visualização consolidada (somente leitura). Movimentações e entradas são feitas em <strong>Suprimentos</strong>; quantidades de produção na área <strong>Produção</strong>.</span>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-xs flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
            <SelectTrigger className="w-[220px]"><Warehouse className="h-4 w-4 mr-2 text-muted-foreground" /><SelectValue placeholder="Centro de Distribuição" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os CDs</SelectItem>
              {HUBS.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} — {w.city}/{w.state}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[170px]"><Tag className="h-4 w-4 mr-2 text-muted-foreground" /><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              <SelectItem value="Produto Final">Produto Final</SelectItem>
              <SelectItem value="Insumo">Insumo</SelectItem>
              <SelectItem value="Embalagem">Embalagem</SelectItem>
              <SelectItem value="Carbonatação">Carbonatação</SelectItem>
              <SelectItem value="Outro">Outro</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5 ml-auto" onClick={() => toast("Exportar Excel (em breve)")}><Download className="h-4 w-4" /> Exportar Excel</Button>
        </div>

        {/* Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando estoque…</div>
        ) : error ? (
          <CarboCard><CarboCardContent><CarboEmptyState icon={Package} title="Erro ao carregar" description="Não foi possível buscar o estoque." /></CarboCardContent></CarboCard>
        ) : filtered.length === 0 ? (
          <CarboCard><CarboCardContent><CarboEmptyState icon={Package} title="Sem dados" description="Nenhum produto em estoque." /></CarboCardContent></CarboCard>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => {
              const hubStocks = visibleHubs.map((h) => ({ id: h.id, name: h.name, qty: p.hubs[h.id] ?? 0 }));
              const totalQty = hubStocks.reduce((s, h) => s + h.qty, 0);
              const cobertura = p.giroMedio > 0 ? Math.round(totalQty / p.giroMedio) : null;
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
                    </div>

                    <div className="text-center px-5 pb-3">
                      <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{totalQty.toLocaleString("pt-BR")}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{p.stock_unit} total · Segurança: {p.safety_stock_qty.toLocaleString("pt-BR")} {p.stock_unit}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-px bg-border mx-5 rounded-lg overflow-hidden mb-4">
                      <div className="bg-card px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5"><Activity className="h-3 w-3 text-muted-foreground" /></div>
                        <p className="text-sm font-bold tabular-nums text-foreground">{p.giroMedio > 0 ? p.giroMedio.toFixed(1) : "—"}</p>
                        <p className="text-[9px] text-muted-foreground leading-tight">un/dia</p>
                      </div>
                      <div className="bg-card px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5"><Shield className="h-3 w-3 text-muted-foreground" /></div>
                        <p className="text-sm font-bold tabular-nums text-foreground">{cobertura !== null ? `${cobertura}d` : "—"}</p>
                        <p className="text-[9px] text-muted-foreground leading-tight">cobertura</p>
                      </div>
                      <div className="bg-card px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5"><Calendar className="h-3 w-3 text-muted-foreground" /></div>
                        <p className="text-sm font-bold tabular-nums text-foreground">{ruptura ? format(ruptura, "dd/MM", { locale: ptBR }) : "—"}</p>
                        <p className="text-[9px] text-muted-foreground leading-tight">ruptura</p>
                      </div>
                    </div>

                    <div className="border-t border-border px-5 py-4 space-y-3">
                      {hubStocks.map((h) => (
                        <StockProgressBar key={h.id} current={h.qty} safety={p.safety_stock_qty} hubName={h.name} unit={p.stock_unit} />
                      ))}
                    </div>
                  </CarboCardContent>
                </CarboCard>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center">Saldo real por hub (warehouse_stock). Giro/cobertura dependem do histórico de consumo (fase futura); movimentações e entradas são feitas em Suprimentos.</p>
      </div>
    </div>
  );
}
