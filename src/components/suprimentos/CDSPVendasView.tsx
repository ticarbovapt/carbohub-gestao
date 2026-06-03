import { Package, Truck, CheckCircle, Users, XCircle } from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  spVendasWarehouseId: string;
}

export function CDSPVendasView({ spVendasWarehouseId }: Props) {
  const qc = useQueryClient();

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["sp-vendas-transito", spVendasWarehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select("*, mrp_products:product_id(name, stock_unit)")
        .eq("to_hub", spVendasWarehouseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!spVendasWarehouseId,
  });

  // Confirmar chegada: credita warehouse_stock[HUB-SP-VENDAS] e marca como executado
  const confirmArrival = useMutation({
    mutationFn: async (transfer: Record<string, unknown>) => {
      const transferId = transfer.id as string;
      const productId  = transfer.product_id as string;
      const qty        = transfer.quantity as number;

      // T5: reivindica a remessa ANTES de creditar — update condicionado a
      // status='approved'. Se já foi recebida em outra aba/usuário, voltam 0
      // linhas e abortamos sem creditar de novo (evita crédito em dobro).
      const { data: claimed, error: claimErr } = await supabase
        .from("stock_transfers")
        .update({
          status:      "executed",
          executed_at: new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        } as never)
        .eq("id", transferId)
        .eq("status", "approved")
        .select("id");
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) {
        throw new Error("Esta remessa já foi recebida.");
      }

      // Credita (ou cria) linha em warehouse_stock do CD SP Vendas
      const { data: ws } = await supabase
        .from("warehouse_stock")
        .select("id, quantity")
        .eq("warehouse_id", spVendasWarehouseId)
        .eq("product_id", productId)
        .maybeSingle();

      if (ws) {
        await supabase.from("warehouse_stock")
          .update({ quantity: (ws.quantity as number) + qty, updated_at: new Date().toISOString() })
          .eq("id", ws.id);
      } else {
        await supabase.from("warehouse_stock")
          .insert({ warehouse_id: spVendasWarehouseId, product_id: productId, quantity: qty });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sp-vendas-transito"] });
      qc.invalidateQueries({ queryKey: ["rn-envios-sp"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      qc.invalidateQueries({ queryKey: ["suprimentos-kpis-hub"] });
      toast.success("Chegada confirmada — estoque atualizado no CD SP Vendas");
    },
    onError: () => toast.error("Erro ao confirmar chegada"),
  });

  const revertTransfer = useMutation({
    mutationFn: async (transfer: Record<string, unknown>) => {
      const transferId = transfer.id as string;
      const productId  = transfer.product_id as string;
      const qty        = transfer.quantity as number;
      const fromHub    = transfer.from_hub as string; // HUB-RN

      // Devolve ao warehouse_stock do Hub Natal
      const { data: ws } = await supabase
        .from("warehouse_stock")
        .select("id, quantity")
        .eq("warehouse_id", fromHub)
        .eq("product_id", productId)
        .maybeSingle();

      if (ws) {
        await supabase.from("warehouse_stock")
          .update({ quantity: (ws.quantity as number) + qty, updated_at: new Date().toISOString() })
          .eq("id", ws.id);
      } else {
        await supabase.from("warehouse_stock")
          .insert({ warehouse_id: fromHub, product_id: productId, quantity: qty });
      }

      // Cancela a transferência
      const { error } = await supabase
        .from("stock_transfers")
        .update({ status: "cancelled", updated_at: new Date().toISOString() } as never)
        .eq("id", transferId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sp-vendas-transito"] });
      qc.invalidateQueries({ queryKey: ["rn-envios-sp"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      qc.invalidateQueries({ queryKey: ["suprimentos-kpis-hub"] });
      toast.success("Envio estornado — estoque devolvido ao Hub Natal");
    },
    onError: () => toast.error("Erro ao estornar envio"),
  });

  const pending  = (transfers || []).filter(t => (t.status as string) !== "executed");
  const executed = (transfers || []).filter(t => (t.status as string) === "executed");
  const totalPending = pending.reduce((s, t) => s + (t.quantity as number), 0);

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;
  }

  if (!transfers || transfers.length === 0) {
    return (
      <CarboCard>
        <CarboCardContent className="py-12 text-center">
          <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">Nenhuma remessa registrada</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use "Registrar Envio para CD SP" → destino "CD SP Vendas" para registrar envios aos licenciados
          </p>
        </CarboCardContent>
      </CarboCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="flex items-center gap-5 px-1 flex-wrap">
        {pending.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium text-blue-400">
              {pending.length} em trânsito — {totalPending.toLocaleString("pt-BR")} unidades
            </span>
          </div>
        )}
        {executed.length > 0 && (
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-carbo-green" />
            <span className="text-sm font-medium text-muted-foreground">
              {executed.length} entregue{executed.length > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {transfers.map(t => {
        const product   = t.mrp_products as Record<string, string> | null;
        const qty       = t.quantity as number;
        const notes     = t.notes as string | null;
        const createdAt = t.created_at as string;
        const status    = t.status as string;
        const done      = status === "executed";

        return (
          <CarboCard key={t.id as string}>
            <CarboCardContent className="py-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className={`p-2 rounded-lg ${done ? "bg-green-500/10" : "bg-blue-500/10"}`}>
                  {done
                    ? <CheckCircle className="h-5 w-5 text-carbo-green" />
                    : <Package className="h-5 w-5 text-blue-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{product?.name || (t.product_code as string)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {notes ? ` · ${notes}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-xl">
                    {qty.toLocaleString("pt-BR")}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {product?.stock_unit || "un"}
                    </span>
                  </p>
                  <CarboBadge variant={done ? "success" : "info"}>
                    {done ? "Entregue" : "Em trânsito"}
                  </CarboBadge>
                </div>
                {!done && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-green-500/30 text-carbo-green hover:bg-green-500/10"
                      onClick={() => confirmArrival.mutate(t as Record<string, unknown>)}
                      disabled={confirmArrival.isPending || revertTransfer.isPending}
                    >
                      <CheckCircle className="h-4 w-4" />
                      Confirmar chegada
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => revertTransfer.mutate(t as Record<string, unknown>)}
                      disabled={confirmArrival.isPending || revertTransfer.isPending}
                    >
                      <XCircle className="h-4 w-4" />
                      Não chegou / Estornar
                    </Button>
                  </div>
                )}
              </div>
            </CarboCardContent>
          </CarboCard>
        );
      })}
    </div>
  );
}
