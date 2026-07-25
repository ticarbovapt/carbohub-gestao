import { Bug, Lightbulb, Clock, AlertTriangle, MessageSquare, CheckSquare, UserPlus } from "lucide-react";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import type { BugReport } from "@/hooks/useBugReports";
import { prioOf, agingOf, daysSince, dFmt } from "@/lib/demandas";

export interface CardCounts {
  notes: number;
  tasksPendentes: number;
}

// Face do cartão — usada tanto na coluna quanto no DragOverlay, pra o card
// arrastado ficar idêntico ao de origem (mesmo truque do quadro do Marketing).
export function DemandaCardFace({
  d, counts, avatarUrl,
}: {
  d: BugReport;
  counts?: CardCounts;
  avatarUrl?: string | null;
}) {
  const p = prioOf(d.priority);
  const ref = d.updated_at || d.created_at;
  const aging = agingOf(ref);
  const dias = daysSince(ref);
  const semDono = !d.assignee_id;

  return (
    <>
      {/* Título + tipo */}
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${p.dot}`} title={`Prioridade ${p.label}`} />
        <p className="ti-card-title flex-1 min-w-0">{d.title}</p>
        {d.kind === "sugestao"
          ? <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          : <Bug className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
      </div>

      {/* Etiquetas */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{d.app}</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${p.badge}`}>{p.label}</span>
        {semDono && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive flex items-center gap-1">
            <UserPlus className="h-2.5 w-2.5" /> livre
          </span>
        )}
      </div>

      {/* Envelhecimento — altura reservada pra todos os cards ficarem iguais */}
      <div className="h-4">
        {aging && (
          <p className={`text-[11px] flex items-center gap-1 ${aging === "red" ? "text-destructive" : "text-amber-500"}`}>
            <AlertTriangle className="h-3 w-3 shrink-0" /> parada há {dias}d
          </p>
        )}
      </div>

      {/* Rodapé: responsável (avatar) · atividade · data */}
      <div className="ti-meta-row justify-between border-t pt-2">
        <span className="flex items-center gap-1.5 min-w-0">
          {d.assignee_id ? (
            <>
              <ProfileAvatar userId={d.assignee_id} avatarUrl={avatarUrl} fullName={d.assignee_name} size={20} />
              <span className="truncate text-foreground/80 max-w-[110px]">{d.assignee_name}</span>
            </>
          ) : (
            <span className="italic">sem responsável</span>
          )}
        </span>

        <span className="flex items-center gap-2 shrink-0">
          {!!counts?.notes && (
            <span className="flex items-center gap-0.5" title={`${counts.notes} comentário(s)`}>
              <MessageSquare className="h-3 w-3" />{counts.notes}
            </span>
          )}
          {!!counts?.tasksPendentes && (
            <span className="flex items-center gap-0.5 text-amber-500" title={`${counts.tasksPendentes} tarefa(s) pendente(s)`}>
              <CheckSquare className="h-3 w-3" />{counts.tasksPendentes}
            </span>
          )}
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {dFmt(d.created_at)}</span>
        </span>
      </div>
    </>
  );
}
