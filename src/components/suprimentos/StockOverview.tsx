import { useState, useMemo, useEffect } from "react";
import { Package, Search, Pencil, Save, X, Warehouse, TrendingUp, TrendingDown, Calendar, BarChart3, Shield, Activity, Download, ArrowDownToLine, Tag, Info, Settings2, Layers } from "lucide-react";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCanManageStock } from "@/hooks/useActionPermissions";
import { useCreateStockMovement } from "@/hooks/useStockMovements";
import { useProductMovements30d } from "@/hooks/useProductMovements30d";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StockProgressBar } from "./StockProgressBar";
import { MiniTrendChart } from "./MiniTrendChart";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EditingProduct {
  id: string;
  name: string;
  product_code: string;
  current_qty: number;
  safety_stock_qty: number;
  stock_unit: string;
  warehouse_stock_id?: string;
  selectedHubId?: string;
}

type CoverageStatus = {
  label: string;
  variant: "destructive" | "warning" | "success" | "info" | "secondary";
};

// Equivalência mostrada no card: "multiply" = produto é kit, mostra unidades (×fator);
// "divide" = produto é unidade, mostra quantos kits (÷fator).
type EquivCfg = { mode: "multiply" | "divide"; factor: number };
type DisplayCfg = { hidden: string[]; equiv: Record<string, EquivCfg> };

function getCoverageStatus(days: number | null): CoverageStatus {
  if (days === null) return { label: "Sem consumo", variant: "secondary" };
  if (days < 7) return { label: "Ruptura iminente", variant: "destructive" };
  if (days < 15) return { label: "Atenção", variant: "warning" };
  if (days < 30) return { label: "Estável", variant: "warning" };
  if (days < 60) return { label: "Saudável", variant: "success" };
  return { label: "Excedente", variant: "info" };
}

interface StockOverviewProps {
  hubView?: "sp" | "rn";
}

