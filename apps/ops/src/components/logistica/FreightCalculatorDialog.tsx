// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Separator } from "@/components/ui/separator";
import { Calculator, MapPin, Truck, Clock, AlertCircle } from "lucide-react";

interface FreightCalculatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface CarrierResult {
  name: string;
  service: string;
  days: string;
  price: number;
}

// Resultado MOCK — valores ilustrativos, não são reais.
const MOCK_RESULTS: CarrierResult[] = [
  { name: "Correios", service: "PAC", days: "6–8 dias úteis", price: 38.9 },
  { name: "Jadlog", service: "Package", days: "4–5 dias úteis", price: 52.4 },
  { name: "Braspress", service: "Rodoviário", days: "3–4 dias úteis", price: 67.0 },
  { name: "Correios", service: "Sedex", days: "2–3 dias úteis", price: 94.5 },
];

export function FreightCalculatorDialog({ open, onOpenChange }: FreightCalculatorDialogProps) {
  const [origem, setOrigem] = useState("Natal / RN — 59000-000");
  const [cep, setCep] = useState("");
  const [peso, setPeso] = useState("");
  const [altura, setAltura] = useState("");
  const [largura, setLargura] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [showResult, setShowResult] = useState(false);

  const handleClose = (o: boolean) => {
    if (!o) setShowResult(false);
    onOpenChange(o);
  };

  const cheapest = Math.min(...MOCK_RESULTS.map((r) => r.price));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Calculadora de Frete
          </DialogTitle>
          <DialogDescription>
            Simule o frete por transportadora com base em destino e dimensões.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Origem</Label>
            <Input value={origem} onChange={(e) => setOrigem(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Destino (CEP)</Label>
            <Input
              placeholder="00000-000"
              maxLength={9}
              value={cep}
              onChange={(e) => setCep(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Peso (kg)</Label>
              <Input
                type="number"
                min={0.1}
                step={0.1}
                placeholder="ex: 2.5"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Dimensões (cm)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                min={1}
                placeholder="Altura"
                value={altura}
                onChange={(e) => setAltura(e.target.value)}
              />
              <Input
                type="number"
                min={1}
                placeholder="Largura"
                value={largura}
                onChange={(e) => setLargura(e.target.value)}
              />
              <Input
                type="number"
                min={1}
                placeholder="Compr."
                value={comprimento}
                onChange={(e) => setComprimento(e.target.value)}
              />
            </div>
          </div>

          <Button className="w-full gap-2" onClick={() => setShowResult(true)}>
            <Calculator className="h-4 w-4" /> Calcular
          </Button>

          {showResult && (
            <>
              <Separator />
              <div className="rounded-lg border bg-card overflow-hidden">
                <div className="px-3 py-2 bg-red-50 dark:bg-red-950/30 text-[11px] text-red-700 dark:text-red-300 border-b flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    <strong>Cotação simulada</strong> — valores ilustrativos, não são reais.
                  </span>
                </div>
                <div className="divide-y">
                  {MOCK_RESULTS.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{r.name}</span>
                          <span className="text-xs text-muted-foreground">· {r.service}</span>
                          {r.price === cheapest && (
                            <CarboBadge variant="success" size="sm">
                              Mais barato
                            </CarboBadge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" /> {r.days}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{brl(r.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
