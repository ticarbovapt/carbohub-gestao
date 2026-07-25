import { useState } from "react";
import {
  X, Bug, Lightbulb, ExternalLink, User, Hand, Trash2, History, ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  useUpdateDemanda, useAllProfiles, useDeleteBugReport, useAssumirDemanda,
  useDemandaActivities, useAddDemandaActivity,
  type BugReport, type BugStatus, type BugPriority,
} from "@/hooks/useBugReports";
import { STAGES, PRIOS, stageLabel, prioOf, dtFmt } from "@/lib/demandas";

// Rótulo de seção — mesmo padrão do card de lead do Sales.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-muted-foreground shrink-0 w-24">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

const ACT_ICON: Record<string, string> = { note: "📝", status_change: "🔀", assign: "👤" };

export function DemandaDrawer({ demanda, onClose }: { demanda: BugReport; onClose: () => void }) {
  const { user } = useAuth();
  const update = useUpdateDemanda();
  const assumir = useAssumirDemanda();
  const remove = useDeleteBugReport();
  const { data: profiles = [] } = useAllProfiles();
  const { data: activities = [] } = useDemandaActivities(demanda.id);
  const addAct = useAddDemandaActivity();

  const [nota, setNota] = useState("");
  const [showHist, setShowHist] = useState(false);

  const p = prioOf(demanda.priority);
  const souEu = demanda.assignee_id === user?.id;

  // Registra a mudança na timeline junto com o patch, pra ficar auditável.
  function patch(fields: Parameters<typeof update.mutate>[0], act?: { body: string; type?: "status_change" | "assign" }) {
    update.mutate(fields, {
      onSuccess: () => {
        if (act) {
          addAct.mutate({
            demanda_id: demanda.id,
            activity_type: act.type ?? "status_change",
            body: act.body,
            status_from: fields.status ? demanda.status : null,
            status_to: fields.status ?? null,
          });
        }
      },
    });
  }

  function addNota() {
    const body = nota.trim();
    if (!body) return;
    addAct.mutate({ demanda_id: demanda.id, activity_type: "note", body }, { onSuccess: () => setNota("") });
  }

  function mudarEtapa(to: BugStatus) {
    if (to === demanda.status) return;
    patch({ id: demanda.id, status: to }, { body: `${stageLabel(demanda.status)} → ${stageLabel(to)}` });
  }

  function atribuir(v: string) {
    if (v === "__none__") {
      patch({ id: demanda.id, assignee_id: null, assignee_name: null }, { body: "Responsável removido", type: "assign" });
      return;
    }
    const prof = profiles.find((x) => x.id === v);
    patch(
      { id: demanda.id, assignee_id: v, assignee_name: prof?.full_name ?? null },
      { body: `Responsável: ${prof?.full_name ?? "—"}`, type: "assign" },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />

      <div className="w-full max-w-md bg-background border-l shadow-xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {demanda.kind === "sugestao"
                ? <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
                : <Bug className="h-4 w-4 text-destructive shrink-0" />}
              <p className="font-semibold text-sm break-words">{demanda.title}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stageLabel(demanda.status)} · <span className="uppercase">{demanda.app}</span>
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => { if (confirm("Remover esta demanda?")) remove.mutate(demanda.id, { onSuccess: onClose }); }}
              title="Remover">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Fechar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-5 space-y-4 flex-1">
          {/* Chips */}
          <div className="flex flex-wrap gap-2">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${p.badge}`}>{p.label}</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase">{demanda.app}</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
              {demanda.kind === "sugestao" ? "Sugestão" : "Bug"}
            </span>
          </div>

          <Section title="Descrição">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{demanda.description}</p>
          </Section>

          {/* Assumir / responsável */}
          <Section title="Responsável">
            {!souEu && (
              <Button size="sm" className="w-full gap-1.5 mb-2"
                onClick={() => assumir.mutate(demanda.id)} disabled={assumir.isPending}>
                <Hand className="h-3.5 w-3.5" /> Assumir esta demanda
              </Button>
            )}
            {souEu && (
              <p className="text-xs text-carbo-green font-medium mb-2 flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> Você é o responsável
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={demanda.assignee_id ?? "__none__"} onValueChange={atribuir}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Atribuir a…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem responsável</SelectItem>
                  {profiles.map((x) => <SelectItem key={x.id} value={x.id}>{x.full_name || "—"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Section>

          {/* Etapa + prioridade */}
          <Section title="Andamento">
            <div className="grid grid-cols-2 gap-2">
              <Select value={demanda.status} onValueChange={(v) => mudarEtapa(v as BugStatus)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={demanda.priority}
                onValueChange={(v) => patch({ id: demanda.id, priority: v as BugPriority }, { body: `Prioridade: ${prioOf(v).label}` })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIOS.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Section>

          <Section title="Origem">
            <InfoRow label="Reportado por" value={demanda.reporter_name || "—"} />
            <InfoRow label="Departamento" value={demanda.department} />
            <InfoRow label="Quando" value={dtFmt(demanda.created_at)} />
            {demanda.url && (
              <a href={demanda.url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-carbo-green hover:underline break-all mt-1">
                <ExternalLink className="h-3 w-3 shrink-0" /> {demanda.url}
              </a>
            )}
          </Section>

          {/* Anotações + timeline — mesmo padrão do card de lead do Sales */}
          <Section title="Anotações">
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNota(); }}
              placeholder="O que está sendo feito, causa, solução…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[11px] text-muted-foreground">Ctrl+Enter para registrar</span>
              <Button size="sm" onClick={addNota} disabled={!nota.trim() || addAct.isPending}>Registrar</Button>
            </div>

            {activities.length > 0 && (
              <div className="mt-3 space-y-2.5 border-l-2 border-border pl-3">
                {activities
                  .filter((a) => showHist || a.activity_type === "note")
                  .map((a) => (
                    <div key={a.id} className="text-xs">
                      <p className="text-foreground whitespace-pre-wrap break-words">
                        <span className="mr-1">{ACT_ICON[a.activity_type] ?? "📝"}</span>{a.body}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {a.created_by_name || "—"} · {dtFmt(a.created_at)}
                      </p>
                    </div>
                  ))}
                {activities.some((a) => a.activity_type !== "note") && (
                  <button onClick={() => setShowHist((s) => !s)}
                    className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <History className="h-3 w-3" /> {showHist ? "Ocultar histórico" : "Ver histórico de mudanças"}
                  </button>
                )}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
