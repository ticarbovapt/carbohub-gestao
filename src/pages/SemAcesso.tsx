import { useNavigate } from "react-router-dom";
import { ShieldOff, Home, UserCircle } from "lucide-react";
import { CarboButton } from "@/components/ui/carbo-button";
import logoCarbo from "@/assets/logo-carbo.png";

export default function SemAcesso() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-board-bg p-6 text-center">
      <img src={logoCarbo} alt="Carbo" className="h-10 mb-8 opacity-70" />
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <ShieldOff className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Acesso não configurado</h1>
      <p className="text-muted-foreground max-w-sm mb-8">
        Você ainda não tem acesso a esta área. Entre em contato com o administrador para liberar suas telas no Role Matrix.
      </p>
      <div className="flex gap-3">
        <CarboButton variant="outline" onClick={() => navigate("/home")}>
          <Home className="h-4 w-4 mr-2" />
          Início
        </CarboButton>
        <CarboButton variant="outline" onClick={() => navigate("/meu-perfil")}>
          <UserCircle className="h-4 w-4 mr-2" />
          Meu Perfil
        </CarboButton>
      </div>
    </div>
  );
}
