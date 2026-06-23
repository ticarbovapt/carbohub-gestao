import { Link } from "react-router-dom";
import { Wallet, CreditCard, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";

export default function Home() {
  const { profile } = useAuth();
  const nome = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-carbo-green/10 flex items-center justify-center">
            <Wallet className="h-6 w-6 text-carbo-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Carbo Finanças{nome ? `, olá ${nome}` : ""}</h1>
            <p className="text-muted-foreground text-sm">Contas a pagar, notas fiscais e faturamento.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link to="/contas-a-pagar">
            <CarboCard className="hover:shadow-md transition-shadow cursor-pointer">
              <CarboCardContent className="p-4">
                <CreditCard className="h-7 w-7 text-warning mb-2" />
                <p className="font-semibold">Contas a Pagar</p>
                <p className="text-sm text-muted-foreground mb-2">Lançar, pagar e acompanhar vencimentos.</p>
                <span className="text-xs font-semibold text-primary inline-flex items-center gap-1">Abrir <ArrowRight className="h-3.5 w-3.5" /></span>
              </CarboCardContent>
            </CarboCard>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">Notas Fiscais, Faturamento e Integração Bling entram nas próximas etapas.</p>
      </div>
    </div>
  );
}
