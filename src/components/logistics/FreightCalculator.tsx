import { useState, useEffect, useRef } from "react";
import { MapPin, Package, Pencil, Truck, Loader2, CheckCircle2, XCircle } from "lucide-react";
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

// ── ViaCEP ────────────────────────────────────────────────────────────────────
interface ViaCepResult {
  logradouro?: string;
  bairro?: string;
  localidade: string;  // cidade
  uf: string;          // estado
  erro?: boolean;
}

async function lookupCep(cep: string): Promise<ViaCepResult | null> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!res.ok) return null;
    const json: ViaCepResult = await res.json();
    if (json.erro) return null;
    return json;
  } catch {
    return null;
  }
}

// ── CEP Input with auto-fill ───────────────────────────────────────────────────
interface CepInputProps {
  value: string;
  onChange: (raw: string, city?: string, state?: string) => void;
}

function CepInput({ value, onChange }: CepInputProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [cityLabel, setCityLabel] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const digits = value.replace(/\D/g, "");

  const handleChange = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 8);
    const formatted = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    onChange(formatted);
    setCityLabel("");
    setStatus("idle");

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (d.length === 8) {
      setStatus("loading");
      debounceRef.current = setTimeout(async () => {
        const result = await lookupCep(d);
        if (result) {
          setStatus("ok");
          const label = `${result.localidade} / ${result.uf}`;
          setCityLabel(label);
          onChange(formatted, result.localidade, result.uf);
        } else {
          setStatus("error");
          setCityLabel("CEP não encontrado");
          onChange(formatted, undefined, undefined);
        }
      }, 400);
    }
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs">CEP de destino</Label>
      <div className="relative">
        <Input
          placeholder="00000-000"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={9}
          className={cn(
            "pr-8",
            status === "ok"    && "border-green-500 focus-visible:ring-green-500/30",
            status === "error" && "border-destructive focus-visible:ring-destructive/30"
          )}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {status === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {status === "ok"      && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
          {status === "error"   && <XCircle className="h-3.5 w-3.5 text-destructive" />}
        </div>
      </div>
      {/* Cidade/estado preenchidos */}
      {cityLabel && (
        <p className={cn(
          "text-[11px] flex items-center gap-1",
          status === "ok"    ? "text-green-500" : "text-destructive"
        )}>
          {status === "ok" && <MapPin className="h-3 w-3" />}
          {cityLabel}
        </p>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface FreightCalculatorProps {
  onCalculate: (payload: {
    to_cep:     string;
    products:   FreightProduct[];
    productRef: string;
    quantity:   number;
    to_city?:   string;
    to_state?:  string;
  }) => void;
  isLoading?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FreightCalculator({ onCalculate, isLoading }: FreightCalculatorProps) {
  const { data: mrpProducts = [] } = useMrpProducts();

  const [mode, setMode]       = useState<"catalog" | "manual">("catalog");
  const [toCep, setToCep]     = useState("");
  const [toCity, setToCity]   = useState<string | undefined>();
  const [toState, setToState] = useState<string | undefined>();
  const [quantity, setQuantity] = useState(1);

  // Catalog mode
  const [selectedProductId, setSelectedProductId] = useState<string>("");

  // Manual mode
  const [height,   setHeight]   = useState<number | "">("");
  const [width,    setWidth]    = useState<number | "">("");
  const [length,   setLength]   = useState<number | "">("");
  const [weight,   setWeight]   = useState<number | "">("");
  const [insValue, setInsValue] = useState<number | "">(0);

  const activeProducts = mrpProducts.filter((p) => p.is_active);
  const selectedProduct = activeProducts.find((p) => p.id === selectedProductId);

  const canSubmit = (() => {
    const cepOk = toCep.replace(/\D/g, "").length === 8;
    if (mode === "catalog") return cepOk && !!selectedProductId;
    return (
      cepOk &&
      Number(height) > 0 &&
      Number(width)  > 0 &&
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

    onCalculate({ to_cep: rawCep, products: [product], productRef, quantity, to_city: toCity, to_state: toState });
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
              <Input type="number" min={1} placeholder="ex: 15" value={height}
                onChange={(e) => setHeight(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Largura (cm)</Label>
              <Input type="number" min={1} placeholder="ex: 20" value={width}
                onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Comprimento (cm)</Label>
              <Input type="number" min={1} placeholder="ex: 30" value={length}
                onChange={(e) => setLength(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Peso (kg)</Label>
              <Input type="number" min={0.1} step={0.1} placeholder="ex: 2.5" value={weight}
                onChange={(e) => setWeight(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor declarado (R$)</Label>
              <Input type="number" min={0} step={0.01} placeholder="ex: 150.00" value={insValue}
                onChange={(e) => setInsValue(e.target.value === "" ? "" : Number(e.target.value))} />
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

        {/* CEP com ViaCEP */}
        <CepInput
          value={toCep}
          onChange={(formatted, city, state) => {
            setToCep(formatted);
            setToCity(city);
            setToState(state);
          }}
        />
      </div>

      {/* Submit */}
      <Button
        className="w-full gap-2"
        disabled={!canSubmit || isLoading}
        onClick={handleSubmit}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
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
