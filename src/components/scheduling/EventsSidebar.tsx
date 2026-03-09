import React from "react";
import { format, isSameDay, isToday, isTomorrow, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Clock, Link2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ScheduledEvent } from "@/hooks/useScheduledEvents";

interface EventsSidebarProps {
  events: ScheduledEvent[];
  selectedDate: Date | null;
  onEventClick: (event: ScheduledEvent) => void;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
  in_progress: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  completed: "bg-green-500/20 text-green-600 dark:text-green-400",
  cancelled: "bg-red-500/20 text-red-600 dark:text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado",
  in_progress: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

function getDateLabel(date: Date): string {
  if (isToday(date)) return "Hoje";
  if (isTomorrow(date)) return "Amanhã";
  return format(date, "EEEE, dd/MM", { locale: ptBR });
}

export function EventsSidebar({
  events,
  selectedDate,
  onEventClick,
}: EventsSidebarProps) {
  // Filter and group events
  const filteredEvents = selectedDate
    ? events.filter((e) => isSameDay(new Date(e.start_date), selectedDate))
    : events.filter((e) => {
        const eventDate = new Date(e.start_date);
        const today = new Date();
        const nextWeek = addDays(today, 7);
        return eventDate >= today && eventDate <= nextWeek;
      });

  // Group by date
  const groupedEvents = filteredEvents.reduce((acc, event) => {
    const dateKey = format(new Date(event.start_date), "yyyy-MM-dd");
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, ScheduledEvent[]>);

  const sortedDates = Object.keys(groupedEvents).sort();

  return (
    <div className="bg-card rounded-lg border shadow-sm h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          {selectedDate
            ? getDateLabel(selectedDate)
            : "Próximos 7 dias"}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {filteredEvents.length} evento(s)
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {sortedDates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum evento {selectedDate ? "nesta data" : "próximo"}
            </p>
          ) : (
            sortedDates.map((dateKey) => (
              <div key={dateKey}>
                {!selectedDate && (
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">
                    {getDateLabel(new Date(dateKey))}
                  </h4>
                )}

                <div className="space-y-2">
                  {groupedEvents[dateKey].map((event) => (
                    <button
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className="w-full text-left p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="h-3 w-3 rounded-full mt-1.5 shrink-0"
                          style={{ backgroundColor: event.color || "#3B82F6" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{event.title}</p>
                          
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {event.all_day
                              ? "Dia inteiro"
                              : format(new Date(event.start_date), "HH:mm", {
                                  locale: ptBR,
                                })}
                          </div>

                          {event.service_order && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-primary">
                              <Link2 className="h-3 w-3" />
                              {event.service_order.os_number}
                            </div>
                          )}

                          <Badge
                            variant="secondary"
                            className={`mt-2 text-xs ${STATUS_COLORS[event.status]}`}
                          >
                            {STATUS_LABELS[event.status]}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
