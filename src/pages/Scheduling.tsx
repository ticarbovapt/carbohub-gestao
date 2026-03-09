import React, { useState } from "react";
import { Link } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { SchedulingCalendar } from "@/components/scheduling/SchedulingCalendar";
import { EventsSidebar } from "@/components/scheduling/EventsSidebar";
import { CreateEventDialog } from "@/components/scheduling/CreateEventDialog";
import { EventDetailsDialog } from "@/components/scheduling/EventDetailsDialog";
import { useScheduledEvents, ScheduledEvent } from "@/hooks/useScheduledEvents";
import { useAuth } from "@/contexts/AuthContext";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { ArrowLeft, Home } from "lucide-react";

export default function Scheduling() {
  const { isManager } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ScheduledEvent | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEventDetails, setShowEventDetails] = useState(false);

  const { data: events = [], isLoading } = useScheduledEvents(currentMonth);

  const handleEventClick = (event: ScheduledEvent) => {
    setSelectedEvent(event);
    setShowEventDetails(true);
  };

  const handleCreateEvent = () => {
    setShowCreateDialog(true);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  if (isLoading) {
    return (
      <BoardLayout>
        <div className="p-6 space-y-6">
          <CarboSkeleton className="h-10 w-48" />
          <CarboSkeleton className="h-[600px]" />
        </div>
      </BoardLayout>
    );
  }

  return (
    <BoardLayout>
      <div className="p-6 space-y-6">
        {/* Back to home */}
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <Home className="h-4 w-4" />
          <span>Início OPS</span>
        </Link>

        <div>
          <h1 className="text-2xl font-bold">Agendamentos</h1>
          <p className="text-muted-foreground">
            Gerencie eventos e prazos vinculados às Ordens de Produção
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar - 3 columns */}
          <div className="lg:col-span-3">
            <SchedulingCalendar
              events={events}
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              onEventClick={handleEventClick}
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              onCreateEvent={handleCreateEvent}
              isManager={isManager}
            />
          </div>

          {/* Events Sidebar - 1 column */}
          <div className="lg:col-span-1 h-[600px]">
            <EventsSidebar
              events={events}
              selectedDate={selectedDate}
              onEventClick={handleEventClick}
            />
          </div>
        </div>
      </div>

      {/* Create Event Dialog */}
      <CreateEventDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        initialDate={selectedDate || undefined}
      />

      {/* Event Details Dialog */}
      <EventDetailsDialog
        event={selectedEvent}
        open={showEventDetails}
        onOpenChange={setShowEventDetails}
      />
    </BoardLayout>
  );
}
