import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { isCarbohubDomain, goToHubLogin } from "@/lib/sso";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, hasAdminInterface, isLoading, signOut } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Não logado: login é ÚNICO, no Hub (carbohub.com.br). Não pedimos login aqui.
  // Em dev/preview (fora do domínio) cai no /login local standalone.
  if (!user) {
    if (isCarbohubDomain()) {
      goToHubLogin();
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return <Navigate to="/login" replace />;
  }

  // Logado mas sem a flag carbo_admin liberada — bloqueia mesmo com a URL direta.
  // O acesso ao Admin segue a mesma regra dos outros sistemas: precisa estar
  // liberado no próprio Admin (profiles.allowed_interfaces inclui "carbo_admin").
  if (!hasAdminInterface) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Você não tem o Carbo Admin liberado. Peça a um gestor para habilitar
            seu acesso ao Admin.
          </p>
        </div>
        <Button variant="outline" onClick={signOut}>Sair</Button>
      </div>
    );
  }

  return <>{children}</>;
}