export function StockOverview({ hubView = "sp" }: StockOverviewProps) {
  const isSP = hubView === "sp";
  const [search, setSearch] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>(isSP ? "Produto Final" : "all");
  const [editing, setEditing] = useState<EditingProduct | null>(null);
  const [editHubId, setEditHubId] = useState<string>("");
  const [newQty, setNewQty] = useState("");
  const [newSafetyQty, setNewSafetyQty] = useState("");
  const [reason, setReason] = useState("");
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [entradaProductId, setEntradaProductId] = useState("");
  const [entradaHubId, setEntradaHubId] = useState("");
  const [entradaQty, setEntradaQty] = useState("");
  const [entradaReason, setEntradaReason] = useState("");
  const [entradaSaving, setEntradaSaving] = useState(false);
  const createMovement = useCreateStockMovement();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = useCanManageStock();

  // ── Preferências de exibição (só front, salvas no navegador) ────────────────
  // hidden: códigos de produto que não aparecem.
  // equiv:  equivalência mostrada no card (kit↔unidades) por código de produto.
  const [displayCfg, setDisplayCfg] = useState<DisplayCfg>({ hidden: [], equiv: {} });
  const [displayOpen, setDisplayOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`suprimentos_display_${hubView}`);
      setDisplayCfg(raw ? JSON.parse(raw) : { hidden: [], equiv: {} });
    } catch { setDisplayCfg({ hidden: [], equiv: {} }); }
  }, [hubView]);

  const saveDisplayCfg = (next: DisplayCfg) => {
    setDisplayCfg(next);
    try { localStorage.setItem(`suprimentos_display_${hubView}`, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Auto-seleciona o hub correto conforme a view
  useEffect(() => {
    if (!warehouses) return;
    const code = hubView === "sp" ? "HUB-SP" : "HUB-RN";
    const hub = warehouses.find(w => w.code === code);
    if (hub) setSelectedWarehouse(hub.id);
    setSelectedCategory(hubView === "sp" ? "Produto Final" : "all");
  }, [warehouses, hubView]);

  const { data: products, isLoading } = useQuery({
    queryKey: ["mrp-products-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mrp_products")
        .select("id, product_code, name, current_stock_qty, min_order_qty, safety_stock_qty, stock_unit, category, stock_updated_at")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: warehouseStock } = useQuery({
    queryKey: ["warehouse-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const productIds = useMemo(() => (products || []).map(p => p.id), [products]);
  const { data: movements30d } = useProductMovements30d(productIds);

  const filtered = (products || []).filter(p => {
    if (displayCfg.hidden.includes(p.product_code)) return false;
    if (selectedCategory !== "all" && p.category !== selectedCategory) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return p.name.toLowerCase().includes(s) || p.product_code.toLowerCase().includes(s);
  });

  // Produtos configuráveis no diálogo de exibição (mesma categoria da view).
  const configurableProducts = (products || []).filter(
    p => selectedCategory === "all" || p.category === selectedCategory
  );

  const handleExport = () => {
    const exportWarehouses = selectedWarehouse === "all"
      ? (warehouses || [])
      : (warehouses || []).filter(w => w.id === selectedWarehouse);
    const rows = filtered.map(p => {
      const hubStocks = exportWarehouses.map(w => {
        const ws = warehouseStock?.find(s => s.product_id === p.id && s.warehouse_id === w.id);
        return { name: w.name, qty: ws?.quantity || 0 };
      });
      const totalQty = hubStocks.reduce((s, h) => s + h.qty, 0);
      const row: Record<string, unknown> = {
        Código: p.product_code,
        Nome: p.name,
        Categoria: p.category || "",
        "Estoque Total": totalQty,
        Unidade: p.stock_unit,
        "Estoque Segurança": p.safety_stock_qty || 0,
        "Última Atualização": p.stock_updated_at ? new Date(p.stock_updated_at).toLocaleDateString("pt-BR") : "",
      };
      hubStocks.forEach(h => { row[`Hub: ${h.name}`] = h.qty; });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estoque");
    XLSX.writeFile(wb, `estoque_suprimentos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const openEdit = (p: (typeof products extends (infer T)[] ? T : never), hubId?: string) => {
    // Usa o hub já selecionado na view (nunca usa warehouses[0] pois a ordem alfabética pode ser RN antes de SP)
    const defaultHub = hubId || (selectedWarehouse !== "all" ? selectedWarehouse : (warehouses?.find(w => w.code === (isSP ? "HUB-SP" : "HUB-RN"))?.id ?? warehouses?.[0]?.id ?? ""));
    const ws = defaultHub
      ? warehouseStock?.find(s => s.product_id === p.id && s.warehouse_id === defaultHub)
      : undefined;
    // warehouse_stock é sempre a fonte de verdade — nunca usa current_stock_qty como fallback
    const qty = ws?.quantity ?? 0;

    setEditing({
      id: p.id,
      name: p.name,
      product_code: p.product_code,
      current_qty: qty,
      safety_stock_qty: p.safety_stock_qty || 0,
      stock_unit: p.stock_unit,
      warehouse_stock_id: ws?.id,
      selectedHubId: defaultHub,
    });
    setEditHubId(defaultHub);
    setNewQty(String(qty));
    setNewSafetyQty(String(p.safety_stock_qty || 0));
    setReason("");
  };

  const handleEditHubChange = (hubId: string) => {
    if (!editing) return;
    setEditHubId(hubId);
    const ws = warehouseStock?.find(s => s.product_id === editing.id && s.warehouse_id === hubId);
    const qty = ws?.quantity || 0;
    setEditing(prev => prev ? { ...prev, current_qty: qty, warehouse_stock_id: ws?.id, selectedHubId: hubId } : null);
    setNewQty(String(qty));
  };

  const handleSave = async () => {
    if (!editing || !editHubId) return;
    const qty = Number(newQty);
    const safetyQty = Number(newSafetyQty);
    if (isNaN(qty) || qty < 0) {
      toast.error("Quantidade inválida");
      return;
    }
    if (isNaN(safetyQty) || safetyQty < 0) {
      toast.error("Estoque de segurança inválido");
      return;
    }
    if (!reason.trim()) {
      toast.error("Motivo do ajuste é obrigatório");
      return;
    }
    const diff = qty - editing.current_qty;
    if (diff === 0) {
      setEditing(null);
      return;
    }

    try {
      if (diff !== 0) {
        if (editing.warehouse_stock_id) {
          const { error } = await supabase
            .from("warehouse_stock")
            .update({ quantity: qty, updated_at: new Date().toISOString() })
            .eq("id", editing.warehouse_stock_id);
          if (error) throw error;
        } else {
          // First stock entry for this product+hub — create the row
          const { error } = await supabase
            .from("warehouse_stock")
            .insert({ product_id: editing.id, warehouse_id: editHubId, quantity: qty });
          if (error) throw error;
        }

        await createMovement.mutateAsync({
          product_id: editing.id,
          tipo: diff > 0 ? "entrada" : "saida",
          quantidade: Math.abs(diff),
          origem: "ajuste",
          observacoes: `[Hub: ${warehouses?.find(w => w.id === editHubId)?.name}] ${reason}`,
        });
      }

      await supabase.from("flow_audit_logs").insert({
        user_id: user?.id,
        action_type: "stock_adjusted",
        resource_type: "warehouse_stock",
        resource_id: editing.warehouse_stock_id || editing.id,
        reason: reason,
        details: {
          product_code: editing.product_code,
          hub_id: editHubId,
          old_qty: editing.current_qty,
          new_qty: qty,
          old_safety: editing.safety_stock_qty,
          new_safety: safetyQty,
          reason,
        },
      });

      qc.invalidateQueries({ queryKey: ["mrp-products-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      qc.invalidateQueries({ queryKey: ["suprimentos-kpis"] });
      toast.success("Ajuste manual registrado", {
        description: `Motivo: "${reason}" — consulte a aba Movimentos para ver o histórico completo.`,
        duration: 6000,
      });
      setEditing(null);
    } catch {
      // error handled by hook
    }
  };

  const openEntrada = () => {
    // Usa sempre o hub da view ativa (nunca warehouses[0])
    const defaultHub = selectedWarehouse !== "all"
      ? selectedWarehouse
      : (warehouses?.find(w => w.code === (isSP ? "HUB-SP" : "HUB-RN"))?.id || warehouses?.[0]?.id || "");
    setEntradaProductId(products?.[0]?.id || "");
    setEntradaHubId(defaultHub);
    setEntradaQty("");
    setEntradaReason("");
    setEntradaOpen(true);
  };

  const handleEntrada = async () => {
    const qty = Number(entradaQty);
    if (!entradaProductId) { toast.error("Selecione o produto"); return; }
    if (!entradaHubId) { toast.error("Selecione o HUB"); return; }
    if (isNaN(qty) || qty <= 0) { toast.error("Quantidade inválida"); return; }
    if (!entradaReason.trim()) { toast.error("Motivo é obrigatório"); return; }

    setEntradaSaving(true);
    try {
      const ws = warehouseStock?.find(s => s.product_id === entradaProductId && s.warehouse_id === entradaHubId);
      const currentQty = ws?.quantity || 0;
      const newQty = currentQty + qty;

      if (ws) {
        const { error } = await supabase.from("warehouse_stock")
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq("id", ws.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("warehouse_stock")
          .insert({ product_id: entradaProductId, warehouse_id: entradaHubId, quantity: newQty });
        if (error) throw error;
      }

      await createMovement.mutateAsync({
        product_id: entradaProductId,
        tipo: "entrada",
        quantidade: qty,
        origem: "ajuste",
        observacoes: `[Hub: ${warehouses?.find(w => w.id === entradaHubId)?.name}] ${entradaReason}`,
      });

      await supabase.from("flow_audit_logs").insert({
        user_id: user?.id,
        action_type: "stock_entry",
        resource_type: "warehouse_stock",
        resource_id: ws?.id || entradaProductId,
        reason: entradaReason,
        details: { product_id: entradaProductId, hub_id: entradaHubId, qty_entrada: qty },
      });

      qc.invalidateQueries({ queryKey: ["mrp-products-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      qc.invalidateQueries({ queryKey: ["suprimentos-kpis"] });
      toast.success("Entrada registrada com sucesso");
      setEntradaOpen(false);
    } catch {
      toast.error("Erro ao registrar entrada");
    } finally {
      setEntradaSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        {!isSP && (
          <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
            <SelectTrigger className="w-[200px]">
              <Warehouse className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Centro de Distribuição" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os CDs</SelectItem>
              {(warehouses || []).map(w => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} — {w.city}/{w.state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!isSP && (
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[170px]">
              <Tag className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              <SelectItem value="Produto Final">Produto Final</SelectItem>
              <SelectItem value="Insumo">Insumo</SelectItem>
              <SelectItem value="Embalagem">Embalagem</SelectItem>
              <SelectItem value="Carbonatação">Carbonatação</SelectItem>
              <SelectItem value="Outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {canEdit && !isSP && (
            <Button size="sm" className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white" onClick={openEntrada}>
              <ArrowDownToLine className="h-4 w-4" />
              Nova Entrada
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDisplayOpen(true)}>
            <Settings2 className="h-4 w-4" />
            Exibição
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* SP banner */}
      {isSP && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400">
          <Info className="h-4 w-4 shrink-0" />
          <span>
            <strong>CD São Paulo</strong> — Estoque gerenciado manualmente conforme transferências do CD contratado.
            Atualize ao receber confirmação de entrada no CD.
          </span>
        </div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <CarboCard>
          <CarboCardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">Nenhum produto encontrado</p>
          </CarboCardContent>
        </CarboCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(p => {
            const safetyQty = p.safety_stock_qty || p.min_order_qty || 1;

            // All hubs or just the selected one
            const visibleWarehouses = selectedWarehouse === "all"
              ? (warehouses || [])
              : (warehouses || []).filter(w => w.id === selectedWarehouse);

            const hubStocks = visibleWarehouses.map(w => {
              const ws = warehouseStock?.find(
                s => s.product_id === p.id && s.warehouse_id === w.id
              );
              return {
                id: w.id,
                name: w.name || "Hub",
                qty: ws?.quantity || 0,
              };
            });

            // warehouse_stock é sempre a fonte de verdade (nunca usa current_stock_qty como fallback)
            const hasAnyHubData = (warehouseStock || []).some(s => s.product_id === p.id);
            const totalQty = hubStocks.reduce((sum, h) => sum + h.qty, 0);

            const hubTarget = hubStocks.length > 0 ? Math.ceil(safetyQty / Math.max(hubStocks.length, 1)) : safetyQty;

            // BI calculations
            const stats = movements30d?.[p.id];
            const giroMedio = stats?.giroMedio ?? 0;
            const coberturaDias = giroMedio > 0 ? Math.round(totalQty / giroMedio) : null;
            const dataRuptura = giroMedio > 0 && coberturaDias !== null ? addDays(new Date(), coberturaDias) : null;
            const coverageStatus = getCoverageStatus(coberturaDias);
            const tendenciaPct = stats?.tendenciaPct ?? null;

            return (
              <CarboCard key={p.id} variant="default" padding="none">
                <CarboCardContent>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h3 className="font-semibold text-sm text-foreground leading-tight truncate">
                          {p.name}
                        </h3>
                        <CarboBadge variant={coverageStatus.variant} size="sm">
                          {coverageStatus.label}
                        </CarboBadge>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono tracking-wide">
                        {p.product_code}
                        {p.category && <span className="ml-2 font-sans">· {p.category}</span>}
                      </p>
                    </div>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Central total */}
                  <div className="text-center px-5 pb-3">
                    <p className="text-3xl font-bold tabular-nums text-foreground leading-none">
                      {totalQty.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {p.stock_unit} total · Segurança: {safetyQty.toLocaleString("pt-BR")} {p.stock_unit}
                    </p>
                    {(() => {
                      const eq = displayCfg.equiv[p.product_code];
                      if (!eq || eq.factor <= 0) return null;
                      const val = eq.mode === "multiply"
                        ? totalQty * eq.factor
                        : Math.floor(totalQty / eq.factor);
                      return (
                        <p className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                          <Layers className="h-3 w-3" />
                          {eq.mode === "multiply"
                            ? `≈ ${val.toLocaleString("pt-BR")} un · kit de ${eq.factor}`
                            : `≈ ${val.toLocaleString("pt-BR")} kits · ${eq.factor} un/kit`}
                        </p>
                      );
                    })()}
                  </div>

                  {/* BI Indicators */}
                  <div className="grid grid-cols-3 gap-px bg-border mx-5 rounded-lg overflow-hidden mb-4">
                    <div className="bg-card px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <Activity className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-bold tabular-nums text-foreground">
                        {giroMedio > 0 ? giroMedio.toFixed(1) : "—"}
                      </p>
                      <p className="text-[9px] text-muted-foreground leading-tight">un/dia</p>
                    </div>
                    <div className="bg-card px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <Shield className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-bold tabular-nums text-foreground">
                        {coberturaDias !== null ? `${coberturaDias}d` : "—"}
                      </p>
                      <p className="text-[9px] text-muted-foreground leading-tight">cobertura</p>
                    </div>
                    <div className="bg-card px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-bold tabular-nums text-foreground">
                        {dataRuptura ? format(dataRuptura, "dd/MM", { locale: ptBR }) : "—"}
                      </p>
                      <p className="text-[9px] text-muted-foreground leading-tight">ruptura</p>
                    </div>
                  </div>

                  {/* Hub progress bars */}
                  <div className="border-t border-border px-5 py-4 space-y-3">
                    {hasAnyHubData ? (
                      hubStocks.map(h => (
                        <StockProgressBar
                          key={h.id}
                          current={h.qty}
                          safety={safetyQty}
                          hubName={h.name}
                          unit={p.stock_unit}
                          onClick={() => openEdit(p, h.id)}
                        />
                      ))
                    ) : isSP ? (
                      // SP sem linha no warehouse_stock ainda → mostra Hub SP com 0 (não usa fallback global)
                      <StockProgressBar
                        current={0}
                        safety={safetyQty}
                        hubName="Hub SP"
                        unit={p.stock_unit}
                        onClick={() => openEdit(p)}
                      />
                    ) : (
                      <StockProgressBar
                        current={totalQty}
                        safety={safetyQty}
                        hubName="Estoque geral"
                        unit={p.stock_unit}
                        onClick={() => openEdit(p)}
                      />
                    )}
                  </div>

                  {/* Mini trend chart */}
                  <div className="border-t border-border px-5 pt-3 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" /> Saídas 30 dias
                      </span>
                      {tendenciaPct !== null && (
                        <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${
                          tendenciaPct > 0 ? "text-destructive" : tendenciaPct < 0 ? "text-success" : "text-muted-foreground"
                        }`}>
                          {tendenciaPct > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : tendenciaPct < 0 ? (
                            <TrendingDown className="h-3 w-3" />
                          ) : null}
                          {tendenciaPct > 0 ? "+" : ""}{tendenciaPct}% vs média
                        </span>
                      )}
                    </div>
                    <MiniTrendChart data={stats?.dailyData || []} />
                  </div>
                </CarboCardContent>
              </CarboCard>
            );
          })}
        </div>
      )}

      {/* Diálogo de Exibição (só front: o que aparece + equivalência kit↔un) */}
      <Dialog open={displayOpen} onOpenChange={setDisplayOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-carbo-green" />
              Exibição dos produtos
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Escolha quais produtos aparecem e configure a equivalência mostrada no card
            (ex.: kit de sachê → unidades; CarboZé 100ml → quantos kits). Preferência salva neste navegador.
          </p>
          <div className="max-h-[55vh] overflow-y-auto divide-y divide-border/40 -mx-1 px-1">
            {configurableProducts.map(p => {
              const visible = !displayCfg.hidden.includes(p.product_code);
              const eq = displayCfg.equiv[p.product_code];
              return (
                <div key={p.id} className="flex items-center gap-3 py-2.5">
                  <Checkbox
                    checked={visible}
                    onCheckedChange={(c) => {
                      const hidden = c === true
                        ? displayCfg.hidden.filter(x => x !== p.product_code)
                        : [...new Set([...displayCfg.hidden, p.product_code])];
                      saveDisplayCfg({ ...displayCfg, hidden });
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium truncate", !visible && "text-muted-foreground line-through")}>
                      {p.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono">{p.product_code}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Select
                      value={eq?.mode ?? "none"}
                      onValueChange={(v) => {
                        const equiv = { ...displayCfg.equiv };
                        if (v === "none") delete equiv[p.product_code];
                        else equiv[p.product_code] = { mode: v as EquivCfg["mode"], factor: eq?.factor || 1 };
                        saveDisplayCfg({ ...displayCfg, equiv });
                      }}
                    >
                      <SelectTrigger className="w-[185px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem equivalência</SelectItem>
                        <SelectItem value="multiply">Kit → mostra unidades</SelectItem>
                        <SelectItem value="divide">Unidade → mostra kits</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      className="w-16 h-8 text-xs"
                      placeholder="fator"
                      value={eq?.factor ?? ""}
                      disabled={!eq}
                      onChange={(e) => {
                        if (!displayCfg.equiv[p.product_code]) return;
                        const f = Math.max(1, Number(e.target.value) || 1);
                        const equiv = { ...displayCfg.equiv, [p.product_code]: { ...displayCfg.equiv[p.product_code], factor: f } };
                        saveDisplayCfg({ ...displayCfg, equiv });
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => saveDisplayCfg({ hidden: [], equiv: {} })}>
              Restaurar padrão
            </Button>
            <Button onClick={() => setDisplayOpen(false)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nova Entrada Dialog */}
      <Dialog open={entradaOpen} onOpenChange={setEntradaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-carbo-green" />
              Registrar Entrada de Material
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Produto</Label>
              <Select value={entradaProductId} onValueChange={setEntradaProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {(products || []).map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="text-muted-foreground text-xs ml-1">({p.product_code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedWarehouse === "all" ? (
              <div>
                <Label>HUB de Destino</Label>
                <Select value={entradaHubId} onValueChange={setEntradaHubId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o HUB" />
                  </SelectTrigger>
                  <SelectContent>
                    {(warehouses || []).map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} — {w.city}/{w.state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border">
                <Warehouse className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">
                  {warehouses?.find(w => w.id === entradaHubId)?.name || "Hub"}
                </span>
              </div>
            )}
            <div>
              <Label htmlFor="entrada-qty">Quantidade Recebida</Label>
              <Input
                id="entrada-qty"
                type="number"
                min={1}
                placeholder="0"
                value={entradaQty}
                onChange={e => setEntradaQty(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="entrada-reason">Motivo / Origem <span className="text-destructive">*</span></Label>
              <Textarea
                id="entrada-reason"
                placeholder="Ex: Recebimento NF 001234, Transferência de estoque..."
                value={entradaReason}
                onChange={e => setEntradaReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEntradaOpen(false)}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button
              className="bg-carbo-green hover:bg-carbo-green/90 text-white"
              onClick={handleEntrada}
              disabled={entradaSaving || !entradaReason.trim() || !entradaProductId || !entradaHubId}
            >
              <ArrowDownToLine className="h-4 w-4 mr-1" />
              {entradaSaving ? "Salvando..." : "Registrar Entrada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isSP ? "Ajustar Estoque — CD São Paulo" : "Ajustar Estoque por HUB"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <p className="font-semibold">{editing.name}</p>
                <p className="text-xs text-muted-foreground">{editing.product_code}</p>
              </div>

              {/* Hub selector: hidden for SP (locked), shown for RN */}
              {!isSP && (
                <div>
                  <Label>HUB</Label>
                  <Select value={editHubId} onValueChange={handleEditHubChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o HUB" />
                    </SelectTrigger>
                    <SelectContent>
                      {(warehouses || []).map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} — {w.city}/{w.state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label>{isSP ? "Estoque atual (CD São Paulo)" : `Estoque atual (${warehouses?.find(w => w.id === editHubId)?.name || "Hub"})`}</Label>
                  <p className="text-lg font-bold text-muted-foreground">{editing.current_qty} {editing.stock_unit}</p>
                </div>
                <div className="flex-1">
                  <Label htmlFor="new-qty">Novo estoque</Label>
                  <Input
                    id="new-qty"
                    type="number"
                    min={0}
                    value={newQty}
                    onChange={e => setNewQty(e.target.value)}
                    autoFocus
                  />
                </div>
                </div>
              {Number(newQty) !== editing.current_qty && !isNaN(Number(newQty)) && (
                <div className="text-sm">
                  <span className={Number(newQty) > editing.current_qty ? "text-success" : "text-destructive"}>
                    {Number(newQty) > editing.current_qty ? "+" : ""}{Number(newQty) - editing.current_qty} {editing.stock_unit}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    ({Number(newQty) > editing.current_qty ? "entrada" : "saída"})
                  </span>
                </div>
              )}

              {/* Safety stock — removed from this dialog; edit via Política de Estoque */}
              <div>
                <Label htmlFor="reason">Motivo do ajuste <span className="text-destructive">*</span></Label>
                <Textarea
                  id="reason"
                  placeholder="Ex: Contagem física, correção de inventário..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button onClick={handleSave} disabled={createMovement.isPending || !reason.trim()}>
              <Save className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
