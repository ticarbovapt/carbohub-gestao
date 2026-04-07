import { useState } from "react";
import { ClipboardList, Plus, Trash2, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useMrpProducts, type MrpProduct } from "@/hooks/useMrpProducts";
import {
  useProductBom,
  useUpsertBomItem,
  useDeleteBomItem,
  type MrpBomItem,
} from "@/hooks/useProductBom";

// ── Props ─────────────────────────────────────────────────────────────────────
interface ProductBomModalProps {
  product: MrpProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── AddItem inline form ───────────────────────────────────────────────────────
interface AddItemFormProps {
  productId: string;
  existingInsumoIds: string[];
  onDone: () => void;
}

function AddItemForm({ productId, existingInsumoIds, onDone }: AddItemFormProps) {
  const { data: allProducts = [] } = useMrpProducts();
  const upsert = useUpsertBomItem();

  const [insumoId, setInsumoId] = useState("");
  const [qty, setQty]           = useState("1");
  const [unit, setUnit]         = useState("un");
  const [critical, setCritical] = useState(false);

  // Only non-"Produto Final" items can be insumos + exclude already-added and self
  const availableInsumos = allProducts.filter(
    (p) =>
      p.is_active &&
      p.id !== productId &&
      p.category !== "Produto Final" &&
      !existingInsumoIds.includes(p.id)
  );

  const handleAdd = async () => {
    if (!insumoId || !qty) return;
    await upsert.mutateAsync({
      product_id:        productId,
      insumo_id:         insumoId,
      quantity_per_unit: Number(qty),
      unit,
      is_critical:       critical,
    });
    onDone();
  };

  return (
    <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 space-y-3">
      <p className="text-xs font-semibold text-primary">Adicionar Insumo</p>

      <div className="space-y-1">
        <Label className="text-xs">Insumo / Embalagem</Label>
        <Select value={insumoId} onValueChange={setInsumoId}>
          <SelectTrigger className="text-xs h-8">
            <SelectValue placeholder="Selecione um insumo..." />
          </SelectTrigger>
          <SelectContent>
            {availableInsumos.length === 0 ? (
              <SelectItem value="__none__" disabled>Nenhum insumo disponível</SelectItem>
            ) : (
              availableInsumos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="font-mono text-[10px] text-muted-foreground mr-2">{p.product_code}</span>
                  {p.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Quantidade</Label>
          <Input
            type="number"
            min={0.0001}
            step={0.0001}
            className="h-8 text-xs"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Unidade</Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["un", "ml", "L", "g", "kg", "m", "cm", "pç"].map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="critical-check"
          checked={critical}
          onCheckedChange={(v) => setCritical(!!v)}
        />
        <Label htmlFor="critical-check" className="text-xs cursor-pointer">
          Insumo crítico (ausência trava a OP)
        </Label>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!insumoId || !qty || upsert.isPending}
          onClick={handleAdd}
        >
          {upsert.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
          Adicionar
        </Button>
      </div>
    </div>
  );
}

// ── BOM row ───────────────────────────────────────────────────────────────────
function BomRow({
  item,
  canEdit,
  onDelete,
}: {
  item: MrpBomItem;
  canEdit: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 rounded-lg gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {item.is_critical ? (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        ) : (
          <CheckCircle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">
            {item.insumo?.name ?? item.insumo_id}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono">
            {item.insumo?.product_code}
            {item.insumo?.category && (
              <span className="font-sans ml-1">· {item.insumo.category}</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">
            {item.quantity_per_unit.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {item.unit}
          </p>
          <p className="text-[10px] text-muted-foreground">por unidade</p>
        </div>

        {item.is_critical && (
          <Badge className="text-[9px] bg-amber-500 text-white border-0 px-1.5 shrink-0">
            Crítico
          </Badge>
        )}

        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
export function ProductBomModal({ product, open, onOpenChange }: ProductBomModalProps) {
  const { isAdmin, isCeo, isMasterAdmin } = useAuth();
  const canEdit = isAdmin || isCeo || isMasterAdmin;

  const { data: bomItems = [], isLoading } = useProductBom(product?.id);
  const deleteBom = useDeleteBomItem();
  const [showAddForm, setShowAddForm] = useState(false);

  if (!product) return null;

  const existingInsumoIds = bomItems.map((i) => i.insumo_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5 text-primary" />
            BOM — {product.name}
          </DialogTitle>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-mono text-muted-foreground">{product.product_code}</span>
            <Badge className="text-[10px] bg-emerald-700 text-white border-0">Produto Final</Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              {bomItems.length} componente{bomItems.length !== 1 ? "s" : ""}
            </span>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {/* Description */}
          <p className="text-xs text-muted-foreground border-b border-border pb-3">
            Insumos e embalagens necessários para produzir <strong>1 unidade</strong> deste produto.
            A execução de uma OP deduz estes insumos do estoque e alimenta o estoque de produto final.
          </p>

          {/* BOM items */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Carregando BOM...</span>
            </div>
          ) : bomItems.length === 0 && !showAddForm ? (
            <div className="flex flex-col items-center py-8 text-center gap-2">
              <ClipboardList className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhum insumo cadastrado nesta BOM.</p>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1 gap-1.5"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar primeiro insumo
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {bomItems.map((item) => (
                <BomRow
                  key={item.id}
                  item={item}
                  canEdit={canEdit}
                  onDelete={() =>
                    deleteBom.mutate({ id: item.id, productId: product.id })
                  }
                />
              ))}
            </div>
          )}

          {/* Add form */}
          {showAddForm && (
            <AddItemForm
              productId={product.id}
              existingInsumoIds={existingInsumoIds}
              onDone={() => setShowAddForm(false)}
            />
          )}

          {/* Add button (when items exist) */}
          {canEdit && !showAddForm && bomItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 w-full"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar Insumo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
