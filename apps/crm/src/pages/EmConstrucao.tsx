import { Hammer } from "lucide-react";

// Placeholder enquanto a tela do Controle é portada (visual) pra cá.
export default function EmConstrucao({ titulo, origem }: { titulo: string; origem: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 py-20">
      <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
        <Hammer className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">{titulo}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tela em port visual a partir do Controle (<span className="font-mono">{origem}</span>).
        </p>
      </div>
    </div>
  );
}
