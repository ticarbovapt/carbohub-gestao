import { useMemo, useState } from "react";
import { Bug, Lightbulb, CheckCircle2, Clock, XCircle, Trash2, RotateCcw, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  useAllBugReports, useResolveBugReport, useDeclineBugReport, useReopenBugReport, useDeleteBugReport,
  type BugReport, type BugKind, type BugStatus,
} from "@/hooks/useBugReports";

const dtFmt = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
type StatusTab = "open" | "resolved" | "declined" | "all";

function StatusIcon({ status }: { status: BugStatus }) {
  if (status === "resolved") return <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />;
  if (status === "declined") return <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />;
  return <Clock className="h-4 w-4 text-warning mt-0.5 shrink-0" />;
}
const statusText = (s: BugStatus) => (s === "resolved" ? "Resolvido" : s === "declined" ? "Recusado" : "Em aberto");

export default function BugReports() {
  // Gestor: crm expõe `isGestor`; ops/admin expõem `canAdmin`. Cobre os dois.
  const auth = useAuth() as { isGestor?: boolean; canAdmin?: boolean };
  const isGestor = Boolean(auth.isGestor ?? auth.canAdmin);

  const { data: all = [], isLoading } = useAllBugReports();
  const resolve = useResolveBugReport();
  const decline = useDeclineBugReport();
  const reopen = useReopenBugReport();
  const remove = useDeleteBugReport();

  const [kind, setKind] = useState<BugKind>("bug");
  const [tab, setTab] = useState<StatusTab>("open");
  const [detail, setDetail] = useState<BugReport | null>(null);
  const [nota, setNota] = useState("");

  // Filtra por tipo (bug/sugestão) primeiro.
  const byKind = useMemo(() => all.filter((b) => b.kind === kind), [all, kind]);

  const counts = useMemo(() => ({
    open: byKind.filter((b) => b.status === "open").length,
    resolved: byKind.filter((b) => b.status === "resolved").length,
    declined: byKind.filter((b) => b.status === "declined").length,
    all: byKind.length,
  }), [byKind]);

  const list = useMemo(
    () => byKind.filter((b) => (tab === "all" ? true : b.status === tab)),
    [byKind, tab],
  );

  const kindCounts = useMemo(() => ({
    bug: all.filter((b) => b.kind === "bug").length,
    sugestao: all.filter((b) => b.kind === "sugestao").length,
  }), [all]);

  const openDetail = (b: BugReport) => { setDetail(b); setNota(b.admin_notes ?? ""); };

  const resolveLabel = kind === "sugestao" ? "Marcar como feita" : "Marcar como resolvido";

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-5xl mx-auto">
        <CarboPageHeader
          title="Reporte de Bugs e Sugestões"
          description="O que o time reportou — bugs corrigidos e sugestões avaliadas pelo TI"
          icon={Bug}
        />

        {/* Tipo: Bugs | Sugestões */}
        <div className="flex gap-2">
          <button onClick={() => { setKind("bug"); setTab("open"); }}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
              kind === "bug" ? "border-destructive bg-destructive/10 text-destructive" : "border-input text-muted-foreground hover:bg-muted"}`}>
            <Bug className="h-4 w-4" /> Bugs <span className="opacity-70">({kindCounts.bug})</span>
          </button>
          <button onClick={() => { setKind("sugestao"); setTab("open"); }}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
              kind === "sugestao" ? "border-amber-500 bg-amber-500/10 text-amber-600" : "border-input text-muted-foreground hover:bg-muted"}`}>
            <Lightbulb className="h-4 w-4" /> Sugestões <span className="opacity-70">({kindCounts.sugestao})</span>
          </button>
        </div>

        {/* Sub-filtro por status */}
        <div className="flex gap-1 border-b border-border flex-wrap">
          {([["open", "Abertos", counts.open], ["resolved", kind === "sugestao" ? "Feitas" : "Resolvidos", counts.resolved], ["declined", "Recusados", counts.declined], ["all", "Todos", counts.all]] as [StatusTab, string, number][]).map(([k, label, n]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors border-b-2 -mb-px ${
                tab === k ? "border-carbo-green text-carbo-green bg-carbo-green/5" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {label} <span className="text-xs opacity-70">({n})</span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />)}</div>
        ) : list.length === 0 ? (
          <CarboCard><CarboCardContent className="py-12 text-center space-y-2">
            {kind === "sugestao" ? <Lightbulb className="h-10 w-10 mx-auto text-muted-foreground/30" /> : <Bug className="h-10 w-10 mx-auto text-muted-foreground/30" />}
            <p className="text-muted-foreground">Nenhum {kind === "sugestao" ? "registro de sugestão" : "registro de bug"} aqui.</p>
          </CarboCardContent></CarboCard>
        ) : (
          <div className="space-y-2">
            {list.map((b) => (
              <CarboCard key={b.id}>
                <CarboCardContent className="p-3 flex items-start gap-3">
                  <StatusIcon status={b.status} />
                  <button className="flex-1 min-w-0 text-left" onClick={() => openDetail(b)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{b.title}</p>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{b.app}</span>
                      <span className={`text-[10px] font-medium ${b.status === "resolved" ? "text-success" : b.status === "declined" ? "text-muted-foreground" : "text-warning"}`}>{statusText(b.status)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{b.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span>{b.reporter_name || "—"}</span>
                      <span>·</span>
                      <span>{dtFmt(b.created_at)}</span>
                    </div>
                  </button>
                  {isGestor && (
                    <div className="flex gap-1 shrink-0">
                      {b.status === "open" ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openDetail(b)}>
                          <CheckCircle2 className="h-3 w-3" /> Avaliar
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => reopen.mutate(b.id)}>
                          <RotateCcw className="h-3 w-3" /> Reabrir
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => remove.mutate(b.id)} title="Remover">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CarboCardContent>
              </CarboCard>
            ))}
          </div>
        )}
      </div>

      {/* Detalhe (todos leem) + ações de gestão */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.kind === "sugestao" ? <Lightbulb className="h-4 w-4 text-amber-500" /> : <Bug className="h-4 w-4 text-destructive" />}
                  {detail.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-1 text-sm">
                <p className="whitespace-pre-wrap text-muted-foreground">{detail.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Reportado por</span><p className="font-medium">{detail.reporter_name || "—"}</p></div>
                  <div><span className="text-muted-foreground">App</span><p className="font-medium uppercase">{detail.app}</p></div>
                  <div><span className="text-muted-foreground">Status</span><p className="font-medium">{statusText(detail.status)}</p></div>
                  <div><span className="text-muted-foreground">Quando</span><p className="font-medium">{dtFmt(detail.created_at)}</p></div>
                </div>
                {detail.url && isGestor && (
                  <a href={detail.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-carbo-green hover:underline break-all">
                    <ExternalLink className="h-3 w-3 shrink-0" /> {detail.url}
                  </a>
                )}
                {/* Nota do TI: gestor edita; demais só leem se houver */}
                {isGestor ? (
                  <div className="space-y-1.5">
                    <Label>Resposta / nota do TI</Label>
                    <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que foi feito / motivo..." />
                  </div>
                ) : detail.admin_notes ? (
                  <div className="rounded bg-muted px-3 py-2">
                    <p className="text-[11px] font-medium mb-0.5">Resposta do TI</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail.admin_notes}</p>
                  </div>
                ) : null}
              </div>
              {isGestor && (
                <DialogFooter className="gap-2 flex-wrap">
                  {detail.status === "open" ? (
                    <>
                      <Button variant="outline" onClick={() => decline.mutate({ id: detail.id, admin_notes: nota.trim() || undefined }, { onSuccess: () => setDetail(null) })} disabled={decline.isPending} className="gap-1">
                        <XCircle className="h-4 w-4" /> Recusar
                      </Button>
                      <Button onClick={() => resolve.mutate({ id: detail.id, admin_notes: nota.trim() || undefined }, { onSuccess: () => setDetail(null) })} disabled={resolve.isPending} className="bg-carbo-green hover:bg-carbo-green/90 text-white gap-1">
                        <CheckCircle2 className="h-4 w-4" /> {resolveLabel}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" onClick={() => reopen.mutate(detail.id, { onSuccess: () => setDetail(null) })} disabled={reopen.isPending} className="gap-1">
                        <RotateCcw className="h-4 w-4" /> Reabrir
                      </Button>
                      <Button variant="outline" onClick={() => resolve.mutate({ id: detail.id, admin_notes: nota.trim() || undefined }, { onSuccess: () => setDetail(null) })} disabled={resolve.isPending}>
                        Salvar nota
                      </Button>
                    </>
                  )}
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
