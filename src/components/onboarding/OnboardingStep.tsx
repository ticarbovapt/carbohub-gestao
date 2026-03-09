import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface OnboardingStepProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  description: string;
  illustration?: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  actionLabel?: string;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  variant?: "operator" | "manager" | "admin";
  currentStep: number;
  totalSteps: number;
}

const variantStyles = {
  operator: {
    bg: "bg-gradient-to-br from-ops-bg via-white to-ops-yellow/10",
    accent: "bg-ops-yellow",
    accentText: "text-ops-text",
    button: "bg-ops-yellow hover:bg-ops-yellow/90 text-ops-text",
    buttonOutline: "border-ops-yellow/50 text-ops-text hover:bg-ops-yellow/10",
    dotActive: "bg-ops-yellow",
    dotInactive: "bg-ops-yellow/30",
  },
  manager: {
    bg: "bg-gradient-to-br from-board-bg via-white to-board-blue/10",
    accent: "bg-board-navy",
    accentText: "text-white",
    button: "bg-board-navy hover:bg-board-navy/90 text-white",
    buttonOutline: "border-board-navy/50 text-board-navy hover:bg-board-navy/10",
    dotActive: "bg-board-navy",
    dotInactive: "bg-board-navy/30",
  },
  admin: {
    bg: "bg-gradient-to-br from-slate-50 via-white to-purple-50",
    accent: "bg-purple-600",
    accentText: "text-white",
    button: "bg-purple-600 hover:bg-purple-700 text-white",
    buttonOutline: "border-purple-600/50 text-purple-600 hover:bg-purple-50",
    dotActive: "bg-purple-600",
    dotInactive: "bg-purple-600/30",
  },
};

export function OnboardingStep({
  icon,
  title,
  subtitle,
  description,
  illustration,
  onNext,
  onBack,
  onSkip,
  isFirst = false,
  isLast = false,
  actionLabel = "Continuar",
  secondaryAction,
  variant = "operator",
  currentStep,
  totalSteps,
}: OnboardingStepProps) {
  const styles = variantStyles[variant];

  return (
    <div className={`min-h-screen flex flex-col ${styles.bg}`}>
      {/* Header with skip */}
      <div className="flex items-center justify-between p-4 md:p-6">
        {!isFirst ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        ) : (
          <div />
        )}
        {onSkip && !isLast && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="text-muted-foreground"
          >
            Pular
          </Button>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-md mx-auto text-center">
        {/* Icon */}
        <div
          className={`w-20 h-20 rounded-3xl ${styles.accent} ${styles.accentText} flex items-center justify-center mb-8 shadow-lg ops-bounce-in`}
        >
          {icon}
        </div>

        {/* Title */}
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-3 ops-slide-up">
          {title}
        </h1>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-lg text-muted-foreground mb-4 ops-slide-up font-medium">
            {subtitle}
          </p>
        )}

        {/* Description */}
        <p className="text-base text-muted-foreground leading-relaxed mb-8 ops-slide-up">
          {description}
        </p>

        {/* Illustration */}
        {illustration && (
          <div className="mb-8 ops-bounce-in w-full max-w-xs">
            {illustration}
          </div>
        )}

        {/* Secondary action */}
        {secondaryAction && (
          <Button
            variant="outline"
            className={`mb-4 w-full ${styles.buttonOutline}`}
            onClick={secondaryAction.onClick}
          >
            {secondaryAction.label}
          </Button>
        )}
      </div>

      {/* Footer with navigation */}
      <div className="p-6 space-y-4">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div
              key={index}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentStep
                  ? `w-8 ${styles.dotActive}`
                  : `w-2 ${styles.dotInactive}`
              }`}
            />
          ))}
        </div>

        {/* Action button */}
        <Button
          className={`w-full h-12 text-base font-semibold ${styles.button} ops-press`}
          onClick={onNext}
        >
          {isLast ? actionLabel : "Continuar"}
          {!isLast && <ChevronRight className="h-5 w-5 ml-2" />}
        </Button>
      </div>
    </div>
  );
}
