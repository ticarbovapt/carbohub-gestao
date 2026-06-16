import { useMemo, useState } from "react";
import { Bug, CheckCircle2, Clock, Trash2, RotateCcw, ExternalLink, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  useAllBugReports, useResolveBugReport, useReopenBugReport, useDeleteBugReport, type BugReport,
} from "@/hooks/useBugReports";

const dtFmt = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
type Tab = "all" | "open" | "resolved";

export default function BugReports() {
  const { isGestor } = useAuth();
  const { data: bugs = [], isLoading } = useAllBugReports();
  const resolve = useResolveBugReport();
  const reopen = useReopenBugReport();
  const remove = useDeleteBugReport();

  const [tab, setTab] = useState<Tab>("open");
  const [detail, setDetail] = useState<BugReport | null>(null);
  const [nota, setNota] = useState("");

  const counts = useMemo(() => ({
    all: bugs.length,
    open: bugs.filter((b) => b.status === "open").length,
    resolved: bugs.filter((b) => b.status === "resolved").length,
  }), [bugs]);

  const list = useMemo(
    () => bugs.filter((b) => (tab === "all" ? true : b.status === tab)),
    [bugs, tab],
  );

  if (!isGestor) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Acesso restrito à gestão (TI / command / head).</p>
      </div>
    );
  }

  const openDetail = (b: BugReport) => { setDetail(b); setNota(b.admin_notes ?? ""); };

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-5xl mx-auto">
        <CarboPageHeader title="Reports de Bug" description="Problemas reportados pelos usuários — com a tela onde aconteceu" icon={Bug} />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {([["open", "Abertos", counts.open], ["resolved", "Corrigidos", counts.resolved], ["all", "Todos", counts.all]] as [Tab, string, number][]).map(([k, label, n]) => (
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
            <Bug className="h-10 w-10 mx-auto text-muted-foreground/30" />
            <p className="text-muted-foreground">Nenhum report {tab === "open" ? "em aberto" : tab === "resolved" ? "corrigido" : ""}.</p>
          </CarboCardContent></CarboCard>
        ) : (
          <div className="space-y-2">
            {list.map((b) => (
              <CarboCard key={b.id}>
                <CarboCardContent className="p-3 flex items-start gap-3">
                  {b.status === "resolved"
                    ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                    : <Clock className="h-4 w-4 text-warning mt-0.5 shrink-0" />}
                  <button className="flex-1 min-w-0 text-left" onClick={() => openDetail(b)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{b.title}</p>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{b.app}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{b.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span>{b.reporter_name || "—"}</span>
                      <span>·</span>
                      <span>{dtFmt(b.created_at)}</span>
                      {b.url && <><span>·</span><span className="truncate max-w-[220px]">{b.url}</span></>}
                    </div>
                  </button>
                  <div className="flex gap-1 shrink-0">
                    {b.status === "open" ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openDetail(b)}>
                        <CheckCircle2 className="h-3 w-3" /> Resolver
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
                </CarboCardContent>
              </CarboCard>
            ))}
          </div>
        )}
      </div>

      {/* Detalhe + resolver */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Bug className="h-4 w-4 text-destructive" /> {detail.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-1 text-sm">
                <p className="whitespace-pre-wrap text-muted-foreground">{detail.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Reportado por</span><p className="font-medium">{detail.reporter_name || "—"}</p></div>
                  <div><span className="text-muted-foreground">App</span><p className="font-medium uppercase">{detail.app}</p></div>
                  <div><span className="text-muted-foreground">Departamento</span><p className="font-medium">{detail.department || "—"}</p></div>
                  <div><span className="text-muted-foreground">Quando</span><p className="font-medium">{dtFmt(detail.created_at)}</p></div>
                </div>
                {detail.url && (
                  <a href={detail.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-carbo-green hover:underline break-all">
                    <ExternalLink className="h-3 w-3 shrink-0" /> {detail.url}
                  </a>
                )}
                <div className="space-y-1.5">
                  <Label>Resposta / nota do TI</Label>
                  <Textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que foi feito / status..." />
                </div>
              </div>
              <DialogFooter className="gap-2">
                {detail.status === "open" ? (
                  <Button onClick={() => resolve.mutate({ id: detail.id, admin_notes: nota.trim() || undefined }, { onSuccess: () => setDetail(null) })} disabled={resolve.isPending} className="bg-carbo-green hover:bg-carbo-green/90 text-white gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Marcar como corrigido
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => resolve.mutate({ id: detail.id, admin_notes: nota.trim() || undefined }, { onSuccess: () => setDetail(null) })} disabled={resolve.isPending}>
                    Salvar nota
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
