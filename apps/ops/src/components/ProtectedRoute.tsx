import { ReactNode } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isCarbohubDomain, goToHubLogin, HUB_URL } from "@/lib/sso";
import { Button } from "@/components/ui/button";

// Login é ÚNICO no Hub (carbohub.com.br). O acesso ao Ops é liberado pelo Admin
// via allowed_interfaces (carbo_ops_app) — nem todo mundo enxerga o Ops.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, canAccessOps, isLoading } = useAuth();

  // Preview/dev (fora de *.carbohub.com.br, ex.: *.vercel.app): o cookie SSO é
  // cross-subdomínio e não chega aqui, então não há como ler a sessão/liberação.
  // Renderiza direto só para visualização — o gate real roda no subdomínio.
  if (!isCarbohubDomain()) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Sem sessão → login único do Hub.
  if (!user) {
    goToHubLogin();
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Logado, mas o Admin não liberou o Ops para este usuário.
  if (!canAccessOps) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Acesso ao Ops não liberado</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Seu perfil não tem o Carbo Ops habilitado. Solicite a liberação ao
            time de gestão (feita no Carbo Admin).
          </p>
        </div>
        <Button variant="outline" onClick={() => { window.location.href = `${HUB_URL}/home`; }}>
          Voltar ao Hub
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
