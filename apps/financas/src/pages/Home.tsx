import { Link } from "react-router-dom";
import { Wallet, ShoppingCart, Package, ClipboardList, BarChart3, Link2, ArrowRight, Percent, Users, HandCoins, Landmark, AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { useFinAging } from "@/hooks/useFinanceDashboard";
import { useFinReceivablesAging, useFinCashflow } from "@/hooks/useReceivables";
import { usePurchaseRequests } from "@/hooks/usePurchasing";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(v || 0);
const sumVencido = (rows: { bucket: string; total: number }[]) => rows.filter((a) => a.bucket.startsWith("vencido")).reduce((s, a) => s + Number(a.total), 0);
const sum30 = (rows: { bucket: string; total: number }[]) => rows.filter((a) => ["vence_hoje", "a_vencer_7", "a_vencer_30"].includes(a.bucket)).reduce((s, a) => s + Number(a.total), 0);

const ATALHOS = [
  { to: "/compras", label: "Financeiro & Suprimentos", desc: "Requisições, OC, recebimento, NF, contas a pagar/receber, caixa.", icon: ShoppingCart, color: "text-carbo-blue" },
  { to: "/compras/recebiveis", label: "Contas a Receber", desc: "Títulos a receber, baixa e inadimplência.", icon: HandCoins, color: "text-carbo-green" },
  { to: "/compras/fluxo", label: "Fluxo de Caixa", desc: "Entradas × saídas e saldo projetado.", icon: Landmark, color: "text-carbo-blue" },
  { to: "/suprimentos", label: "Suprimentos", desc: "Estoque, movimentações, recebimento e política.", icon: Package, color: "text-carbo-green" },
  { to: "/pedidos", label: "Pedidos de Venda", desc: "Pedidos, faturamento e entregas.", icon: ClipboardList, color: "text-primary" },
  { to: "/comissionamento", label: "Comissionamento", desc: "Calcular comissões e controlar pagamentos.", icon: Percent, color: "text-carbo-green" },
  { to: "/funcionarios", label: "Funcionários", desc: "Dados bancários/PIX e contato de emergência.", icon: Users, color: "text-warning" },
  { to: "/compras/dashboard", label: "Dashboard Financeiro", desc: "Aging, fluxo, curva ABC e indicadores.", icon: BarChart3, color: "text-carbo-blue" },
  { to: "/integracoes/bling", label: "Integração Bling", desc: "Conectar e sincronizar com o Bling ERP.", icon: Link2, color: "text-success" },
];

function Kpi({ to, icon: Icon, label, value, tone = "", sub }: { to: string; icon: any; label: string; value: string; tone?: string; sub?: string }) {
  return (
    <Link to={to}>
      <CarboCard variant="kpi" padding="sm" className="cursor-pointer hover:-translate-y-px transition-transform">
        <CarboCardContent>
          <div className="flex items-center gap-2 mb-1"><Icon className={`h-4 w-4 ${tone || "text-muted-foreground"}`} /><span className="text-xs text-muted-foreground">{label}</span></div>
          <p className={`text-xl font-bold kpi-number ${tone}`}>{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </CarboCardContent>
      </CarboCard>
    </Link>
  );
}

export default function Home() {
  const { profile } = useAuth();
  const nome = profile?.full_name?.split(" ")[0] ?? "";

  const { data: payAging = [] } = useFinAging("all");
  const { data: recAging = [] } = useFinReceivablesAging("all");
  const { data: cashflow = [] } = useFinCashflow("all", 8);
  const { data: rcPend = [] } = usePurchaseRequests({ status: "aguardando_aprovacao" });

  const pagarVencido = sumVencido(payAging);
  const pagar30 = sum30(payAging);
  const receberVencido = sumVencido(recAging);
  const saldo8 = cashflow.reduce((s, c) => s + (Number(c.entrada) - Number(c.saida)), 0);

  return (
    <div>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-carbo-green/10 flex items-center justify-center">
            <Wallet className="h-6 w-6 text-carbo-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Carbo Finanças{nome ? `, olá ${nome}` : ""}</h1>
            <p className="text-muted-foreground text-sm">Visão executiva do caixa, contas e aprovações.</p>
          </div>
        </div>

        {/* Painel executivo */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Kpi to="/compras/pagar" icon={AlertTriangle} label="A pagar vencido" value={brl(pagarVencido)} tone={pagarVencido > 0 ? "text-destructive" : ""} />
          <Kpi to="/compras/pagar" icon={Clock} label="A pagar (30 dias)" value={brl(pagar30)} />
          <Kpi to="/compras/recebiveis" icon={HandCoins} label="A receber vencido" value={brl(receberVencido)} tone={receberVencido > 0 ? "text-destructive" : ""} sub="inadimplência" />
          <Kpi to="/compras/fluxo" icon={TrendingUp} label="Saldo projetado (8 sem.)" value={brl(saldo8)} tone={saldo8 < 0 ? "text-destructive" : "text-success"} />
          <Kpi to="/compras/requisicoes" icon={ClipboardList} label="RCs a aprovar" value={String(rcPend.length)} tone={rcPend.length > 0 ? "text-warning" : ""} />
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
