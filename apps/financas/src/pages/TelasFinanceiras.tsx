import { RefreshCw, Building2, Wallet, BarChart3 } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { useAuth } from "@/contexts/AuthContext";
import { PayablesList } from "@/components/purchasing/PayablesList";
import { SubscriptionsList } from "@/components/purchasing/SubscriptionsList";
import { SuppliersList } from "@/components/purchasing/SuppliersList";
import { PaymentMethodsList } from "@/components/purchasing/PaymentMethodsList";
import { PurchasingDashboard } from "@/components/purchasing/PurchasingDashboard";

// Páginas que antes eram abas de "/compras" (Financeiro & Suprimentos). Cada
// uma tem o próprio endereço, título de guia e cabeçalho; a AÇÃO principal
// ("Novo…") mora na barra do próprio componente, não aqui — assim não volta a
// existir um botão de cabeçalho comum a telas que não têm nada a ver com ele.

// O cabeçalho mora no `PayablesList`: o botão "Nova conta a pagar" depende da
// empresa escolhida, que é estado dele.
export function ContasPagar() {
  return <PayablesList />;
}

export function Assinaturas() {
  return (
    <div className="space-y-6">
      <CarboPageHeader
        title="Assinaturas"
        icon={RefreshCw}
      />
      <SubscriptionsList />
    </div>
  );
}

export function Fornecedores() {
  return (
    <div className="space-y-6">
      <CarboPageHeader title="Fornecedores" icon={Building2} />
      <SuppliersList />
    </div>
  );
}

export function FormasPagamento() {
  return (
    <div className="space-y-6">
      <CarboPageHeader
        title="Formas de pagamento"
        icon={Wallet}
      />
      <PaymentMethodsList />
    </div>
  );
}

// ⚠️ Só gestor. Antes, quem não era gestor e abria o link caía CALADO em
// outra aba — parecia que o link estava quebrado. Agora a tela diz o porquê.
export function PainelFinanceiro() {
  const { gestor } = useAuth();
  return (
    <div className="space-y-6">
      <CarboPageHeader
        title="Painel financeiro"
        icon={BarChart3}
      />
      {gestor ? (
        <PurchasingDashboard />
      ) : (
        <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Painel restrito a gestores.
        </p>
      )}
    </div>
  );
}
