import { Link } from "react-router-dom";
import { Wallet, ShoppingCart, Package, ClipboardList, BarChart3, Link2, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";

const ATALHOS = [
  { to: "/financeiro", label: "Financeiro", desc: "Requisições, cotações, aprovações e contas a pagar.", icon: Wallet, color: "text-warning" },
  { to: "/compras", label: "Compras & Suprimentos", desc: "Requisições, OC, recebimento, NF, contas a pagar.", icon: ShoppingCart, color: "text-carbo-blue" },
  { to: "/suprimentos", label: "Suprimentos", desc: "Estoque, movimentações, recebimento e política.", icon: Package, color: "text-carbo-green" },
  { to: "/pedidos", label: "Pedidos (RV)", desc: "Pedidos, faturamento e entregas.", icon: ClipboardList, color: "text-primary" },
  { to: "/dashboard-financeiro", label: "Dashboard Financeiro", desc: "Contas a pagar e custo por fornecedor.", icon: BarChart3, color: "text-carbo-blue" },
  { to: "/integracoes/bling", label: "Integração Bling", desc: "Conectar e sincronizar com o Bling ERP.", icon: Link2, color: "text-success" },
];

export default function Home() {
  const { profile } = useAuth();
  const nome = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-carbo-green/10 flex items-center justify-center">
            <Wallet className="h-6 w-6 text-carbo-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Carbo Finanças{nome ? `, olá ${nome}` : ""}</h1>
            <p className="text-muted-foreground text-sm">Financeiro, compras, suprimentos e integrações.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ATALHOS.map((a) => (
            <Link key={a.to} to={a.to}>
              <CarboCard className="hover:shadow-md transition-shadow cursor-pointer">
                <CarboCardContent className="p-4">
                  <a.icon className={`h-7 w-7 ${a.color} mb-2`} />
                  <p className="font-semibold">{a.label}</p>
                  <p className="text-sm text-muted-foreground mb-2">{a.desc}</p>
                  <span className="text-xs font-semibold text-primary inline-flex items-center gap-1">Abrir <ArrowRight className="h-3.5 w-3.5" /></span>
                </CarboCardContent>
              </CarboCard>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
