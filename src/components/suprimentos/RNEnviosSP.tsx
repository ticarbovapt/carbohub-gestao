import { Send, Truck, CheckCircle, XCircle } from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect } from "react";

interface Props {
  rnWarehouseId: string;
}

export function RNEnviosSP({ rnWarehouseId }: Props) {
  const qc = useQueryClient();

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["rn-envios-sp", rnWarehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select("*, mrp_products:product_id(name, stock_unit)")
        .eq("from_hub", rnWarehouseId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data || [];
    },
    enabled: !!rnWarehouseId,
  });

  // Fica em sincronia quando sp-transito confirma chegada
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["rn-envios-sp", rnWarehouseId] });
  }, []);

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;
  }

  if (!transfers || transfers.length === 0) {
    return (
      <CarboCard>
        <CarboCardContent className="py-12 text-center">
          <Send className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">Nenhum envio registrado</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use "Registrar Envio para CD SP" para registrar remessas
          </p>
        </CarboCardContent>
      </CarboCard>
    );
  }

  const emTransito = transfers.filter(t => (t.status as string) === "approved" || (t.status as string) === "suggested");
  const entregues  = transfers.filter(t => (t.status as string) === "executed");
  const cancelados = transfers.filter(t => (t.status as string) === "cancelled");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5 px-1">
        {emTransito.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium text-blue-400">
              {emTransito.length} em trânsito
            </span>
          </div>
        )}
        {entregues.length > 0 && (
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-carbo-green" />
            <span className="text-sm font-medium text-muted-foreground">
              {entregues.length} entregue{entregues.length > 1 ? "s" : ""} no CD SP
            </span>
          </div>
        )}
        {cancelados.length > 0 && (
          <div className="flex items-center gap-1.5">
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-muted-foreground">
              {cancelados.length} estornado{cancelados.length > 1 ? "s" : ""}
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
        const done       = status === "executed";
        const cancelled  = status === "cancelled";

        return (
          <CarboCard key={t.id as string}>
            <CarboCardContent className="py-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className={`p-2 rounded-lg ${done ? "bg-green-500/10" : cancelled ? "bg-destructive/10" : "bg-blue-500/10"}`}>
                  {done
                    ? <CheckCircle className="h-5 w-5 text-carbo-green" />
                    : cancelled
                    ? <XCircle className="h-5 w-5 text-destructive" />
                    : <Truck className="h-5 w-5 text-blue-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{product?.name || (t.product_code as string)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enviado em {format(new Date(createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
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
                  <CarboBadge variant={done ? "success" : cancelled ? "cancelled" : "info"}>
                    {done ? "Chegou no CD SP" : cancelled ? "Estornado" : "Em trânsito"}
                  </CarboBadge>
                </div>
              </div>
            </CarboCardContent>
          </CarboCard>
        );
      })}
    </div>
  );
}
