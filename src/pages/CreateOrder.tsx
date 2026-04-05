import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboCard } from "@/components/ui/carbo-card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CalendarIcon, Loader2, Plus, Trash2, Repeat, Search, Building2, MapPin, CheckCircle2, AlertCircle, ShoppingCart, Gift, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateOrder, type OrderType, ORDER_TYPE_LABELS } from "@/hooks/useCarbozeOrders";
import { useLicensees } from "@/hooks/useLicensees";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGeocode } from "@/hooks/useGeocode";
import { MapPreview } from "@/components/maps/MapPreview";
import { toast } from "sonner";
import { useTeamMembers } from "@/hooks/useTeamMembers";

type OrderMode = "venda" | "acao_promocional";

const POINT_TYPES_VENDA = [
  { value: "posto", label: "Posto" },
  { value: "oficina", label: "Oficina" },
  { value: "frota", label: "Frota" },
  { value: "pdv", label: "PDV" },
  { value: "licenciado", label: "Licenciado" },
] as const;

const POINT_TYPES_PROMO = [
  { value: "pap", label: "PAP" },
  { value: "consultor_tecnico", label: "Consultor Técnico" },
] as const;

const CLASSIFICATION_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "pdv", label: "PDV" },
  { value: "licenciado", label: "Licenciado" },
] as const;

export type RvFlowType = "standard" | "service" | "bonus_only";
export type LinhaCarbo = "carboze_100ml" | "carboze_1l" | "carbopro" | "carbovapt";

const LINHAS: { value: LinhaCarbo; label: string; flow: RvFlowType }[] = [
  { value: "carboze_100ml", label: "CarboZé 100ml", flow: "standard" },
  { value: "carboze_1l", label: "CarboZé 1L", flow: "standard" },
  { value: "carbopro", label: "CarboPro", flow: "standard" },
  { value: "carbovapt", label: "CarboVapt (Serviço)", flow: "service" },
];

const MODALIDADES = [
  { value: "poc", label: "POC — Prova de Conceito" },
  { value: "eventual", label: "Eventual — Avulso" },
  { value: "recorrente", label: "Recorrente — Contrato" },
  { value: "licenciado", label: "Licenciado — Parceiro" },
];

