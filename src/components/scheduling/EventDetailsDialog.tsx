import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Calendar, 
  Clock, 
  Link2, 
  User, 
  Trash2, 
  CheckCircle2,
  XCircle,
  PlayCircle
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ScheduledEvent, 
  useUpdateEvent, 
  useDeleteEvent,
  EventStatus 
} from "@/hooks/useScheduledEvents";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface EventDetailsDialogProps {
  event: ScheduledEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  os_creation: "Criação de OP",
  os_delivery: "Entrega de OP",
  meeting: "Reunião",
  deadline: "Prazo",
  general: "Geral",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Agendado", variant: "secondary" },
  in_progress: { label: "Em Andamento", variant: "default" },
  completed: { label: "Concluído", variant: "outline" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

export function EventDetailsDialog({
  event,
  open,
  onOpenChange,
}: EventDetailsDialogProps) {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const { mutate: updateEvent, isPending: isUpdating } = useUpdateEvent();
  const { mutate: deleteEvent, isPending: isDeleting } = useDeleteEvent();

  if (!event) return null;

  const handleStatusChange = (status: EventStatus) => {
    updateEvent(
      { eventId: event.id, data: { status } },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const handleDelete = () => {
    if (confirm("Tem certeza que deseja excluir este evento?")) {
      deleteEvent(event.id, {
        onSuccess: () => onOpenChange(false),
      });
    }
  };

  const handleGoToOS = () => {
    if (event.service_order_id) {
      onOpenChange(false);
      navigate(`/os/${event.service_order_id}`);
    }
  };

  const statusInfo = STATUS_LABELS[event.status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: event.color || "#3B82F6" }}
                />
                {event.title}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {EVENT_TYPE_LABELS[event.event_type]}
              </DialogDescription>
            </div>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {event.description && (
            <p className="text-sm text-muted-foreground">{event.description}</p>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>
                {format(new Date(event.start_date), "EEEE, dd 'de' MMMM 'de' yyyy", {
                  locale: ptBR,
                })}
              </span>
            </div>

            {!event.all_day && (
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  {format(new Date(event.start_date), "HH:mm", { locale: ptBR })}
                  {event.end_date &&
                    ` - ${format(new Date(event.end_date), "HH:mm", { locale: ptBR })}`}
                </span>
              </div>
            )}

            {event.all_day && (
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Dia inteiro</span>
              </div>
            )}

            {event.service_order && (
              <div className="flex items-center gap-3 text-sm">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <button
                  onClick={handleGoToOS}
                  className="text-primary hover:underline"
                >
                  {event.service_order.os_number} - {event.service_order.title}
                </button>
              </div>
            )}

            {event.assignee && (
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{event.assignee.full_name || "Usuário"}</span>
              </div>
            )}
          </div>

          {isManager && event.status !== "completed" && event.status !== "cancelled" && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">Alterar Status</p>
                <div className="flex flex-wrap gap-2">
                  {event.status !== "in_progress" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => handleStatusChange("in_progress")}
                      disabled={isUpdating}
                    >
                      <PlayCircle className="h-4 w-4" />
                      Iniciar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => handleStatusChange("completed")}
                    disabled={isUpdating}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Concluir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 text-destructive"
                    onClick={() => handleStatusChange("cancelled")}
                    disabled={isUpdating}
                  >
                    <XCircle className="h-4 w-4" />
                    Cancelar
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {isManager && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
