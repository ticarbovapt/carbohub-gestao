import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CarboButton } from "@/components/ui/carbo-button";
import { useUpdateOrder, type CarbozeOrder, type OrderStatus, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, type OrderType } from "@/hooks/useCarbozeOrders";
import { useLicensees } from "@/hooks/useLicensees";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CalendarIcon, Repeat, Zap, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  customer_name: z.string().min(1, "Nome do cliente é obrigatório"),
  customer_email: z.string().email("Email inválido").optional().or(z.literal("")),
  customer_phone: z.string().optional(),
  licensee_id: z.string().optional(),
  delivery_address: z.string().optional(),
  delivery_city: z.string().optional(),
  delivery_state: z.string().optional(),
  delivery_zip: z.string().optional(),
  status: z.enum(["pending", "confirmed", "invoiced", "shipped", "delivered", "cancelled"]),
  tracking_code: z.string().optional(),
  tracking_url: z.string().optional(),
  vendedor_id: z.string().optional(),
  vendedor_name: z.string().optional(),
  notes: z.string().optional(),
  internal_notes: z.string().optional(),
  // Recurrence fields
  order_type: z.enum(["spot", "recorrente"]),
  is_recurring: z.boolean(),
  recurrence_interval_days: z.number().min(1).optional().nullable(),
  next_delivery_date: z.date().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

interface EditOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: CarbozeOrder | null;
}

export function EditOrderDialog({ open, onOpenChange, order }: EditOrderDialogProps) {
  const updateOrder = useUpdateOrder();
  const { data: licensees = [] } = useLicensees("all");

  // Load all approved collaborators to populate vendedor select
  const { data: vendedores = [] } = useQuery({
    queryKey: ["profiles-vendedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("status", "approved")
        .order("full_name");
      if (error) throw error;
      return (data || []).filter((p) => p.full_name) as { id: string; full_name: string; email: string | null }[];
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      licensee_id: "none",
      delivery_address: "",
      delivery_city: "",
      delivery_state: "",
      delivery_zip: "",
      status: "pending",
      tracking_code: "",
      tracking_url: "",
      notes: "",
      internal_notes: "",
      order_type: "spot",
      is_recurring: false,
      recurrence_interval_days: null,
      next_delivery_date: null,
      vendedor_id: "none",
      vendedor_name: "",
    },
  });

  const watchOrderType = form.watch("order_type");
  const watchIsRecurring = form.watch("is_recurring");

  useEffect(() => {
    if (order) {
      form.reset({
        customer_name: order.customer_name,
        customer_email: order.customer_email || "",
        customer_phone: order.customer_phone || "",
        licensee_id: order.licensee_id || "none",
        delivery_address: order.delivery_address || "",
        delivery_city: order.delivery_city || "",
        delivery_state: order.delivery_state || "",
        delivery_zip: order.delivery_zip || "",
        status: order.status,
        tracking_code: order.tracking_code || "",
        tracking_url: order.tracking_url || "",
        notes: order.notes || "",
        internal_notes: order.internal_notes || "",
        order_type: order.order_type || "spot",
        is_recurring: order.is_recurring || false,
        recurrence_interval_days: order.recurrence_interval_days || null,
        next_delivery_date: order.next_delivery_date ? new Date(order.next_delivery_date) : null,
        vendedor_id: order.vendedor_id || "none",
        vendedor_name: order.vendedor_name || "",
      });
    }
  }, [order, form]);

  const onSubmit = async (data: FormData) => {
    if (!order) return;

    try {
      // Resolve vendedor name from selected id
      const selectedVendedor = vendedores.find((v) => v.id === data.vendedor_id);

      await updateOrder.mutateAsync({
        id: order.id,
        ...data,
        customer_email: data.customer_email || undefined,
        licensee_id: data.licensee_id === "none" ? null : data.licensee_id || null,
        vendedor_id: data.vendedor_id === "none" ? null : data.vendedor_id || null,
        vendedor_name: data.vendedor_id === "none" ? null : (selectedVendedor?.full_name || data.vendedor_name || null),
        recurrence_interval_days: data.is_recurring ? data.recurrence_interval_days : null,
        next_delivery_date: data.is_recurring && data.next_delivery_date
          ? format(data.next_delivery_date, "yyyy-MM-dd")
          : null,
      });
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Pedido</DialogTitle>
          <DialogDescription>
            Atualize as informações do pedido {order?.order_number}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Customer Info */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Cliente *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome completo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@exemplo.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input placeholder="(00) 00000-0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Licensee */}
            <FormField
              control={form.control}
              name="licensee_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Licenciado</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o licenciado" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sem licenciado</SelectItem>
                      {licensees.map((lic) => (
                        <SelectItem key={lic.id} value={lic.id}>
                          {lic.code} - {lic.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Vendedor */}
            <FormField
              control={form.control}
              name="vendedor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    Vendedor
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o vendedor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sem vendedor</SelectItem>
                      {vendedores.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.full_name || v.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Delivery Address */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="delivery_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço de Entrega</FormLabel>
                    <FormControl>
                      <Input placeholder="Rua, número, complemento" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="delivery_city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input placeholder="Cidade" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="delivery_state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <FormControl>
                        <Input placeholder="UF" maxLength={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="delivery_zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CEP</FormLabel>
                      <FormControl>
                        <Input placeholder="00000-000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Tracking */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tracking_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código de Rastreio</FormLabel>
                    <FormControl>
                      <Input placeholder="AB123456789BR" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tracking_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL de Rastreio</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Recurrence Settings */}
            <div className="space-y-4 p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Repeat className="h-4 w-4 text-carbo-blue" />
                <span className="font-medium">Configurações de Recorrência</span>
              </div>
              
              <FormField
                control={form.control}
                name="order_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo do Pedido</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="spot">
                          <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-warning" />
                            Spot (Pedido Único)
                          </div>
                        </SelectItem>
                        <SelectItem value="recorrente">
                          <div className="flex items-center gap-2">
                            <Repeat className="h-4 w-4 text-carbo-blue" />
                            Recorrente (PDV)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Spot para pedidos únicos, Recorrente para PDVs com entregas periódicas
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchOrderType === "recorrente" && (
                <>
                  <FormField
                    control={form.control}
                    name="is_recurring"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Ativar Recorrência</FormLabel>
                          <FormDescription>
                            Quando ativado, um novo pedido será sugerido na data prevista
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {watchIsRecurring && (
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="recurrence_interval_days"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Intervalo (dias)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                placeholder="30" 
                                min={1}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              />
                            </FormControl>
                            <FormDescription>
                              Dias entre entregas
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="next_delivery_date"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Próxima Entrega</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <CarboButton
                                    variant="outline"
                                    className={cn(
                                      "w-full pl-3 text-left font-normal justify-start",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? (
                                      format(field.value, "dd/MM/yyyy", { locale: ptBR })
                                    ) : (
                                      <span>Selecione a data</span>
                                    )}
                                  </CarboButton>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value ?? undefined}
                                  onSelect={field.onChange}
                                  disabled={(date) => date < new Date()}
                                  initialFocus
                                  className={cn("p-3 pointer-events-auto")}
                                />
                              </PopoverContent>
                            </Popover>
                            <FormDescription>
                              Data prevista para próximo pedido
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Notes */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Observações visíveis..."
                        className="min-h-[80px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="internal_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas Internas</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Notas internas da equipe..."
                        className="min-h-[80px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3">
              <CarboButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </CarboButton>
              <CarboButton type="submit" disabled={updateOrder.isPending}>
                {updateOrder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Alterações
              </CarboButton>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
