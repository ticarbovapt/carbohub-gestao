// Mapa Territorial do Carbo Sales — dados REAIS do CORE (licensees / pdvs / machines).
import { useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, Building2, Store, Cpu, AlertTriangle, Layers, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTerritorioMapa, BRAZIL_CENTER, BRAZIL_ZOOM } from "@/hooks/useTerritorio";

interface LayerConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  enabled: boolean;
}

const HEIGHT = "calc(100vh - 280px)";

export default function MapaTerritorial() {
  const { data, isLoading, isError } = useTerritorioMapa();
  const licensees = data?.licensees ?? [];
  const pdvs = data?.pdvs ?? [];
  const machines = data?.machines ?? [];

  const [layers, setLayers] = useState<LayerConfig[]>([
    { id: "licensees", label: "Licenciados", icon: <Building2 className="h-4 w-4" />, color: "#3BC770", enabled: true },
    { id: "pdvs", label: "Lojas", icon: <Store className="h-4 w-4" />, color: "#F59E0B", enabled: true },
    { id: "machines", label: "Máquinas", icon: <Cpu className="h-4 w-4" />, color: "#8B5CF6", enabled: true },
  ]);
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  const isOn = (id: string) => layers.find((l) => l.id === id)?.enabled ?? false;
  const toggleLayer = (id: string) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)));

  // KPIs derivados dos dados reais.
  const stats = useMemo(() => {
    const states = new Set<string>();
    const cities = new Set<string>();
    [...licensees, ...pdvs].forEach((i) => {
      if (i.state) states.add(i.state);
      if (i.city) cities.add(i.city);
    });
    machines.forEach((m) => {
      if (m.location_state) states.add(m.location_state);
      if (m.location_city) cities.add(m.location_city);
    });
    return {
      totalStates: states.size,
      totalCities: cities.size,
      activeLicensees: licensees.filter((l) => l.status === "active").length,
      totalMachines: machines.length,
      activePDVs: pdvs.filter((p) => p.status === "active").length,
      stockAlerts:
        pdvs.filter((p) => p.hasStockAlert).length + machines.filter((m) => m.hasActiveAlert).length,
    };
  }, [licensees, pdvs, machines]);

  // Resumo lateral por estado.
  const byState = useMemo(() => {
    const map = new Map<string, { licensees: number; machines: number; pdvs: number }>();
    const get = (uf: string | null) => {
      if (!uf) return null;
      const e = map.get(uf) || { licensees: 0, machines: 0, pdvs: 0 };
      map.set(uf, e);
      return e;
    };
    licensees.forEach((l) => { const e = get(l.state); if (e) e.licensees += 1; });
    machines.forEach((m) => { const e = get(m.location_state); if (e) e.machines += 1; });
    pdvs.forEach((p) => { const e = get(p.state); if (e) e.pdvs += 1; });
    return Array.from(map.entries()).sort((a, b) => b[1].machines - a[1].machines);
  }, [licensees, machines, pdvs]);

  const hasData = licensees.length + pdvs.length + machines.length > 0;

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1600px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <MapPin className="h-6 w-6 text-primary" /> Mapa Territorial
          </h1>
          <p className="text-muted-foreground mt-1">
            Visualização geográfica do ecossistema Carbo — bases, lojas e máquinas
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* Mapa */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  Mapa Territorial do Ecossistema
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setShowLayerPanel((v) => !v)} className="gap-2">
                  <Layers className="h-4 w-4" /> Camadas
                </Button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-4">
                <div className="flex flex-col items-center p-2 bg-muted/50 rounded-lg">
                  <span className="text-lg font-bold text-foreground">{stats.totalStates}</span>
                  <span className="text-xs text-muted-foreground">Estados</span>
                </div>
                <div className="flex flex-col items-center p-2 bg-muted/50 rounded-lg">
                  <span className="text-lg font-bold text-foreground">{stats.totalCities}</span>
                  <span className="text-xs text-muted-foreground">Cidades</span>
                </div>
                <div className="flex flex-col items-center p-2 bg-green-500/10 rounded-lg">
                  <span className="text-lg font-bold text-green-600">{stats.activeLicensees}</span>
                  <span className="text-xs text-muted-foreground">Licenciados</span>
                </div>
                <div className="flex flex-col items-center p-2 bg-purple-500/10 rounded-lg">
                  <span className="text-lg font-bold text-purple-600">{stats.totalMachines}</span>
                  <span className="text-xs text-muted-foreground">Máquinas</span>
                </div>
                <div className="flex flex-col items-center p-2 bg-amber-500/10 rounded-lg">
                  <span className="text-lg font-bold text-amber-600">{stats.activePDVs}</span>
                  <span className="text-xs text-muted-foreground">PDVs</span>
                </div>
                <div className="flex flex-col items-center p-2 bg-red-500/10 rounded-lg">
                  <span className="text-lg font-bold text-red-600">{stats.stockAlerts}</span>
                  <span className="text-xs text-muted-foreground">Alertas</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0 relative">
              {/* Layer control panel */}
              {showLayerPanel && (
                <div className="absolute top-4 right-4 z-[1000] bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border p-4 min-w-[200px]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-sm">Camadas</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowLayerPanel(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {layers.map((layer) => (
                      <div key={layer.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: layer.color }} />
                          <Label htmlFor={layer.id} className="text-sm cursor-pointer">
                            {layer.label}
                          </Label>
                        </div>
                        <Switch id={layer.id} checked={layer.enabled} onCheckedChange={() => toggleLayer(layer.id)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Estados de loading / vazio sobre o mapa */}
              {isLoading && (
                <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-background/60">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
              {!isLoading && (isError || !hasData) && (
                <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-background/70">
                  <p className="text-sm text-muted-foreground">Sem dados para exibir no mapa.</p>
                </div>
              )}

              {/* Map */}
              <MapContainer center={BRAZIL_CENTER} zoom={BRAZIL_ZOOM} scrollWheelZoom style={{ height: HEIGHT, width: "100%" }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Licenciados */}
                {isOn("licensees") &&
                  licensees.map((l) => {
                    const color = l.status === "active" ? "#3BC770" : "#6B7280";
                    return (
                      <CircleMarker
                        key={l.id}
                        center={[l.lat as number, l.lng as number]}
                        radius={10}
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.75, weight: 2 }}
                      >
                        <Popup>
                          <div className="text-sm space-y-1 min-w-[170px]">
                            <p className="font-bold flex items-center gap-1">🏢 {l.name}</p>
                            <p className="text-muted-foreground text-xs">{l.code}</p>
                            <p className="text-muted-foreground">{l.city}, {l.state}</p>
                            <p className="text-muted-foreground text-xs">Máquinas: {l.totalMachines}</p>
                            <p className="text-xs" style={{ color }}>
                              {l.status === "active" ? "Ativo" : "Inativo"}
                            </p>
                          </div>
                        </Popup>
                        <Tooltip>{l.name}</Tooltip>
                      </CircleMarker>
                    );
                  })}

                {/* PDVs */}
                {isOn("pdvs") &&
                  pdvs.map((p) => {
                    const color = p.hasStockAlert ? "#EF4444" : p.status === "active" ? "#F59E0B" : "#9CA3AF";
                    return (
                      <CircleMarker
                        key={p.id}
                        center={[p.lat as number, p.lng as number]}
                        radius={7}
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.7, weight: 2 }}
                      >
                        <Popup>
                          <div className="text-sm space-y-1 min-w-[160px]">
                            <p className="font-bold flex items-center gap-1">🏪 {p.name}</p>
                            <p className="text-muted-foreground text-xs">{p.pdvCode}</p>
                            <p className="text-muted-foreground">{p.city}, {p.state}</p>
                            <p className="text-muted-foreground text-xs">
                              Estoque: {p.currentStock} / mín {p.minStockThreshold}
                            </p>
                            {p.hasStockAlert && <p className="text-red-500 font-medium text-xs">⚠ Alerta de estoque</p>}
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}

                {/* Máquinas */}
                {isOn("machines") &&
                  machines.map((m) => {
                    const color = m.hasActiveAlert ? "#EF4444" : "#8B5CF6";
                    return (
                      <CircleMarker
                        key={m.id}
                        center={[m.latitude, m.longitude]}
                        radius={5}
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.7, weight: 1.5 }}
                      >
                        <Popup>
                          <div className="text-sm space-y-1 min-w-[160px]">
                            <p className="font-bold flex items-center gap-1">⚙️ {m.machine_id}</p>
                            <p className="text-muted-foreground text-xs">{m.model}</p>
                            <p className="text-muted-foreground">{m.location_city}, {m.location_state}</p>
                            <p className="text-muted-foreground text-xs">{m.licensee_name ?? "—"}</p>
                            {m.estimatedLocation && (
                              <p className="text-muted-foreground text-xs italic">Posição aproximada (cidade)</p>
                            )}
                            {m.hasActiveAlert && <p className="text-red-500 font-medium text-xs">⚠ Alerta ativo</p>}
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}
              </MapContainer>

              {/* Legenda */}
              <div className="absolute bottom-4 left-4 z-[1000] bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Legenda</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {layers
                    .filter((l) => l.enabled)
                    .map((layer) => (
                      <div key={layer.id} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full ring-2 ring-offset-1" style={{ backgroundColor: layer.color }} />
                        <span className="text-xs">{layer.label}</span>
                      </div>
                    ))}
                </div>
                <div className="mt-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                    <span className="text-xs text-red-600">Alerta de estoque/máquina</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Painel resumo lateral */}
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Resumo por Estado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {byState.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">Sem dados.</p>
              )}
              {byState.map(([uf, e]) => (
                <div key={uf} className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                  <span className="font-semibold text-sm">{uf}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3 text-green-500" />{e.licensees}</span>
                    <span className="flex items-center gap-1"><Cpu className="h-3 w-3 text-purple-500" />{e.machines}</span>
                    <span className="flex items-center gap-1"><Store className="h-3 w-3 text-amber-500" />{e.pdvs}</span>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={() => toast("Exportar mapa territorial (em breve)")}
              >
                Exportar visão
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Dados reais do ecossistema Carbo. Itens sem coordenada de cidade conhecida não são plotados.
        </p>
      </div>
    </div>
  );
}
