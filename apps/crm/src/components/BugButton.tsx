import { useState } from "react";
import { Bug, Plus, CheckCircle2, Clock, ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBugReports, useSubmitBugReport } from "@/hooks/useBugReports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

function StatusIcon({ status }: { status: "open" | "resolved" }) {
  if (status === "resolved") return <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />;
  return <Clock className="h-3.5 w-3.5 text-warning shrink-0" />;
}

function StatusLabel({ status }: { status: "open" | "resolved" }) {
  return (
    <span className={`text-[10px] font-medium ${status === "resolved" ? "text-success" : "text-warning"}`}>
      {status === "resolved" ? "Resolvido" : "Em aberto"}
    </span>
  );
}

function dtFmt(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function BugButton() {
  const { user, profile, isGestor } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: bugs = [] } = useMyBugReports(user?.id);
  const submit = useSubmitBugReport();

  if (!user) return null;

  const openCount = bugs.filter((b) => b.status === "open").length;

  function handleOpenDialog() {
    setOpen(false);
    setTitle("");
    setDescription("");
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!title.trim() || !description.trim()) return;
    submit.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        url: window.location.href,
        reporter_id: user!.id,
        reporter_name: profile?.full_name ?? null,
        reporter_email: user!.email ?? null,
        department: (profile as { department?: string } | null)?.department ?? null,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setDialogOpen(false);
        },
      }
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="relative h-9 w-9 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
            title="Bugs reportados"
          >
            <Bug className="h-4 w-4" />
            {openCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center leading-none">
                {openCount > 9 ? "9+" : openCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Meus Bugs</span>
              {openCount > 0 && (
                <span className="text-[10px] bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 font-medium">
                  {openCount} aberto{openCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleOpenDialog}>
              <Plus className="h-3 w-3" /> Reportar
            </Button>
          </div>

          {bugs.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              <Bug className="h-8 w-8 mx-auto mb-2 opacity-20" />
              Nenhum bug reportado ainda
            </div>
          ) : (
            <ScrollArea className="max-h-72">
              <div className="divide-y">
                {bugs.map((bug) => (
                  <div key={bug.id} className="px-4 py-2.5">
                    <button
                      className="w-full text-left"
                      onClick={() => setExpandedId(expandedId === bug.id ? null : bug.id)}
                    >
                      <div className="flex items-start gap-2">
                        <StatusIcon status={bug.status} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug truncate">{bug.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <StatusLabel status={bug.status} />
                            <span className="text-[10px] text-muted-foreground">{dtFmt(bug.created_at)}</span>
                          </div>
                        </div>
                        {expandedId === bug.id
                          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                      </div>
                    </button>
                    {expandedId === bug.id && (
                      <div className="mt-2 ml-5 space-y-1.5">
                        <p className="text-xs text-muted-foreground leading-relaxed">{bug.description}</p>
                        {bug.admin_notes && (
                          <div className="rounded bg-muted px-2.5 py-1.5">
                            <p className="text-[10px] font-medium text-foreground mb-0.5">Resposta do TI:</p>
                            <p className="text-xs text-muted-foreground">{bug.admin_notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          {isGestor && (
            <button
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border-t text-xs font-medium text-carbo-green hover:bg-muted transition-colors"
              onClick={() => { setOpen(false); navigate("/bugs"); }}
            >
              <ListChecks className="h-3.5 w-3.5" /> Ver todos os reports (gestão)
            </button>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-destructive" />
              Reportar um problema
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="bug-title">Título <span className="text-destructive">*</span></Label>
              <Input
                id="bug-title"
                placeholder="Ex: Botão de salvar não funciona"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bug-desc">Descrição <span className="text-destructive">*</span></Label>
              <Textarea
                id="bug-desc"
                placeholder="O que aconteceu? O que esperava? Alguma mensagem de erro?"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A tela atual ({location.pathname}) será registrada automaticamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={!title.trim() || !description.trim() || submit.isPending}
            >
              {submit.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
