import { MessageSquare, CheckSquare, UserPlus, PauseCircle } from "lucide-react";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import type { BugReport } from "@/hooks/useBugReports";
import { prioOf, agingOf, stageDays, dtFmt, stageOf, kindOf, kindUi } from "@/lib/demandas";

export interface CardCounts {
  notes: number;
  tasksPendentes: number;
}

// Face do cartão — usada na coluna e no DragOverlay, pro card arrastado ficar
// idêntico ao de origem (mesmo truque do quadro do Marketing).
//
// Hierarquia: TÍTULO primeiro. A prioridade vira a borda esquerda colorida e só
// aparece como selo quando é alta/crítica (silencioso por padrão, alto na
// exceção) — antes ela se repetia 3x e empurrava o título pra terceiro plano.
export function DemandaCardFace({
  d, counts, avatarUrl, onAssumir,
}: {
  d: BugReport;
  counts?: CardCounts;
  avatarUrl?: string | null;
  onAssumir?: (d: BugReport) => void;
}) {
  const p = prioOf(d.priority);
  const aging = agingOf(d);
  const dias = stageDays(d);
  const cfg = stageOf(d.status);
  const semDono = !d.assignee_id;
  const alerta = d.priority === "critica" || d.priority === "alta";
  const aTriar = !d.priority;
  const kind = kindOf(d.kind);
  const { Icon: KindIcon, className: kindColor } = kindUi(d.kind);

  return (
    <>
      {/* Título + tipo */}
      <div className="flex items-start gap-2">
        <p className="ti-card-title flex-1 min-w-0">{d.title}</p>
        <span title={kind.label} className="shrink-0 mt-0.5">
          <KindIcon className={`h-3.5 w-3.5 ${kindColor}`} />
        </span>
      </div>

      {/* Quem pediu — durante a triagem é o dado que falta */}
      {d.status === "open" && d.reporter_name && (
        <p className="text-[11px] text-muted-foreground truncate">por {d.reporter_name}</p>
      )}

      {/* Etiquetas: sistema (ou a categoria, quando não é software) + prioridade
          só quando pesa. Num pedido de cabo o app não diz nada — a categoria é
          que orienta quem vai pegar o card. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">
          {kind.software ? d.app : kind.label}
        </span>
        {alerta && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${p.badge}`}>{p.label}</span>}
        {aTriar && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">a triar</span>}
      </div>

      {/* Rodapé: responsável · atividade · UM relógio (tempo na etapa) */}
      <div className="ti-meta-row justify-between border-t pt-2">
        <span className="flex items-center gap-1.5 min-w-0">
          {d.assignee_id ? (
            <>
              <ProfileAvatar userId={d.assignee_id} avatarUrl={avatarUrl} fullName={d.assignee_name} size={20} />
              <span className="truncate text-foreground/80 max-w-[100px]">{d.assignee_name}</span>
            </>
          ) : onAssumir ? (
            <button
              onClick={(e) => { e.stopPropagation(); onAssumir(d); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-carbo-green hover:bg-carbo-green/10 transition-colors"
            >
              <UserPlus className="h-3 w-3" /> Assumir
            </button>
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
          {cfg.espera ? (
            <span className="flex items-center gap-1 text-yellow-600" title="Esperando resposta de quem reportou">
              <PauseCircle className="h-3 w-3" /> {dias}d
            </span>
          ) : (
            <span
              title={`Nesta etapa desde ${d.stage_since ? dtFmt(d.stage_since) : "—"}`}
              className={aging === "red" ? "text-destructive font-medium" : aging === "amber" ? "text-amber-500" : ""}
            >
              {cfg.final ? "" : `há ${dias}d`}
            </span>
          )}
        </span>
      </div>
    </>
  );
}
