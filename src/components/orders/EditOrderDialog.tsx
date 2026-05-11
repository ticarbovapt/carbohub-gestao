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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Loader2, CalendarIcon, Repeat, Zap, UserCheck, FileText, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  // ── Aba Pedido ────────────────────────────────────────────────────────────
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
  // ── Aba Dados PO / SAP ────────────────────────────────────────────────────
  po_number: z.string().optional(),
  po_date: z.string().optional(),               // ISO date string
  ie: z.string().optional(),
  billing_address: z.string().optional(),
  billing_city: z.string().optional(),
  billing_state: z.string().max(2).optional(),
  billing_zip: z.string().optional(),
  billing_contact_name: z.string().optional(),
  billing_contact_email: z.string().email("Email inválido").optional().or(z.literal("")),
  payment_terms: z.string().optional(),
  freight_type: z.enum(["CIF", "FOB"]).optional().nullable(),
  buyer_notes: z.string().optional(),
  general_notes: z.string().optional(),
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
      // PO fields
      po_number: "",
      po_date: "",
      ie: "",
      billing_address: "",
      billing_city: "",
      billing_state: "",
      billing_zip: "",
      billing_contact_name: "",
      billing_contact_email: "",
      payment_terms: "",
      freight_type: null,
      buyer_notes: "",
      general_notes: "",
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
        // PO fields
        po_number: order.po_number || "",
        po_date: order.po_date || "",
        ie: order.ie || "",
        billing_address: order.billing_address || "",
        billing_city: order.billing_city || "",
        billing_state: order.billing_state || "",
        billing_zip: order.billing_zip || "",
        billing_contact_name: order.billing_contact_name || "",
        billing_contact_email: order.billing_contact_email || "",
        payment_terms: order.payment_terms || "",
        freight_type: order.freight_type || null,
        buyer_notes: order.buyer_notes || "",
        general_notes: order.general_notes || "",
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
        // PO fields
        po_number: data.po_number || null,
        po_date: data.po_date || null,
        ie: data.ie || null,
        billing_address: data.billing_address || null,
        billing_city: data.billing_city || null,
        billing_state: data.billing_state || null,
        billing_zip: data.billing_zip || null,
        billing_contact_name: data.billing_contact_name || null,
        billing_contact_email: data.billing_contact_email || null,
        payment_terms: data.payment_terms || null,
        freight_type: data.freight_type || null,
        buyer_notes: data.buyer_notes || null,
        general_notes: data.general_notes || null,
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
            <Tabs defaultValue="pedido">
              <TabsList className="w-full">
                <TabsTrigger value="pedido" className="flex-1 gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  Pedido
                </TabsTrigger>
                <TabsTrigger value="po" className="flex-1 gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Dados PO / Fiscal
                </TabsTrigger>
              </TabsList>

              {/* ── ABA PEDIDO ─────────────────────────────────────────────────── */}
              <TabsContent value="pedido" className="space-y-4 mt-4">
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
                <div className="space-y-3">
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
                                <FormDescription>Dias entre entregas</FormDescription>
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
                                <FormDescription>Data prevista para próximo pedido</FormDescription>
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
                          <Textarea placeholder="Observações visíveis..." className="min-h-[80px]" {...field} />
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
                          <Textarea placeholder="Notas internas da equipe..." className="min-h-[80px]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* ── ABA DADOS PO / FISCAL ──────────────────────────────────────── */}
              <TabsContent value="po" className="space-y-5 mt-4">
                {/* Dados do PO do cliente */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Pedido de Compra do Cliente
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="po_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número do PO</FormLabel>
                          <FormControl>
                            <Input placeholder="ex: 4500787362" {...field} />
                          </FormControl>
                          <FormDescription>Número do pedido de compra no ERP do cliente</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="po_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data do PO</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Faturamento */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Faturar Para
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="ie"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Inscrição Estadual (IE)</FormLabel>
                          <FormControl>
                            <Input placeholder="ex: 066839440" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="billing_contact_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Responsável (comprador)</FormLabel>
                          <FormControl>
                            <Input placeholder="Nome do responsável pelo PO" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="billing_contact_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email do Responsável</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="responsavel@empresa.com.br" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billing_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Endereço de Faturamento</FormLabel>
                        <FormControl>
                          <Input placeholder="Rua, número, complemento (se diferente do endereço de entrega)" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="billing_city"
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
                      name="billing_state"
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
                      name="billing_zip"
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

                {/* Logística */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" />
                    Logística / Pagamento
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="payment_terms"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Condição de Pagamento</FormLabel>
                          <FormControl>
                            <Input placeholder="ex: 30/60/90/120/150 DIAS - BOLETO" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="freight_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Frete</FormLabel>
                          <Select
                            onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                            value={field.value ?? "none"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Não informado</SelectItem>
                              <SelectItem value="CIF">CIF — frete por conta do vendedor</SelectItem>
                              <SelectItem value="FOB">FOB — frete por conta do comprador</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Observações */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Observações do PO
                  </p>
                  <FormField
                    control={form.control}
                    name="buyer_notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações do Comprador</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Instruções específicas do comprador..." className="min-h-[70px]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="general_notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações Gerais</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="ex: Horário de recebimento: Seg-Sex 08h-16h. Prazo de emissão de notas: até dia 25 de cada mês."
                            className="min-h-[70px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 pt-2 border-t">
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
