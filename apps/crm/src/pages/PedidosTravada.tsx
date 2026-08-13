import { useNavigate } from "react-router-dom";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Lock, TrendingUp } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// /pedidos — TRAVADA
//
// A tela saiu do menu e a rota passa a mostrar este aviso.
//
// ⚠️ A rota NÃO foi apagada, de propósito. Quem tem o link salvo — ou clicou
// num link antigo de outro lugar do sistema — cairia em "página não
// encontrada", que faz a pessoa achar que errou o endereço e procurar de novo.
// Um aviso explícito encerra a busca e diz para onde ir.
//
// O `pages/Pedidos.tsx` continua no repositório, funcionando (o bug do
// SelectItem com valor vazio foi corrigido antes de travar). Destravar é
// trocar o elemento da rota no App.tsx de volta.
// ─────────────────────────────────────────────────────────────────────────────

export default function PedidosTravada() {
  const navigate = useNavigate();
  return (
    <div className="p-4 md:p-6">
      <div className="max-w-md mx-auto pt-10">
        <CarboCard>
          <CarboCardContent className="py-10 text-center space-y-3">
            <div className="mx-auto w-11 h-11 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold">Tela temporariamente indisponível</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              A tela de Pedidos está fora do ar por enquanto. Para acompanhar
              suas vendas, use a tela de Vendas.
            </p>
            <Button className="gap-1.5 mt-1" onClick={() => navigate("/vendas")}>
              <TrendingUp className="h-4 w-4" /> Ir para Vendas
            </Button>
          </CarboCardContent>
        </CarboCard>
      </div>
    </div>
  );
}
