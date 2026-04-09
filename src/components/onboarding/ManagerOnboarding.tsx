import React, { useState } from "react";
import { OnboardingStep } from "./OnboardingStep";
import {
  DashboardIllustration,
  StepsIllustration,
  FilterIllustration,
  GrowthIllustration,
} from "./OnboardingIllustrations";
import { Users, BarChart3, Filter, Rocket, LogIn } from "lucide-react";

interface ManagerOnboardingProps {
  onComplete: () => void;
  onBack: () => void;
}

export function ManagerOnboarding({ onComplete, onBack }: ManagerOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const STEPS = [
    {
      icon: <Users className="h-10 w-10" />,
      title: "Papel do Gestor",
      subtitle: "Você não comanda tarefas.",
      description:
        "Você desenvolve pessoas. Seu papel é destravar o fluxo e impulsionar seu time.",
      illustration: <DashboardIllustration />,
    },
    {
      icon: <BarChart3 className="h-10 w-10" />,
      title: "Como Funciona?",
      subtitle: "Visão clara, ação certeira.",
      description:
        "1. Veja os KPIs do seu time\n2. Apoie os operadores onde houver gargalo\n3. Finalize OPs com validação e feedback",
      illustration: <StepsIllustration />,
    },
    {
      icon: <Filter className="h-10 w-10" />,
      title: "Filtros e Visualização",
      subtitle: "Você vê o todo. E ajuda cada um.",
      description:
        "Filtre por colaborador, setor, unidade e período. Tenha controle total sobre o desempenho da sua equipe.",
      illustration: <FilterIllustration />,
    },
    {
      icon: <Rocket className="h-10 w-10" />,
      title: "Cultura de Licenciamento",
      subtitle: "Vamos crescer juntos",
      description:
        "Incentive sua equipe a cadastrar novos licenciados. Você também pode contribuir diretamente para a expansão da Carbo.",
      illustration: <GrowthIllustration />,
      secondaryAction: {
        label: "➕ Cadastrar novo licenciado",
      },
    },
    {
      icon: <LogIn className="h-10 w-10" />,
      title: "Pronto para liderar?",
      subtitle: "Na Carbo, você não apenas trabalha.",
      description:
        "Você constrói. Vamos crescer juntos?",
      actionLabel: "🚀 Acessar como Gestor",
    },
  ];

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    } else {
      onBack();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const handleNewLicensee = () => {
    localStorage.setItem("carbo_pending_action", "create_licensee");
    onComplete();
  };

  const step = STEPS[currentStep];

  return (
    <OnboardingStep
      icon={step.icon}
      title={step.title}
      subtitle={step.subtitle}
      description={step.description}
      illustration={step.illustration}
      onNext={handleNext}
      onBack={handleBack}
      onSkip={handleSkip}
      isFirst={currentStep === 0}
      isLast={currentStep === STEPS.length - 1}
      actionLabel={step.actionLabel}
      secondaryAction={
        step.secondaryAction
          ? { label: step.secondaryAction.label, onClick: handleNewLicensee }
          : undefined
      }
      variant="manager"
      currentStep={currentStep}
      totalSteps={STEPS.length}
    />
  );
}
