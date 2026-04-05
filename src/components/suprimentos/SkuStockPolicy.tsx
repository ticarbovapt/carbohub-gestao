import { useState, useMemo } from "react";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Shield, AlertTriangle, CheckCircle, Package, Save, Factory } from "lucide-react";
import { useSkus, type Sku } from "@/hooks/useSkus";
import { useSkuWarehousePolicies, useUpsertSkuWarehousePolicy, useInsumoRequirements } from "@/hooks/useSkuWarehousePolicy";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Warehouse {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
}

function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Warehouse[];
    },
  });
}

export function SkuStockPolicy() {
  const { data: skus = [] } = useSkus();
  const { data: warehouses = [] } = useWarehouses();
  const { data: policies = [] } = useSkuWarehousePolicies();
  const { data: deficits = [] } = useInsumoRequirements();
  const upsertPolicy = useUpsertSkuWarehousePolicy();
  const [search, setSearch] = useState("");
  const [editDialog, setEditDialog] = useState<{ sku: Sku; warehouse: Warehouse } | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [editDays, setEditDays] = useState(30);

  const activeSkus = useMemo(() => {
    return skus
      .filter((s) => s.is_active)
      .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()));
  }, [skus, search]);

  const getPolicyQty = (skuId: string, warehouseId: string) => {
    const p = policies.find((pol) => pol.sku_id === skuId && pol.warehouse_id === warehouseId);
    return p?.safety_stock_qty || 0;
  };

  const getSkuDeficits = (skuId: string) => {
    return deficits.filter((d) => d.sku_id === skuId);
  };

  const handleEdit = (sku: Sku, warehouse: Warehouse) => {
    const current = getPolicyQty(sku.id, warehouse.id);
    const currentPolicy = policies.find((p) => p.sku_id === sku.id && p.warehouse_id === warehouse.id);
    setEditQty(current);
    setEditDays(currentPolicy?.min_coverage_days || 30);
    setEditDialog({ sku, warehouse });
  };

  const handleSave = async () => {
    if (!editDialog) return;
    await upsertPolicy.mutateAsync({
      sku_id: editDialog.sku.id,
      warehouse_id: editDialog.warehouse.id,
      safety_stock_qty: editQty,
      min_coverage_days: editDays,
    });
    setEditDialog(null);
  };

  return (
    <div className="space-y-6">
      {/* Deficits Alert */}
      {deficits.length > 0 && (
        <CarboCard className="border-destructive/50 bg-destructive/5">
          <CarboCardHeader>
            <CarboCardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {deficits.length} insumo{deficits.length > 1 ? "s" : ""} abaixo do necessário
            </CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent className="pt-0">
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {deficits.slice(0, 10).map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm p-2 bg-background rounded-lg">
                  <div>
                    <span className="font-medium">{d.product?.name || d.product_id}</span>
                    <span className="text-muted-foreground ml-2">({d.warehouse?.name})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">Tem: {d.current_stock_qty}</span>
                    <span className="text-muted-foreground">Precisa: {Math.ceil(d.required_qty)}</span>
                    <CarboBadge variant="destructive">Déficit: {Math.ceil(d.deficit)}</CarboBadge>
                  </div>
                </div>
              ))}
            </div>
          </CarboCardContent>
        </CarboCard>
      )}

      {/* Search */}
      <div className="max-w-md">
        <CarboSearchInput
          placeholder="Buscar SKU por nome ou código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Policy Grid */}
      <div className="space-y-4">
        {activeSkus.map((sku) => {
          const skuDeficits = getSkuDeficits(sku.id);
          const hasDeficit = skuDeficits.length > 0;

          return (
            <CarboCard key={sku.id} className={hasDeficit ? "border-warning/50" : ""}>
              <CarboCardContent className="p-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${hasDeficit ? "bg-warning/10" : "bg-carbo-green/10"}`}>
                      <Package className={`h-5 w-5 ${hasDeficit ? "text-warning" : "text-carbo-green"}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{sku.name}</h3>
                      <p className="text-xs text-muted-foreground">{sku.code} · {sku.packaging_ml}ml</p>
                    </div>
                  </div>
                  {hasDeficit && (
                    <CarboBadge variant="warning">{skuDeficits.length} insumo{skuDeficits.length > 1 ? "s" : ""} em falta</CarboBadge>
                  )}
                </div>

                {/* Warehouses Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {warehouses.map((wh) => {
                    const qty = getPolicyQty(sku.id, wh.id);
                    const isSet = qty > 0;

                    return (
                      <div
                        key={wh.id}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                          isSet ? "bg-card border-carbo-green/30" : "bg-muted/30 border-dashed"
                        }`}
                        onClick={() => handleEdit(sku, wh)}
                      >
                        <div>
                          <p className="text-sm font-medium">{wh.name}</p>
                          <p className="text-xs text-muted-foreground">{wh.city}/{wh.state}</p>
                        </div>
                        <div className="text-right">
                          {isSet ? (
                            <>
                              <p className="font-bold text-lg kpi-number">{qty.toLocaleString("pt-BR")}</p>
                              <p className="text-xs text-muted-foreground">estoque mín.</p>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Configurar</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CarboCardContent>
            </CarboCard>
          );
        })}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-carbo-green" />
              Estoque Mínimo
            </DialogTitle>
            <DialogDescription>
              {editDialog?.sku.name} — {editDialog?.warehouse.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Estoque mínimo de segurança (unidades)</Label>
              <Input
                type="number"
                min={0}
                value={editQty}
                onChange={(e) => setEditQty(Number(e.target.value))}
                className="text-lg font-bold"
              />
              <p className="text-xs text-muted-foreground">
                Quando o estoque cair abaixo deste valor, o sistema alertará e sugerirá OP/PC automaticamente.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Cobertura mínima (dias)</Label>
              <Select value={String(editDays)} onValueChange={(v) => setEditDays(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="15">15 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="45">45 dias</SelectItem>
                  <SelectItem value="60">60 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <CarboButton variant="outline" onClick={() => setEditDialog(null)}>Cancelar</CarboButton>
            <CarboButton onClick={handleSave} disabled={upsertPolicy.isPending}>
              <Save className="h-4 w-4 mr-1" />
              Salvar
            </CarboButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
