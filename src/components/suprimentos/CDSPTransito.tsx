import { Truck, CheckCircle, Package } from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  spWarehouseId: string;
}

export function CDSPTransito({ spWarehouseId }: Props) {
  const qc = useQueryClient();

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["sp-transito", spWarehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select("*, mrp_products:product_id(name, stock_unit)")
        .eq("to_hub", spWarehouseId)
        .in("status", ["approved", "suggested"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!spWarehouseId,
  });

  const confirmArrival = useMutation({
    mutationFn: async (transfer: Record<string, unknown>) => {
      const productId  = transfer.product_id as string;
      const qty        = transfer.quantity as number;
      const transferId = transfer.id as string;

      // Atualiza warehouse_stock do HUB-SP
      const { data: ws } = await supabase
        .from("warehouse_stock")
        .select("id, quantity")
        .eq("warehouse_id", spWarehouseId)
        .eq("product_id", productId)
        .maybeSingle();

      if (ws) {
        await supabase.from("warehouse_stock")
          .update({ quantity: (ws.quantity as number) + qty, updated_at: new Date().toISOString() })
          .eq("id", ws.id);
      } else {
        await supabase.from("warehouse_stock")
          .insert({ warehouse_id: spWarehouseId, product_id: productId, quantity: qty });
      }

      // Marca transferência como executada (sem stock_movement — transferências não contaminam KPIs de hub)
      await supabase.from("stock_transfers")
        .update({
          status:       "executed",
          executed_by:  user!.id,
          executed_at:  new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        } as never)
        .eq("id", transferId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sp-transito"] });
      qc.invalidateQueries({ queryKey: ["rn-envios-sp"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["suprimentos-kpis-hub"] });
      qc.invalidateQueries({ queryKey: ["mrp-products-stock"] });
      toast.success("Chegada confirmada — estoque atualizado no CD SP");
    },
    onError: () => toast.error("Erro ao confirmar chegada"),
  });

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;
  }

  if (!transfers || transfers.length === 0) {
    return (
      <CarboCard>
        <CarboCardContent className="py-12 text-center">
          <Truck className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">Nenhum envio em trânsito</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use "Registrar Envio" quando remessas saírem da produção para o CD
          </p>
        </CarboCardContent>
      </CarboCard>
    );
  }

  const totalUnits = transfers.reduce((s, t) => s + (t.quantity as number), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Truck className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-medium">
          {transfers.length} {transfers.length === 1 ? "remessa" : "remessas"} em trânsito —{" "}
          <span className="text-blue-400">{totalUnits} unidades</span>
        </span>
      </div>

      {transfers.map(t => {
        const product = t.mrp_products as Record<string, string> | null;
        const qty     = t.quantity as number;
        const notes   = t.notes as string | null;
        const createdAt = t.created_at as string;

        return (
          <CarboCard key={t.id as string}>
            <CarboCardContent className="py-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Package className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{product?.name || (t.product_code as string)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Registrado em {format(new Date(createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {notes ? ` · ${notes}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-xl">
                    {qty}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {product?.stock_unit || "un"}
                    </span>
                  </p>
                  <CarboBadge variant="info">Em trânsito</CarboBadge>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 bg-carbo-green hover:bg-carbo-green/90 text-white shrink-0"
                  onClick={() => confirmArrival.mutate(t as Record<string, unknown>)}
                  disabled={confirmArrival.isPending}
                >
                  <CheckCircle className="h-4 w-4" />
                  Confirmar Chegada
                </Button>
              </div>
            </CarboCardContent>
          </CarboCard>
        );
      })}
    </div>
  );
}
