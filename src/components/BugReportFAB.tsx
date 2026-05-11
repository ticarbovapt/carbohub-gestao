import React, { useState } from "react";
import { Bug } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubmitBugReport } from "@/hooks/useBugReports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function BugReportButton() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const submitMutation = useSubmitBugReport();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [capturedUrl, setCapturedUrl] = useState("");

  if (!user || location.pathname === "/bugs") return null;

  function handleOpen() {
    setCapturedUrl(window.location.href);
    setOpen(true);
  }

  function handleSubmit() {
    if (!title.trim() || !description.trim()) return;
    submitMutation.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        url: capturedUrl,
        reporter_id: user!.id,
        reporter_name: profile?.full_name ?? null,
        reporter_email: user!.email ?? null,
        department: profile?.department ?? null,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setOpen(false);
        },
      }
    );
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpen}
            className="h-9 w-9 lg:h-10 lg:w-10"
            aria-label="Reportar problema"
          >
            <Bug className="h-4 w-4 lg:h-5 lg:w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reportar problema</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
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
                placeholder="Ex: Botão de voltar desconecta do sistema"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bug-desc">Descrição <span className="text-destructive">*</span></Label>
              <Textarea
                id="bug-desc"
                placeholder="Descreva o que aconteceu, o que esperava que acontecesse e qualquer mensagem de erro."
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A tela atual e suas informações serão registradas automaticamente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!title.trim() || !description.trim() || submitMutation.isPending}
            >
              {submitMutation.isPending ? "Enviando..." : "Enviar Reporte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
