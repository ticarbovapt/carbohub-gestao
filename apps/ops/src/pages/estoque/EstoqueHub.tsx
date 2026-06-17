import { useParams } from "react-router-dom";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Warehouse, Eye } from "lucide-react";
import { StockView } from "@/components/estoque/StockView";
import { hubBySlug, HUBS } from "@/components/estoque/stockData";

// Estoque por hub — somente leitura (espelho). Edição vive em Suprimentos.
// TODO: ligar em warehouse_stock (Supabase).
export default function EstoqueHub() {
  const { hub: slug } = useParams<{ hub: string }>();
  const hub = hubBySlug(slug) ?? HUBS[0];

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-4 max-w-[1500px] mx-auto">
        <CarboPageHeader title={`Estoque — ${hub.label}`} description={`Saldo de produtos e insumos · ${hub.city}/${hub.state}`} icon={Warehouse} />

        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-500">
          <Eye className="h-4 w-4 shrink-0" />
          <span>Visualização (somente leitura). Para registrar entradas, ajustes e transferências, use <strong>Suprimentos</strong>.</span>
        </div>

        <StockView hub={hub} editable={false} />

        <p className="text-xs text-muted-foreground text-center">Saldo real (warehouse_stock) entra na fase de lógica.</p>
      </div>
    </div>
  );
}
