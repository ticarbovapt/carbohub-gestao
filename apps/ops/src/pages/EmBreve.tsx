import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Hammer } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Placeholder de tela ainda não portada. Marca o "lugar" da tela na estrutura;
// será substituída pelo port fiel do Carbo Controle.
export default function EmBreve({
  title, icon, from, mirror,
}: { title: string; icon: LucideIcon; from?: string; mirror?: boolean }) {
  return (
    <div className="p-4 md:p-6">
      <div className="max-w-[1200px] mx-auto space-y-6">
        <CarboPageHeader title={title} description={mirror ? "Tela espelhada do Carbo Sales (visualização)" : "Operação"} icon={icon} />
        <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-10 flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
            <Hammer className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Em breve</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Esta tela já tem seu lugar definido aqui no Carbo Ops e será portada
              {mirror ? " espelhando o Carbo Sales" : " fiel ao Carbo Controle"} nas próximas etapas.
            </p>
            {from && (
              <p className="text-[11px] text-muted-foreground/60 mt-3 font-mono">origem: {from}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
