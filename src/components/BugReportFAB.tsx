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

export function BugReportFAB() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const submitMutation = useSubmitBugReport();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [capturedUrl, setCapturedUrl] = useState("");

  // Não aparece na página de bugs nem em rotas públicas
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
          <button
            onClick={handleOpen}
            className="fixed bottom-6 left-6 z-50 h-10 w-10 rounded-full bg-background border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
            aria-label="Reportar problema"
          >
            <Bug className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Reportar problema</p>
        </TooltipContent>
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
              <Label htmlFor="fab-title">Título <span className="text-destructive">*</span></Label>
              <Input
                id="fab-title"
                placeholder="Ex: Botão de voltar desconecta do sistema"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fab-desc">Descrição <span className="text-destructive">*</span></Label>
              <Textarea
                id="fab-desc"
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
