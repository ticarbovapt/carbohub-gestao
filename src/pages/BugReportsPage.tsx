import React, { useState } from "react";
import { Bug, CheckCircle2, Clock, ExternalLink, Trash2 } from "lucide-react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useBugReports, useResolveBugReport, useDeleteBugReport, BugReport } from "@/hooks/useBugReports";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type StatusFilter = "all" | "open" | "resolved";

export default function BugReportsPage() {
  const { isAdmin, isSuporte } = useAuth();
  const canManageBugs = isAdmin || isSuporte;
  const { data: reports = [], isLoading } = useBugReports();
  const resolveMutation = useResolveBugReport();
  const deleteMutation = useDeleteBugReport();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [detailBug, setDetailBug] = useState<BugReport | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const filtered = reports.filter((r) => {
    if (statusFilter === "all") return true;
    return r.status === statusFilter;
  });

  function handleResolve(bug: BugReport) {
    resolveMutation.mutate(
      { id: bug.id, admin_notes: adminNotes.trim() || undefined },
      {
        onSuccess: () => {
          setDetailBug(null);
          setAdminNotes("");
        },
      }
    );
  }

  function openDetail(bug: BugReport) {
    setDetailBug(bug);
    setAdminNotes(bug.admin_notes ?? "");
  }

  const counts = {
    all: reports.length,
    open: reports.filter((r) => r.status === "open").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Bug className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Bugs Encontrados</h1>
            <p className="text-sm text-muted-foreground">Problemas reportados pela equipe</p>
          </div>
        </div>

        {/* Filtros */}
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">
              Todos <span className="ml-1.5 text-xs opacity-70">({counts.all})</span>
            </TabsTrigger>
            <TabsTrigger value="open">
              Abertos <span className="ml-1.5 text-xs opacity-70">({counts.open})</span>
            </TabsTrigger>
            <TabsTrigger value="resolved">
              Corrigidos <span className="ml-1.5 text-xs opacity-70">({counts.resolved})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Tabela */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Data</TableHead>
                <TableHead>Título</TableHead>
                <TableHead className="w-[160px]">Reportado por</TableHead>
                <TableHead className="w-[200px]">Tela</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    Carregando...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    Nenhum bug encontrado nesta categoria.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((bug) => (
                <TableRow key={bug.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openDetail(bug)}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(bug.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">{bug.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate max-w-[160px]">
                    {bug.reporter_name ?? bug.reporter_email ?? "—"}
                  </TableCell>
                  <TableCell>
                    {bug.url ? (
                      <a
                        href={bug.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-primary hover:underline truncate max-w-[190px]"
                      >
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{bug.url.replace(/^https?:\/\/[^/]+/, "")}</span>
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {bug.status === "open" ? (
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        Aberto
                      </Badge>
                    ) : (
                      <Badge className="gap-1 text-xs bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3" />
                        Corrigido
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => openDetail(bug)}>
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Modal: Detalhes */}
      <Dialog open={!!detailBug} onOpenChange={(open) => { if (!open) { setDetailBug(null); setAdminNotes(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-destructive" />
              Detalhes do Bug
            </DialogTitle>
          </DialogHeader>
          {detailBug && (
            <div className="space-y-4 py-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Título</p>
                <p className="font-medium">{detailBug.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Descrição</p>
                <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-lg p-3">{detailBug.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Reportado por</p>
                  <p>{detailBug.reporter_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{detailBug.reporter_email ?? ""}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Data</p>
                  <p>{format(new Date(detailBug.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                </div>
              </div>
              {detailBug.url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tela</p>
                  <a
                    href={detailBug.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1 break-all"
                  >
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    {detailBug.url}
                  </a>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                {detailBug.status === "open" ? (
                  <Badge variant="destructive" className="gap-1">
                    <Clock className="h-3 w-3" />
                    Aberto
                  </Badge>
                ) : (
                  <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3" />
                    Corrigido
                  </Badge>
                )}
              </div>
              {canManageBugs && detailBug.status === "open" && (
                <div className="space-y-1.5 pt-2 border-t">
                  <Label htmlFor="admin-notes">Notas do admin (opcional)</Label>
                  <Textarea
                    id="admin-notes"
                    placeholder="Descreva o que foi corrigido ou qualquer observação..."
                    rows={3}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                  />
                </div>
              )}
              {detailBug.status === "resolved" && detailBug.admin_notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notas do admin</p>
                  <p className="text-sm whitespace-pre-wrap bg-emerald-500/10 rounded-lg p-3 text-emerald-700 dark:text-emerald-400">
                    {detailBug.admin_notes}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {canManageBugs && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
                  onClick={() => { if (detailBug) { deleteMutation.mutate(detailBug.id); setDetailBug(null); setAdminNotes(""); } }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Apagar
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setDetailBug(null); setAdminNotes(""); }}>
                Fechar
              </Button>
              {canManageBugs && detailBug?.status === "open" && (
                <Button
                  onClick={() => detailBug && handleResolve(detailBug)}
                  disabled={resolveMutation.isPending}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {resolveMutation.isPending ? "Salvando..." : "Marcar como corrigido"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BoardLayout>
  );
}
