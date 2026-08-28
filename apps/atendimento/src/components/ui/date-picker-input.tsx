import { useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ── Props ─────────────────────────────────────────────────────────────────────
interface DatePickerInputProps {
  value: string;         // YYYY-MM-DD  ou ""
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  clearable?: boolean;
  disablePast?: boolean;   // bloqueia datas anteriores a hoje
  disableFuture?: boolean; // bloqueia datas posteriores a hoje
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DatePickerInput({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  className,
  clearable = true,
  disablePast = false,
  disableFuture = false,
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false);

  // Converter YYYY-MM-DD → Date para o Calendar
  const selected: Date | undefined = (() => {
    if (!value) return undefined;
    try {
      const d = parseISO(value);
      return isValid(d) ? d : undefined;
    } catch {
      return undefined;
    }
  })();

  const handleSelect = (day: Date | undefined) => {
    if (!day) return;
    // Converter Date → YYYY-MM-DD (sem fuso horário)
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const d = String(day.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${d}`);
    setOpen(false);
  };

  const displayLabel = selected
    ? format(selected, "dd/MM/yyyy", { locale: ptBR })
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-8 justify-start text-left font-normal gap-2 px-2.5",
            !displayLabel && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs flex-1">{displayLabel ?? placeholder}</span>
          {clearable && value && (
            <X
              className="h-3 w-3 text-muted-foreground hover:text-foreground shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          initialFocus
          locale={ptBR}
          disabled={(date) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              if (disablePast && date < today) return true;
              if (disableFuture && date > today) return true;
              return false;
            }}
        />
      </PopoverContent>
    </Popover>
  );
}
