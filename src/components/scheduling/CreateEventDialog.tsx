import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useCreateEvent, EventType } from "@/hooks/useScheduledEvents";
import { useTeamProfiles } from "@/hooks/useTeamProfiles";
import { supabase } from "@/integrations/supabase/client";

const eventSchema = z.object({
  title: z.string().min(1, "Título é obrigatório").max(100, "Máximo 100 caracteres"),
  description: z.string().max(500, "Máximo 500 caracteres").optional(),
  start_date: z.date({ required_error: "Data de início é obrigatória" }),
  end_date: z.date().optional(),
  all_day: z.boolean().default(false),
  event_type: z.enum(["os_creation", "os_delivery", "meeting", "deadline", "general"]),
  service_order_id: z.string().optional(),
  assigned_to: z.string().optional(),
  color: z.string().optional(),
});

type EventFormData = z.infer<typeof eventSchema>;

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date;
}

const EVENT_TYPES: { value: EventType; label: string; color: string }[] = [
  { value: "os_creation", label: "Criação de OP", color: "#22C55E" },
  { value: "os_delivery", label: "Entrega de OP", color: "#3B82F6" },
  { value: "meeting", label: "Reunião", color: "#A855F7" },
  { value: "deadline", label: "Prazo", color: "#EF4444" },
  { value: "general", label: "Geral", color: "#6B7280" },
];

export function CreateEventDialog({
  open,
  onOpenChange,
  initialDate,
}: CreateEventDialogProps) {
  const { mutate: createEvent, isPending } = useCreateEvent();
  const { data: profiles = [] } = useTeamProfiles();
  const [serviceOrders, setServiceOrders] = useState<{ id: string; os_number: string; title: string }[]>([]);

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      description: "",
      all_day: false,
      event_type: "general",
      color: "#3B82F6",
    },
  });

  // Load service orders
  useEffect(() => {
    async function loadServiceOrders() {
      const { data } = await supabase
        .from("service_orders")
        .select("id, os_number, title")
        .in("status", ["draft", "active", "paused"])
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (data) setServiceOrders(data);
    }
    
    if (open) {
      loadServiceOrders();
    }
  }, [open]);

  // Set initial date when provided
  useEffect(() => {
    if (initialDate && open) {
      form.setValue("start_date", initialDate);
    }
  }, [initialDate, open, form]);

  const selectedEventType = form.watch("event_type");

  // Update color when event type changes
  useEffect(() => {
    const eventType = EVENT_TYPES.find((t) => t.value === selectedEventType);
    if (eventType) {
      form.setValue("color", eventType.color);
    }
  }, [selectedEventType, form]);

  const onSubmit = (data: EventFormData) => {
    createEvent(
      {
        title: data.title,
        description: data.description,
        start_date: data.start_date,
        end_date: data.end_date,
        all_day: data.all_day,
        event_type: data.event_type,
        service_order_id: data.service_order_id || undefined,
        assigned_to: data.assigned_to || undefined,
        color: data.color,
      },
      {
        onSuccess: () => {
          form.reset();
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Evento</DialogTitle>
          <DialogDescription>
            Crie um novo evento no calendário. Vincule a uma OP se necessário.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do evento" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Detalhes do evento..."
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="event_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Evento *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-popover">
                        {EVENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: type.color }}
                              />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="all_day"
                render={({ field }) => (
                  <FormItem className="flex flex-col justify-end">
                    <FormLabel>Dia inteiro</FormLabel>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <span className="text-sm text-muted-foreground">
                        {field.value ? "Sim" : "Não"}
                      </span>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de Início *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? format(field.value, "dd/MM/yyyy", { locale: ptBR })
                              : "Selecione"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-popover" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          locale={ptBR}
                          className="pointer-events-auto"
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de Término</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? format(field.value, "dd/MM/yyyy", { locale: ptBR })
                              : "Opcional"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-popover" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          locale={ptBR}
                          className="pointer-events-auto"
                          disabled={(date) =>
                            form.getValues("start_date")
                              ? date < form.getValues("start_date")
                              : false
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="service_order_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Vincular à OP
                  </FormLabel>
                  <Select 
                    onValueChange={(val) => field.onChange(val === "__none__" ? undefined : val)} 
                    value={field.value || "__none__"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Nenhuma OP vinculada" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover max-h-48">
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {serviceOrders.map((os) => (
                        <SelectItem key={os.id} value={os.id}>
                          {os.os_number} - {os.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assigned_to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsável</FormLabel>
                  <Select 
                    onValueChange={(val) => field.onChange(val === "__none__" ? undefined : val)} 
                    value={field.value || "__none__"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sem responsável definido" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover max-h-48">
                      <SelectItem value="__none__">Nenhum</SelectItem>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.full_name || "Usuário"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Criando..." : "Criar Evento"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
