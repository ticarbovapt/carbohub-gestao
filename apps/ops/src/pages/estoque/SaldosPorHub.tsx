import { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Warehouse, Search, Tag, Download, Package, Eye, Loader2, ChevronDown } from "lucide-react";
import { StockProgressBar } from "@/components/estoque/StockProgressBar";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { useStock } from "@/hooks/useStock";
import { minStockStatus, minForHub } from "@/components/estoque/stockData";
import { toast } from "sonner";

const HUBS = [
  { id: "rn", code: "HUB-RN", name: "Hub Natal", city: "Natal", state: "RN" },
  { id: "sp", code: "HUB-SP", name: "CD SP LogHouse", city: "São Paulo", state: "SP" },
  { id: "spv", code: "HUB-SP-VENDAS", name: "CD SP Vendas", city: "São Paulo", state: "SP" },
];

// Export CSV (separador ';' + BOM → abre direto no Excel pt-BR).
function csvEscape(v: string | number): string {
  const s = String(v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCSV(filename: string, header: string[], rows: (string | number)[][]) {
  const lines = [header, ...rows].map((r) => r.map(csvEscape).join(";"));
  const BOM = "﻿";
  const blob = new Blob([BOM + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
const dateTag = () => new Date().toISOString().slice(0, 10);

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

  const exportGeral = () => {
    if (filtered.length === 0) { toast.info("Nada para exportar."); return; }
    const header = ["Código", "Produto", "Categoria", "Unidade", ...HUBS.map((h) => h.name), "Total", "Mínimo", "Status"];
    const rows = filtered.map((p) => {
      const qs = HUBS.map((h) => p.hubs[h.id] ?? 0);
      const total = qs.reduce((s, q) => s + q, 0);
      const min = HUBS.reduce((s, h) => s + minForHub(p, h.id), 0);
      return [p.product_code, p.name, p.category, p.stock_unit, ...qs, total, min, minStockStatus(total, min).label];
    });
    downloadCSV(`estoque_geral_${dateTag()}.csv`, header, rows);
    toast.success(`Exportado: ${rows.length} produto(s) — geral.`);
  };
  const exportHub = (hub: typeof HUBS[number]) => {
    if (filtered.length === 0) { toast.info("Nada para exportar."); return; }
    const header = ["Código", "Produto", "Categoria", "Unidade", "Saldo", "Mínimo", "Status"];
    const rows = filtered.map((p) => {
      const q = p.hubs[hub.id] ?? 0;
      const min = minForHub(p, hub.id);
      return [p.product_code, p.name, p.category, p.stock_unit, q, min, minStockStatus(q, min).label];
    });
    downloadCSV(`estoque_${hub.code}_${dateTag()}.csv`, header, rows);
    toast.success(`Exportado: ${rows.length} produto(s) — ${hub.name}.`);
  };

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 ml-auto"><Download className="h-4 w-4" /> Exportar <ChevronDown className="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Exportar saldos (CSV)</DropdownMenuLabel>
              <DropdownMenuItem onClick={exportGeral}>Geral — todos os hubs</DropdownMenuItem>
              <DropdownMenuSeparator />
              {HUBS.map((h) => (
                <DropdownMenuItem key={h.id} onClick={() => exportHub(h)}>{h.name}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
              const totalMin = visibleHubs.reduce((s, h) => s + minForHub(p, h.id), 0);
              const status = minStockStatus(totalQty, totalMin);
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
                    </div>

                    <div className="text-center px-5 pb-3">
                      <p className="text-3xl font-bold tabular-nums text-foreground leading-none">{totalQty.toLocaleString("pt-BR")}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{p.stock_unit} total · Mínimo: {totalMin.toLocaleString("pt-BR")} {p.stock_unit}</p>
                    </div>

                    <div className="border-t border-border px-5 py-4 space-y-3">
                      {hubStocks.map((h) => (
                        <StockProgressBar key={h.id} current={h.qty} safety={minForHub(p, h.id)} hubName={h.name} unit={p.stock_unit} />
                      ))}
                    </div>
                  </CarboCardContent>
                </CarboCard>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center">Saldo real por hub (warehouse_stock). Status pelo estoque mínimo (segurança); movimentações e entradas são feitas em Suprimentos.</p>
      </div>
    </div>
  );
}
