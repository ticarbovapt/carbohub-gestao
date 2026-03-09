import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStockMovements, useCreateStockMovement } from "@/hooks/useStockMovements";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function StockMovementsList() {
  const { isCeo, isAnyGestor } = useAuth();
  const [tipoFilter, setTipoFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [productId, setProductId] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [quantidade, setQuantidade] = useState(0);
  const [origem, setOrigem] = useState<"PC" | "OP" | "ajuste">("ajuste");
  const [obs, setObs] = useState("");

  const { data: movements, isLoading } = useStockMovements(
    tipoFilter !== "all" ? { tipo: tipoFilter } : undefined
  );
  const createMovement = useCreateStockMovement();

  const { data: products } = useQuery({
    queryKey: ["mrp-products-list"],
    queryFn: async () => {
      const { data } = await supabase.from("mrp_products").select("id, name, product_code").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const handleCreate = () => {
    if (!productId || quantidade <= 0) return;
    createMovement.mutate({
      product_id: productId,
      tipo,
      quantidade,
      origem,
      observacoes: obs || undefined,
    }, {
      onSuccess: () => {
        setShowCreate(false);
        setProductId(""); setQuantidade(0); setObs("");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center justify-between">
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="entrada">Entradas</SelectItem>
            <SelectItem value="saida">Saídas</SelectItem>
          </SelectContent>
        </Select>
        {(isCeo || isAnyGestor) && (
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 carbo-gradient text-white">
            <Plus className="h-3.5 w-3.5" />
            Movimento Manual
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (movements || []).length === 0 ? (
        <CarboCard>
          <CarboCardContent className="py-12 text-center">
            <p className="text-muted-foreground">Nenhum movimento registrado</p>
          </CarboCardContent>
        </CarboCard>
      ) : (
        <div className="space-y-2">
          {movements?.map(m => (
            <CarboCard key={m.id}>
              <CarboCardContent className="py-3">
                <div className="flex items-center gap-3">
                  {(m as any).tipo === 'entrada' ? (
                    <ArrowDownToLine className="h-4 w-4 text-carbo-green flex-shrink-0" />
                  ) : (
                    <ArrowUpFromLine className="h-4 w-4 text-destructive flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{(m as any).product_name || (m as any).product_id}</p>
                      <CarboBadge variant={(m as any).tipo === 'entrada' ? 'success' : 'destructive'}>
                        {(m as any).tipo === 'entrada' ? 'Entrada' : 'Saída'}
                      </CarboBadge>
                      <CarboBadge variant="secondary">{(m as any).origem}</CarboBadge>
                    </div>
                    {(m as any).observacoes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{(m as any).observacoes}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{(m as any).quantidade}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(m.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </CarboCardContent>
            </CarboCard>
          ))}
        </div>
      )}

      {/* Create Movement Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Movimento de Estoque</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Produto</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Selecionar produto" /></SelectTrigger>
                <SelectContent>
                  {products?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.product_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={v => setTipo(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="saida">Saída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Quantidade</Label>
                <Input type="number" min={1} value={quantidade} onChange={e => setQuantidade(Number(e.target.value))} />
              </div>
              <div className="grid gap-2">
                <Label>Origem</Label>
                <Select value={origem} onValueChange={v => setOrigem(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PC">PC</SelectItem>
                    <SelectItem value="OP">OP</SelectItem>
                    <SelectItem value="ajuste">Ajuste</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Observações</Label>
              <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createMovement.isPending || !productId || quantidade <= 0} className="carbo-gradient text-white">
              {createMovement.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
