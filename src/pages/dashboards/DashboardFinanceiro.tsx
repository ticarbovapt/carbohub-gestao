import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Wallet } from "lucide-react";
import { PurchasingDashboard } from "@/components/purchasing/PurchasingDashboard";
import { DashboardFilterBar, DashboardFilters, EMPTY_FILTERS } from "@/components/dashboard/DashboardFilterBar";

export default function DashboardFinanceiro() {
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);

  return (
    <BoardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <CarboPageHeader
            title="Dashboard Financeiro"
            description="Contas a pagar, ordens de compra e fluxo financeiro"
            icon={Wallet}
          />
          <DashboardFilterBar
            filters={filters}
            onChange={setFilters}
            className="sm:pt-1 shrink-0"
          />
        </div>
        <PurchasingDashboard from={filters.from || undefined} to={filters.to || undefined} />
      </div>
    </BoardLayout>
  );
}
