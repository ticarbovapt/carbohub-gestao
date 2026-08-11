import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMrpProductMutations } from "@/hooks/useMrpProductMutations";
import { useProdutoHubs, useSalvarProdutoHubs } from "@/hooks/useProdutoHubs";
import { HUBS } from "@/components/estoque/stockData";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect } from "react";

// "Semi-acabado" = etapa intermediária (ex.: garrafa envasada sem rótulo). Tem BOM
// própria (garrafa+líquido+tampa) e é consumida pelo Produto Final na hora de rotular.
const CATEGORIES = ["Produto Final", "Semi-acabado", "Insumo", "Embalagem", "Carbonatação", "Outro"];
const UNITS = ["un", "L", "ml", "kg", "g", "cx"];

// Gera o código a partir do nome: maiúsculas, sem acento, cada palavra abreviada
// em até 3 caracteres, unidas por hífen. Ex.: "Reagente base" → "REA-BAS".
const toCode = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 3))
    .join("-");

export interface MrpProductFormInitial {
  name?: string;
  product_code?: string;
  category?: string;
  stock_unit?: string;
  safety_stock_qty?: number;
  unit_cost?: number;
  notes?: string;
}

interface MrpProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  id?: string;
  initial?: MrpProductFormInitial;
}

export function MrpProductFormDialog({ open, onOpenChange, mode, id, initial }: MrpProductFormDialogProps) {
  const { create, update } = useMrpProductMutations();
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.product_code ?? "");
  // No modo criar, o código segue o nome até o usuário editá-lo manualmente.
  const [codeTouched, setCodeTouched] = useState(mode === "edit");

  const onNameChange = (v: string) => {
    setName(v);
    if (!codeTouched) setCode(toCode(v));
  };
  const onCodeChange = (v: string) => {
    setCodeTouched(true);
    setCode(v);
  };
  const [category, setCategory] = useState(initial?.category ?? "Insumo");
  const [unit, setUnit] = useState(initial?.stock_unit ?? "un");
  const [safetyStock, setSafetyStock] = useState(String(initial?.safety_stock_qty ?? 0));
  const [unitCost, setUnitCost] = useState(String(initial?.unit_cost ?? 0));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  /* ── Em quais hubs este produto existe ────────────────────────────────
   *
   * Começa com TODOS marcados. Isso não é preguiça: a tabela guarda exceção,
   * não permissão, e "sem informação" significa "existe em todos" no resto do
   * sistema. Se aqui começasse desmarcado, criar um produto o esconderia de
   * toda a operação — e o cadastro pareceria ter funcionado. */
  const hubsSalvos = useProdutoHubs(mode === "edit" ? id : undefined);
  const salvarHubs = useSalvarProdutoHubs();
  const [hubsMarcados, setHubsMarcados] = useState<Record<string, boolean>>(
    () => Object.fromEntries(HUBS.map((h) => [h.id, true])),
  );
  useEffect(() => {
    if (hubsSalvos.data) setHubsMarcados(hubsSalvos.data);
  }, [hubsSalvos.data]);

  const pending = create.isPending || update.isPending || salvarHubs.isPending;

  const handleSubmit = async () => {
    const payload = {
      name, product_code: code, category, stock_unit: unit,
      safety_stock_qty: Number(safetyStock) || 0,
      unit_cost: Number(unitCost) || 0,
      notes,
    };
    try {
      let productId = id;
      if (mode === "edit" && id) await update.mutateAsync({ id, ...payload });
      else {
        const criado = await create.mutateAsync(payload);
        // No modo criar o id só existe DEPOIS de gravar — os hubs vão numa
        // segunda etapa por isso, não por descuido.
        productId = criado?.id;
      }

      // ⚠️ Falha aqui NÃO desfaz o produto. O cadastro é o que importa; a
      // marcação de hub é organização de tela e o padrão dela (todos) é
      // seguro. Avisar e seguir é melhor que perder o produto digitado.
      if (productId) {
        try {
          await salvarHubs.mutateAsync({ productId, marcado: hubsMarcados });
        } catch {
          toast.warning("Produto salvo, mas não consegui gravar os hubs. Edite o produto para tentar de novo.");
        }
      }

      toast.success(mode === "create" ? "Produto criado." : "Produto atualizado.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o produto.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Novo Produto" : "Editar Produto"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Cadastre um item no catálogo MRP (insumo, embalagem ou SKU)." : "Atualize os dados do item no catálogo MRP."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input placeholder="Reagente base" value={name} onChange={(e) => onNameChange(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Código *</Label>
              <Input placeholder="REA-BAS" value={code} onChange={(e) => onCodeChange(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Estoque de Segurança (referência)</Label>
            <Input type="number" placeholder="0" value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">O mínimo por hub que aciona a reposição é configurado em Suprimentos → Política de Estoque.</p>
          </div>

          <div className="space-y-2">
            <Label>Custo unitário (R$)</Label>
            <Input type="number" step="0.01" min="0" placeholder="0,00" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Usado para calcular o valor mobilizado em estoque (visível no Carbo Admin → Estoque &amp; Custos).</p>
          </div>

          <div className="space-y-2">
            <Label>Onde este produto existe</Label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-3">
              {HUBS.map((h) => (
                <label key={h.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={hubsMarcados[h.id] !== false}
                    onCheckedChange={(v) =>
                      setHubsMarcados((m) => ({ ...m, [h.id]: v === true }))}
                  />
                  <span className="truncate">{h.label}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Desmarcar tira o produto da tela de estoque daquele hub.
              {" "}
              <strong>Produto com saldo continua aparecendo</strong>, sinalizado — esconder
              estoque que existe seria pior que a poluição da lista.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea placeholder="Observações sobre o produto..." rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : (mode === "create" ? "Criar Produto" : "Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
