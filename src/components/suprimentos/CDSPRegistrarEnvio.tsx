import { useState } from "react";
import { Send, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open:              boolean;
  onClose:           () => void;
  spWarehouseId:     string; // HUB-SP (LogHouse)
  spVendasWarehouseId?: string; // HUB-SP-VENDAS
  rnWarehouseId:     string;
}

interface EnvioRow {
  id:          number;
  productId:   string;
  destinoId:   string;
  quantity:    string;
  notes:       string;
}

let nextId = 1;
const newRow = (defaultDestino: string): EnvioRow => ({
  id:        nextId++,
  productId: "",
  destinoId: defaultDestino,
  quantity:  "",
  notes:     "",
});

export function CDSPRegistrarEnvio({
  open, onClose, spWarehouseId, spVendasWarehouseId, rnWarehouseId,
}: Props) {
  const qc = useQueryClient();

  const destinos = [
    { id: spWarehouseId,           label: "CD SP LogHouse",  desc: "E-commerce / estoque principal" },
    ...(spVendasWarehouseId ? [{ id: spVendasWarehouseId, label: "CD SP Vendas", desc: "Licenciados / lojas físicas" }] : []),
  ];

  const [rows, setRows] = useState<EnvioRow[]>([newRow(spWarehouseId)]);

  const { data: products } = useQuery({
    queryKey: ["mrp-products-final"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mrp_products")
        .select("id, name, product_code, stock_unit")
        .eq("is_active", true)
        .eq("category", "Produto Final")
        .order("name");
      return data || [];
    },
  });

  const addRow = () => setRows(r => [...r, newRow(spWarehouseId)]);
  const removeRow = (id: number) => setRows(r => r.filter(x => x.id !== id));
  const updateRow = (id: number, field: keyof EnvioRow, value: string) =>
    setRows(r => r.map(x => x.id === id ? { ...x, [field]: value } : x));

  const send = useMutation({
    mutationFn: async () => {
      const validRows = rows.filter(r => r.productId && Number(r.quantity) > 0 && r.destinoId);
      if (validRows.length === 0) throw new Error("Preencha ao menos um envio válido");

      for (const row of validRows) {
        const product = products?.find(p => p.id === row.productId);
        if (!product) continue;
        const qty = Number(row.quantity);
        const obs = row.notes.trim() || `Envio para ${destinos.find(d => d.id === row.destinoId)?.label ?? "CD São Paulo"}`;

        // Debita do warehouse_stock do Hub Natal — valida saldo ANTES (T4).
        // Sem esta checagem, enviar acima do saldo era "clampado" em 0 mas o
        // destino recebia a quantidade cheia, criando estoque do nada. Também
        // bloqueia o caso de não existir linha de estoque em Natal (que antes
        // pulava o débito mas criava a transferência mesmo assim).
        const { data: ws } = await supabase
          .from("warehouse_stock")
          .select("id, quantity")
          .eq("warehouse_id", rnWarehouseId)
          .eq("product_id", row.productId)
          .maybeSingle();

        const available = (ws?.quantity as number) ?? 0;
        if (!ws || available < qty) {
          throw new Error(
            `Estoque insuficiente em Natal para "${product.name}": disponível ${available}, envio solicitado ${qty}.`
          );
        }

        await supabase.from("warehouse_stock")
          .update({ quantity: available - qty, updated_at: new Date().toISOString() })
          .eq("id", ws.id);

        // Cria transferência para o destino escolhido
        const { error } = await supabase.from("stock_transfers").insert({
          product_id:   row.productId,
          product_code: product.product_code,
          from_hub:     rnWarehouseId,
          to_hub:       row.destinoId,
          quantity:     qty,
          status:       "approved",
          notes:        obs,
          pre_debited:  true, // T1: from_hub já foi debitado acima
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sp-transito"] });
      qc.invalidateQueries({ queryKey: ["sp-vendas-transito"] });
      qc.invalidateQueries({ queryKey: ["rn-envios-sp"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      qc.invalidateQueries({ queryKey: ["suprimentos-kpis-hub"] });
      qc.invalidateQueries({ queryKey: ["mrp-products-stock"] });
      toast.success("Envio(s) registrado(s) com sucesso");
      onClose();
      setRows([newRow(spWarehouseId)]);
    },
    onError: (e: Error) => toast.error("Erro ao registrar envio", { description: e.message }),
  });

  const isValid = rows.some(r => r.productId && Number(r.quantity) > 0 && r.destinoId);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-carbo-blue" />
            Registrar Envio para CD São Paulo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {rows.map((row, idx) => (
            <div key={row.id} className="rounded-lg border border-border p-3 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Envio {idx + 1}</span>
                {rows.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeRow(row.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* Destino */}
              <div>
                <Label className="text-xs">Destino</Label>
                <Select value={row.destinoId} onValueChange={v => updateRow(row.id, "destinoId", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {destinos.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        <div>
                          <p className="font-medium">{d.label}</p>
                          <p className="text-[11px] text-muted-foreground">{d.desc}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Produto */}
              <div>
                <Label className="text-xs">Produto</Label>
                <Select value={row.productId} onValueChange={v => updateRow(row.id, "productId", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {(products || []).map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} <span className="text-muted-foreground text-xs">({p.product_code})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Quantidade */}
                <div>
                  <Label className="text-xs">Quantidade</Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    placeholder="Ex: 500"
                    value={row.quantity}
                    onChange={e => updateRow(row.id, "quantity", e.target.value)}
                  />
                </div>
                {/* Observações */}
                <div>
                  <Label className="text-xs">Obs. <span className="text-muted-foreground">(opcional)</span></Label>
                  <Input
                    className="h-9"
                    placeholder="NF, remessa..."
                    value={row.notes}
                    onChange={e => updateRow(row.id, "notes", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5 border-dashed"
            onClick={addRow}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar outro envio
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => send.mutate()}
            disabled={!isValid || send.isPending}
            className="carbo-gradient text-white gap-1.5"
          >
            <Send className="h-4 w-4" />
            {send.isPending ? "Registrando..." : `Registrar ${rows.filter(r => r.productId && Number(r.quantity) > 0).length > 1 ? "Envios" : "Envio"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
