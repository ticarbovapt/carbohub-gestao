import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { WelcomeScreen, RoleSelection } from "@/components/onboarding/WelcomeScreen";
import { OperatorOnboarding } from "@/components/onboarding/OperatorOnboarding";
import { ManagerOnboarding } from "@/components/onboarding/ManagerOnboarding";
import { AdminOnboarding } from "@/components/onboarding/AdminOnboarding";

type OnboardingView = "welcome" | "operator" | "manager" | "admin";

export default function Onboarding() {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<OnboardingView>("welcome");

  const handleSelectRole = (role: RoleSelection) => {
    if (role) {
      setCurrentView(role);
    }
  };

  const handleComplete = () => {
    // Store that onboarding was viewed (optional)
    sessionStorage.setItem("carbo_onboarding_viewed", "true");
    // Navigate to login
    navigate("/");
  };

  const handleBackToWelcome = () => {
    setCurrentView("welcome");
  };

  switch (currentView) {
    case "operator":
      return (
        <OperatorOnboarding
          onComplete={handleComplete}
          onBack={handleBackToWelcome}
        />
      );
    case "manager":
      return (
        <ManagerOnboarding
          onComplete={handleComplete}
          onBack={handleBackToWelcome}
        />
      );
    case "admin":
      return (
        <AdminOnboarding
          onComplete={handleComplete}
          onBack={handleBackToWelcome}
        />
      );
    default:
      return <WelcomeScreen onSelectRole={handleSelectRole} />;
  }
}
