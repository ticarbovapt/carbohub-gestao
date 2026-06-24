import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Wallet } from "lucide-react";
import { PurchasingDashboard } from "@/components/purchasing/PurchasingDashboard";

export default function DashboardFinanceiro() {
  return (
    <>
      <div className="space-y-6">
        <CarboPageHeader
          title="Dashboard Financeiro"
          description="Contas a pagar, ordens de compra e fluxo financeiro"
          icon={Wallet}
        />
        <PurchasingDashboard />
      </div>
    </>
  );
}
