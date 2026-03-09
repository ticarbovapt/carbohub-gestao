import { useState, useMemo } from "react";
import { Package, Search, Pencil, Save, X, Warehouse, TrendingUp, TrendingDown, Calendar, BarChart3, Shield, Activity } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateStockMovement } from "@/hooks/useStockMovements";
import { useProductMovements30d } from "@/hooks/useProductMovements30d";
import { toast } from "sonner";
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

function getCoverageStatus(days: number | null): CoverageStatus {
  if (days === null) return { label: "Sem consumo", variant: "secondary" };
  if (days < 7) return { label: "Ruptura iminente", variant: "destructive" };
  if (days < 15) return { label: "Atenção", variant: "warning" };
  if (days < 30) return { label: "Estável", variant: "warning" };
  if (days < 60) return { label: "Saudável", variant: "success" };
  return { label: "Excedente", variant: "info" };
}

export function StockOverview() {
  const [search, setSearch] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all");
  const [editing, setEditing] = useState<EditingProduct | null>(null);
  const [editHubId, setEditHubId] = useState<string>("");
  const [newQty, setNewQty] = useState("");
  const [newSafetyQty, setNewSafetyQty] = useState("");
  const [reason, setReason] = useState("");
  const createMovement = useCreateStockMovement();
  const qc = useQueryClient();
  const { user } = useAuth();

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
    if (!search) return true;
    const s = search.toLowerCase();
    return p.name.toLowerCase().includes(s) || p.product_code.toLowerCase().includes(s);
  });

  const openEdit = (p: (typeof products extends (infer T)[] ? T : never), hubId?: string) => {
    const defaultHub = hubId || (warehouses && warehouses.length > 0 ? warehouses[0].id : "");
    const ws = defaultHub
      ? warehouseStock?.find(s => s.product_id === p.id && s.warehouse_id === defaultHub)
      : undefined;
    const qty = ws?.quantity || 0;

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
    const safetyChanged = safetyQty !== editing.safety_stock_qty;
    if (diff === 0 && !safetyChanged) {
      setEditing(null);
      return;
    }

    try {
      // Update safety stock on product if changed
      if (safetyChanged) {
        const { error } = await supabase
          .from("mrp_products")
          .update({ safety_stock_qty: safetyQty, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
      }

      if (diff !== 0) {
        if (editing.warehouse_stock_id) {
          const { error } = await supabase
            .from("warehouse_stock")
            .update({ quantity: qty, updated_at: new Date().toISOString() })
            .eq("id", editing.warehouse_stock_id);
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
        action_type: safetyChanged && diff !== 0 ? "stock_and_safety_adjusted" : safetyChanged ? "safety_stock_adjusted" : "stock_adjusted",
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
      toast.success("Ajuste salvo com sucesso");
      setEditing(null);
    } catch {
      // error handled by hook
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
      </div>

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

            const hubStocks = (warehouses || []).map(w => {
              const ws = warehouseStock?.find(
                s => s.product_id === p.id && s.warehouse_id === w.id
              );
              return {
                id: w.id,
                name: w.name || "Hub",
                qty: ws?.quantity || 0,
              };
            });

            const totalQty = hubStocks.length > 0
              ? hubStocks.reduce((sum, h) => sum + h.qty, 0)
              : p.current_stock_qty;

            const hubTarget = hubStocks.length > 0 ? Math.ceil(safetyQty / hubStocks.length) : safetyQty;

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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Central total */}
                  <div className="text-center px-5 pb-3">
                    <p className="text-3xl font-bold tabular-nums text-foreground leading-none">
                      {totalQty.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {p.stock_unit} total · Segurança: {safetyQty.toLocaleString("pt-BR")} {p.stock_unit}
                    </p>
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
                    {hubStocks.length > 0 ? (
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
                    ) : (
                      <StockProgressBar
                        current={totalQty}
                        safety={safetyQty}
                        hubName="Estoque geral"
                        unit={p.stock_unit}
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

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar Estoque por HUB</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <p className="font-semibold">{editing.name}</p>
                <p className="text-xs text-muted-foreground">{editing.product_code}</p>
              </div>

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

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label>Estoque atual ({warehouses?.find(w => w.id === editHubId)?.name || "Hub"})</Label>
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

              {/* Safety stock */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label>Segurança atual</Label>
                    <p className="text-lg font-bold text-muted-foreground">{editing.safety_stock_qty} {editing.stock_unit}</p>
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="new-safety">Novo nível de segurança</Label>
                    <Input
                      id="new-safety"
                      type="number"
                      min={0}
                      value={newSafetyQty}
                      onChange={e => setNewSafetyQty(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Quantidade mínima consolidada para alertas e projeções.
                </p>
              </div>
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
