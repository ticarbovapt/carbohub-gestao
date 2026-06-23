import { Wallet, LogOut, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { HUB_URL } from "@/lib/sso";

export default function Home() {
  const { profile, signOut } = useAuth();
  const nome = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <div className="min-h-screen bg-background">
      {/* Topo simples (a topbar completa entra numa próxima leva) */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2 font-bold">
            <Wallet className="h-5 w-5 text-carbo-green" /> Carbo Finanças
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => { window.location.href = `${HUB_URL}/home`; }}>
              <ExternalLink className="h-4 w-4 mr-1" /> Hub
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-16 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-carbo-green/10 flex items-center justify-center mb-4">
          <Wallet className="h-8 w-8 text-carbo-green" />
        </div>
        <h1 className="text-2xl font-bold">Carbo Finanças{nome ? `, olá ${nome}` : ""}</h1>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          App de Finanças no ar. As telas (Contas a Pagar, Requisições/Pedidos,
          Notas Fiscais e Faturamento) entram por etapas.
        </p>
      </main>
    </div>
  );
}
