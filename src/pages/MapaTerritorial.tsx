import React from "react";
import { OpsLayout } from "@/components/layouts/OpsLayout";
import { TerritorialMap } from "@/components/maps/TerritorialMap";

/**
 * Página dedicada do Mapa Territorial do Ecossistema Carbo
 * Visualização estratégica de operações, licenciados, PDVs e máquinas
 */
export default function MapaTerritorial() {
  return (
    <OpsLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Mapa Territorial
          </h1>
          <p className="text-muted-foreground">
            Visualização geográfica do ecossistema Carbo
          </p>
        </div>

        <TerritorialMap 
          height="calc(100vh - 240px)"
          showFilters={true}
          showLegend={true}
          showStats={true}
        />
      </div>
    </OpsLayout>
  );
}