const formSchema = z.object({
  // Vendedor + Fluxo
  vendedor_id: z.string().min(1, "Selecione o vendedor"),
  linha: z.string().min(1, "Selecione a linha"),
  rv_flow_type: z.enum(["standard", "service", "bonus_only"]).default("standard"),
  modalidade: z.string().optional(),
  // CNPJ-first fields
  cnpj: z.string().optional(),
  legal_name: z.string().optional(),
  trade_name: z.string().optional(),
  cnae: z.string().optional(),
  situacao_cadastral: z.string().optional(),
  // Original fields
  customer_name: z.string().min(1, "Nome do cliente é obrigatório"),
  customer_email: z.string().email("Email inválido").optional().or(z.literal("")),
  customer_phone: z.string().optional(),
  is_licensee: z.boolean(),
  delivery_address: z.string().optional(),
  delivery_city: z.string().optional(),
  delivery_state: z.string().optional(),
  delivery_zip: z.string().optional(),
  notes: z.string().optional(),
  internal_notes: z.string().optional(),
  order_type: z.enum(["spot", "recorrente"]),
  is_recurring: z.boolean(),
  recurrence_interval_days: z.number().min(1).optional().nullable(),
  next_delivery_date: z.date().optional().nullable(),
  has_commission: z.boolean(),
  commission_rate: z.number().min(0).max(100).optional(),
  // Strategic fields
  point_type: z.string().optional(),
  avg_monthly_vehicles: z.number().min(0).optional().nullable(),
  works_with_diesel: z.boolean(),
  works_with_fleets: z.boolean(),
  internal_classification: z.string().optional(),
  // Promo fields
  operator_name: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ItemRow {
  product_code: string;
  name: string;
  quantity: number;
  unit_price: number;
  has_bonus: boolean;
  bonus_quantity: number;
}

interface CnpjData {
  cnpj: string;
  legal_name: string | null;
  trade_name: string | null;
  status: string | null;
  address: {
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    zip: string;
  };
  phones: string[];
  emails: string[];
  raw: any;
}

export default function CreateOrder() {
  const navigate = useNavigate();
  const createOrder = useCreateOrder();
  const { data: licensees } = useLicensees();
  const { data: teamMembers } = useTeamMembers();
  const { geocodeAddress, isLoading: isGeoLoading } = useGeocode();
  const [orderMode, setOrderMode] = useState<OrderMode>("venda");
  const [items, setItems] = useState<ItemRow[]>([
    { product_code: "", name: "", quantity: 1, unit_price: 0, has_bonus: false, bonus_quantity: 0 },
  ]);
  const [cnpjInput, setCnpjInput] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjFound, setCnpjFound] = useState(false);
  const [cnpjError, setCnpjError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const { data: products } = useQuery({
    queryKey: ["mrp-products-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mrp_products")
        .select("product_code, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vendedor_id: "",
      linha: "",
      rv_flow_type: "standard",
      modalidade: "",
      cnpj: "",
      legal_name: "",
      trade_name: "",
      cnae: "",
      situacao_cadastral: "",
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      is_licensee: false,
      delivery_address: "",
      delivery_city: "",
      delivery_state: "",
      delivery_zip: "",
      notes: "",
      internal_notes: "",
      order_type: "spot",
      is_recurring: false,
      recurrence_interval_days: null,
      next_delivery_date: null,
      has_commission: false,
      commission_rate: 0,
      point_type: "",
      avg_monthly_vehicles: null,
      works_with_diesel: false,
      works_with_fleets: false,
      internal_classification: "",
      operator_name: "",
    },
  });

  const isRecurring = form.watch("is_recurring");
  const hasCommission = form.watch("has_commission");
  const pointType = form.watch("point_type");

  // Auto-set recurrence when point_type = PDV
  useEffect(() => {
    if (pointType === "pdv") {
      form.setValue("order_type", "recorrente");
      form.setValue("is_recurring", true);
    }
  }, [pointType, form]);

  // Format CNPJ as user types
  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  };

  // CNPJ lookup
  const handleCnpjLookup = useCallback(async () => {
    const digits = cnpjInput.replace(/\D/g, "");
    if (digits.length !== 14) {
      setCnpjError("CNPJ deve conter 14 dígitos");
      return;
    }

    setCnpjLoading(true);
    setCnpjError(null);
    setCnpjFound(false);

    try {
      const session = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cnpj-lookup?cnpj=${digits}`,
        {
          headers: {
            "Authorization": `Bearer ${session.data.session?.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao buscar CNPJ");
      }

      const result: CnpjData = await response.json();

      form.setValue("cnpj", result.cnpj);
      form.setValue("legal_name", result.legal_name || "");
      form.setValue("trade_name", result.trade_name || "");
      form.setValue("customer_name", result.trade_name || result.legal_name || "");
      form.setValue("situacao_cadastral", result.status || "");

      if (result.raw?.cnae_fiscal_descricao) {
        form.setValue("cnae", `${result.raw.cnae_fiscal || ""} - ${result.raw.cnae_fiscal_descricao}`);
      }

      const addr = result.address;
      const fullAddress = [addr.street, addr.number, addr.complement, addr.neighborhood]
        .filter(Boolean)
        .join(", ");
      form.setValue("delivery_address", fullAddress);
      form.setValue("delivery_city", addr.city);
      form.setValue("delivery_state", addr.state);
      form.setValue("delivery_zip", addr.zip);

      if (result.phones.length > 0) {
        form.setValue("customer_phone", result.phones[0]);
      }
      if (result.emails.length > 0) {
        form.setValue("customer_email", result.emails[0]);
      }

      setCnpjFound(true);
      toast.success("Dados do CNPJ carregados com sucesso!");

      if (addr.city && addr.state) {
        const geo = await geocodeAddress(fullAddress, addr.city, addr.state);
        if (geo) {
          setCoords({ lat: geo.lat, lng: geo.lng });
        }
      }
    } catch (err: any) {
      setCnpjError(err.message || "Erro ao consultar CNPJ");
      toast.error(err.message || "Erro ao consultar CNPJ");
    } finally {
      setCnpjLoading(false);
    }
  }, [cnpjInput, form, geocodeAddress]);

  const deliveryAddress = form.watch("delivery_address");
  const deliveryCity = form.watch("delivery_city");
  const deliveryState = form.watch("delivery_state");

  const handleGeocode = useCallback(async () => {
    if (deliveryCity && deliveryState) {
      const geo = await geocodeAddress(deliveryAddress || "", deliveryCity, deliveryState);
      if (geo) {
        setCoords({ lat: geo.lat, lng: geo.lng });
      }
    }
  }, [deliveryAddress, deliveryCity, deliveryState, geocodeAddress]);

  const addItem = () => {
    setItems([...items, { product_code: "", name: "", quantity: 1, unit_price: 0, has_bonus: false, bonus_quantity: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ItemRow, value: string | number | boolean) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    if (field === "product_code" && products) {
      const product = products.find((p) => p.product_code === value);
      if (product) {
        updated[index].name = product.name;
      }
    }
    // Enforce bonus_quantity max 75
    if (field === "bonus_quantity" && typeof value === "number") {
      updated[index].bonus_quantity = Math.min(Math.max(0, value), 75);
    }
    setItems(updated);
  };

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const total = subtotal;

  const isPromo = orderMode === "acao_promocional";
  const availablePointTypes = isPromo ? POINT_TYPES_PROMO : POINT_TYPES_VENDA;

  const onSubmit = async (data: FormData) => {
    const orderItems = items
      .filter((item) => item.name && item.quantity > 0)
      .map((item) => ({
        product_code: item.product_code,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.quantity * item.unit_price,
        has_bonus: item.has_bonus,
        bonus_quantity: item.has_bonus ? item.bonus_quantity : 0,
      }));

    if (orderItems.length === 0) {
      toast.error("Adicione pelo menos um item ao pedido.");
      return;
    }

    const selectedVendedor = teamMembers?.find((m: any) => m.id === data.vendedor_id);

    await createOrder.mutateAsync({
      vendedor_id: data.vendedor_id || undefined,
      vendedor_name: selectedVendedor?.full_name || selectedVendedor?.name || undefined,
      rv_flow_type: data.rv_flow_type || "standard",
      linha: data.linha || undefined,
      modalidade: data.modalidade || undefined,
      customer_name: data.customer_name,
      customer_email: data.customer_email || undefined,
      customer_phone: data.customer_phone || undefined,
      licensee_id: undefined,
      delivery_address: data.delivery_address || undefined,
      delivery_city: data.delivery_city || undefined,
      delivery_state: data.delivery_state || undefined,
      delivery_zip: data.delivery_zip || undefined,
      notes: data.notes || undefined,
      items: orderItems,
      subtotal,
      total,
      order_type: data.order_type,
      is_recurring: data.is_recurring,
      recurrence_interval_days: data.recurrence_interval_days || undefined,
      next_delivery_date: data.next_delivery_date
        ? format(data.next_delivery_date, "yyyy-MM-dd")
        : undefined,
      has_commission: data.has_commission,
      commission_rate: data.commission_rate || undefined,
      cnpj: data.cnpj || undefined,
      legal_name: data.legal_name || undefined,
      trade_name: data.trade_name || undefined,
      cnae: data.cnae || undefined,
      situacao_cadastral: data.situacao_cadastral || undefined,
      point_type: data.point_type || undefined,
      avg_monthly_vehicles: data.avg_monthly_vehicles || undefined,
      works_with_diesel: data.works_with_diesel,
      works_with_fleets: data.works_with_fleets,
      internal_classification: data.internal_classification || undefined,
      latitude: coords?.lat || undefined,
      longitude: coords?.lng || undefined,
    });

    navigate("/orders");
  };

  // Reset point_type when switching modes
  useEffect(() => {
    form.setValue("point_type", "");
  }, [orderMode, form]);

  return (
    <BoardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <CarboButton variant="ghost" size="sm" onClick={() => navigate("/orders")}>
            <ArrowLeft className="h-4 w-4" />
          </CarboButton>
          <div>
            <h1 className="text-2xl font-bold">Novo Pedido</h1>
            <p className="text-sm text-muted-foreground">
              V2.1 — Comece pelo CNPJ para preenchimento automático
            </p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* ===== VENDEDOR + LINHA ===== */}
            <CarboCard>
              <div className="p-6 space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Vendedor e Linha
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField control={form.control} name="vendedor_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendedor *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Selecione o vendedor..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(teamMembers || []).map((m: any) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.full_name || m.name || m.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="linha" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Linha *</FormLabel>
                      <Select onValueChange={(v) => {
                        field.onChange(v);
                        const selected = LINHAS.find(l => l.value === v);
                        if (selected) {
                          form.setValue("rv_flow_type", selected.flow);
                        }
                      }} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Selecione a linha..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LINHAS.map(l => (
                            <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {form.watch("rv_flow_type") === "service" && (
                    <FormField control={form.control} name="modalidade" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Modalidade</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {MODALIDADES.map(m => (
                              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}
                </div>
                {form.watch("rv_flow_type") === "service" && (
                  <div className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2">
                    Fluxo Serviço: ao confirmar este RV, uma OS será gerada automaticamente.
                  </div>
                )}
                {form.watch("rv_flow_type") === "standard" && form.watch("linha") && (
                  <div className="text-xs text-emerald-600 bg-emerald-50 rounded-lg p-2">
                    Fluxo Produto: ao confirmar este RV, uma OP será gerada automaticamente.
                  </div>
                )}
              </div>
            </CarboCard>

            {/* ===== ORDER MODE SELECTOR ===== */}
            <CarboCard>
              <div className="p-6 space-y-4">
                <h3 className="font-semibold">Tipo de Operação</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setOrderMode("venda")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-4 transition-all text-left",
                      orderMode === "venda"
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    <ShoppingCart className={cn("h-6 w-6", orderMode === "venda" ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <p className={cn("font-semibold", orderMode === "venda" ? "text-primary" : "text-foreground")}>Venda</p>
                      <p className="text-xs text-muted-foreground">Fluxo padrão com CNPJ e dados completos</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderMode("acao_promocional")}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-4 transition-all text-left",
                      orderMode === "acao_promocional"
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    <Gift className={cn("h-6 w-6", orderMode === "acao_promocional" ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <p className={cn("font-semibold", orderMode === "acao_promocional" ? "text-primary" : "text-foreground")}>Ação Promocional</p>
                      <p className="text-xs text-muted-foreground">Bonificação — PAP ou Consultor Técnico</p>
                    </div>
                  </button>
                </div>
              </div>
            </CarboCard>

            {/* ===== CNPJ LOOKUP SECTION (only for Venda) ===== */}
            {orderMode === "venda" && (
              <CarboCard>
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Busca por CNPJ</h3>
                    {cnpjFound && (
                      <Badge variant="outline" className="ml-auto text-primary border-primary/30 bg-primary/10">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Dados carregados
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Input
                        placeholder="00.000.000/0000-00"
                        value={cnpjInput}
                        onChange={(e) => setCnpjInput(formatCnpj(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCnpjLookup();
                          }
                        }}
                      />
                    </div>
                    <CarboButton
                      type="button"
                      onClick={handleCnpjLookup}
                      disabled={cnpjLoading || cnpjInput.replace(/\D/g, "").length !== 14}
                    >
                      {cnpjLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Search className="h-4 w-4 mr-1" />
                      )}
                      Buscar dados
                    </CarboButton>
                  </div>
                  {cnpjError && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      {cnpjError}
                    </div>
                  )}

                  {cnpjFound && (
                    <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border">
                      <FormField
                        control={form.control}
                        name="legal_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Razão Social</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="trade_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome Fantasia</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="cnae"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CNAE</FormLabel>
                            <FormControl>
                              <Input {...field} readOnly className="bg-muted/50" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="situacao_cadastral"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Situação Cadastral</FormLabel>
                            <FormControl>
                              <Input {...field} readOnly className="bg-muted/50" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
              </CarboCard>
            )}

            {/* ===== PROMO: Operator identification ===== */}
            {isPromo && (
              <CarboCard>
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Identificação do Operador</h3>
                  </div>
                  <FormField
                    control={form.control}
                    name="operator_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Operador Responsável *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o colaborador" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(teamMembers || [])
                              .filter((m) => m.status === "approved")
                              .map((member) => (
                                <SelectItem key={member.id} value={member.full_name || member.id}>
                                  {member.full_name || "Sem nome"}
                                  {member.department ? ` — ${member.department}` : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CarboCard>
            )}

            {/* ===== CUSTOMER INFO ===== */}
            <CarboCard>
              <div className="p-6 space-y-4">
                <h3 className="font-semibold">Informações do Cliente</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="customer_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome / Razão Social *</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome do cliente" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customer_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="email@exemplo.com" {...field} />
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
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_licensee"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                          <FormLabel>É Licenciado?</FormLabel>
                          <FormDescription className="text-xs">Marque se o cliente é um licenciado Carbo</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CarboCard>

            {/* ===== STRATEGIC FIELDS — Máquina de Vendas ===== */}
            <CarboCard>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Dados Estratégicos</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="point_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Ponto</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availablePointTypes.map((pt) => (
                              <SelectItem key={pt.value} value={pt.value}>
                                {pt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {pointType === "pdv" && (
                          <p className="text-xs text-primary mt-1">PDV sempre será recorrente automaticamente</p>
                        )}
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="internal_classification"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Classificação Interna</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Classificar como" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CLASSIFICATION_OPTIONS.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="avg_monthly_vehicles"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Volume Médio Mensal (veículos)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            placeholder="Ex: 500"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="works_with_diesel"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                          <FormLabel>Atua com Diesel?</FormLabel>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="works_with_fleets"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                          <FormLabel>Atua com Frotas?</FormLabel>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CarboCard>

            {/* ===== DELIVERY ADDRESS + MAP ===== */}
            <CarboCard>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Endereço de Entrega</h3>
                  <CarboButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGeocode}
                    disabled={isGeoLoading || !deliveryCity}
                  >
                    {isGeoLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <MapPin className="h-4 w-4 mr-1" />
                    )}
                    Localizar no mapa
                  </CarboButton>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <FormField
                      control={form.control}
                      name="delivery_address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Endereço</FormLabel>
                          <FormControl>
                            <Input placeholder="Rua, número, complemento" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="delivery_city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade</FormLabel>
                        <FormControl>
                          <Input placeholder="Cidade" {...field} />
                        </FormControl>
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
                          <Input placeholder="UF" {...field} />
                        </FormControl>
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
                      </FormItem>
                    )}
                  />
                </div>

                <MapPreview
                  latitude={coords?.lat ?? null}
                  longitude={coords?.lng ?? null}
                  isLoading={isGeoLoading}
                  label={form.getValues("customer_name") || "Localização"}
                />
              </div>
            </CarboCard>

            {/* ===== ITEMS ===== */}
            <CarboCard>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Itens do Pedido</h3>
                  <CarboButton type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar Item
                  </CarboButton>
                </div>

                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div key={index} className="space-y-3 border-b pb-4 last:border-0">
                      <div className="grid gap-3 sm:grid-cols-12 items-end">
                        <div className="sm:col-span-4">
                          <label className="text-sm font-medium">Produto</label>
                          <Select
                            value={item.product_code}
                            onValueChange={(v) => updateItem(index, "product_code", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {products?.map((p) => (
                                <SelectItem key={p.product_code} value={p.product_code}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-3">
                          <label className="text-sm font-medium">Quantidade</label>
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="text-sm font-medium">Preço Unit. (R$)</label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, "unit_price", Number(e.target.value))}
                          />
                        </div>
                        <div className="sm:col-span-1 text-right">
                          <p className="text-sm font-medium mb-2">Total</p>
                          <p className="text-sm font-semibold">
                            R$ {(item.quantity * item.unit_price).toFixed(2)}
                          </p>
                        </div>
                        <div className="sm:col-span-1 flex justify-end">
                          {items.length > 1 && (
                            <CarboButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </CarboButton>
                          )}
                        </div>
                      </div>

                      {/* Bonus flag per item */}
                      <div className="flex items-center gap-4 pl-1">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Switch
                            checked={item.has_bonus}
                            onCheckedChange={(v) => updateItem(index, "has_bonus", v)}
                          />
                          <span className="flex items-center gap-1">
                            <Gift className="h-3.5 w-3.5 text-muted-foreground" />
                            Tem bonificação
                          </span>
                        </label>
                        {item.has_bonus && (
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-muted-foreground">Qtd. bonificação:</label>
                            <Input
                              type="number"
                              min={0}
                              max={75}
                              className="w-24 h-8"
                              value={item.bonus_quantity}
                              onChange={(e) => updateItem(index, "bonus_quantity", Number(e.target.value))}
                            />
                            <span className="text-xs text-muted-foreground">(máx. 75)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />
                <div className="flex justify-end">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Subtotal</p>
                    <p className="text-xl font-bold">R$ {subtotal.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </CarboCard>

            {/* ===== ORDER TYPE & RECURRENCE ===== */}
            <CarboCard>
              <div className="p-6 space-y-4">
                <h3 className="font-semibold">Tipo e Recorrência</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="order_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo do Pedido</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={pointType === "pdv"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(Object.entries(ORDER_TYPE_LABELS) as [OrderType, string][]).map(
                              ([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                        {pointType === "pdv" && (
                          <p className="text-xs text-primary">Forçado para recorrente (tipo PDV)</p>
                        )}
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="is_recurring"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="flex items-center gap-2">
                          <Repeat className="h-4 w-4" />
                          Ativar Recorrência
                        </FormLabel>
                        <FormDescription>
                          Um novo pedido será sugerido na data prevista
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={pointType === "pdv"}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {isRecurring && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="recurrence_interval_days"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Intervalo (dias)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="next_delivery_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Próxima Entrega</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <CarboButton
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {field.value
                                    ? format(field.value, "dd/MM/yyyy", { locale: ptBR })
                                    : "Selecione a data"}
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
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            </CarboCard>

            {/* ===== COMMISSION ===== */}
            <CarboCard>
              <div className="p-6 space-y-4">
                <h3 className="font-semibold">Comissão</h3>
                <FormField
                  control={form.control}
                  name="has_commission"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <FormLabel>Possui Comissão</FormLabel>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                {hasCommission && (
                  <FormField
                    control={form.control}
                    name="commission_rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Taxa de Comissão (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </CarboCard>

            {/* ===== NOTES ===== */}
            <CarboCard>
              <div className="p-6 space-y-4">
                <h3 className="font-semibold">Observações</h3>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações Públicas</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Visíveis para o cliente" {...field} />
                      </FormControl>
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
                        <Textarea placeholder="Visíveis apenas internamente" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </CarboCard>

            {/* ===== ACTIONS ===== */}
            <div className="flex items-center justify-end gap-3">
              <CarboButton type="button" variant="outline" onClick={() => navigate("/orders")}>
                Cancelar
              </CarboButton>
              <CarboButton type="submit" disabled={createOrder.isPending}>
                {createOrder.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Pedido
              </CarboButton>
            </div>
          </form>
        </Form>
      </div>
    </BoardLayout>
  );
}
