import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { LoadingTip } from "@/components/ui/LoadingTip";
import type { CarboRole } from "@/types/carboRoles";

interface ProtectedRouteProps {
  children: React.ReactNode;
  // Roles legados (mantidos para compatibilidade)
  requiredRole?: "admin" | "manager" | "operator" | "viewer";
  // Novos roles Carbo
  requiredCarboRole?: CarboRole | CarboRole[];
  // Requer qualquer gestor
  requiresGestor?: boolean;
  // Requer CEO
  requiresCeo?: boolean;
}

export function ProtectedRoute({ 
  children, 
  requiredRole,
  requiredCarboRole,
  requiresGestor,
  requiresCeo
}: ProtectedRouteProps) {
  const { 
    user, isLoading, roles, isAdmin, isManager, passwordMustChange,
    isCeo, isGestorAdm, isGestorFin, isGestorCompras, 
    isOperadorFiscal, isOperador, isAnyGestor, carboRoles
  } = useAuth();
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

  // If user needs to change password, redirect to change password page
  if (passwordMustChange && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  // Verificar roles Carbo primeiro (se configurados)
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
