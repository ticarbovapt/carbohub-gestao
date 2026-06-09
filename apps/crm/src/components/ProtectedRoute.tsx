import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const HUB_URL = "https://carbohub.com.br";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, hasAppAccess, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Camada 1: logado, mas sem este app liberado no perfil (allowed_interfaces).
  // Bloqueia mesmo quem souber o domínio direto. Espera o profile carregar.
  if (profile && !hasAppAccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Você não tem acesso ao CRM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seu perfil não tem este sistema liberado. Fale com a gestão para liberar o acesso.
          </p>
        </div>
        <Button onClick={() => { window.location.href = HUB_URL; }}>Voltar ao Hub</Button>
      </div>
    );
  }

  return <>{children}</>;
}
