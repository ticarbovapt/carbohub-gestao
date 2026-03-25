import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { OrgChart } from "@/components/team/OrgChart";
import { useOrgChart } from "@/hooks/useOrgChart";
import { Network } from "lucide-react";

export default function OrgChartPage() {
  const { data: tree = [], isLoading } = useOrgChart();

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Organograma"
          description="Estrutura hierárquica do Grupo Carbo — 6 níveis"
          icon={Network}
        />

        <OrgChart tree={tree} isLoading={isLoading} />
      </div>
    </BoardLayout>
  );
}
