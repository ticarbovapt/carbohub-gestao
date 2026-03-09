import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ScheduledEvent } from "@/hooks/useScheduledEvents";

interface SchedulingCalendarProps {
  events: ScheduledEvent[];
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  onEventClick: (event: ScheduledEvent) => void;
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onCreateEvent: () => void;
  isManager: boolean;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  os_creation: "bg-green-500",
  os_delivery: "bg-blue-500",
  meeting: "bg-purple-500",
  deadline: "bg-red-500",
  general: "bg-gray-500",
};

export function SchedulingCalendar({
  events,
  selectedDate,
  onDateSelect,
  onEventClick,
  currentMonth,
  onMonthChange,
  onCreateEvent,
  isManager,
}: SchedulingCalendarProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => {
      const eventDate = new Date(event.start_date);
      return isSameDay(eventDate, day);
    });
  };

  return (
    <div className="bg-card rounded-lg border shadow-sm">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onMonthChange(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onMonthChange(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isManager && (
          <Button onClick={onCreateEvent} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Evento
          </Button>
        )}
      </div>

      {/* Week Days Header */}
      <div className="grid grid-cols-7 border-b">
        {weekDays.map((day) => (
          <div
            key={day}
            className="p-3 text-center text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const dayEvents = getEventsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isTodayDate = isToday(day);

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[100px] border-b border-r p-1 cursor-pointer hover:bg-accent/50 transition-colors",
                !isCurrentMonth && "bg-muted/30 text-muted-foreground",
                isSelected && "bg-accent",
                index % 7 === 0 && "border-l"
              )}
              onClick={() => onDateSelect(day)}
            >
              <div className="flex flex-col h-full">
                <span
                  className={cn(
                    "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                    isTodayDate && "bg-primary text-primary-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>

                <div className="flex-1 space-y-1 mt-1 overflow-hidden">
                  {dayEvents.slice(0, 3).map((event) => (
                    <button
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      className={cn(
                        "w-full text-left text-xs px-1.5 py-0.5 rounded truncate text-white",
                        EVENT_TYPE_COLORS[event.event_type] || "bg-gray-500"
                      )}
                      style={event.color ? { backgroundColor: event.color } : undefined}
                    >
                      {event.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-xs text-muted-foreground pl-1">
                      +{dayEvents.length - 3} mais
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
