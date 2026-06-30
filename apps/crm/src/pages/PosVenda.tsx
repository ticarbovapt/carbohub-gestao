import { useMemo } from "react";
import { ShoppingBag, Loader2, Calendar, Eye } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { useMyPosVenda, POSVENDA_STAGES, type PosVendaOrder } from "@/hooks/usePosVenda";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

export default function PosVenda() {
  const { data: orders = [], isLoading } = useMyPosVenda();

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
          title="Pós-venda — Meus Pedidos"
          description="Acompanhe a jornada dos seus pedidos (somente leitura — quem controla é a operação)"
          icon={ShoppingBag}
        />

        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-500">
          <Eye className="h-4 w-4 shrink-0" />
          <span>Visualização. As etapas são atualizadas pelo time de operações no Carbo Ops.</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : orders.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Você ainda não tem pedidos manuais em acompanhamento.</p>
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
                        <div key={o.id} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium text-sm truncate">{o.customer_name}</span>
                            <span className="text-xs font-semibold tabular-nums shrink-0">{brl(Number(o.total))}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono">{o.order_number || "—"}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(o.created_at)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
