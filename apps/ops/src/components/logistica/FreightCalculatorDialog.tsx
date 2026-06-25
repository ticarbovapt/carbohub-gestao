// Cotação de frete via Melhor Envio (edge function melhor-envio-quote): retorna
// transportadoras reais com preço e prazo. Origem padrão: CD SP (Guarulhos).
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
import { Calculator, Truck, Clock, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCalculateFreight, ORIGIN_LABEL, type FreightCarrier } from "@/hooks/useFreightQuote";

interface FreightCalculatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const prazo = (min: number | null, max: number | null) => {
  if (min == null && max == null) return "—";
  if (min != null && max != null && min !== max) return `${min}–${max} dias úteis`;
  return `${max ?? min} dia(s) úteis`;
};

export function FreightCalculatorDialog({ open, onOpenChange }: FreightCalculatorDialogProps) {
  const calc = useCalculateFreight();
  const [cep, setCep] = useState("");
  const [peso, setPeso] = useState("");
  const [altura, setAltura] = useState("");
  const [largura, setLargura] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [valor, setValor] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [results, setResults] = useState<FreightCarrier[]>([]);
  const [isMock, setIsMock] = useState(false);

  const handleClose = (o: boolean) => {
    if (!o) { setShowResult(false); setResults([]); }
    onOpenChange(o);
  };

  const handleCalcular = async () => {
    const pesoNum = Number(peso) || 0;
    if (pesoNum <= 0) { toast.error("Informe o peso (kg)."); return; }
    if (cep.replace(/\D/g, "").length !== 8) { toast.error("Informe um CEP de destino válido (8 dígitos)."); return; }
    try {
      const res = await calc.mutateAsync({
        to_cep: cep,
        products: [{
          id: "1",
          weight: pesoNum,
          height: Number(altura) || 1,
          width: Number(largura) || 1,
          length: Number(comprimento) || 1,
          insurance_value: Number(valor) || 0,
          quantity: 1,
        }],
      });
      setResults(res.carriers);
      setIsMock(res.env === "mock");
      setShowResult(true);
      if (res.carriers.length === 0) toast.info("Nenhuma transportadora retornou cotação para este CEP/pacote.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao calcular frete.");
    }
  };

  const cheapest = results.length ? Math.min(...results.map((r) => r.price)) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Calculadora de Frete
          </DialogTitle>
          <DialogDescription>
            Cotação via Melhor Envio por transportadora (destino + peso/dimensões). Origem: {ORIGIN_LABEL}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
              <Input type="number" min={0.1} step={0.1} placeholder="ex: 2.5" value={peso} onChange={(e) => setPeso(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor da mercadoria (R$)</Label>
              <Input type="number" min={0} step={0.01} placeholder="seguro (opcional)" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Dimensões (cm)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input type="number" min={1} placeholder="Altura" value={altura} onChange={(e) => setAltura(e.target.value)} />
              <Input type="number" min={1} placeholder="Largura" value={largura} onChange={(e) => setLargura(e.target.value)} />
              <Input type="number" min={1} placeholder="Compr." value={comprimento} onChange={(e) => setComprimento(e.target.value)} />
            </div>
          </div>

          <Button className="w-full gap-2" onClick={handleCalcular} disabled={calc.isPending}>
            {calc.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</>
              : <><Calculator className="h-4 w-4" /> Calcular</>}
          </Button>

          {showResult && (
            <>
              <Separator />
              <div className="rounded-lg border bg-card overflow-hidden">
                {isMock && (
                  <div className="px-3 py-2 bg-red-50 dark:bg-red-950/30 text-[11px] text-red-700 dark:text-red-300 border-b flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span><strong>Cotação simulada</strong> — token do Melhor Envio não configurado; valores ilustrativos.</span>
                  </div>
                )}
                <div className="divide-y">
                  {results.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum resultado de cotação.</p>
                  )}
                  {results.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{r.company}</span>
                          <span className="text-xs text-muted-foreground">· {r.name}</span>
                          {r.price === cheapest && (
                            <CarboBadge variant="success" size="sm">Mais barato</CarboBadge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" /> {prazo(r.delivery_min, r.delivery_max)}
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
