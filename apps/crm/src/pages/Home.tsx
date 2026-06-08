import { Boxes, ShieldCheck } from "lucide-react";
import { CRM_MANIFEST, CAPABILITIES } from "@/lib/access";

// Tela temporária de fundação — prova que o app builda, tem tema e o modelo
// de acesso carregado. Será substituída pelo login + Kanban de leads.
export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-6 p-8">
      <div className="flex items-center gap-3">
        <Boxes className="h-8 w-8 text-carbo-green" />
        <h1 className="text-2xl font-bold">Carbo CRM</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        Fundação do app — Fase 0. Próximo: login compartilhado + Kanban de leads.
      </p>

      <div className="rounded-2xl border bg-card p-5 w-full max-w-md">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-carbo-green" />
          <span className="text-sm font-semibold">Manifesto de acesso ({CRM_MANIFEST.label})</span>
        </div>
        <p className="text-xs text-muted-foreground mb-1">Níveis: {CRM_MANIFEST.levels.join(", ")}</p>
        <p className="text-xs text-muted-foreground mb-3">
          Telas: {CRM_MANIFEST.screens.map((s) => s.label).join(", ")}
        </p>
        <p className="text-xs font-medium mb-1">Capabilities:</p>
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {Object.entries(CAPABILITIES).map(([cap, levels]) => (
            <li key={cap} className="flex justify-between gap-2">
              <span className="font-mono">{cap}</span>
              <span>{(levels as readonly string[]).join(", ")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
