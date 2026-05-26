import { useState } from "react";
import { Send } from "lucide-react";
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
  open:          boolean;
  onClose:       () => void;
  spWarehouseId: string;
  rnWarehouseId: string;
}

export function CDSPRegistrarEnvio({ open, onClose, spWarehouseId, rnWarehouseId }: Props) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState("");
  const [quantity,  setQuantity]  = useState("");
  const [notes,     setNotes]     = useState("");

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

  const send = useMutation({
    mutationFn: async () => {
      const product = products?.find(p => p.id === productId);
      if (!product) throw new Error("Produto não encontrado");
      const { error } = await supabase.from("stock_transfers").insert({
        product_id:   productId,
        product_code: product.product_code,
        from_hub:     rnWarehouseId,
        to_hub:       spWarehouseId,
        quantity:     Number(quantity),
        status:       "approved",
        notes:        notes.trim() || "Envio para CD São Paulo",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sp-transito"] });
      toast.success("Envio registrado — aparecerá como Em Trânsito");
      onClose();
      setProductId(""); setQuantity(""); setNotes("");
    },
    onError: (e: Error) => toast.error("Erro ao registrar envio", { description: e.message }),
  });

  const isValid = !!productId && Number(quantity) > 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-carbo-blue" />
            Registrar Envio para CD São Paulo
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Produto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o produto" />
              </SelectTrigger>
              <SelectContent>
                {(products || []).map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.product_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade enviada</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="Ex: 500"
            />
          </div>
          <div>
            <Label>Observações <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Remessa semana 22, NF 12345..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => send.mutate()}
            disabled={!isValid || send.isPending}
            className="carbo-gradient text-white gap-1.5"
          >
            <Send className="h-4 w-4" />
            Registrar Envio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
