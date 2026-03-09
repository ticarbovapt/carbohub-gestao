import React, { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboButton } from "@/components/ui/carbo-button";
import { useCreateLicensee, LicenseeStatus } from "@/hooks/useLicensees";
import { useGeocode } from "@/hooks/useGeocode";
import { MapPin, Loader2, CheckCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { MapPreview } from "@/components/maps/MapPreview";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  legal_name: z.string().optional(),
  trade_name: z.string().optional(),
  document_number: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  address_street: z.string().optional(),
  address_city: z.string().optional(),
  address_state: z.string().optional(),
  address_zip: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  status: z.enum(["active", "inactive", "pending", "suspended"] as const),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

interface CreateLicenseeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateLicenseeDialog({ open, onOpenChange }: CreateLicenseeDialogProps) {
  const createLicensee = useCreateLicensee();
  const { geocodeAddress, isLoading: isGeocoding } = useGeocode();
  const [geocodeSuccess, setGeocodeSuccess] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [autoFilledFromCnpj, setAutoFilledFromCnpj] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      legal_name: "",
      trade_name: "",
      document_number: "",
      email: "",
      phone: "",
      address_street: "",
      address_city: "",
      address_state: "",
      address_zip: "",
      latitude: undefined,
      longitude: undefined,
      status: "pending",
      notes: "",
    },
  });

  const watchCity = form.watch("address_city");
  const watchState = form.watch("address_state");
  const watchStreet = form.watch("address_street");

  // Auto-geocode when address fields change
  useEffect(() => {
    const fetchCoords = async () => {
      if (watchCity && watchState) {
        setGeocodeSuccess(false);
        const result = await geocodeAddress(watchStreet || "", watchCity, watchState);
        if (result) {
          form.setValue("latitude", result.lat);
          form.setValue("longitude", result.lng);
          setGeocodeSuccess(true);
          toast.success("Coordenadas obtidas automaticamente", { duration: 2000 });
        }
      }
    };

    const debounce = setTimeout(fetchCoords, 1000);
    return () => clearTimeout(debounce);
  }, [watchCity, watchState, watchStreet, geocodeAddress, form]);

  const handleCnpjLookup = useCallback(async (rawCnpj: string) => {
    const cnpj = rawCnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) return;

    setCnpjLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cnpj-lookup?cnpj=${cnpj}`,
        {
          headers: {
            "Authorization": `Bearer ${session?.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        if (response.status === 404) {
          toast.warning("CNPJ não encontrado — preencha manualmente");
        } else {
          toast.error(errBody.error || "Falha na consulta — tente novamente");
        }
        return;
      }

      const result = await response.json();

      // Auto-fill fields
      const addr = result.address || {};
      const streetParts = [addr.street, addr.number, addr.neighborhood].filter(Boolean);

      form.setValue("legal_name", result.legal_name || "");
      form.setValue("trade_name", result.trade_name || "");
      form.setValue("address_street", streetParts.join(", "));
      form.setValue("address_city", addr.city || "");
      form.setValue("address_state", addr.state || "");
      form.setValue("address_zip", addr.zip || "");

      // Fill phone if available
      if (result.phones?.length) {
        const phone = result.phones[0];
        form.setValue("phone", phone.length > 2 ? formatPhone(phone) : phone);
      }

      // Fill email if available
      if (result.emails?.length && result.emails[0]) {
        form.setValue("email", result.emails[0].toLowerCase());
      }

      // Auto-fill name if empty: prefer trade_name, fallback legal_name
      const currentName = form.getValues("name");
      if (!currentName || currentName.trim().length < 2) {
        form.setValue("name", result.trade_name || result.legal_name || "");
      }

      setAutoFilledFromCnpj(true);
      toast.success("Dados encontrados e preenchidos");
    } catch (err) {
      console.error("CNPJ lookup error:", err);
      toast.error("Falha na consulta — tente novamente");
    } finally {
      setCnpjLoading(false);
    }
  }, [form]);

  const handleCnpjBlur = useCallback(() => {
    const raw = form.getValues("document_number") || "";
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 14 && !autoFilledFromCnpj) {
      handleCnpjLookup(digits);
    }
  }, [form, autoFilledFromCnpj, handleCnpjLookup]);

  const clearAutoFilledData = () => {
    form.setValue("legal_name", "");
    form.setValue("trade_name", "");
    form.setValue("address_street", "");
    form.setValue("address_city", "");
    form.setValue("address_state", "");
    form.setValue("address_zip", "");
    form.setValue("phone", "");
    form.setValue("email", "");
    form.setValue("latitude", undefined);
    form.setValue("longitude", undefined);
    setAutoFilledFromCnpj(false);
    setGeocodeSuccess(false);
  };

  const onSubmit = async (values: FormValues) => {
    await createLicensee.mutateAsync({
      name: values.name,
      legal_name: values.legal_name,
      document_number: values.document_number?.replace(/\D/g, ""),
      email: values.email || undefined,
      phone: values.phone,
      address_street: values.address_street,
      address_city: values.address_city,
      address_state: values.address_state,
      address_zip: values.address_zip,
      status: values.status,
      notes: values.notes,
      latitude: values.latitude,
      longitude: values.longitude,
    });
    form.reset();
    setGeocodeSuccess(false);
    setAutoFilledFromCnpj(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-plex">Novo Licenciado</DialogTitle>
          <DialogDescription>
            Cadastre um novo licenciado no sistema. Informe o CNPJ para preenchimento automático.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* CNPJ + Auto-fill */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Identificação
              </h3>
              <FormField
                control={form.control}
                name="document_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="00.000.000/0000-00"
                          value={field.value}
                          onChange={(e) => {
                            const formatted = formatCnpj(e.target.value);
                            field.onChange(formatted);
                            // Reset auto-fill state when CNPJ changes
                            if (autoFilledFromCnpj) setAutoFilledFromCnpj(false);
                          }}
                          onBlur={handleCnpjBlur}
                        />
                      </FormControl>
                      {field.value && field.value.replace(/\D/g, "").length === 14 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => handleCnpjLookup(field.value || "")}
                          disabled={cnpjLoading}
                          title="Buscar CNPJ"
                        >
                          {cnpjLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                    {cnpjLoading && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Buscando dados do CNPJ…
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {autoFilledFromCnpj && (
                <button
                  type="button"
                  onClick={clearAutoFilledData}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <X className="h-3 w-3" />
                  Limpar dados preenchidos pelo CNPJ
                </button>
              )}
            </div>

            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Informações Básicas
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome do licenciado" {...field} />
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
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="inactive">Inativo</SelectItem>
                          <SelectItem value="suspended">Suspenso</SelectItem>
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
                  name="legal_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Razão Social</FormLabel>
                      <FormControl>
                        <Input placeholder="Razão social" {...field} />
                      </FormControl>
                      <FormMessage />
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
                        <Input placeholder="Nome fantasia" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Contato
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
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
                  name="phone"
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
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Endereço
              </h3>
              <FormField
                control={form.control}
                name="address_street"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço</FormLabel>
                    <FormControl>
                      <Input placeholder="Rua, número, bairro" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="address_city"
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
                  name="address_state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="UF" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
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
                  name="address_zip"
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

              {/* Coordinates */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="latitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Latitude</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="any" 
                            placeholder="-23.5505" 
                            {...field} 
                            value={field.value ?? ""}
                            className="h-8 text-sm"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="longitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Longitude</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="any" 
                            placeholder="-46.6333" 
                            {...field} 
                            value={field.value ?? ""}
                            className="h-8 text-sm"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex items-center gap-1">
                  {isGeocoding && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {geocodeSuccess && <CheckCircle className="h-4 w-4 text-carbo-green" />}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                As coordenadas são preenchidas automaticamente ao informar cidade e estado
              </p>

              {/* Map Preview */}
              <MapPreview
                latitude={form.watch("latitude") ?? null}
                longitude={form.watch("longitude") ?? null}
                isLoading={isGeocoding}
                label={form.watch("name") || "Novo Licenciado"}
              />
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Observações sobre o licenciado..." rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <CarboButton
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </CarboButton>
              <CarboButton type="submit" loading={createLicensee.isPending}>
                Criar Licenciado
              </CarboButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
