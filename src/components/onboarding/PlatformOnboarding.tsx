import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  ClipboardList,
  Building2,
  Store,
  ArrowRight,
  ArrowLeft,
  Rocket,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

// Current platform version - increment this when you want to show onboarding again
const PLATFORM_VERSION = "2.0.0";
const STORAGE_KEY = "carbo_onboarding_dismissed";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  features: string[];
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Bem-vindo ao Carbo Controle!",
    description: "Sua plataforma integrada de gestão operacional, comercial e logística.",
    icon: <Sparkles className="h-8 w-8" />,
    gradient: "from-carbo-green to-carbo-blue",
    features: [
      "Gestão centralizada de ordens de produção",
      "Acompanhamento em tempo real",
      "Analytics e relatórios inteligentes",
    ],
  },
  {
    id: "os",
    title: "Ordens de Produção",
    description: "Crie e gerencie OP de forma inteligente com fluxo de etapas.",
    icon: <ClipboardList className="h-8 w-8" />,
    gradient: "from-blue-500 to-blue-700",
    features: [
      "Origem: Licenciado, PDV ou Venda Spot/Recorrente",
      "Checklists por departamento",
      "SLA e alertas automáticos",
    ],
  },
  {
    id: "ecosystem",
    title: "Ecossistema Integrado",
    description: "Conecte licenciados, PDVs e equipes em uma única plataforma.",
    icon: <Building2 className="h-8 w-8" />,
    gradient: "from-carbo-green to-emerald-600",
    features: [
      "Portal dedicado para licenciados",
      "Gestão de máquinas e estoque",
      "Comissões e gamificação",
    ],
  },
  {
    id: "ready",
    title: "Tudo Pronto!",
    description: "Você está pronto para começar. Explore a plataforma.",
    icon: <Rocket className="h-8 w-8" />,
    gradient: "from-amber-500 to-orange-600",
    features: [
      "Use a sidebar para navegar entre seções",
      "Troque de área usando o seletor de ambiente",
      "Acesse ações rápidas na parte inferior",
    ],
  },
];

interface PlatformOnboardingProps {
  forceShow?: boolean;
}

export function PlatformOnboarding({ forceShow = false }: PlatformOnboardingProps) {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const checkOnboardingStatus = () => {
      try {
        // Check localStorage for dismissed version
        const dismissedData = localStorage.getItem(STORAGE_KEY);
        
        if (dismissedData) {
          const parsed = JSON.parse(dismissedData);
          const { version, userId, dontShowAgain: savedDontShow } = parsed;
          
          // If same user and same version and user chose not to see, don't show
          if (userId === user.id && version === PLATFORM_VERSION && savedDontShow && !forceShow) {
            setIsLoading(false);
            return;
          }
          
          // If different version, show onboarding for updates
          if (version !== PLATFORM_VERSION) {
            setOpen(true);
            setIsLoading(false);
            return;
          }
        } else {
          // First time user, show onboarding
          setOpen(true);
        }
      } catch (error) {
        // If any error, show onboarding
        console.log("Onboarding check error:", error);
        setOpen(true);
      } finally {
        setIsLoading(false);
      }
    };

    // Small delay to avoid flash
    const timer = setTimeout(checkOnboardingStatus, 500);
    return () => clearTimeout(timer);
  }, [user, forceShow]);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: PLATFORM_VERSION,
      userId: user?.id,
      dismissedAt: new Date().toISOString(),
      dontShowAgain,
    }));

    setOpen(false);
    setCurrentStep(0);
  };

  const handleSkip = () => {
    // Save skip to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: PLATFORM_VERSION,
      userId: user?.id,
      dismissedAt: new Date().toISOString(),
      skipped: true,
    }));
    
    setOpen(false);
    setCurrentStep(0);
  };

  if (isLoading || !open) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header with gradient */}
            <div className={cn(
              "p-6 pb-8 bg-gradient-to-br text-white",
              step.gradient
            )}>
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  {step.icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{step.title}</h2>
                  <p className="text-sm text-white/80 mt-0.5">{step.description}</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="space-y-3">
                {step.features.map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <CheckCircle2 className="h-5 w-5 text-carbo-green flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground">{feature}</span>
                  </motion.div>
                ))}
              </div>

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-2 mt-6">
                {ONBOARDING_STEPS.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentStep(index)}
                    className={cn(
                      "h-2 rounded-full transition-all duration-200",
                      index === currentStep 
                        ? "w-6 bg-carbo-green" 
                        : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    )}
                  />
                ))}
              </div>

              {/* Don't show again checkbox (only on last step) */}
              {isLastStep && (
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                  <Checkbox
                    id="dontShowAgain"
                    checked={dontShowAgain}
                    onCheckedChange={(checked) => setDontShowAgain(checked as boolean)}
                  />
                  <Label 
                    htmlFor="dontShowAgain" 
                    className="text-sm text-muted-foreground cursor-pointer"
                  >
                    Não mostrar novamente até a próxima atualização
                  </Label>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between mt-6">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="text-muted-foreground"
                >
                  Pular
                </Button>

                <div className="flex items-center gap-2">
                  {!isFirstStep && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrev}
                      className="gap-1"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Voltar
                    </Button>
                  )}

                  {isLastStep ? (
                    <Button
                      size="sm"
                      onClick={handleComplete}
                      className="gap-1 carbo-gradient text-white"
                    >
                      Começar
                      <Rocket className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleNext}
                      className="gap-1 carbo-gradient text-white"
                    >
                      Próximo
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}