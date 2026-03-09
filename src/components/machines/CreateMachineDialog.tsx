import React, { useEffect, useState } from "react";
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
import { useCreateMachine, MachineStatus } from "@/hooks/useMachines";
import { Licensee } from "@/hooks/useLicensees";
import { useGeocode } from "@/hooks/useGeocode";
import { MapPin, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { MapPreview } from "@/components/maps/MapPreview";

const formSchema = z.object({
  model: z.string().min(1, "Modelo é obrigatório"),
  serial_number: z.string().optional(),
  licensee_id: z.string().optional(),
  location_address: z.string().optional(),
  location_city: z.string().optional(),
  location_state: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  status: z.enum(["operational", "maintenance", "offline", "retired"] as const),
  capacity: z.coerce.number().min(1, "Capacidade mínima é 1"),
  low_stock_threshold: z.coerce.number().min(1, "Limite mínimo é 1"),
  current_price_per_unit: z.coerce.number().min(0, "Preço não pode ser negativo"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

interface CreateMachineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licensees: Licensee[];
}

export function CreateMachineDialog({ open, onOpenChange, licensees }: CreateMachineDialogProps) {
  const createMachine = useCreateMachine();
  const { geocodeAddress, isLoading: isGeocoding } = useGeocode();
  const [geocodeSuccess, setGeocodeSuccess] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      model: "",
      serial_number: "",
      licensee_id: "",
      location_address: "",
      location_city: "",
      location_state: "",
      latitude: undefined,
      longitude: undefined,
      status: "operational",
      capacity: 100,
      low_stock_threshold: 20,
      current_price_per_unit: 0,
      notes: "",
    },
  });

  const watchCity = form.watch("location_city");
  const watchState = form.watch("location_state");
  const watchAddress = form.watch("location_address");

  // Auto-geocode when address fields change
  useEffect(() => {
    const fetchCoords = async () => {
      if (watchCity && watchState) {
        setGeocodeSuccess(false);
        const result = await geocodeAddress(watchAddress || "", watchCity, watchState);
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
  }, [watchCity, watchState, watchAddress, geocodeAddress, form]);

  const onSubmit = async (values: FormValues) => {
    await createMachine.mutateAsync({
      model: values.model,
      serial_number: values.serial_number,
      licensee_id: values.licensee_id || undefined,
      location_address: values.location_address,
      location_city: values.location_city,
      location_state: values.location_state,
      latitude: values.latitude,
      longitude: values.longitude,
      status: values.status,
      capacity: values.capacity,
      low_stock_threshold: values.low_stock_threshold,
      current_price_per_unit: values.current_price_per_unit,
      notes: values.notes,
    });
    form.reset();
    setGeocodeSuccess(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-plex">Nova Máquina</DialogTitle>
          <DialogDescription>
            Cadastre uma nova máquina no sistema
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Informações Básicas
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modelo *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: CarboZé Pro 2000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="serial_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Série</FormLabel>
                      <FormControl>
                        <Input placeholder="S/N" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="licensee_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Licenciado</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "_none_" ? "" : val)} value={field.value || "_none_"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none_">Nenhum</SelectItem>
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
                          <SelectItem value="operational">Operacional</SelectItem>
                          <SelectItem value="maintenance">Manutenção</SelectItem>
                          <SelectItem value="offline">Offline</SelectItem>
                          <SelectItem value="retired">Aposentada</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Location */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Localização
              </h3>
              <FormField
                control={form.control}
                name="location_address"
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
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="location_city"
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
                  name="location_state"
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
                label={form.watch("model") || "Nova Máquina"}
              />
            </div>

            {/* Capacity */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Capacidade e Preço
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacidade (un)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="low_stock_threshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Limite Baixo (un)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="current_price_per_unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preço/Unidade (R$)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Observações sobre a máquina..." rows={3} {...field} />
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
              <CarboButton type="submit" loading={createMachine.isPending}>
                Criar Máquina
              </CarboButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
