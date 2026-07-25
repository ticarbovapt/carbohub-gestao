import { Bug, Lightbulb, User, Clock, AlertTriangle } from "lucide-react";
import type { BugReport } from "@/hooks/useBugReports";
import { prioOf, agingOf, daysSince, dFmt } from "@/lib/demandas";

// Face do cartão — usada tanto na coluna quanto no DragOverlay, pra o card
// arrastado ficar idêntico ao de origem (mesmo truque do quadro do Marketing).
export function DemandaCardFace({ d }: { d: BugReport }) {
  const p = prioOf(d.priority);
  const aging = agingOf(d.updated_at || d.created_at);
  const dias = daysSince(d.updated_at || d.created_at);

  return (
    <>
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${p.dot}`} title={`Prioridade ${p.label}`} />
        <p className="ti-card-title flex-1 min-w-0">{d.title}</p>
        {d.kind === "sugestao"
          ? <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          : <Bug className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{d.app}</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${p.badge}`}>{p.label}</span>
      </div>

      {/* Linha de envelhecimento — altura reservada pra todos os cards ficarem iguais */}
      <div className="h-4">
        {aging && (
          <p className={`text-[11px] flex items-center gap-1 ${aging === "red" ? "text-destructive" : "text-amber-500"}`}>
            <AlertTriangle className="h-3 w-3 shrink-0" /> parada há {dias}d
          </p>
        )}
      </div>

      <div className="ti-meta-row justify-between">
        <span className="flex items-center gap-1 min-w-0 truncate">
          <User className="h-3 w-3 shrink-0" />
          {d.assignee_name
            ? <span className="truncate text-foreground/80">{d.assignee_name}</span>
            : <span className="italic">sem responsável</span>}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <Clock className="h-3 w-3" /> {dFmt(d.created_at)}
        </span>
      </div>
    </>
  );
}
