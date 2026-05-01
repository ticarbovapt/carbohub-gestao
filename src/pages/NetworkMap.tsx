import React, { useMemo, useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { LicenseeSubNav } from "@/components/licensees/LicenseeSubNav";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Loader2, Cpu, Users, Activity, Map, Store, AlertTriangle, Layers } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useNetworkMap, useNetworkStats } from "@/hooks/useNetworkIntelligence";
import { useTerritorialData } from "@/hooks/useTerritorialData";

const STATUS_COLORS: Record<string, string> = {
  ativa: "#22c55e",
  operational: "#22c55e",
  manutencao: "#eab308",
  maintenance: "#eab308",
  inativa: "#ef4444",
  offline: "#ef4444",
  retired: "#6b7280",
};

const STATUS_LABELS: Record<string, string> = {
  ativa: "Ativa",
  operational: "Operacional",
  manutencao: "Manutenção",
  maintenance: "Manutenção",
  inativa: "Inativa",
  offline: "Offline",
  retired: "Desativada",
};

export default function NetworkMap() {
  const { data: machines = [], isLoading: machinesLoading } = useNetworkMap();
  const { data: stats, isLoading: statsLoading } = useNetworkStats();
  const { data: territorial } = useTerritorialData();

  const [stateFilter, setStateFilter] = useState<string>("all");
  const [licenseeFilter, setLicenseeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showPDVLayer, setShowPDVLayer] = useState(false);

  // Derive unique states and licensees from data
  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    machines.forEach((m: any) => {
      if (m.location_state) states.add(m.location_state);
    });
    return Array.from(states).sort();
  }, [machines]);

  const uniqueLicensees = useMemo(() => {
    const map = new Map<string, string>();
    machines.forEach((m: any) => {
      if (m.licensee_code && m.licensee_name) {
        map.set(m.licensee_name, m.licensee_name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [machines]);

  // Apply filters
  const filteredMachines = useMemo(() => {
    return machines.filter((m: any) => {
      if (stateFilter !== "all" && m.location_state !== stateFilter) return false;
      if (licenseeFilter !== "all" && m.licensee_name !== licenseeFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      return true;
    });
  }, [machines, stateFilter, licenseeFilter, statusFilter]);

  const isLoading = machinesLoading || statsLoading;

  return (
    <BoardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Mapa da Rede CarboVAPT
            </h1>
            <p className="text-sm text-muted-foreground">
              Inteligência territorial e distribuição de máquinas
            </p>
          </div>
        </div>

        <LicenseeSubNav />

        {/* PDV Layer Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={showPDVLayer ? "default" : "outline"}
            size="sm"
            onClick={() => setShowPDVLayer((v) => !v)}
            className="h-9 gap-2"
          >
            <Store className="h-4 w-4" />
            {showPDVLayer ? "Ocultar PDVs" : "Mostrar PDVs"}
          </Button>
          {showPDVLayer && territorial?.stats && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500 inline-block" />{territorial.stats.activePDVs} ativos</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" />{territorial.stats.stockAlerts} alertas</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />{(territorial.pdvs?.length ?? 0) - territorial.stats.activePDVs} inativos</span>
            </div>
          )}
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Cpu className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Total Máquinas</p>
              <p className="text-lg font-bold text-foreground">
                {statsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  stats?.total_machines ?? 0
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Activity className="h-4 w-4 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Máquinas Ativas</p>
              <p className="text-lg font-bold text-foreground">
                {statsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  stats?.total_active_machines ?? 0
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Users className="h-4 w-4 text-purple-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Licenciados</p>
              <p className="text-lg font-bold text-foreground">
                {statsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  stats?.total_licensees ?? 0
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Map className="h-4 w-4 text-orange-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Estados</p>
              <p className="text-lg font-bold text-foreground">
                {statsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  stats?.machines_by_state?.length ?? 0
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-full sm:w-48 h-10 rounded-xl">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Estados</SelectItem>
              {uniqueStates.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={licenseeFilter} onValueChange={setLicenseeFilter}>
            <SelectTrigger className="w-full sm:w-56 h-10 rounded-xl">
              <SelectValue placeholder="Licenciado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Licenciados</SelectItem>
              {uniqueLicensees.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44 h-10 rounded-xl">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Map */}
        <div className="relative rounded-xl border border-border overflow-hidden bg-card">
          {isLoading && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Carregando mapa...</p>
              </div>
            </div>
          )}
          <MapContainer
            center={[-14.235, -51.9253]}
            zoom={4}
            style={{ height: "500px", width: "100%" }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {showPDVLayer && (territorial?.pdvs ?? []).map((pdv) => {
              if (!pdv.lat || !pdv.lng) return null;
              const pdvColor = pdv.hasStockAlert ? "#ef4444" : pdv.status === "active" ? "#22c55e" : "#f59e0b";
              return (
                <CircleMarker
                  key={`pdv-${pdv.id}`}
                  center={[pdv.lat, pdv.lng]}
                  radius={8}
                  pathOptions={{ color: pdvColor, fillColor: pdvColor, fillOpacity: 0.7, weight: 2 }}
                >
                  <Popup>
                    <div className="text-sm space-y-1 min-w-[160px]">
                      <p className="font-bold">{pdv.name}</p>
                      <p className="text-muted-foreground text-xs">{pdv.pdvCode}</p>
                      <p className="text-muted-foreground">{pdv.city}, {pdv.state}</p>
                      {pdv.hasStockAlert && (
                        <p className="text-red-500 font-medium text-xs">⚠ Alerta de estoque</p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        Estoque: {pdv.currentStock ?? "—"} / mín {pdv.minStockThreshold ?? "—"}
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {filteredMachines.map((machine: any) => {
              if (!machine.latitude || !machine.longitude) return null;
              const color = STATUS_COLORS[machine.status] || "#6b7280";
              return (
                <CircleMarker
                  key={machine.id || machine.machine_id}
                  center={[machine.latitude, machine.longitude]}
                  radius={8}
                  pathOptions={{
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.7,
                    weight: 2,
                    opacity: 0.9,
                  }}
                >
                  <Popup>
                    <div className="text-sm space-y-1 min-w-[180px]">
                      <p className="font-bold text-foreground">
                        {machine.machine_id}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-medium">Modelo:</span> {machine.model}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-medium">Tipo:</span> {machine.machine_type}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-medium">Licenciado:</span>{" "}
                        {machine.licensee_name}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-medium">Local:</span>{" "}
                        {machine.location_city}, {machine.location_state}
                      </p>
                      <p>
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: color }}
                        >
                          {STATUS_LABELS[machine.status] || machine.status}
                        </span>
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[1000] rounded-lg border border-border bg-card/95 backdrop-blur-sm p-3 shadow-md">
            <p className="text-xs font-semibold text-foreground mb-2">Legenda</p>
            <div className="flex flex-col gap-1.5">
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[key] }} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
              {showPDVLayer && (
                <>
                  <div className="border-t border-border my-1" />
                  <p className="text-xs font-semibold text-foreground mb-1">PDVs</p>
                  <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-green-500" /><span className="text-xs text-muted-foreground">PDV Ativo</span></div>
                  <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-amber-500" /><span className="text-xs text-muted-foreground">PDV Inativo</span></div>
                  <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-red-500" /><span className="text-xs text-muted-foreground">Alerta Estoque</span></div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </BoardLayout>
  );
}
