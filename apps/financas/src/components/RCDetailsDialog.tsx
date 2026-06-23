import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const dt = (s?: string) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export interface RCItem { descricao: string; quantidade: number; unidade: string; valor_unitario: number; }

export interface RCLite {
  rc_number: string;
  cost_center: string;
  tipo: string;
  valor: number;
  statusLabel: string;
  statusVariant: "secondary" | "warning" | "success" | "destructive";
  items: RCItem[];
  suggested_supplier?: string | null;
  data?: string;
}

export function RCDetailsDialog({ rc, open, onOpenChange }: { rc: RCLite | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!rc) return null;
  const items = rc.items ?? [];
  const totalQtd = items.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Requisição {rc.rc_number}</span>
            <CarboBadge variant={rc.statusVariant}>{rc.statusLabel}</CarboBadge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Info cards */}
          <div className="grid md:grid-cols-3 gap-4">
            <CarboCard padding="sm"><CarboCardContent>
              <p className="text-xs text-muted-foreground mb-1">Valor Estimado</p>
              <p className="text-lg font-bold">{brl(rc.valor)}</p>
            </CarboCardContent></CarboCard>
            <CarboCard padding="sm"><CarboCardContent>
              <p className="text-xs text-muted-foreground mb-1">Quantidade total</p>
              <p className="text-lg font-bold">{totalQtd}</p>
            </CarboCardContent></CarboCard>
            <CarboCard padding="sm"><CarboCardContent>
              <p className="text-xs text-muted-foreground mb-1">Centro de Custo</p>
              <p className="text-lg font-bold">{rc.cost_center}</p>
            </CarboCardContent></CarboCard>
          </div>

          {/* Meta */}
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted-foreground">Tipo de compra: </span><span className="font-medium">{rc.tipo}</span></div>
            <div><span className="text-muted-foreground">Fornecedor sugerido: </span><span className="font-medium">{rc.suggested_supplier || "—"}</span></div>
            <div><span className="text-muted-foreground">Data: </span><span className="font-medium">{dt(rc.data)}</span></div>
          </div>

          {/* Itens */}
          <CarboCard>
            <CarboCardHeader><CarboCardTitle className="text-sm">Itens da Requisição</CarboCardTitle></CarboCardHeader>
            <CarboCardContent>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nenhum item</p>
              ) : (
                <div className="divide-y divide-border">
                  {items.map((it, i) => (
                    <div key={i} className="py-2.5 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{it.descricao}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{it.quantidade} {it.unidade} × {brl(Number(it.valor_unitario) || 0)}</p>
                      </div>
                      <p className="font-bold text-sm">{brl((Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0))}</p>
                    </div>
                  ))}
                </div>
              )}
            </CarboCardContent>
          </CarboCard>
        </div>
      </DialogContent>
    </Dialog>
  );
}
