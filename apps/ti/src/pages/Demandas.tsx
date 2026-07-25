import { useMemo, useState } from "react";
import {
  LifeBuoy, Bug, Lightbulb, Search, ExternalLink, User, Clock, Loader2, CheckCircle2, XCircle,
  RotateCcw, Play, AlertTriangle,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboButton } from "@/components/ui/carbo-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAllBugReports, useUpdateDemanda, useAllProfiles, useDeleteBugReport,
  type BugReport, type BugStatus, type BugPriority,
} from "@/hooks/useBugReports";

const dtFmt = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

// Colunas do quadro (execução: aberto → em andamento → resolvido / recusado).
const COLUMNS: { key: BugStatus; label: string; icon: typeof Clock; tone: string }[] = [
  { key: "open",        label: "Abertas",      icon: Clock,        tone: "text-warning" },
  { key: "in_progress", label: "Em andamento", icon: Loader2,      tone: "text-blue-500" },
  { key: "resolved",    label: "Resolvidas",   icon: CheckCircle2, tone: "text-success" },
  { key: "declined",    label: "Recusadas",    icon: XCircle,      tone: "text-muted-foreground" },
];

const PRIOS: { key: BugPriority; label: string; dot: string; badge: string }[] = [
  { key: "critica", label: "Crítica", dot: "bg-red-500",    badge: "text-red-600 bg-red-500/10" },
  { key: "alta",    label: "Alta",    dot: "bg-orange-500", badge: "text-orange-600 bg-orange-500/10" },
  { key: "media",   label: "Média",   dot: "bg-amber-500",  badge: "text-amber-600 bg-amber-500/10" },
  { key: "baixa",   label: "Baixa",   dot: "bg-slate-400",  badge: "text-slate-500 bg-slate-400/10" },
];
const prio = (p: BugPriority) => PRIOS.find((x) => x.key === p) ?? PRIOS[2];

