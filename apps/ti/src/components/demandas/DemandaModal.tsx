import { useEffect, useState } from "react";
import {
  X, Archive, ChevronRight, Hand, AlertTriangle, Pin, PinOff, ArrowRight,
  StickyNote, CheckSquare, Clock, GitBranch, MessageSquare, UserCog, ExternalLink,
  Bug, Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  useUpdateDemanda, useArquivarDemanda, useAssumirDemanda, useTimeTI, useAllProfiles,
  useDemandaActivities, useAddDemandaActivity, useToggleActivityPin, useToggleActivityTask,
  type BugReport, type BugStatus, type BugPriority, type DemandaActivity,
} from "@/hooks/useBugReports";
import {
  STAGES, PRIOS, stageLabel, prioOf, stageDays, dtFmt, bloqueioLabel, alcanceLabel,
  type StageConfig,
} from "@/lib/demandas";
import { StageProgressBar } from "./StageProgressBar";
import { AnexosDaDemanda } from "./AnexosDaDemanda";

const ACT_TYPES = [
  { id: "note", label: "Comentário", icon: <StickyNote className="h-4 w-4" /> },
  { id: "task", label: "Tarefa", icon: <CheckSquare className="h-4 w-4" /> },
];

export function DemandaModal({ demanda, onClose }: { demanda: BugReport; onClose: () => void }) {
  const { user, profile } = useAuth();
  const update = useUpdateDemanda();
  const assumir = useAssumirDemanda();
  const arquivar = useArquivarDemanda();
  const { data: timeTI = [] } = useTimeTI();
  const { data: dir = [] } = useAllProfiles();
  const { data: activities = [] } = useDemandaActivities(demanda.id);
  const addActivity = useAddDemandaActivity();
  const togglePin = useToggleActivityPin();
  const toggleTask = useToggleActivityTask();

  // Etapa local (otimista) — o chevron responde na hora, sem esperar o refetch.
  const [stage, setStage] = useState<BugStatus>(demanda.status);
  useEffect(() => { setStage(demanda.status); }, [demanda.id, demanda.status]);

  const [actType, setActType] = useState("note");
  const [actText, setActText] = useState("");
  const [actDue, setActDue] = useState("");
  const [confirmArquivar, setConfirmArquivar] = useState(false);
  const [fechando, setFechando] = useState<null | "resolved" | "declined">(null);
  const [notaFecho, setNotaFecho] = useState("");

  const p = prioOf(demanda.priority);
  const souEu = demanda.assignee_id === user?.id;
  const dias = stageDays(demanda);
  const cfgAtual = STAGES.find((s) => s.id === stage);
  const terminal = !!cfgAtual?.final;
  // Próxima etapa = a seguinte entre as NÃO finais (imune a acrescentar etapas).
  const fluxo = STAGES.filter((s) => !s.final);
  const idxFluxo = fluxo.findIndex((s) => s.id === stage);
  const proxima: StageConfig | null =
    idxFluxo >= 0 && idxFluxo < fluxo.length - 1 ? fluxo[idxFluxo + 1]
    : idxFluxo === fluxo.length - 1 ? STAGES.find((s) => s.id === "resolved") ?? null
    : null;
  const stageResolved = STAGES.find((s) => s.id === "resolved")!;
  const stageDeclined = STAGES.find((s) => s.id === "declined")!;
  const stageEntrada = STAGES.find((s) => s.id === "open")!;

  function irParaEtapa(target: StageConfig) {
    const from = stage;
    if (target.id === from) return;
    // Fechar (concluir/recusar) exige explicação — é o que o solicitante recebe.
    if (target.id === "resolved" || target.id === "declined") {
      setNotaFecho(demanda.admin_notes ?? "");
      setFechando(target.id);
      return;
    }
    setStage(target.id);
    update.mutate({ id: demanda.id, status: target.id }, { onError: () => setStage(from) });
  }

  function confirmarFecho() {
    if (!fechando || !notaFecho.trim()) return;
    const from = stage;
    setStage(fechando);
    update.mutate(
      { id: demanda.id, status: fechando, admin_notes: notaFecho.trim() },
      { onError: () => setStage(from), onSuccess: () => { setFechando(null); setNotaFecho(""); } },
    );
  }

  // A atividade de troca de responsável é gravada por TRIGGER no banco — aqui
  // só o patch, senão a timeline duplicaria.
  function atribuir(v: string) {
    if (v === "__none__") {
      update.mutate({ id: demanda.id, assignee_id: null, assignee_name: null });
      return;
    }
    const pes = timeTI.find((x) => x.id === v);
    update.mutate({ id: demanda.id, assignee_id: v, assignee_name: pes?.full_name ?? null });
  }

  function handleAddActivity() {
    if (!actText.trim()) return;
    addActivity.mutate({
      demanda_id: demanda.id,
      activity_type: actType as "note" | "task",
      body: actText.trim(),
      due_at: actType === "task" && actDue ? new Date(actDue).toISOString() : null,
    }, { onSuccess: () => { setActText(""); setActDue(""); } });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[95dvh] sm:max-w-[96vw] p-0 gap-0 flex flex-col overflow-hidden [&>button]:hidden">
        {/* 1. Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base flex items-center gap-2">
              {demanda.kind === "sugestao"
                ? <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
                : <Bug className="h-4 w-4 text-destructive shrink-0" />}
              {demanda.title}
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhe da demanda</DialogDescription>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-xs uppercase">{demanda.app}</Badge>
              <Badge variant="outline" className="text-xs">{stageLabel(stage)}</Badge>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${p.badge}`}>{p.label}</span>
              {!terminal && dias > 7 && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-2.5 w-2.5 mr-1" />{dias}d sem movimentação
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setConfirmArquivar(true)} className="text-muted-foreground hover:text-foreground p-1.5" title="Arquivar demanda">
              <Archive className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1.5" title="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 2. Barra de etapas */}
        <div className="border-b px-5 py-2.5">
          <StageProgressBar currentStage={stage} onSelect={irParaEtapa} disabled={update.isPending} />
        </div>

        {/* 3. Abas */}
        <div className="border-b px-5">
          <div className="flex gap-4 text-sm">
            <button className="border-b-2 border-primary py-2 font-medium text-foreground">Geral</button>
          </div>
        </div>

        {/* 4. Duas colunas */}
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Esquerda — dados + execução */}
          <div className="w-full space-y-4 overflow-y-auto border-b p-5 lg:w-2/5 lg:border-b-0 lg:border-r">
            {!souEu && !terminal && (
              <Button className="w-full gap-1.5" onClick={() => assumir.mutate(demanda.id)} disabled={assumir.isPending}>
                <Hand className="h-4 w-4" /> Assumir esta demanda
              </Button>
            )}

            <Bloco title="Responsável">
              {souEu && (
                <p className="text-xs text-carbo-green font-medium flex items-center gap-1.5 mb-2">
                  <Hand className="h-3.5 w-3.5" /> Você é o responsável
                </p>
              )}
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={demanda.assignee_id ?? "__none__"} onValueChange={atribuir}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Atribuir a…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem responsável</SelectItem>
                    {timeTI.map((x) => <SelectItem key={x.id} value={x.id}>{x.full_name || "—"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {timeTI.length > 0 ? "Apenas o time de TI pode assumir." : "Nenhuma pessoa com departamento de TI cadastrada."}
              </p>
            </Bloco>

            <Bloco title="Prioridade">
              <Select value={demanda.priority ?? "__none__"}
                onValueChange={(v) => update.mutate({ id: demanda.id, priority: v === "__none__" ? null : (v as BugPriority) })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="A triar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">A triar</SelectItem>
                  {PRIOS.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {demanda.bloqueio && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Sugerida pelo impacto informado: <strong>{bloqueioLabel(demanda.bloqueio)}</strong>
                  {demanda.pessoas_afetadas ? ` · afeta ${alcanceLabel(demanda.pessoas_afetadas)}` : ""}
                </p>
              )}
            </Bloco>

            <Bloco title="Descrição">
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">{demanda.description}</p>
            </Bloco>

            {!!demanda.attachments?.length && (
              <Bloco title="Prints">
                <AnexosDaDemanda anexos={demanda.attachments} />
              </Bloco>
            )}

            <Bloco title="Origem">
              <Field label="Reportado por" value={demanda.reporter_name} />
              <Field label="E-mail" value={demanda.reporter_email} />
              <Field label="Departamento" value={demanda.department} />
              <Field label="Sistema" value={demanda.app?.toUpperCase()} />
              <Field label="Tipo" value={demanda.kind === "sugestao" ? "Sugestão" : "Bug"} />
              <Field label="Quando" value={dtFmt(demanda.created_at)} />
              <Field label="Impacto" value={bloqueioLabel(demanda.bloqueio) ?? "— não informado"} />
              <Field label="Alcance" value={alcanceLabel(demanda.pessoas_afetadas) ?? "— não informado"} />
              {demanda.reopen_count > 0 && <Field label="Reaberturas" value={String(demanda.reopen_count)} />}
              <Field label="Resposta do TI" value={demanda.admin_notes} />
              {demanda.url && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tela</p>
                  <a href={demanda.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-carbo-green hover:underline break-all">
                    <ExternalLink className="h-3 w-3 shrink-0" /> {demanda.url}
                  </a>
                </div>
              )}
            </Bloco>
          </div>

          {/* Direita — atividades */}
          <div className="flex w-full flex-1 flex-col overflow-hidden lg:w-3/5">
            <div className="border-b p-5 pb-4">
              <div className="mb-3 flex gap-4 border-b text-sm">
                {ACT_TYPES.map((t) => (
                  <button key={t.id} onClick={() => setActType(t.id)}
                    className={`flex items-center gap-1.5 border-b-2 pb-2 -mb-px transition-colors ${
                      actType === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              <textarea
                value={actText}
                onChange={(e) => setActText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAddActivity(); }}
                placeholder={actType === "task" ? "O que precisa ser feito…" : "Escreva o comentário / o que foi feito…"}
                className="min-h-[90px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {actType === "task" && (
                <input type="datetime-local" className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={actDue} onChange={(e) => setActDue(e.target.value)} />
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Ctrl+Enter para registrar</span>
                <Button size="sm" onClick={handleAddActivity} disabled={!actText.trim() || addActivity.isPending}>Registrar</Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <Timeline
                activities={activities}
                onTogglePin={(a) => togglePin.mutate({ id: a.id, pinned: !a.pinned, demanda_id: demanda.id })}
                onToggleTask={(a) => toggleTask.mutate({ id: a.id, done: a.status !== "done", demanda_id: demanda.id })}
                busy={togglePin.isPending || toggleTask.isPending}
                resolveUser={(id) => {
                  const u = id ? dir.find((d) => d.id === id) : undefined;
                  return { avatar_url: u?.avatar_url, full_name: u?.full_name };
                }}
              />
            </div>
          </div>
        </div>

        {/* Rodapé — Avançar / Recusar */}
        {!terminal ? (
          <DialogFooter className="border-t p-3 sm:justify-start">
            <div className="flex w-full gap-2 sm:w-auto">
              {proxima && (
                <Button className="flex-1 sm:flex-none" onClick={() => irParaEtapa(proxima)} disabled={update.isPending}>
                  Avançar para {proxima.label} <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" className="flex-1 text-destructive hover:text-destructive sm:flex-none"
                onClick={() => irParaEtapa(stageDeclined)} disabled={update.isPending}>
                Recusar
              </Button>
              {stage !== "resolved" && proxima?.id !== "resolved" && (
                <Button variant="outline" className="flex-1 sm:flex-none"
                  onClick={() => irParaEtapa(stageResolved)} disabled={update.isPending}>
                  Concluir
                </Button>
              )}
            </div>
          </DialogFooter>
        ) : (
          <DialogFooter className="border-t p-3 sm:justify-start">
            <Button variant="outline" onClick={() => irParaEtapa(stageEntrada)} disabled={update.isPending}>
              Reabrir demanda
            </Button>
          </DialogFooter>
        )}

        {/* Arquivar (substitui excluir: chamado não se apaga) */}
        <Dialog open={confirmArquivar} onOpenChange={setConfirmArquivar}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Arquivar demanda</DialogTitle>
              <DialogDescription>
                <strong>{demanda.title}</strong> sai do quadro, mas o registro e todo o histórico
                continuam guardados para auditoria.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmArquivar(false)}>Cancelar</Button>
              <Button disabled={arquivar.isPending}
                onClick={() => arquivar.mutate(demanda.id, { onSuccess: () => { setConfirmArquivar(false); onClose(); } })}>
                {arquivar.isPending ? "Arquivando..." : "Arquivar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Fechar exige explicação — é o texto que chega pra quem reportou */}
        <Dialog open={!!fechando} onOpenChange={(o) => { if (!o) { setFechando(null); setNotaFecho(""); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{fechando === "resolved" ? "Concluir demanda" : "Recusar demanda"}</DialogTitle>
              <DialogDescription>
                {fechando === "resolved"
                  ? "O que foi feito? Quem reportou recebe esta resposta na notificação."
                  : "Por que não será feita? Quem reportou recebe esta explicação."}
              </DialogDescription>
            </DialogHeader>
            <textarea
              value={notaFecho}
              onChange={(e) => setNotaFecho(e.target.value)}
              autoFocus
              placeholder={fechando === "resolved" ? "Ex.: corrigido o cálculo do frete e publicado." : "Ex.: já existe outra tela que faz isso."}
              className="min-h-[100px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setFechando(null); setNotaFecho(""); }}>Cancelar</Button>
              <Button onClick={confirmarFecho} disabled={!notaFecho.trim() || update.isPending}>
                {fechando === "resolved" ? "Concluir" : "Recusar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Blocos da coluna esquerda ---------- */

function Bloco({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground break-words">{value}</p>
    </div>
  );
}

/* ---------- Timeline ---------- */

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Hoje";
  if (sameDay(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function activityMeta(type: string, status: string | null) {
  switch (type) {
    case "task":          return { label: "Tarefa", nodeClass: "bg-amber-500", Icon: status === "done" ? CheckSquare : Clock };
    case "status_change": return { label: "Etapa alterada", nodeClass: "bg-muted-foreground/40", Icon: GitBranch };
    case "assign":        return { label: "Responsável", nodeClass: "bg-violet-500", Icon: UserCog };
    case "note":          return { label: "Comentário", nodeClass: "bg-blue-500", Icon: MessageSquare };
    default:              return { label: "Registro", nodeClass: "bg-muted-foreground/40", Icon: StickyNote };
  }
}

interface TimelineProps {
  activities: DemandaActivity[];
  onTogglePin: (a: DemandaActivity) => void;
  onToggleTask: (a: DemandaActivity) => void;
  busy: boolean;
  resolveUser: (id: string | null) => { avatar_url?: string | null; full_name?: string | null };
}

function Timeline({ activities, onTogglePin, onToggleTask, busy, resolveUser }: TimelineProps) {
  if (activities.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma atividade ainda. Registre a primeira acima.</p>;
  }

  const pinned = activities.filter((a) => a.pinned);

  // activities vêm ordenadas desc por created_at. Agrupa por dia preservando a ordem.
  const groups: { label: string; items: DemandaActivity[] }[] = [];
  for (const a of activities) {
    const label = dayLabel(a.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(a);
    else groups.push({ label, items: [a] });
  }

  const common = { onTogglePin, onToggleTask, busy, resolveUser };

  return (
    <div className="space-y-6">
      {pinned.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Pin className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Fixados</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {pinned.map((a) => <ActivityCard key={`pin-${a.id}`} a={a} highlight {...common} />)}
        </div>
      )}

      {/* Feed com trilho vertical à esquerda */}
      <div className="relative">
        <div className="pointer-events-none absolute bottom-2 left-4 top-2 w-px bg-border" aria-hidden />
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label} className="space-y-4">
              <div className="relative flex justify-center py-1">
                <span className="z-10 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">{g.label}</span>
              </div>
              {g.items.map((a) => {
                const meta = activityMeta(a.activity_type, a.status);
                return (
                  <div key={a.id} className="relative flex gap-3">
                    <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-background ${meta.nodeClass}`}>
                      <meta.Icon className="h-4 w-4 text-white" />
                    </div>
                    <ActivityCard a={a} {...common} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActivityCard({
  a, onTogglePin, onToggleTask, busy, resolveUser, highlight,
}: {
  a: DemandaActivity;
  onTogglePin: (a: DemandaActivity) => void;
  onToggleTask: (a: DemandaActivity) => void;
  busy: boolean;
  resolveUser: (id: string | null) => { avatar_url?: string | null; full_name?: string | null };
  highlight?: boolean;
}) {
  const meta = activityMeta(a.activity_type, a.status);
  const when = new Date(a.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const canPin = a.activity_type !== "status_change";
  const author = resolveUser(a.created_by);
  const authorName = author.full_name || a.created_by_name || "—";
  const isStage = a.activity_type === "status_change";
  const isTask = a.activity_type === "task";

  return (
    <div className={[
      "min-w-0 flex-1 rounded-lg border bg-card shadow-sm",
      highlight ? "border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10" : "",
    ].join(" ")}>
      <div className="flex items-start justify-between gap-2 px-3 pt-2.5">
        <div className="flex items-center gap-2">
          {a.pinned && <Pin className="h-3 w-3 text-amber-500" />}
          <span className="text-sm font-semibold text-foreground">{meta.label}</span>
          <span className="text-[11px] text-muted-foreground">{when}</span>
        </div>
        <div title={authorName} className="shrink-0">
          <ProfileAvatar userId={a.created_by || a.id} avatarUrl={author.avatar_url} fullName={author.full_name} size={24} />
        </div>
      </div>

      <div className="px-3 pb-2.5 pt-1.5">
        {isStage ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{stageLabel(a.status_from ?? "")}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{stageLabel(a.status_to ?? "")}</span>
          </div>
        ) : (
          <p className={`whitespace-pre-wrap break-words text-sm ${a.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {a.body || meta.label}
          </p>
        )}

        {isTask && a.due_at && (
          <p className={`mt-1 text-[11px] ${a.status === "done" ? "text-muted-foreground" : "text-amber-500"}`}>
            prazo {new Date(a.due_at).toLocaleDateString("pt-BR")}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">por {authorName}</span>
          <div className="flex items-center gap-1">
            {isTask && (
              <button type="button" onClick={() => onToggleTask(a)} disabled={busy}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <CheckSquare className="h-3 w-3" /> {a.status === "done" ? "Reabrir" : "Concluir"}
              </button>
            )}
            {canPin && (
              <button type="button" onClick={() => onTogglePin(a)} disabled={busy}
                className={[
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors",
                  a.pinned ? "text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-500/20"
                           : "text-muted-foreground hover:bg-muted hover:text-foreground",
                ].join(" ")}>
                {a.pinned ? <><PinOff className="h-3 w-3" /> Desafixar</> : <><Pin className="h-3 w-3" /> Fixar</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
