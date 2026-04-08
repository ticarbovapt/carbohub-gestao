import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, ChevronLeft, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { usePDVStatus } from "@/hooks/usePDV";
import { usePDVSellerRanking } from "@/hooks/usePDVSellers";
import { useMyPDVSeller } from "@/hooks/usePDVSellers";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

type Period = "day" | "week" | "month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  day:   "Hoje",
  week:  "Semana",
  month: "Mês",
  all:   "Tudo",
};

const MEDAL_COLORS = ["text-yellow-500", "text-slate-400", "text-amber-600"];
const MEDAL_BG    = ["bg-yellow-500/10", "bg-slate-400/10", "bg-amber-600/10"];

export default function PDVRanking() {
  const navigate = useNavigate();
  const { data: pdvStatus } = usePDVStatus();
  const pdvId = pdvStatus?.pdv?.id;
  const [period, setPeriod] = useState<Period>("month");
  const { data: ranking = [], isLoading } = usePDVSellerRanking(pdvId, period);
  const { data: mySeller } = useMyPDVSeller(pdvId);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <CarboSkeleton className="h-10 w-48" />
        {[1, 2, 3].map(i => <CarboSkeleton key={i} className="h-20" />)}
      </div>
    );
  }

  // If user is a non-manager seller, only show their own row
  const isSeller = !!mySeller && !mySeller.is_manager;
  const visibleRanking = isSeller
    ? ranking.filter(r => r.seller_id === mySeller?.id)
    : ranking;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pdv/dashboard")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h1 className="font-bold text-lg">Ranking de Vendas</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Period filter */}
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              className={period === p ? "carbo-gradient" : ""}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>

        {isSeller && (
          <div className="rounded-lg bg-muted/50 border border-border px-4 py-2.5 text-sm text-muted-foreground">
            Você está vendo apenas seus próprios resultados.
          </div>
        )}

        {visibleRanking.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Trophy className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Nenhuma venda no período selecionado.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleRanking.map((entry, idx) => {
              const pos = idx + 1;
              const isMe = entry.seller_id === mySeller?.id;
              const hasMedal = pos <= 3 && !isSeller;
              return (
                <div
                  key={entry.seller_id}
                  className={cn(
                    "rounded-xl border border-border bg-card p-4 flex items-center gap-4",
                    isMe && "border-primary/40 bg-primary/5",
                    hasMedal && pos === 1 && "border-yellow-500/30"
                  )}
                >
                  {/* Position */}
                  <div
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm",
                      hasMedal ? MEDAL_BG[idx] : "bg-muted",
                      hasMedal ? MEDAL_COLORS[idx] : "text-muted-foreground"
                    )}
                  >
                    {hasMedal ? <Medal className="h-5 w-5" /> : pos}
                  </div>

                  {/* Seller info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{entry.seller_name}</p>
                      {isMe && <Badge className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-0">Você</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{entry.qty_sales} {entry.qty_sales === 1 ? "venda" : "vendas"}</span>
                      <span>·</span>
                      <span>ticket médio {fmt(entry.avg_ticket)}</span>
                    </div>
                  </div>

                  {/* Revenue + Commission */}
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-base text-primary">{fmt(entry.revenue)}</p>
                    {entry.commission > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Comissão: {fmt(entry.commission)}
                      </p>
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
