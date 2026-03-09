import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronLeft,
  Zap,
  QrCode,
  CreditCard,
  Copy,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PaymentMethod = "pix" | "card_online";

export default function CarboVAPTPayment() {
  const navigate = useNavigate();
  const location = useLocation();

  const requestId: string = location.state?.requestId ?? "";
  const modality: string = location.state?.modality ?? "P";
  const modalityTitle: string = location.state?.modalityTitle ?? `Modalidade ${modality}`;

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("pix");
  const [loading, setLoading] = useState(false);

  // Simulated Pix data (in production, comes from payment gateway)
  const PIX_QR_PLACEHOLDER = "00020126580014br.gov.bcb.pix0136placeholder-key5204000053039865802BR5925CARBO...";
  const [pixCopied, setPixCopied] = useState(false);

  const handleCopyPix = async () => {
    await navigator.clipboard.writeText(PIX_QR_PLACEHOLDER);
    setPixCopied(true);
    toast.success("Código Pix copiado!");
    setTimeout(() => setPixCopied(false), 3000);
  };

  const handleInitiatePayment = async () => {
    if (!requestId) {
      toast.error("Solicitação não identificada");
      return;
    }
    setLoading(true);
    try {
      // Create payment record with status=pending
      const { data: payment, error } = await supabase
        .from("carbovapt_payments")
        .insert({
          request_id: requestId,
          payment_method: selectedMethod,
          payment_status: "pending",
          amount: 0, // Will be updated by gateway webhook
          pix_qr_code: selectedMethod === "pix" ? PIX_QR_PLACEHOLDER : null,
          pix_copy_paste: selectedMethod === "pix" ? PIX_QR_PLACEHOLDER : null,
        })
        .select()
        .single();

      if (error) throw error;

      if (selectedMethod === "pix") {
        toast.info("Aguardando confirmação do Pix", {
          description: "Após o pagamento, a OP será gerada automaticamente.",
        });
        // In production: open real Pix QR / redirect
        // For now, simulate success after 3s
        setTimeout(() => {
          navigate("/licenciado/carboVAPT/confirmacao", {
            state: { paymentId: payment.id, requestId, modality, modalityTitle, method: "pix" },
          });
        }, 2000);
      } else {
        // Card online: redirect to gateway
        toast.info("Redirecionando para pagamento online...");
        // In production: navigate to gateway URL
        setTimeout(() => {
          navigate("/licenciado/carboVAPT/confirmacao", {
            state: { paymentId: payment.id, requestId, modality, modalityTitle, method: "card_online" },
          });
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao iniciar pagamento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LicenseeLayout>
      <div className="p-6 lg:p-8 max-w-xl mx-auto space-y-6">
        {/* Back */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2"
          onClick={() => navigate(-1)}
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
            <h1 className="text-xl font-bold text-foreground">Pagamento</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Modalidade: <span className="font-semibold text-foreground">{modalityTitle}</span>
          </p>
        </div>

        {/* Method selection */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Escolha a forma de pagamento</p>

          {/* Pix */}
          <button
            type="button"
            onClick={() => setSelectedMethod("pix")}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
              selectedMethod === "pix"
                ? "border-[#1b6ca8] bg-[#1b6ca8]/5"
                : "border-border bg-card hover:border-muted-foreground/30"
            )}
          >
            <div className={cn(
              "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
              selectedMethod === "pix" ? "bg-[#1b6ca8]/10" : "bg-secondary"
            )}>
              <QrCode className={cn("h-6 w-6", selectedMethod === "pix" ? "text-[#1b6ca8]" : "text-muted-foreground")} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Pix</p>
              <p className="text-xs text-muted-foreground">QR Code + Copia e Cola • Confirmação automática</p>
            </div>
            {selectedMethod === "pix" && (
              <Badge className="bg-[#1b6ca8] text-white border-0 text-xs">Selecionado</Badge>
            )}
          </button>

          {/* Card online */}
          <button
            type="button"
            onClick={() => setSelectedMethod("card_online")}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
              selectedMethod === "card_online"
                ? "border-[#1b6ca8] bg-[#1b6ca8]/5"
                : "border-border bg-card hover:border-muted-foreground/30"
            )}
          >
            <div className={cn(
              "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
              selectedMethod === "card_online" ? "bg-[#1b6ca8]/10" : "bg-secondary"
            )}>
              <CreditCard className={cn("h-6 w-6", selectedMethod === "card_online" ? "text-[#1b6ca8]" : "text-muted-foreground")} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Cartão Online</p>
              <p className="text-xs text-muted-foreground">Checkout seguro via gateway • Débito ou crédito</p>
            </div>
            {selectedMethod === "card_online" && (
              <Badge className="bg-[#1b6ca8] text-white border-0 text-xs">Selecionado</Badge>
            )}
          </button>
        </div>

        {/* Pix details */}
        {selectedMethod === "pix" && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            {/* Fake QR placeholder */}
            <div className="flex justify-center">
              <div className="h-40 w-40 rounded-xl bg-secondary/50 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border">
                <QrCode className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">QR Pix</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Copia e Cola</p>
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg bg-secondary px-3 py-2 text-xs font-mono text-muted-foreground truncate">
                  {PIX_QR_PLACEHOLDER.substring(0, 40)}...
                </div>
                <Button size="sm" variant="outline" onClick={handleCopyPix} className="shrink-0 gap-1.5">
                  {pixCopied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  {pixCopied ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3 text-xs text-amber-700 dark:text-amber-300">
              💡 Após confirmar o pagamento, a OP será gerada automaticamente em até 2 minutos.
            </div>
          </div>
        )}

        {/* Card online details */}
        {selectedMethod === "card_online" && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-[#1b6ca8] shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Você será redirecionado para o gateway de pagamento seguro.</p>
                <p>Após a confirmação pelo gateway, a OP será gerada automaticamente.</p>
              </div>
            </div>
          </div>
        )}

        {/* Info: OS only generated when paid */}
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-4 text-xs text-blue-700 dark:text-blue-300">
          <strong>🔒 Gate de segurança:</strong> A Ordem de Produção só é criada após confirmação automática do pagamento pelo sistema.
        </div>

        {/* CTA */}
        <Button
          className={cn(
            "w-full h-12 text-base font-semibold gap-2",
            "bg-gradient-to-r from-[#0f4c75] to-[#1b6ca8] hover:from-[#0d3d60] hover:to-[#155f95] text-white border-0"
          )}
          disabled={loading}
          onClick={handleInitiatePayment}
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Processando...
            </>
          ) : (
            <>
              {selectedMethod === "pix" ? (
                <QrCode className="h-5 w-5" />
              ) : (
                <CreditCard className="h-5 w-5" />
              )}
              {selectedMethod === "pix" ? "Pagar com Pix" : "Pagar com Cartão"}
            </>
          )}
        </Button>
      </div>
    </LicenseeLayout>
  );
}
