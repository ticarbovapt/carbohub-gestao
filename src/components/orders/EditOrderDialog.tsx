import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, parseISO } from "date-fns";
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
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { Loader2, CalendarIcon, Repeat, Zap, UserCheck, FileText, Truck, Receipt, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateInscricaoEstadual } from "@/lib/inscricaoEstadual";

const UFS_BRASIL = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const formSchema = z.object({
  // ── Aba Pedido ────────────────────────────────────────────────────────────
  sale_date: z.date().optional().nullable(),     // data real da venda (head/command)
  customer_name: z.string().min(1, "Nome do cliente é obrigatório"),
  customer_email: z.string().email("Email inválido").optional().or(z.literal("")),
  customer_phone: z.string().optional(),
  licensee_id: z.string().optional(),
  delivery_address: z.string().optional(),
  delivery_city: z.string().optional(),
  delivery_state: z.string().optional(),
  delivery_zip: z.string().optional(),
  status: z.enum(["quote", "pending", "confirmed", "invoiced", "shipped", "delivered", "cancelled"]),
  segmento: z.enum(["consumo", "revenda", "online"]).optional().nullable(),  // Consumo=B2B, Revenda=PDV, On-line
  excluir_metricas: z.boolean().optional(),  // transferência/uso interno: fora dos números
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
  // ── Nota Fiscal (Bling) ───────────────────────────────────────────────────
  nf_access_key: z.string().optional(),
  bling_nf_id: z.number().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

interface EditOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: CarbozeOrder | null;
  /** If true, shows sale_date picker and vendedor select (heads/command only) */
  canEditSensitive?: boolean;
}

export function EditOrderDialog({ open, onOpenChange, order, canEditSensitive = false }: EditOrderDialogProps) {
  const updateOrder = useUpdateOrder();
  const { data: licensees = [] } = useLicensees("all");
  const { data: teamMembers = [] } = useTeamMembers();
  const [ieUf, setIeUf] = useState("");

  // Only show actual vendedores (is_vendedor = true) in the dropdown
  const vendedores = teamMembers.filter(m => m.status === "approved" && m.is_vendedor);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sale_date: null,
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      licensee_id: "none",
      delivery_address: "",
      delivery_city: "",
      delivery_state: "",
      delivery_zip: "",
      status: "pending",
      segmento: null,
      excluir_metricas: false,
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
      nf_access_key: "",
      bling_nf_id: null,
    },
  });

  const watchOrderType = form.watch("order_type");
  const watchIsRecurring = form.watch("is_recurring");

  useEffect(() => {
    if (order) {
      form.reset({
        sale_date: order.sale_date ? parseISO(order.sale_date) : null,
        customer_name: order.customer_name,
        customer_email: order.customer_email || "",
        customer_phone: order.customer_phone || "",
        licensee_id: order.licensee_id || "none",
        delivery_address: order.delivery_address || "",
        delivery_city: order.delivery_city || "",
        delivery_state: order.delivery_state || "",
        delivery_zip: order.delivery_zip || "",
        status: order.status,
        segmento: order.segmento ?? null,
        excluir_metricas: order.excluir_metricas ?? false,
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
        nf_access_key: order.nf_access_key || "",
        bling_nf_id: order.bling_nf_id ?? null,
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
        segmento: data.segmento ?? null,
        excluir_metricas: data.excluir_metricas ?? false,
        sale_date: data.sale_date ? format(data.sale_date, "yyyy-MM-dd") : null,
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
        // NF fields
        nf_access_key: data.nf_access_key || null,
        bling_nf_id: data.bling_nf_id ?? null,
      });
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  Dados da Venda
                </TabsTrigger>
                <TabsTrigger value="po" className="flex-1 gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Compra e Nota Fiscal
                </TabsTrigger>
              </TabsList>

              {/* ── ABA PEDIDO ─────────────────────────────────────────────────── */}
              <TabsContent value="pedido" className="space-y-4 mt-4">

                {/* Sale date — head/command only */}
                {canEditSensitive && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="flex-1 space-y-1.5">
                      <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        Data real da venda
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Quando diferente da data de registro, afeta o mês/semana das metas do vendedor.
                      </p>
                      <FormField
                        control={form.control}
                        name="sale_date"
                        render={({ field }) => (
                          <FormItem>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <CarboButton
                                    variant="outline"
                                    className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value
                                      ? format(field.value, "dd/MM/yyyy", { locale: ptBR })
                                      : `Padrão: ${order?.created_at ? format(parseISO(order.created_at), "dd/MM/yyyy") : "—"}`}
                                  </CarboButton>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value ?? undefined}
                                  onSelect={field.onChange}
                                  locale={ptBR}
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {form.watch("sale_date") && (
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground underline"
                          onClick={() => form.setValue("sale_date", null)}
                        >
                          Limpar (usar data de registro)
                        </button>
                      )}
                    </div>
                  </div>
                )}

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

                {/* Segmentação — Consumo (B2B) vs Revenda (PDV) */}
                <FormField
                  control={form.control}
                  name="segmento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Canal de Venda</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                        value={field.value ?? "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a segmentação" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Não classificado</SelectItem>
                          <SelectItem value="consumo">Consumo (B2B)</SelectItem>
                          <SelectItem value="revenda">Revenda (Ponto de Venda)</SelectItem>
                          <SelectItem value="online">On-line</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-[11px]">
                        Consumo = venda para empresa (B2B). Revenda = ponto de venda (PDV). On-line = venda online.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Não contabilizar — transferência / uso interno */}
                <FormField
                  control={form.control}
                  name="excluir_metricas"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Não contabilizar nos números</FormLabel>
                        <FormDescription className="text-[11px]">
                          Transferência matriz↔filial / uso interno. Aparece na lista, mas fica fora de dashboards, vendas e metas.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Vendedor — only editable by heads/command */}
                {canEditSensitive && (
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
                )}

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

              {/* ── ABA COMPRA E NOTA FISCAL ──────────────────────────────────── */}
              <TabsContent value="po" className="space-y-5 mt-4">
                {/* Explicação para leigos */}
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Esta aba é opcional. Use apenas quando o cliente envia um <strong>Pedido de Compra formal</strong> (documento
                    que empresas grandes emitem para autorizar a compra) ou quando precisar registrar os dados de
                    <strong> faturamento</strong> e a <strong>Nota Fiscal</strong>. Em vendas simples pode deixar tudo em branco.
                  </p>
                </div>

                {/* Dados do pedido de compra do cliente */}
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
                          <FormLabel>Número do Pedido de Compra</FormLabel>
                          <FormControl>
                            <Input placeholder="ex: 4500787362" {...field} />
                          </FormControl>
                          <FormDescription>Número que o cliente gerou no sistema dele para autorizar esta compra</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="po_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data do Pedido de Compra</FormLabel>
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
                    Dados para Faturamento
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="ie"
                      render={({ field }) => {
                        const detectedUf = form.watch("billing_state") || form.watch("delivery_state") || "";
                        const uf = ieUf || detectedUf;
                        const isIsento = /^isento$/i.test((field.value || "").trim());
                        const val = (field.value || "").trim();
                        const result = (val && !isIsento) ? validateInscricaoEstadual(val, uf) : null;
                        return (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Inscrição Estadual (IE)</FormLabel>
                              <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground cursor-pointer">
                                <Switch
                                  checked={isIsento}
                                  onCheckedChange={(c) => field.onChange(c ? "ISENTO" : "")}
                                />
                                Isento
                              </label>
                            </div>
                            {!isIsento && (
                              <div className="flex gap-2">
                                <Select value={uf} onValueChange={setIeUf}>
                                  <SelectTrigger className="w-20 shrink-0">
                                    <SelectValue placeholder="UF" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {UFS_BRASIL.map((u) => (
                                      <SelectItem key={u} value={u}>{u}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormControl>
                                  <Input
                                    placeholder="Nº da Inscrição Estadual"
                                    {...field}
                                    className={cn(
                                      "flex-1",
                                      result && !result.valid && "border-destructive focus-visible:ring-destructive",
                                      result && result.valid && "border-green-500 focus-visible:ring-green-500",
                                    )}
                                  />
                                </FormControl>
                              </div>
                            )}
                            {isIsento ? (
                              <p className="text-xs flex items-center gap-1 mt-1 text-green-600">
                                <CheckCircle2 className="h-3 w-3 shrink-0" /> Cliente isento de IE.
                              </p>
                            ) : result && (
                              <p className={cn(
                                "text-xs flex items-center gap-1 mt-1",
                                result.valid ? "text-green-600" : "text-destructive",
                              )}>
                                {result.valid
                                  ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                                  : <AlertCircle className="h-3 w-3 shrink-0" />}
                                {result.message}
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    <FormField
                      control={form.control}
                      name="billing_contact_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Responsável pela Compra</FormLabel>
                          <FormControl>
                            <Input placeholder="Nome de quem fez a compra no cliente" {...field} />
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
                    Observações
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

                {/* Nota Fiscal Bling */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5" />
                    Nota Fiscal (Bling)
                  </p>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Vincule esta venda à NF emitida no Bling. A chave de acesso é preenchida automaticamente quando o financeiro importa a NF com o número <span className="font-mono font-medium">{order?.order_number}</span> na observação.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="nf_access_key"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Chave de Acesso NF-e (44 dígitos)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="00000000000000000000000000000000000000000000"
                              maxLength={44}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bling_nf_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ID da NF no Bling</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="ex: 12345678"
                              value={field.value ?? ""}
                              onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
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
