import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateTimePickerProps {
  value?: string; // "YYYY-MM-DDTHH:MM"
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  minHour?: number;
  maxHour?: number;
}

// Hours 6–22 in steps of 1; minutes only 00 and 30
const HOURS = Array.from({ length: 17 }, (_, i) => (i + 6).toString().padStart(2, "0")); // 06…22
const MINUTES = ["00", "30"];

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Selecione data e horário",
  className,
  minHour = 6,
  maxHour = 22,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  const selected: Date | undefined = value ? new Date(value) : undefined;
  const selHour = selected ? selected.getHours().toString().padStart(2, "0") : "08";
  const selMin  = selected ? (selected.getMinutes() >= 30 ? "30" : "00") : "00";

  const applyDateTime = (day: Date, h: string, m: string) => {
    const d = new Date(day);
    d.setHours(parseInt(h), parseInt(m), 0, 0);
    onChange?.(format(d, "yyyy-MM-dd'T'HH:mm"));
  };

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    applyDateTime(day, selHour, selMin);
  };

  const handleHour = (h: string) => {
    if (!selected) return;
    applyDateTime(selected, h, selMin);
  };

  const handleMin = (m: string) => {
    if (!selected) return;
    applyDateTime(selected, selHour, m);
  };

  const handleClear = () => {
    onChange?.("");
    setOpen(false);
  };

  const hours = HOURS.filter((h) => parseInt(h) >= minHour && parseInt(h) <= maxHour);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-9 gap-2",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          {selected
            ? format(selected, "dd/MM/yyyy '·' HH:mm", { locale: ptBR })
            : <span>{placeholder}</span>
          }
          {selected && (
            <span
              role="button"
              aria-label="Limpar"
              className="ml-auto flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-0 shadow-xl border rounded-xl overflow-hidden"
        align="start"
        side="bottom"
      >
        <div className="flex">
          {/* ── Calendar ── */}
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleDaySelect}
            locale={ptBR}
            initialFocus
            className="rounded-none border-r-0"
          />

          {/* ── Time picker ── */}
          <div className="flex flex-col border-l bg-muted/30 w-[96px]">
            {/* header */}
            <div className="flex items-center gap-1.5 px-3 py-2.5 border-b bg-background">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Horário</span>
            </div>

            <div className="flex flex-1">
              {/* Hours column */}
              <div className="flex flex-col flex-1 border-r">
                <p className="text-center text-[10px] font-medium text-muted-foreground py-1 border-b">H</p>
                <div className="overflow-y-auto max-h-[220px] scrollbar-thin">
                  {hours.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleHour(h)}
                      className={cn(
                        "w-full py-1.5 text-sm text-center transition-colors",
                        h === selHour && selected
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minutes column */}
              <div className="flex flex-col flex-1">
                <p className="text-center text-[10px] font-medium text-muted-foreground py-1 border-b">Min</p>
                <div className="flex flex-col">
                  {MINUTES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleMin(m)}
                      className={cn(
                        "w-full py-1.5 text-sm text-center transition-colors",
                        m === selMin && selected
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected time display */}
            {selected && (
              <div className="border-t bg-background px-2 py-2 text-center">
                <span className="text-sm font-bold text-primary tabular-nums">
                  {format(selected, "HH:mm")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {selected && (
          <div className="border-t bg-background px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground capitalize">
              {format(selected, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </span>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={handleClear}>
              Limpar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
