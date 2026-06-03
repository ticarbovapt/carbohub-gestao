import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCanSeeScreen, ENFORCEMENT_ACTIVE } from "@/hooks/useFunctionAccess";
import { Loader2 } from "lucide-react";
import { LoadingTip } from "@/components/ui/LoadingTip";
import type { CarboRole } from "@/types/carboRoles";

interface ProtectedRouteProps {
  children: React.ReactNode;
  // Roles legados (mantidos para compatibilidade com ENFORCEMENT_ACTIVE = false)
  requiredRole?: "admin" | "manager" | "operator" | "viewer";
  // Novos roles Carbo (legado)
  requiredCarboRole?: CarboRole | CarboRole[];
  // Requer qualquer gestor (legado)
  requiresGestor?: boolean;
  // Requer CEO (legado)
  requiresCeo?: boolean;
  // Novo: screen ID para check via function_screen_access (enforcement path)
  screenId?: string;
}

export function ProtectedRoute({
  children,
  requiredRole,
  requiredCarboRole,
  requiresGestor,
  requiresCeo,
  screenId,
}: ProtectedRouteProps) {
  const {
    user, isLoading, roles, isAdmin, isManager, passwordMustChange, tempPasswordExpired,
    isCeo, isAnyGestor, carboRoles,
  } = useAuth();
  // screenId guard: when ENFORCEMENT_ACTIVE = true and screenId is set, this controls access
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
    // Redirect to login, but save the attempted location
    return <Navigate to="/" state={{ from: location.pathname }} replace />;
  }

  // Senha temporária EXPIRADA: não pode trocar a senha sozinho — precisa de novo
  // temp password do gestor. Manda para "/", onde o Index renderiza a tela de
  // bloqueio TempPasswordExpired. Checado ANTES de passwordMustChange para não
  // cair na auto-troca em /change-password.
  if (tempPasswordExpired && location.pathname !== "/") {
    return <Navigate to="/" replace />;
  }

  // If user needs to change password, redirect to change password page
  if (passwordMustChange && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  // Function-based check (enforcement path): when active + screenId provided, this is authoritative.
  // When it passes, skip all legacy checks to avoid false-positive denials from role mismatches.
  if (ENFORCEMENT_ACTIVE && screenId) {
    if (!canSeeByFunction) {
      // Evita loop: se já está em /sem-acesso ou /home, não redireciona novamente
      const safe = ["/sem-acesso", "/inicio", "/home", "/meu-perfil"];
      if (safe.includes(location.pathname)) return <>{children}</>;
      return <Navigate to="/inicio" replace />;
    }
    return <>{children}</>;
  }

  // Legacy role checks — only run when enforcement is inactive OR no screenId was provided.
  // This keeps backward compat during the partial-migration window.
  if (requiresCeo && !isCeo) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requiresGestor && !isAnyGestor) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requiredCarboRole) {
    const requiredRoles = Array.isArray(requiredCarboRole) ? requiredCarboRole : [requiredCarboRole];
    const userCarboRoles = carboRoles.map(r => r.role as string);
    const hasRequiredCarboRole = requiredRoles.some(role => 
      userCarboRoles.includes(role as string) || isCeo // CEO tem acesso a tudo
    );
    
    if (!hasRequiredCarboRole) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  // Check legacy role requirements (fallback)
  if (requiredRole) {
    const hasRequiredRole = 
      requiredRole === "admin" ? isAdmin :
      requiredRole === "manager" ? isManager :
      roles.includes(requiredRole);

    if (!hasRequiredRole) {
      // User doesn't have required role, redirect to dashboard
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
