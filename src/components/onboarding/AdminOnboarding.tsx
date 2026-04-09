import React, { useState } from "react";
import { OnboardingStep } from "./OnboardingStep";
import {
  AdminPanelIllustration,
  GrowthIllustration,
} from "./OnboardingIllustrations";
import { Brain, Wrench, Rocket, LogIn } from "lucide-react";

interface AdminOnboardingProps {
  onComplete: () => void;
  onBack: () => void;
}

export function AdminOnboarding({ onComplete, onBack }: AdminOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const STEPS = [
    {
      icon: <Brain className="h-10 w-10" />,
      title: "Papel Estratégico",
      subtitle: "Sua visão é o sistema inteiro.",
      description:
        "Sua ação molda o futuro. Você é guardião da verdade e motor da tração.",
      illustration: <AdminPanelIllustration />,
    },
    {
      icon: <Wrench className="h-10 w-10" />,
      title: "Ferramentas à Disposição",
      subtitle: "Controle total ao seu alcance.",
      description:
        "Painel Global • Editor de Checklists • Relatórios Executivos • Visão dos Licenciados",
      illustration: <AdminPanelIllustration />,
    },
    {
      icon: <Rocket className="h-10 w-10" />,
      title: "Cultura de Licenciamento",
      subtitle: "A Carbo cresce com todos.",
      description:
        "Sua visão ajuda a expandir com responsabilidade. Cadastre novos licenciados e acompanhe a evolução da rede.",
      illustration: <GrowthIllustration />,
      secondaryAction: {
        label: "➕ Cadastrar Novo Licenciado",
      },
    },
    {
      icon: <LogIn className="h-10 w-10" />,
      title: "Pronto para transformar?",
      subtitle: "Na Carbo, você não apenas trabalha.",
      description:
        "Você constrói. Vamos crescer juntos?",
      actionLabel: "🚀 Acessar como Admin",
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
      variant="admin"
      currentStep={currentStep}
      totalSteps={STEPS.length}
    />
  );
}
