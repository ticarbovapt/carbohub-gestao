import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { isCarbohubDomain, goToHubLogin } from "@/lib/sso";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, hasTiInterface, isLoading, signOut } = useAuth();

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

  // Logado mas sem entrada liberada — bloqueia mesmo com a URL direta.
  // DUAS condições, e a primeira não é redundante: quem não tem linha em
  // `profiles` (lojista/licenciado usam a MESMA tabela) não é gente do sistema
  // interno e não entra, mesmo que um dia a flag mude de forma.
  // A segunda é a flag `carbo_ti` (profiles.allowed_interfaces).
  if (!profile || !hasTiInterface) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {profile
              ? "Você não tem o Carbo TI liberado. Peça a um gestor para habilitar seu acesso ao app do TI."
              : "Esta conta não tem cadastro no sistema interno da Carbo. Fale com um gestor."}
          </p>
        </div>
        <Button variant="outline" onClick={signOut}>Sair</Button>
      </div>
    );
  }

  return <>{children}</>;
}
