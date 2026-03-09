import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLicenseeStatus } from "@/hooks/useLicenseePortal";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  MapPin,
  ChevronLeft,
  Zap,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function CarboVAPTCheckout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: licenseeStatus } = useLicenseeStatus();

  const modality: string = location.state?.modality ?? "P";
  const modalityTitle: string =
    location.state?.modalityTitle ?? `Modalidade ${modality}`;

  // Form state
  const [region, setRegion] = useState(
    licenseeStatus?.licensee?.address_state ?? ""
  );
  const [city, setCity] = useState(
    licenseeStatus?.licensee?.address_city ?? ""
  );
  const [preferredDate, setPreferredDate] = useState<Date | undefined>();
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!confirmed) {
      toast.error("Confirme os termos para continuar");
      return;
    }
    if (!licenseeStatus?.licensee_id) {
      toast.error("Licenciado não identificado");
      return;
    }

    setLoading(true);
    try {
      // Create carbovapt_request with status awaiting_payment
      const { data, error } = await supabase
        .from("carbovapt_requests")
        .insert({
          licensee_id: licenseeStatus.licensee_id,
          modality,
          request_status: "awaiting_payment",
          region: region || null,
          preferred_date: preferredDate
            ? format(preferredDate, "yyyy-MM-dd")
            : null,
          time_window_start: timeStart || null,
          time_window_end: timeEnd || null,
          notes: notes || null,
          confirmed_terms: true,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      navigate("/licenciado/carboVAPT/pagamento", {
        state: { requestId: data.id, modality, modalityTitle },
      });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao criar solicitação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LicenseeLayout>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
        {/* Back */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2"
          onClick={() => navigate("/licenciado/carboVAPT/servicos")}
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Button>

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#0f4c75] to-[#2ecc71] flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Checkout</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Modalidade selecionada:{" "}
            <span className="font-semibold text-foreground">{modalityTitle}</span>
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          {/* Region */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Local / Região
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Cidade"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <Input
                placeholder="Estado (UF)"
                value={region}
                maxLength={2}
                onChange={(e) => setRegion(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <Separator />

          {/* Date + time window */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Data preferencial
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  {preferredDate ? (
                    format(preferredDate, "PPP", { locale: ptBR })
                  ) : (
                    <span className="text-muted-foreground">
                      Selecionar data (opcional — a definir)
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={preferredDate}
                  onSelect={setPreferredDate}
                  disabled={(d) => d < new Date()}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Janela de horário (opcional)
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="time"
                placeholder="Início"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
              />
              <Input
                type="time"
                placeholder="Fim"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea
              placeholder="Informações adicionais para a equipe..."
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-2xl border border-border bg-secondary/30 p-5 space-y-3">
          <h3 className="font-semibold text-sm">Resumo da solicitação</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Modalidade</span>
              <span className="font-medium">{modalityTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Local</span>
              <span className="font-medium">
                {city && region ? `${city} / ${region}` : "A definir"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data</span>
              <span className="font-medium">
                {preferredDate
                  ? format(preferredDate, "dd/MM/yyyy", { locale: ptBR })
                  : "A definir"}
              </span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Custo</span>
              <span className="text-muted-foreground">
                A confirmar (via gateway)
              </span>
            </div>
          </div>
        </div>

        {/* Terms */}
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
          <Checkbox
            id="terms"
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(v === true)}
          />
          <label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
            Confirmo a modalidade selecionada (
            <strong>{modality}</strong>) e autorizo gerar a solicitação de
            descarbonização para minha operação.
          </label>
        </div>

        {/* CTA */}
        <Button
          className={cn(
            "w-full h-12 text-base font-semibold gap-2",
            "bg-gradient-to-r from-[#0f4c75] to-[#1b6ca8] hover:from-[#0d3d60] hover:to-[#155f95] text-white border-0"
          )}
          disabled={!confirmed || loading}
          onClick={handleContinue}
        >
          {loading ? (
            "Processando..."
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5" />
              Continuar para pagamento
            </>
          )}
        </Button>
      </div>
    </LicenseeLayout>
  );
}
