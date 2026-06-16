import { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Barra a rota para não-gestor — mesmo que o usuário digite a URL direto.
// Gestor = head / command / ti_suporte (derivado do perfil pelo Admin).
export function RequireGestor({ children }: { children: ReactNode }) {
  const { isGestor } = useAuth();
  if (!isGestor) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Acesso restrito à gestão (TI / command / head).</p>
      </div>
    );
  }
  return <>{children}</>;
}
