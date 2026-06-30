import { useMemo } from "react";
import { ShoppingBag, Loader2, User, Calendar } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  usePosVendaOrders, useUpdateFulfillmentStage, POSVENDA_STAGES,
  type FulfillmentStage, type PosVendaOrder,
} from "@/hooks/usePosVenda";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

export default function PosVenda() {
  const { data: orders = [], isLoading } = usePosVendaOrders();
  const updateStage = useUpdateFulfillmentStage();

  const byStage = useMemo(() => {
    const map: Record<string, PosVendaOrder[]> = {};
    for (const s of POSVENDA_STAGES) map[s.key] = [];
    for (const o of orders) (map[o.fulfillment_stage] ??= []).push(o);
    return map;
  }, [orders]);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-4 max-w-[1700px] mx-auto">
        <CarboPageHeader
          title="Pós-venda"
          description="Jornada das vendas manuais (Carbo Sales) — operações controlam da Nova Venda à Entrega"
          icon={ShoppingBag}
        />

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {POSVENDA_STAGES.map((stage) => {
              const items = byStage[stage.key] ?? [];
              return (
                <div key={stage.key} className="w-72 shrink-0 rounded-2xl border border-border bg-board-surface/40 flex flex-col">
                  <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                      {stage.label}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                  </div>
                  <div className="p-2 space-y-2 min-h-[120px]">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 text-center py-6">Vazio</p>
                    ) : (
                      items.map((o) => (
                        <div key={o.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium text-sm truncate">{o.customer_name}</span>
                            <span className="text-xs font-semibold tabular-nums shrink-0">{brl(Number(o.total))}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono">{o.order_number || "—"}</p>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            {o.vendedor_name && <span className="flex items-center gap-1 truncate"><User className="h-3 w-3" /> {o.vendedor_name}</span>}
                            <span className="flex items-center gap-1 shrink-0"><Calendar className="h-3 w-3" /> {fmtDate(o.created_at)}</span>
                          </div>
                          <Select
                            value={o.fulfillment_stage}
                            onValueChange={(v) => updateStage.mutate({ id: o.id, stage: v as FulfillmentStage })}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {POSVENDA_STAGES.map((s) => (
                                <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          As vendas manuais entram em <strong>Nova Venda</strong>. Mova o card pela etapa correspondente até a entrega.
          O vendedor acompanha (somente leitura) no Carbo Sales.
        </p>
      </div>
    </div>
  );
}
