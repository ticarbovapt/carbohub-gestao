import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateRC, useRCRequests } from "@/hooks/useRCPurchasing";
import { CENTROS_CUSTO } from "@/types/rcPurchasing";
import { Loader2, Lightbulb } from "lucide-react";

const STORAGE_KEY = "carbo_rc_last_values";
const UNIDADES = ["un", "kg", "L", "m", "cx", "pct", "par", "kit", "rolo", "fardo"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getLastValues() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch { return {}; }
}

function saveLastValues(vals: Record<string, any>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vals));
}

export function CreateRCDialog({ open, onOpenChange }: Props) {
  const last = getLastValues();
  const [produtoNome, setProdutoNome] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [unidade, setUnidade] = useState(last.unidade || "un");
  const [justificativa, setJustificativa] = useState("");
  const [centroCusto, setCentroCusto] = useState(last.centroCusto || "Operações");
  const [valorEstimado, setValorEstimado] = useState<string>("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const createRC = useCreateRC();
  const { data: previousRCs } = useRCRequests();

  // Unique product names from previous RCs for suggestions
  const productSuggestions = useMemo(() => {
    if (!previousRCs) return [];
    const names = new Set<string>();
    previousRCs.forEach(rc => {
      if (rc.produto_nome) names.add(rc.produto_nome);
    });
    return Array.from(names).slice(0, 10);
  }, [previousRCs]);

  const filteredSuggestions = useMemo(() => {
    if (!produtoNome) return productSuggestions;
    const q = produtoNome.toLowerCase();
    return productSuggestions.filter(s => s.toLowerCase().includes(q));
  }, [produtoNome, productSuggestions]);

  // Reset form on open
  useEffect(() => {
    if (open) {
      const last = getLastValues();
      setProdutoNome("");
      setQuantidade(1);
      setUnidade(last.unidade || "un");
      setJustificativa("");
      setCentroCusto(last.centroCusto || "Operações");
      setValorEstimado("");
    }
  }, [open]);

  const handleSelectSuggestion = (name: string) => {
    setProdutoNome(name);
    setShowSuggestions(false);
    // Auto-fill from the most recent RC with that product
    const match = previousRCs?.find(rc => rc.produto_nome === name);
    if (match) {
      setUnidade(match.unidade);
      setCentroCusto(match.centro_custo);
      if (match.valor_estimado > 0) {
        setValorEstimado(String(match.valor_estimado));
      }
    }
  };

  const handleSubmit = () => {
    if (!produtoNome || !justificativa) return;
    const valor = parseFloat(valorEstimado) || 0;
    saveLastValues({ unidade, centroCusto });
    createRC.mutate({
      produto_nome: produtoNome,
      quantidade,
      unidade,
      justificativa,
      centro_custo: centroCusto,
      valor_estimado: valor,
    }, {
      onSuccess: () => {
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Requisição de Compra</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {/* Produto com autocomplete */}
          <div className="grid gap-2 relative">
            <Label>Produto / Material <span className="text-destructive">*</span></Label>
            <Input
              value={produtoNome}
              onChange={e => { setProdutoNome(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Ex: Copo descartável 200ml"
              autoComplete="off"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto">
                <div className="px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1 border-b">
                  <Lightbulb className="h-3 w-3" />
                  Produtos anteriores
                </div>
                {filteredSuggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                    onMouseDown={() => handleSelectSuggestion(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Quantidade</Label>
              <Input type="number" min={1} value={quantidade} onChange={e => setQuantidade(Number(e.target.value))} />
            </div>
            <div className="grid gap-2">
              <Label>Unidade</Label>
              <Select value={unidade} onValueChange={setUnidade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIDADES.map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Valor Estimado (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={valorEstimado}
                onChange={e => setValorEstimado(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Centro de Custo</Label>
              <Select value={centroCusto} onValueChange={setCentroCusto}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CENTROS_CUSTO.map(cc => (
                    <SelectItem key={cc} value={cc}>{cc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Justificativa <span className="text-destructive">*</span></Label>
            <Textarea
              value={justificativa}
              onChange={e => setJustificativa(e.target.value)}
              placeholder="Ex: Reposição de estoque para operação semanal..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createRC.isPending || !produtoNome || !justificativa} className="carbo-gradient text-white">
            {createRC.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar RC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
