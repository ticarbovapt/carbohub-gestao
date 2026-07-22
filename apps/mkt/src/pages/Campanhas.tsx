import { Megaphone } from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";

// Placeholder — a tela de Campanhas será construída aqui.
export default function Campanhas() {
  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-primary" /> Campanhas
      </h1>
      <CarboCard>
        <CarboCardContent className="p-10 text-center">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Megaphone className="h-7 w-7" />
          </div>
          <p className="mt-4 font-semibold text-foreground">Em construção</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Esta é a base do módulo de Campanhas do Carbo Marketing. As funcionalidades
            serão adicionadas aqui.
          </p>
        </CarboCardContent>
      </CarboCard>
    </div>
  );
}
