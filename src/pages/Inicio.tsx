import { useNavigate } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCanSeeScreen } from "@/hooks/useFunctionAccess";
import { SCREEN_GROUPS } from "@/constants/functionAccessConfig";
import { CarboButton } from "@/components/ui/carbo-button";
import { ArrowRight } from "lucide-react";
import logoCarbo from "@/assets/logo-carbo.png";

// Cada card verifica o próprio acesso — renderiza só se liberado
function ScreenCard({ id, label, path }: { id: string; label: string; path: string }) {
  const can = useCanSeeScreen(id);
  const navigate = useNavigate();
  if (!can) return null;
  return (
    <button
      onClick={() => navigate(path)}
      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent transition-colors w-full"
    >
      <span className="text-sm font-medium">{label}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function InicioContent() {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0] || "Usuário";
  const allScreens = SCREEN_GROUPS.flatMap((g) => g.screens);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <img src={logoCarbo} alt="Carbo" className="h-8" />
        <div>
          <h1 className="text-2xl font-bold">Olá, {firstName}!</h1>
          <p className="text-muted-foreground text-sm">
            Use o menu lateral ou selecione uma área abaixo para começar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {allScreens.map((s) => (
          <ScreenCard key={s.id} id={s.id} label={s.label} path={s.path} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center pt-2">
        Não está vendo suas telas? Solicite ao administrador no Role Matrix.
      </p>
    </div>
  );
}

export default function Inicio() {
  return (
    <BoardLayout>
      <InicioContent />
    </BoardLayout>
  );
}
