import { Boxes, ShieldCheck, LogOut, UserCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { CRM_MANIFEST, CAPABILITIES, can } from "@/lib/access";

// Tela de fundação (Fase 0). Prova o login + o modelo de acesso ponta a ponta:
// mostra a identidade logada, o nível derivado e quais capabilities ela tem.
export default function Home() {
  const { profile, level, scope, isGestor, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-carbo-green" />
            <span className="font-bold">Carbo CRM</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        {/* Identidade logada + nível derivado */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <UserCircle className="h-4 w-4 text-carbo-green" />
            <span className="text-sm font-semibold">Sessão</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Nome" value={profile?.full_name ?? profile?.username ?? "—"} />
            <Info label="Departamento" value={profile?.department ?? "—"} />
            <Info label="Função" value={profile?.funcao ?? "—"} />
            <Info
              label="Nível (derivado)"
              value={
                <span className={isGestor ? "text-carbo-green font-semibold" : "font-semibold"}>
                  {level}
                </span>
              }
            />
            <Info label="Escopo de dado" value={scope} />
          </div>
        </div>

        {/* Manifesto + o que ESTE usuário pode (prova das capabilities) */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-carbo-green" />
            <span className="text-sm font-semibold">Permissões neste sistema ({CRM_MANIFEST.label})</span>
          </div>
          <ul className="text-sm space-y-1">
            {Object.keys(CAPABILITIES).map((cap) => {
              const ok = can(level, cap as keyof typeof CAPABILITIES);
              return (
                <li key={cap} className="flex justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{cap}</span>
                  <span className={ok ? "text-carbo-green text-xs font-semibold" : "text-muted-foreground text-xs"}>
                    {ok ? "✓ pode" : "— não"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Fundação Fase 0 · próximo: Kanban de leads usando estas regras.
        </p>
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
