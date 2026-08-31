import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { HUB_URL, isCarbohubDomain, goToHubLogin } from "@/lib/sso";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, hasAppAccess, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Não logado: login é ÚNICO, no Hub (carbohub.com.br). Em dev/preview cai no
  // /login local standalone.
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

  // Camada 1 (SEGURANÇA): logado, mas SEM acesso a este app. Bloqueia mesmo quem
  // souber o domínio direto — E TAMBÉM quem não tem perfil interno (usuário do
  // portal de lojas, cujo profile é null). O `!profile` está EXPLÍCITO aqui, e
  // não só dentro do `hasAppAccess`: a tela precisa saber QUAL dos dois casos
  // aconteceu, senão manda a pessoa pedir a coisa errada ao gestor.
  if (!profile || !hasAppAccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">
            {profile ? "Você não tem acesso ao CRM" : "Conta sem cadastro interno"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {profile
              ? "Seu perfil não tem este sistema liberado. Fale com a gestão para liberar o acesso."
              : "Esta conta não tem cadastro no sistema interno da Carbo. Fale com um gestor."}
          </p>
        </div>
        <Button onClick={() => { window.location.href = HUB_URL; }}>Voltar ao Hub</Button>
      </div>
    );
  }

  return <>{children}</>;
}
