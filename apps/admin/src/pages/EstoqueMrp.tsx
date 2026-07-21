import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Boxes, Package, AlertTriangle, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useMrpProductsAdmin, type MrpProductAdmin } from "@/hooks/useMrpProductsAdmin";

// ─────────────────────────────────────────────────────────────────────────────
// Espelho SOMENTE LEITURA do "Catálogo MRP" do Carbo Ops, com colunas de custo
// (unit_cost) e valor mobilizado em estoque, para acompanhamento de gestão/
// financeiro. Sem criar/editar/excluir — quem cadastra produto/custo é o Ops.
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_FILTER_TABS = [
  { key: "all", label: "Todos" },
  { key: "Produto Final", label: "Produto Final" },
  { key: "Semi-acabado", label: "Semi-acabado" },
  { key: "Insumo", label: "Insumos" },
  { key: "Embalagem", label: "Embalagem" },
  { key: "Carbonatação", label: "Carbonatação" },
];
const CATEGORY_CLS: Record<string, string> = {
  "Produto Final": "bg-emerald-700 text-white border-0",
  "Semi-acabado": "bg-teal-600 text-white border-0",
  "Insumo": "bg-blue-600 text-white border-0",
  "Embalagem": "bg-amber-500 text-white border-0",
  "Carbonatação": "bg-purple-600 text-white border-0",
  "Outro": "bg-gray-500 text-white border-0",
};
function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-muted-foreground text-sm">—</span>;
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", CATEGORY_CLS[category] ?? CATEGORY_CLS["Outro"])}>{category}</span>;
}

// Estoque = SEMPRE a soma dos hubs (warehouse_stock é a fonte de verdade;
// nunca cair no current_stock_qty legado — ver CLAUDE.md).
const hubTotal = (p: MrpProductAdmin) => p.hubs.reduce((s, h) => s + h.quantity, 0);

function StockRiskBadge({ p }: { p: MrpProductAdmin }) {
  const total = hubTotal(p);
  const hasZero = p.hubs.some((h) => h.quantity === 0);
  if (p.safety_stock_qty > 0 && total < p.safety_stock_qty) return <CarboBadge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Baixo</CarboBadge>;
  if (hasZero) return <CarboBadge variant="warning" className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Risco em HUB</CarboBadge>;
  return <CarboBadge variant="success" className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> OK</CarboBadge>;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

function Tile({ label, value, tone, badge }: { label: string; value: string; tone?: string; badge?: React.ReactNode }) {
  return (
    <CarboCard>
      <CarboCardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          {badge}
        </div>
        <p className={cn("text-xl font-bold tabular-nums", tone)}>{value}</p>
      </CarboCardContent>
    </CarboCard>
  );
}

export default function EstoqueMrp() {
  const { canAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: products = [], isLoading, error } = useMrpProductsAdmin();

  if (!canAdmin) return <main className="p-4 lg:p-6"><RestrictedNotice /></main>;

  const filtered = products.filter((p) => {
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return p.product_code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s);
  });

  // Resumo — SEMPRE sobre o catálogo inteiro (não filtrado por busca/categoria).
  const totalProdutos = products.length;
  const valorTotalMobilizado = products.reduce((sum, p) => sum + p.unit_cost * hubTotal(p), 0);
  const semCusto = products.filter((p) => p.unit_cost === 0 && hubTotal(p) > 0).length;

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Estoque & Custos"
          description="Catálogo MRP (Ops) — valor mobilizado em estoque, somente leitura"
          icon={Boxes}
        />

        {/* Resumo — calculado sobre o catálogo inteiro, independente dos filtros abaixo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Tile label="Produtos no catálogo" value={String(totalProdutos)} />
          <Tile label="Valor total mobilizado" value={brl(valorTotalMobilizado)} tone="text-carbo-green" />
          <Tile
            label="Produtos sem custo cadastrado"
            value={String(semCusto)}
            tone={semCusto > 0 ? "text-amber-500" : undefined}
            badge={semCusto > 0 ? <CarboBadge variant="warning">valor subestimado</CarboBadge> : undefined}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="max-w-md flex-1 min-w-[200px]"><CarboSearchInput placeholder="Buscar por código ou nome..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="flex items-center gap-1 flex-wrap">
            {CATEGORY_FILTER_TABS.map((tab) => (
              <button key={tab.key} onClick={() => setCategoryFilter(tab.key)} className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition-colors", categoryFilter === tab.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>{tab.label}</button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <CarboCard><div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando catálogo…</div></CarboCard>
        ) : error ? (
          <CarboCard><CarboEmptyState icon={AlertTriangle} title="Erro ao carregar" description="Não foi possível buscar os produtos. Tente novamente." /></CarboCard>
        ) : filtered.length === 0 ? (
          <CarboCard><CarboEmptyState icon={Package} title="Nenhum produto encontrado" description={products.length === 0 ? "Nenhum produto ativo no catálogo MRP." : "Ajuste os filtros de busca."} /></CarboCard>
        ) : (
          <CarboCard padding="none">
            <div className="overflow-x-auto">
              <CarboTable>
                <CarboTableHeader>
                  <CarboTableRow>
                    <CarboTableHead>Produto</CarboTableHead><CarboTableHead>Código</CarboTableHead><CarboTableHead>Categoria</CarboTableHead>
                    <CarboTableHead className="text-right">Estoque Total</CarboTableHead>
                    <CarboTableHead className="text-right">Custo unit.</CarboTableHead>
                    <CarboTableHead className="text-right">Valor em estoque</CarboTableHead>
                    <CarboTableHead>Status</CarboTableHead><CarboTableHead>Hubs</CarboTableHead>
                  </CarboTableRow>
                </CarboTableHeader>
                <CarboTableBody>
                  {filtered.map((p) => {
                    const total = hubTotal(p);
                    const valorEstoque = p.unit_cost * total;
                    return (
                      <CarboTableRow key={p.id}>
                        <CarboTableCell className="font-medium text-foreground">{p.name}</CarboTableCell>
                        <CarboTableCell className="font-mono text-xs text-muted-foreground">{p.product_code}</CarboTableCell>
                        <CarboTableCell><CategoryBadge category={p.category} /></CarboTableCell>
                        <CarboTableCell className="text-right font-semibold tabular-nums">{total.toLocaleString("pt-BR")} {p.stock_unit}</CarboTableCell>
                        <CarboTableCell className={cn("text-right tabular-nums", p.unit_cost === 0 ? "text-muted-foreground" : "text-foreground")}>{brl(p.unit_cost)}</CarboTableCell>
                        <CarboTableCell className="text-right font-bold tabular-nums">{brl(valorEstoque)}</CarboTableCell>
                        <CarboTableCell><StockRiskBadge p={p} /></CarboTableCell>
                        <CarboTableCell>
                          <div className="space-y-0.5 text-xs text-muted-foreground">
                            {p.hubs.map((h) => (
                              <div key={h.warehouse_name} className="flex items-center gap-2">
                                <span className="min-w-[52px]">{h.warehouse_name}</span>
                                <span className={cn("font-medium tabular-nums", h.quantity === 0 ? "text-destructive" : "text-foreground")}>{h.quantity.toLocaleString("pt-BR")} {p.stock_unit}</span>
                              </div>
                            ))}
                          </div>
                        </CarboTableCell>
                      </CarboTableRow>
                    );
                  })}
                </CarboTableBody>
              </CarboTable>
            </div>
          </CarboCard>
        )}
      </div>
    </div>
  );
}
