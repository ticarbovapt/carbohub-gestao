import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OnboardingStep } from "./OnboardingStep";
import {
  ChecklistIllustration,
  StepsIllustration,
  GrowthIllustration,
} from "./OnboardingIllustrations";
import { ClipboardCheck, Zap, Users, LogIn } from "lucide-react";

interface OperatorOnboardingProps {
  onComplete: () => void;
  onBack: () => void;
}

const STEPS = [
  {
    icon: <ClipboardCheck className="h-10 w-10" />,
    title: "Papel e Propósito",
    subtitle: "Sua missão aqui é simples:",
    description:
      "Realizar bem feito o que só você pode fazer. Cada tarefa concluída move a Carbo para frente.",
    illustration: <ChecklistIllustration />,
  },
  {
    icon: <Zap className="h-10 w-10" />,
    title: "Como Funciona?",
    subtitle: "Simples. Direto. Seu talento em ação.",
    description:
      "1. Escaneie o QR da unidade ou máquina\n2. Preencha o checklist\n3. Avance para o próximo item",
    illustration: <StepsIllustration />,
  },
  {
    icon: <Users className="h-10 w-10" />,
    title: "Cultura de Licenciamento",
    subtitle: "Faça parte do crescimento",
    description:
      "Qualquer colaborador pode cadastrar um novo licenciado. Você também pode fazer a Carbo crescer!",
    illustration: <GrowthIllustration />,
    secondaryAction: {
      label: "➕ Eu quero criar um novo licenciado",
    },
  },
  {
    icon: <LogIn className="h-10 w-10" />,
    title: "Pronto para começar?",
    subtitle: "Na Carbo, você não apenas trabalha.",
    description:
      "Você constrói. Vamos crescer juntos?",
    actionLabel: "🚀 Acessar como Operador",
  },
];

export function OperatorOnboarding({ onComplete, onBack }: OperatorOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

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
    // Will navigate to create licensee after login
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
      variant="operator"
      currentStep={currentStep}
      totalSteps={STEPS.length}
    />
  );
}
