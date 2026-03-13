import { useState, useEffect, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import {
  CarboTable,
  CarboTableHeader,
  CarboTableBody,
  CarboTableRow,
  CarboTableHead,
  CarboTableCell,
} from "@/components/ui/carbo-table";
import { useSkuBoms, useUpdateSkuBom, useCreateSkuBom, SkuBomItem } from "@/hooks/useSkus";
import { useMrpProducts } from "@/hooks/useMrpProducts";
import { Plus, Trash2, Save, Copy, Loader2, AlertTriangle, PackageCheck } from "lucide-react";
import { toast } from "sonner";

interface BomEditorProps {
  skuId: string;
}

export function BomEditor({ skuId }: BomEditorProps) {
  const { data: boms = [], isLoading: bomsLoading } = useSkuBoms(skuId);
  const { data: products = [] } = useMrpProducts();
  const updateBom = useUpdateSkuBom();
  const createBom = useCreateSkuBom();

  const [selectedBomId, setSelectedBomId] = useState<string>("");
  const [items, setItems] = useState<SkuBomItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // New item form state
  const [newProductId, setNewProductId] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newIsCritical, setNewIsCritical] = useState(false);

  const selectedBom = useMemo(
    () => boms.find((b) => b.id === selectedBomId),
    [boms, selectedBomId]
  );

  const isActiveVersion = selectedBom?.is_active ?? false;

  // Auto-select active BOM when data loads
  useEffect(() => {
    if (boms.length > 0 && !selectedBomId) {
      const active = boms.find((b) => b.is_active);
      const target = active || boms[0];
      setSelectedBomId(target.id);
      setItems(target.items || []);
      setIsDirty(false);
    }
  }, [boms, selectedBomId]);

  // Load items when switching version
  const handleVersionChange = (bomId: string) => {
    if (isDirty) {
      const ok = window.confirm("Você tem alterações não salvas. Deseja descartar?");
      if (!ok) return;
    }
    setSelectedBomId(bomId);
    const bom = boms.find((b) => b.id === bomId);
    setItems(bom?.items || []);
    setIsDirty(false);
  };

  // Active products not already in BOM
  const availableProducts = useMemo(
    () =>
      products.filter(
        (p) => p.is_active && !items.some((i) => i.product_id === p.id)
      ),
    [products, items]
  );

  const handleAddItem = () => {
    if (!newProductId) {
      toast.warning("Selecione um insumo");
      return;
    }
    const qty = parseFloat(newQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.warning("Quantidade deve ser maior que zero");
      return;
    }
    const product = products.find((p) => p.id === newProductId);
    if (!product) return;

    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        quantity_per_unit: qty,
        unit: product.stock_unit || "un",
        is_critical: newIsCritical,
        name: product.name,
      },
    ]);
    setNewProductId("");
    setNewQuantity("1");
    setNewIsCritical(false);
    setIsDirty(true);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!selectedBom) return;
    await updateBom.mutateAsync({ id: selectedBom.id, items, skuId });
    setIsDirty(false);
  };

  const handleNewVersion = async () => {
    const maxVersion = boms.reduce((max, b) => Math.max(max, b.version), 0);
    await createBom.mutateAsync({
      skuId,
      items,
      newVersion: maxVersion + 1,
    });
    setIsDirty(false);
    // Reset selection so useEffect picks the new active BOM
    setSelectedBomId("");
  };

  if (bomsLoading) {
    return <div className="text-sm text-muted-foreground py-4">Carregando BOM...</div>;
  }

  if (boms.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <PackageCheck className="h-5 w-5" />
          <span className="text-sm">Nenhuma BOM cadastrada. Crie a primeira versão.</span>
        </div>
        <AddItemRow
          availableProducts={availableProducts}
          newProductId={newProductId}
          onProductChange={setNewProductId}
          newQuantity={newQuantity}
          onQuantityChange={setNewQuantity}
          newIsCritical={newIsCritical}
          onCriticalChange={setNewIsCritical}
          onAdd={handleAddItem}
        />
        {items.length > 0 && (
          <>
            <ItemsTable items={items} onRemove={handleRemoveItem} editable />
            <CarboButton
              onClick={async () => {
                await createBom.mutateAsync({ skuId, items, newVersion: 1 });
                setIsDirty(false);
                setSelectedBomId("");
              }}
              disabled={createBom.isPending || items.length === 0}
            >
              {createBom.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar BOM v1
            </CarboButton>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Version selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedBomId} onValueChange={handleVersionChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Selecionar versão" />
          </SelectTrigger>
          <SelectContent>
            {boms.map((bom) => (
              <SelectItem key={bom.id} value={bom.id}>
                Versão {bom.version} {bom.is_active ? " (ativa)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedBom && (
          <CarboBadge variant={isActiveVersion ? "success" : "secondary"} dot>
            {isActiveVersion ? "Ativa" : "Inativa"}
          </CarboBadge>
        )}
        {isDirty && (
          <CarboBadge variant="warning">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Não salvo
          </CarboBadge>
        )}
      </div>

      {/* Items table */}
      <ItemsTable
        items={items}
        onRemove={handleRemoveItem}
        editable={isActiveVersion}
      />

      {/* Add item row (only for active version) */}
      {isActiveVersion && (
        <AddItemRow
          availableProducts={availableProducts}
          newProductId={newProductId}
          onProductChange={setNewProductId}
          newQuantity={newQuantity}
          onQuantityChange={setNewQuantity}
          newIsCritical={newIsCritical}
          onCriticalChange={setNewIsCritical}
          onAdd={handleAddItem}
        />
      )}

      {/* Action buttons */}
      {isActiveVersion && (
        <div className="flex items-center gap-3 pt-2">
          <CarboButton
            onClick={handleSave}
            disabled={!isDirty || updateBom.isPending}
          >
            {updateBom.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Alterações
          </CarboButton>
          <CarboButton
            variant="outline"
            onClick={handleNewVersion}
            disabled={createBom.isPending}
          >
            {createBom.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Nova Versão
          </CarboButton>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ItemsTable({
  items,
  onRemove,
  editable,
}: {
  items: SkuBomItem[];
  onRemove: (index: number) => void;
  editable: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">Nenhum insumo adicionado.</p>
    );
  }

  return (
    <CarboTable>
      <CarboTableHeader>
        <CarboTableRow>
          <CarboTableHead>Insumo</CarboTableHead>
          <CarboTableHead>Quantidade</CarboTableHead>
          <CarboTableHead>Unidade</CarboTableHead>
          <CarboTableHead>Crítico</CarboTableHead>
          {editable && <CarboTableHead className="w-10"></CarboTableHead>}
        </CarboTableRow>
      </CarboTableHeader>
      <CarboTableBody>
        {items.map((item, idx) => (
          <CarboTableRow key={`${item.product_id}-${idx}`}>
            <CarboTableCell>
              <span className="font-medium">{item.name}</span>
            </CarboTableCell>
            <CarboTableCell>
              <span className="font-mono">{item.quantity_per_unit}</span>
            </CarboTableCell>
            <CarboTableCell>{item.unit}</CarboTableCell>
            <CarboTableCell>
              {item.is_critical ? (
                <CarboBadge variant="destructive">Sim</CarboBadge>
              ) : (
                <span className="text-muted-foreground text-sm">Não</span>
              )}
            </CarboTableCell>
            {editable && (
              <CarboTableCell>
                <CarboButton
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => onRemove(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </CarboButton>
              </CarboTableCell>
            )}
          </CarboTableRow>
        ))}
      </CarboTableBody>
    </CarboTable>
  );
}

function AddItemRow({
  availableProducts,
  newProductId,
  onProductChange,
  newQuantity,
  onQuantityChange,
  newIsCritical,
  onCriticalChange,
  onAdd,
}: {
  availableProducts: { id: string; product_code: string; name: string }[];
  newProductId: string;
  onProductChange: (v: string) => void;
  newQuantity: string;
  onQuantityChange: (v: string) => void;
  newIsCritical: boolean;
  onCriticalChange: (v: boolean) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg border border-dashed bg-muted/30">
      <div className="flex-1 min-w-[200px]">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Insumo</label>
        <Select value={newProductId} onValueChange={onProductChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecionar insumo..." />
          </SelectTrigger>
          <SelectContent>
            {availableProducts.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.product_code} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-24">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Qtd/un</label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={newQuantity}
          onChange={(e) => onQuantityChange(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">Crítico</label>
        <Switch checked={newIsCritical} onCheckedChange={onCriticalChange} />
      </div>
      <CarboButton size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4 mr-1" />
        Adicionar
      </CarboButton>
    </div>
  );
}