export default function Demandas() {
  const { user } = useAuth();
  const { data: all = [], isLoading } = useAllBugReports();
  const { data: profiles = [] } = useAllProfiles();
  const update = useUpdateDemanda();
  const remove = useDeleteBugReport();

  const [q, setQ] = useState("");
  const [fKind, setFKind] = useState("all");
  const [fApp, setFApp] = useState("all");
  const [fPrio, setFPrio] = useState("all");
  const [detail, setDetail] = useState<BugReport | null>(null);
  const [nota, setNota] = useState("");

  const apps = useMemo(() => Array.from(new Set(all.map((b) => b.app).filter(Boolean))).sort(), [all]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((b) => {
      if (fKind !== "all" && b.kind !== fKind) return false;
      if (fApp !== "all" && b.app !== fApp) return false;
      if (fPrio !== "all" && b.priority !== fPrio) return false;
      if (term && !(`${b.title} ${b.description} ${b.reporter_name ?? ""} ${b.assignee_name ?? ""}`.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [all, q, fKind, fApp, fPrio]);

  const byStatus = (s: BugStatus) => filtered.filter((b) => b.status === s);
  const counts = useMemo(() => ({
    open: all.filter((b) => b.status === "open").length,
    in_progress: all.filter((b) => b.status === "in_progress").length,
    resolved: all.filter((b) => b.status === "resolved").length,
    declined: all.filter((b) => b.status === "declined").length,
  }), [all]);

  const openDetail = (b: BugReport) => { setDetail(b); setNota(b.admin_notes ?? ""); };

  // Aplica um patch e mantém o diálogo em sincronia (ou fecha).
  function patch(fields: Parameters<typeof update.mutate>[0], close = false) {
    update.mutate(fields, {
      onSuccess: () => {
        setDetail((d) => (d && d.id === fields.id ? { ...d, ...fields } as BugReport : d));
        if (close) setDetail(null);
      },
    });
  }

  function assign(id: string, assignee_id: string) {
    if (assignee_id === "__none__") { patch({ id, assignee_id: null, assignee_name: null }); return; }
    const p = profiles.find((x) => x.id === assignee_id);
    patch({ id, assignee_id, assignee_name: p?.full_name ?? null, status: (detail?.status === "open" ? "in_progress" : undefined) });
  }

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1400px] mx-auto">
        <CarboPageHeader
          title="Central de Demandas"
          description="Tudo que chega — bugs e sugestões dos apps — em um só lugar: o que entra, quem resolve e o andamento."
          icon={LifeBuoy}
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <CarboKPI title="Abertas" value={counts.open} icon={Clock} iconColor="warning" />
          <CarboKPI title="Em andamento" value={counts.in_progress} icon={Loader2} iconColor="blue" />
          <CarboKPI title="Resolvidas" value={counts.resolved} icon={CheckCircle2} iconColor="green" />
          <CarboKPI title="Recusadas" value={counts.declined} icon={XCircle} iconColor="muted" />
        </div>

        {/* Filtros */}
        <CarboCard>
          <CarboCardContent className="p-3 flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, descrição, quem reportou ou responsável…" className="pl-9" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={fKind} onValueChange={setFKind}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Bugs + Sugestões</SelectItem>
                  <SelectItem value="bug">Só bugs</SelectItem>
                  <SelectItem value="sugestao">Só sugestões</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fApp} onValueChange={setFApp}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os apps</SelectItem>
                  {apps.map((a) => <SelectItem key={a} value={a} className="uppercase">{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fPrio} onValueChange={setFPrio}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda prioridade</SelectItem>
                  {PRIOS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* Quadro por status */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMNS.map((c) => <div key={c.key} className="h-64 rounded-xl bg-muted/40 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMNS.map((col) => {
              const items = byStatus(col.key);
              const Icon = col.icon;
              return (
                <div key={col.key} className="flex flex-col min-h-0">
                  <div className="flex items-center gap-2 px-1 pb-2">
                    <Icon className={`h-4 w-4 ${col.tone}`} />
                    <h3 className="font-semibold text-sm">{col.label}</h3>
                    <span className="text-xs text-muted-foreground">({items.length})</span>
                  </div>
                  <div className="space-y-2">
                    {items.length === 0 && (
                      <p className="text-xs text-muted-foreground px-1 py-6 text-center border border-dashed rounded-xl">Nada aqui.</p>
                    )}
                    {items.map((b) => {
                      const p = prio(b.priority);
                      return (
                        <button key={b.id} onClick={() => openDetail(b)}
                          className="w-full text-left rounded-xl border bg-card hover:border-carbo-green/50 hover:shadow-sm transition-all p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${p.dot}`} title={`Prioridade ${p.label}`} />
                            <p className="font-medium text-sm leading-snug flex-1 min-w-0">{b.title}</p>
                            {b.kind === "sugestao"
                              ? <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                              : <Bug className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{b.app}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${p.badge}`}>{p.label}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1 min-w-0 truncate">
                              <User className="h-3 w-3 shrink-0" />
                              {b.assignee_name ? <span className="truncate text-foreground/80">{b.assignee_name}</span> : <span className="italic">sem responsável</span>}
                            </span>
                            <span className="shrink-0">{dtFmt(b.created_at)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detalhe / execução */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-6">
                  {detail.kind === "sugestao" ? <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" /> : <Bug className="h-4 w-4 text-destructive shrink-0" />}
                  <span className="min-w-0">{detail.title}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-1 text-sm">
                <p className="whitespace-pre-wrap text-muted-foreground">{detail.description}</p>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Reportado por</span><p className="font-medium">{detail.reporter_name || "—"}</p></div>
                  <div><span className="text-muted-foreground">App</span><p className="font-medium uppercase">{detail.app}</p></div>
                  <div><span className="text-muted-foreground">Quando</span><p className="font-medium">{dtFmt(detail.created_at)}</p></div>
                  <div><span className="text-muted-foreground">Departamento</span><p className="font-medium">{detail.department || "—"}</p></div>
                </div>

                {detail.url && (
                  <a href={detail.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-carbo-green hover:underline break-all">
                    <ExternalLink className="h-3 w-3 shrink-0" /> {detail.url}
                  </a>
                )}

                {/* Execução: responsável + prioridade */}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> Responsável</Label>
                    <Select value={detail.assignee_id ?? "__none__"} onValueChange={(v) => assign(detail.id, v)}>
                      <SelectTrigger><SelectValue placeholder="Atribuir…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem responsável</SelectItem>
                        {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || "—"}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Prioridade</Label>
                    <Select value={detail.priority} onValueChange={(v) => patch({ id: detail.id, priority: v as BugPriority })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIOS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Nota do TI (andamento / o que foi feito) */}
                <div className="space-y-1.5">
                  <Label>Andamento / nota do TI</Label>
                  <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que está sendo feito, causa, solução…" />
                  <div className="flex justify-end">
                    <CarboButton size="sm" variant="outline" onClick={() => patch({ id: detail.id, admin_notes: nota.trim() || null })} disabled={update.isPending}>
                      Salvar nota
                    </CarboButton>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 flex-wrap sm:justify-between">
                <CarboButton variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                  onClick={() => { if (confirm("Remover esta demanda?")) remove.mutate(detail.id, { onSuccess: () => setDetail(null) }); }}>
                  Remover
                </CarboButton>
                <div className="flex gap-2 flex-wrap">
                  {detail.status !== "in_progress" && detail.status !== "resolved" && (
                    <CarboButton size="sm" variant="outline" onClick={() => patch({ id: detail.id, status: "in_progress", admin_notes: nota.trim() || null })} disabled={update.isPending} className="gap-1">
                      <Play className="h-4 w-4" /> Iniciar
                    </CarboButton>
                  )}
                  {(detail.status === "open" || detail.status === "in_progress") && (
                    <>
                      <CarboButton size="sm" variant="outline" onClick={() => patch({ id: detail.id, status: "declined", admin_notes: nota.trim() || null }, true)} disabled={update.isPending} className="gap-1">
                        <XCircle className="h-4 w-4" /> Recusar
                      </CarboButton>
                      <CarboButton size="sm" onClick={() => patch({ id: detail.id, status: "resolved", admin_notes: nota.trim() || null }, true)} disabled={update.isPending} className="gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Resolver
                      </CarboButton>
                    </>
                  )}
                  {(detail.status === "resolved" || detail.status === "declined") && (
                    <CarboButton size="sm" variant="ghost" onClick={() => patch({ id: detail.id, status: "open" }, true)} disabled={update.isPending} className="gap-1">
                      <RotateCcw className="h-4 w-4" /> Reabrir
                    </CarboButton>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
