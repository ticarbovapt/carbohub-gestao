import { useState } from "react";
import { MapPin, Package, Pencil, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useMrpProducts } from "@/hooks/useMrpProducts";
import { ORIGIN_CEP, ORIGIN_LABEL, type FreightProduct } from "@/hooks/useFreightQuote";

// ── helpers ───────────────────────────────────────────────────────────────────
function formatCep(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface FreightCalculatorProps {
  onCalculate: (payload: {
    to_cep: string;
    products: FreightProduct[];
    productRef: string;
    quantity: number;
  }) => void;
  isLoading?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FreightCalculator({ onCalculate, isLoading }: FreightCalculatorProps) {
  const { data: mrpProducts = [] } = useMrpProducts();

  const [mode, setMode] = useState<"catalog" | "manual">("catalog");
  const [toCep, setToCep] = useState("");
  const [quantity, setQuantity] = useState(1);

  // Catalog mode
  const [selectedProductId, setSelectedProductId] = useState<string>("");

  // Manual mode
  const [height, setHeight]   = useState<number | "">("");
  const [width, setWidth]     = useState<number | "">("");
  const [length, setLength]   = useState<number | "">("");
  const [weight, setWeight]   = useState<number | "">("");
  const [insValue, setInsValue] = useState<number | "">(0);

  const activeProducts = mrpProducts.filter((p) => p.is_active);
  const selectedProduct = activeProducts.find((p) => p.id === selectedProductId);

  const canSubmit = (() => {
    const cepOk = toCep.replace(/\D/g, "").length === 8;
    if (mode === "catalog") return cepOk && !!selectedProductId;
    return (
      cepOk &&
      Number(height) > 0 &&
      Number(width) > 0 &&
      Number(length) > 0 &&
      Number(weight) > 0
    );
  })();

  const handleSubmit = () => {
    const rawCep = toCep.replace(/\D/g, "");

    let product: FreightProduct;
    let productRef = "Manual";

    if (mode === "catalog" && selectedProduct) {
      const dims = selectedProduct.dimensions_cm ?? {};
      product = {
        id:              selectedProduct.id,
        width:           dims.width  ?? 10,
        height:          dims.height ?? 10,
        length:          dims.length ?? 10,
        weight:          selectedProduct.weight_kg ?? 1,
        insurance_value: 0,
        quantity,
      };
      productRef = selectedProduct.name;
    } else {
      product = {
        id:              "manual-1",
        width:           Number(width),
        height:          Number(height),
        length:          Number(length),
        weight:          Number(weight),
        insurance_value: Number(insValue) || 0,
        quantity,
      };
    }

    onCalculate({ to_cep: rawCep, products: [product], productRef, quantity });
  };

  return (
    <div className="rounded-xl border border-border bg-board-surface p-5 space-y-5">
      <h3 className="font-semibold text-board-text flex items-center gap-2">
        <Truck className="h-4 w-4 text-primary" />
        Calcular Frete
      </h3>

      {/* Origem — fixo */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Origem:</span>
        <span className="font-medium">{ORIGIN_LABEL}</span>
        <Badge variant="secondary" className="text-[10px] ml-auto">{ORIGIN_CEP}</Badge>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        <button
          onClick={() => setMode("catalog")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            mode === "catalog"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Package className="h-3 w-3" />
          Catálogo
        </button>
        <button
          onClick={() => setMode("manual")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            mode === "manual"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Pencil className="h-3 w-3" />
          Manual
        </button>
      </div>

      {/* Catalog mode */}
      {mode === "catalog" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Produto</Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um produto do catálogo..." />
              </SelectTrigger>
              <SelectContent>
                {activeProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-mono text-[11px] text-muted-foreground mr-2">
                      {p.product_code}
                    </span>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auto-filled dimensions preview */}
          {selectedProduct && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs grid grid-cols-3 gap-2">
              <div>
                <span className="text-muted-foreground">Dimensões</span>
                <p className="font-medium">
                  {selectedProduct.dimensions_cm
                    ? `${selectedProduct.dimensions_cm.height ?? "–"} × ${selectedProduct.dimensions_cm.width ?? "–"} × ${selectedProduct.dimensions_cm.length ?? "–"} cm`
                    : "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Peso</span>
                <p className="font-medium">
                  {selectedProduct.weight_kg != null ? `${selectedProduct.weight_kg} kg` : "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Código</span>
                <p className="font-mono font-medium">{selectedProduct.product_code}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual mode */}
      {mode === "manual" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Altura (cm)</Label>
              <Input
                type="number"
                min={1}
                placeholder="ex: 15"
                value={height}
                onChange={(e) => setHeight(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Largura (cm)</Label>
              <Input
                type="number"
                min={1}
                placeholder="ex: 20"
                value={width}
                onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Comprimento (cm)</Label>
              <Input
                type="number"
                min={1}
                placeholder="ex: 30"
                value={length}
                onChange={(e) => setLength(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Peso (kg)</Label>
              <Input
                type="number"
                min={0.1}
                step={0.1}
                placeholder="ex: 2.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor declarado (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="ex: 150.00"
                value={insValue}
                onChange={(e) => setInsValue(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Quantity + CEP row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Quantidade</Label>
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">CEP de destino</Label>
          <Input
            placeholder="00000-000"
            value={toCep}
            onChange={(e) => setToCep(formatCep(e.target.value))}
            maxLength={9}
          />
        </div>
      </div>

      {/* Submit */}
      <Button
        className="w-full gap-2"
        disabled={!canSubmit || isLoading}
        onClick={handleSubmit}
      >
        {isLoading ? (
          <>
            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            Calculando...
          </>
        ) : (
          <>
            <Truck className="h-4 w-4" />
            Calcular Frete
          </>
        )}
      </Button>
    </div>
  );
}
