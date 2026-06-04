import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCanSeeScreen } from "@/hooks/useFunctionAccess";
import { Loader2 } from "lucide-react";
import { LoadingTip } from "@/components/ui/LoadingTip";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Tela do Role Matrix. Se informado, o acesso é controlado por
   *  function_screen_access (department + funcao). Sem screenId, basta estar
   *  autenticado. */
  screenId?: string;
}

export function ProtectedRoute({ children, screenId }: ProtectedRouteProps) {
  const { user, isLoading, passwordMustChange, tempPasswordExpired } = useAuth();
  const canSeeByFunction = useCanSeeScreen(screenId ?? "");
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-board-bg">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-board-navy mx-auto mb-4" />
          <p className="text-board-muted">Carregando...</p>
          <LoadingTip />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location.pathname }} replace />;
  }

  // Senha temporária EXPIRADA: precisa de novo temp password do gestor.
  if (tempPasswordExpired && location.pathname !== "/") {
    return <Navigate to="/" replace />;
  }

  // Troca de senha obrigatória.
  if (passwordMustChange && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  // Controle de acesso por Role Matrix (department + funcao).
  if (screenId && !canSeeByFunction) {
    // Evita loop: telas-âncora não redirecionam novamente.
    const safe = ["/sem-acesso", "/inicio", "/home", "/meu-perfil"];
    if (safe.includes(location.pathname)) return <>{children}</>;
    return <Navigate to="/inicio" replace />;
  }

  return <>{children}</>;
}
