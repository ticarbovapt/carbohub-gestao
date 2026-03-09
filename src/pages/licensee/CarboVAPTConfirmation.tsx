import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Zap, ArrowRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CarboVAPTConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();

  const modality: string = location.state?.modality ?? "P";
  const modalityTitle: string = location.state?.modalityTitle ?? `Modalidade ${modality}`;
  const method: string = location.state?.method ?? "pix";

  // Redirect if accessed directly without state
  useEffect(() => {
    if (!location.state?.requestId) {
      navigate("/licenciado/carboVAPT/servicos", { replace: true });
    }
  }, [location.state, navigate]);

  const methodLabel =
    method === "pix" ? "Pix" : method === "card_online" ? "Cartão Online" : method;

  return (
    <LicenseeLayout>
      <div className="p-6 lg:p-8 max-w-xl mx-auto space-y-8">
        {/* Success animation */}
        <div className="flex flex-col items-center text-center pt-8 space-y-4">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg animate-pulse">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Solicitação Confirmada!</h1>
            <p className="text-muted-foreground text-sm">
              Seu pagamento via <strong>{methodLabel}</strong> foi processado com sucesso.
            </p>
          </div>
        </div>

        {/* Summary card */}
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
            <Zap className="h-5 w-5" />
            CarboVAPT — {modalityTitle}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status do pagamento</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✅ Confirmado</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">OS gerada</span>
              <span className="font-semibold">Automaticamente ✓</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Próximo passo</span>
              <span className="font-medium">Equipe operacional notificada</span>
            </div>
          </div>
        </div>

        {/* What happens next */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">O que acontece agora?</h3>
          <ol className="space-y-2 text-sm text-muted-foreground list-none">
            {[
              "A OP foi criada automaticamente no sistema.",
              "A equipe de Operações foi notificada e agendará o serviço.",
              "Você receberá atualizações na aba 'Meus Pedidos'.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={cn(
                  "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                  "bg-gradient-to-br from-[#0f4c75] to-[#1b6ca8] text-white"
                )}>
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Button
            className={cn(
              "w-full h-11 font-semibold gap-2",
              "bg-gradient-to-r from-[#0f4c75] to-[#1b6ca8] hover:from-[#0d3d60] hover:to-[#155f95] text-white border-0"
            )}
            onClick={() => navigate("/licensee/pedidos")}
          >
            Ver meus pedidos
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="w-full h-11 gap-2"
            onClick={() => navigate("/licenciado/carboVAPT/servicos")}
          >
            <Home className="h-4 w-4" />
            Novo serviço CarboVAPT
          </Button>
        </div>
      </div>
    </LicenseeLayout>
  );
}
