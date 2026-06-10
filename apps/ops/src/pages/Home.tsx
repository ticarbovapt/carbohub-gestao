import { useNavigate } from "react-router-dom";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import {
  Factory, Boxes, ClipboardList, Truck, ShoppingCart, ArrowRight, Warehouse,
} from "lucide-react";

// Carbo Ops — shell inicial. As telas de operação entram fiéis ao Controle
// (produção, estoque, compras, logística) na fase seguinte.
const SECOES = [
  { icon: Factory, label: "Produção", desc: "Ordens de produção e MRP", accent: "#3b82f6" },
  { icon: Warehouse, label: "Estoque", desc: "Saldos por hub (RN, SP)", accent: "#22c55e" },
  { icon: ShoppingCart, label: "Compras", desc: "Requisições e aprovação do financeiro", accent: "#f59e0b" },
  { icon: Truck, label: "Logística", desc: "Expedição e entregas", accent: "#a78bfa" },
  { icon: ClipboardList, label: "Pedidos", desc: "Pedidos internos e abastecimento", accent: "#06b6d4" },
  { icon: Boxes, label: "Insumos", desc: "Matéria-prima e embalagens", accent: "#f43f5e" },
];

export default function Home() {
  const navigate = useNavigate();
  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Carbo Ops"
          description="Operações — produção, estoque, compras e logística"
          icon={Factory}
        />

        <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
          <p className="text-sm font-medium">App em construção 🛠️</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-lg mx-auto">
            O esqueleto do Carbo Ops está pronto (login único, barra compartilhada, tema).
            As telas de operação serão portadas fiéis ao Carbo Controle nos próximos passos.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-3">Áreas previstas</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SECOES.map(({ icon: Icon, label, desc, accent }) => (
              <div key={label} className="group relative overflow-hidden rounded-2xl border border-border bg-board-surface p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: accent + "1a", color: accent }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground/60 border border-border rounded-full px-2 py-0.5">em breve</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
