import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { useServiceCatalog, useLicenseeStatus, useLicenseeWallet } from "@/hooks/useLicenseePortal";
import { supabase } from "@/integrations/supabase/client";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  Zap,
  Truck,
  Clock,
  Coins,
  CalendarDays,
  MapPin,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ServiceCatalogItem, OperationType } from "@/types/licenseePortal";
import { useCreateRequest } from "@/hooks/useLicenseePortal";
import { cn } from "@/lib/utils";

interface ServiceCatalogProps {
  operationType: OperationType;
}

export default function ServiceCatalog({ operationType }: ServiceCatalogProps) {
  const navigate = useNavigate();
  const { data: services, isLoading } = useServiceCatalog(operationType);
  const { data: licenseeStatus } = useLicenseeStatus();
  const { data: wallet } = useLicenseeWallet(licenseeStatus?.licensee_id);
  const createRequest = useCreateRequest();

  const [selectedService, setSelectedService] = useState<ServiceCatalogItem | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  
  // Checkout form state
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [preferredDate, setPreferredDate] = useState<Date | undefined>();
  const [paymentMethod, setPaymentMethod] = useState<"credits" | "invoice" | "plan">("credits");
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState(30);

  const isVapt = operationType === "carbo_vapt";
  const title = isVapt ? "CarboVAPT" : "CarboZé";
  const subtitle = isVapt
    ? "Solicite serviços de descarbonização para sua operação"
    : "Solicite insumos e produtos para sua operação";
  const Icon = isVapt ? Zap : Truck;

  const openCheckout = (service: ServiceCatalogItem) => {
    setSelectedService(service);
    setCheckoutOpen(true);
  };

  const handleCheckout = async () => {
    if (!selectedService || !licenseeStatus?.licensee_id) return;

    // Validações
    if (selectedService.requiresScheduling && !preferredDate) {
      toast.error("Selecione uma data preferencial");
      return;
    }

    if (paymentMethod === "credits" && wallet && wallet.balance < selectedService.creditCost) {
      toast.error("Saldo de créditos insuficiente");
      return;
    }

    try {
      // 1. Create the request
      const newRequest = await createRequest.mutateAsync({
        licenseeId: licenseeStatus.licensee_id,
        serviceId: selectedService.id,
        operationType: selectedService.operationType,
        operationAddress: address || undefined,
        operationCity: city || undefined,
        operationState: state || undefined,
        preferredDate: preferredDate?.toISOString().split("T")[0],
        paymentMethod,
        creditsUsed: paymentMethod === "credits" ? selectedService.creditCost : 0,
        amountCharged: paymentMethod === "invoice" ? selectedService.basePrice : 0,
        isRecurring,
        recurrenceIntervalDays: isRecurring ? recurrenceInterval : undefined,
        notes: notes || undefined,
      });

      // 2. Process checkout (deduct credits, create OS)
      const { data: checkoutResult, error: checkoutError } = await supabase.functions.invoke(
        "process-licensee-checkout",
        {
          body: { requestId: newRequest.id },
        }
      );

      if (checkoutError) {
        console.error("Checkout processing error:", checkoutError);
        toast.warning("Solicitação criada, mas processamento pendente", {
          description: "Nossa equipe irá processar manualmente.",
        });
      } else {
        toast.success("Solicitação confirmada!", {
          description: checkoutResult.serviceOrderId 
            ? "OS gerada automaticamente." 
            : "Pedido criado com sucesso.",
        });
      }

      setCheckoutOpen(false);
      resetForm();
      navigate("/portal/pedidos");
    } catch (error) {
      console.error("Error creating request:", error);
      toast.error("Erro ao criar solicitação");
    }
  };

  const resetForm = () => {
    setSelectedService(null);
    setAddress("");
    setCity("");
    setState("");
    setPreferredDate(undefined);
    setPaymentMethod("credits");
    setNotes("");
    setIsRecurring(false);
    setRecurrenceInterval(30);
  };

  if (isLoading) {
    return (
      <LicenseeLayout>
        <div className="p-6 lg:p-8 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </LicenseeLayout>
    );
  }

  return (
    <LicenseeLayout>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <PageHeader
          title={title}
          description={subtitle}
          icon={<Icon className={cn("h-6 w-6", isVapt ? "text-amber-600" : "text-blue-600")} />}
        />

        {/* Wallet info */}
        {wallet && (
          <div className="bg-gradient-to-r from-carbo-green/10 to-carbo-blue/10 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Coins className="h-5 w-5 text-carbo-green" />
              <span className="text-sm">Seu saldo:</span>
              <span className="font-mono font-bold text-lg">{wallet.balance} créditos</span>
            </div>
            <Button variant="outline" size="sm">
              Comprar créditos
            </Button>
          </div>
        )}

        {/* Service Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services?.map((service) => (
            <CarboCard key={service.id} className="hover:border-carbo-green/30 transition-colors">
              <CarboCardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center text-2xl">
                    {service.icon}
                  </div>
                  {service.isRecurringEligible && (
                    <Badge variant="secondary" className="text-xs">
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Recorrente
                    </Badge>
                  )}
                </div>

                <h3 className="font-semibold text-lg mb-2">{service.name}</h3>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {service.description}
                </p>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Coins className="h-4 w-4" />
                      Custo
                    </span>
                    <span className="font-mono font-medium">{service.creditCost} créditos</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      SLA
                    </span>
                    <span className="font-medium">{service.defaultSlaHours}h</span>
                  </div>
                  {service.requiresScheduling && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="h-4 w-4" />
                        Antecedência
                      </span>
                      <span className="font-medium">{service.minLeadTimeHours}h</span>
                    </div>
                  )}
                </div>

                <Button
                  className="w-full carbo-gradient"
                  onClick={() => openCheckout(service)}
                  disabled={wallet && wallet.balance < service.creditCost && paymentMethod === "credits"}
                >
                  Solicitar
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CarboCardContent>
            </CarboCard>
          ))}
        </div>

        {/* Checkout Dialog */}
        <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedService?.icon}
                {selectedService?.name}
              </DialogTitle>
              <DialogDescription>
                Preencha os dados para solicitar este serviço
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Endereço */}
              {selectedService?.requiresScheduling && (
                <>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Endereço da operação
                    </Label>
                    <Input
                      placeholder="Rua, número"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Cidade"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                      <Input
                        placeholder="Estado"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Data preferencial */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      Data preferencial
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          {preferredDate ? (
                            format(preferredDate, "PPP", { locale: ptBR })
                          ) : (
                            <span className="text-muted-foreground">Selecione uma data</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={preferredDate}
                          onSelect={setPreferredDate}
                          disabled={(date) => date < new Date()}
                          locale={ptBR}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </>
              )}

              {/* Recorrência */}
              {selectedService?.isRecurringEligible && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Recorrência
                  </Label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isRecurring}
                        onChange={(e) => setIsRecurring(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm">Pedido recorrente</span>
                    </label>
                    {isRecurring && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">a cada</span>
                        <Input
                          type="number"
                          className="w-20"
                          value={recurrenceInterval}
                          onChange={(e) => setRecurrenceInterval(Number(e.target.value))}
                          min={7}
                        />
                        <span className="text-sm text-muted-foreground">dias</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Forma de pagamento */}
              <div className="space-y-2">
                <Label>Forma de pagamento</Label>
                <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-muted/50">
                    <RadioGroupItem value="credits" id="credits" />
                    <label htmlFor="credits" className="flex-1 cursor-pointer">
                      <p className="font-medium">Créditos</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedService?.creditCost} créditos (saldo: {wallet?.balance || 0})
                      </p>
                    </label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-muted/50">
                    <RadioGroupItem value="plan" id="plan" />
                    <label htmlFor="plan" className="flex-1 cursor-pointer">
                      <p className="font-medium">Incluído no plano</p>
                      <p className="text-sm text-muted-foreground">Usar cota do plano mensal</p>
                    </label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-muted/50">
                    <RadioGroupItem value="invoice" id="invoice" />
                    <label htmlFor="invoice" className="flex-1 cursor-pointer">
                      <p className="font-medium">Faturar</p>
                      <p className="text-sm text-muted-foreground">
                        R$ {selectedService?.basePrice?.toFixed(2)} (nota no fim do mês)
                      </p>
                    </label>
                  </div>
                </RadioGroup>
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <Label>Observações (opcional)</Label>
                <Textarea
                  placeholder="Alguma informação adicional..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Resumo */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium">Resumo</h4>
                <div className="flex justify-between text-sm">
                  <span>Serviço</span>
                  <span>{selectedService?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>SLA</span>
                  <span>{selectedService?.defaultSlaHours}h</span>
                </div>
                <div className="flex justify-between text-sm font-medium pt-2 border-t">
                  <span>Total</span>
                  <span>
                    {paymentMethod === "credits"
                      ? `${selectedService?.creditCost} créditos`
                      : paymentMethod === "plan"
                      ? "Incluído no plano"
                      : `R$ ${selectedService?.basePrice?.toFixed(2)}`}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setCheckoutOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 carbo-gradient"
                  onClick={handleCheckout}
                  disabled={createRequest.isPending}
                >
                  {createRequest.isPending ? (
                    "Processando..."
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Confirmar Solicitação
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </LicenseeLayout>
  );
}
