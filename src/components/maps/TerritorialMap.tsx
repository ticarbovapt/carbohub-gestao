import React, { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  MapPin,
  Building2,
  Store,
  Wrench,
  Cpu,
  AlertTriangle,
  Layers,
  X,
} from "lucide-react";
import { useTerritorialData, type TerritorialFilters } from "@/hooks/useTerritorialData";
import { cn } from "@/lib/utils";
import {
  patchLeafletIcons,
  STATE_COORDS,
  NAME_TO_SIGLA,
  BRAZIL_CENTER,
  BRAZIL_ZOOM,
  createEmojiIcon,
  choroplethStyle,
} from "@/lib/mapUtils";

patchLeafletIcons();

const icons = {
  licensee: createEmojiIcon("#3BC770", "🏢"),
  licenseeInactive: createEmojiIcon("#6B7280", "🏢"),
  pdv: createEmojiIcon("#F59E0B", "🏪"),
  pdvAlert: createEmojiIcon("#EF4444", "🏪"),
  os: createEmojiIcon("#4FA4E8", "📋"),
  osUrgent: createEmojiIcon("#EF4444", "⚠️"),
  machine: createEmojiIcon("#8B5CF6", "⚙️"),
  machineAlert: createEmojiIcon("#EF4444", "⚙️"),
};

interface LayerConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  enabled: boolean;
}

interface TerritorialMapProps {
  className?: string;
  height?: string;
  showFilters?: boolean;
  showLegend?: boolean;
  showStats?: boolean;
  initialLayers?: string[];
}

export function TerritorialMap({
  className,
  height = "500px",
  showFilters = true,
  showLegend = true,
  showStats = true,
  initialLayers = ["licensees", "pdvs", "os", "machines"],
}: TerritorialMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  const [filters, setFilters] = useState<TerritorialFilters>({
    states: [],
    cities: [],
    status: [],
    operationType: [],
  });
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerConfig[]>([
    { id: "licensees", label: "Licenciados", icon: <Building2 className="h-4 w-4" />, color: "#3BC770", enabled: initialLayers.includes("licensees") },
    { id: "pdvs", label: "Insumos", icon: <Store className="h-4 w-4" />, color: "#F59E0B", enabled: initialLayers.includes("pdvs") },
    { id: "os", label: "Operações", icon: <Wrench className="h-4 w-4" />, color: "#4FA4E8", enabled: initialLayers.includes("os") },
    { id: "machines", label: "Máquinas", icon: <Cpu className="h-4 w-4" />, color: "#8B5CF6", enabled: initialLayers.includes("machines") },
  ]);
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  const { data, isLoading, error } = useTerritorialData(
    filters.states.length > 0 || filters.cities.length > 0 || filters.status.length > 0
      ? filters
      : undefined
  );

  const toggleLayer = (layerId: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, enabled: !l.enabled } : l))
    );
  };

  // Calculate active states for choropleth
  const activeStates = useMemo(() => {
    if (!data) return new Set<string>();
    const states = new Set<string>();
    if (layers.find((l) => l.id === "licensees")?.enabled) {
      data.licensees.forEach((l) => l.state && states.add(l.state));
    }
    if (layers.find((l) => l.id === "pdvs")?.enabled) {
      data.pdvs.forEach((p) => p.state && states.add(p.state));
    }
    if (layers.find((l) => l.id === "os")?.enabled) {
      data.serviceOrders.forEach((os) => os.state && states.add(os.state));
    }
    if (layers.find((l) => l.id === "machines")?.enabled) {
      data.machines.forEach((m) => m.state && states.add(m.state));
    }
    return states;
  }, [data, layers]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || isLoading) return;

    const map = L.map(mapRef.current, {
      center: BRAZIL_CENTER,
      zoom: BRAZIL_ZOOM,
      scrollWheelZoom: true,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Markers layer group
    markersRef.current = L.layerGroup().addTo(map);

    // Load GeoJSON
    fetch("/data/brazil-states.geojson")
      .then((res) => res.json())
      .then((geoData) => {
        const geoJsonLayer = L.geoJSON(geoData, {
          style: (feature) => {
            const stateSigla = NAME_TO_SIGLA[feature?.properties?.name] || "";
            return choroplethStyle(stateSigla, activeStates, selectedState);
          },
          onEachFeature: (feature, layer) => {
            const stateName = feature?.properties?.name;
            const stateSigla = NAME_TO_SIGLA[stateName] || "";
            const isActive = activeStates.has(stateSigla);

            layer.on({
              click: () => {
                if (isActive) {
                  setSelectedState((prev) => (prev === stateSigla ? null : stateSigla));
                  setFilters((prev) => ({
                    ...prev,
                    states: prev.states.includes(stateSigla)
                      ? prev.states.filter((s) => s !== stateSigla)
                      : [stateSigla],
                  }));
                }
              },
              mouseover: (e) => {
                e.target.setStyle({ weight: 3, fillOpacity: isActive ? 0.5 : 0.2 });
              },
              mouseout: (e) => {
                geoJsonLayer.resetStyle(e.target);
              },
            });

            layer.bindTooltip(
              `<strong>${stateName} (${stateSigla})</strong><br/>
               <span style="color: ${isActive ? "#22C55E" : "#6B7280"}">
                 ${isActive ? "✓ Com operação" : "Sem operação"}
               </span>`,
              { sticky: true }
            );
          },
        });

        geoJsonRef.current = geoJsonLayer;
        geoJsonLayer.addTo(map);
      });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current = null;
        geoJsonRef.current = null;
      }
    };
  }, [isLoading]);

  // Update GeoJSON styles when active states change
  useEffect(() => {
    if (!geoJsonRef.current) return;

    geoJsonRef.current.setStyle((feature) => {
      const stateSigla = NAME_TO_SIGLA[feature?.properties?.name] || "";
      return choroplethStyle(stateSigla, activeStates, selectedState);
    });
  }, [activeStates, selectedState]);

  // Update markers when data or layers change
  useEffect(() => {
    if (!markersRef.current || !data) return;

    markersRef.current.clearLayers();

    const addMarker = (
      lat: number | null,
      lng: number | null,
      state: string | null,
      icon: L.DivIcon,
      popupContent: string
    ) => {
      let finalLat = lat;
      let finalLng = lng;

      if (!finalLat || !finalLng) {
        if (state && STATE_COORDS[state]) {
          const [baseLat, baseLng] = STATE_COORDS[state];
          finalLat = baseLat + (Math.random() - 0.5) * 2;
          finalLng = baseLng + (Math.random() - 0.5) * 2;
        } else {
          return;
        }
      }

      const marker = L.marker([finalLat, finalLng], { icon });
      marker.bindPopup(popupContent, { maxWidth: 300 });
      markersRef.current?.addLayer(marker);
    };

    // Add licensees
    if (layers.find((l) => l.id === "licensees")?.enabled) {
      data.licensees.forEach((l) => {
        const icon = l.status === "active" ? icons.licensee : icons.licenseeInactive;
        addMarker(
          l.lat,
          l.lng,
          l.state,
          icon,
          `<div class="p-2">
            <div class="font-bold text-sm flex items-center gap-2">
              <span>🏢</span> ${l.name}
            </div>
            <div class="text-xs text-gray-600 mt-1">
              <p><strong>Código:</strong> ${l.code}</p>
              ${l.city && l.state ? `<p><strong>Local:</strong> ${l.city}, ${l.state}</p>` : ""}
              <p><strong>Máquinas:</strong> ${l.totalMachines}</p>
              <p><strong>Status:</strong> <span style="color: ${l.status === "active" ? "#22C55E" : "#6B7280"}">${l.status}</span></p>
            </div>
          </div>`
        );
      });
    }

    // Add PDVs
    if (layers.find((l) => l.id === "pdvs")?.enabled) {
      data.pdvs.forEach((p) => {
        const icon = p.hasStockAlert ? icons.pdvAlert : icons.pdv;
        const stockPercent = Math.round((p.currentStock / p.minStockThreshold) * 100);
        addMarker(
          p.lat,
          p.lng,
          p.state,
          icon,
          `<div class="p-2">
            <div class="font-bold text-sm flex items-center gap-2">
              <span>🏪</span> ${p.name}
            </div>
            <div class="text-xs text-gray-600 mt-1">
              <p><strong>Código:</strong> ${p.pdvCode}</p>
              ${p.city && p.state ? `<p><strong>Local:</strong> ${p.city}, ${p.state}</p>` : ""}
              <p><strong>Estoque:</strong> ${p.currentStock} unid. (${stockPercent}%)</p>
              ${p.hasStockAlert ? '<p style="color: #EF4444"><strong>⚠️ Alerta de estoque baixo</strong></p>' : ""}
            </div>
          </div>`
        );
      });
    }

    // Add OS
    if (layers.find((l) => l.id === "os")?.enabled) {
      data.serviceOrders.forEach((os) => {
        const icon = os.slaBreach ? icons.osUrgent : icons.os;
        addMarker(
          os.lat,
          os.lng,
          os.state,
          icon,
          `<div class="p-2">
            <div class="font-bold text-sm flex items-center gap-2">
              <span>📋</span> ${os.osNumber}
            </div>
            <div class="text-xs text-gray-600 mt-1">
              <p><strong>Título:</strong> ${os.title}</p>
              ${os.city && os.state ? `<p><strong>Local:</strong> ${os.city}, ${os.state}</p>` : ""}
              <p><strong>Departamento:</strong> ${os.currentDepartment}</p>
              <p><strong>Status:</strong> ${os.status}</p>
              ${os.slaBreach ? '<p style="color: #EF4444"><strong>⚠️ SLA estourado</strong></p>' : ""}
            </div>
          </div>`
        );
      });
    }

    // Add machines
    if (layers.find((l) => l.id === "machines")?.enabled) {
      data.machines.forEach((m) => {
        const icon = m.hasActiveAlert ? icons.machineAlert : icons.machine;
        addMarker(
          m.lat,
          m.lng,
          m.state,
          icon,
          `<div class="p-2">
            <div class="font-bold text-sm flex items-center gap-2">
              <span>⚙️</span> ${m.machineId}
            </div>
            <div class="text-xs text-gray-600 mt-1">
              <p><strong>Modelo:</strong> ${m.model}</p>
              ${m.city && m.state ? `<p><strong>Local:</strong> ${m.city}, ${m.state}</p>` : ""}
              <p><strong>Status:</strong> ${m.status}</p>
              ${m.hasActiveAlert ? '<p style="color: #EF4444"><strong>⚠️ Alerta ativo</strong></p>' : ""}
            </div>
          </div>`
        );
      });
    }
  }, [data, layers]);

  const clearFilters = () => {
    setFilters({ states: [], cities: [], status: [], operationType: [] });
    setSelectedState(null);
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full rounded-xl" style={{ height }} />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center" style={{ height }}>
          <p className="text-destructive">Erro ao carregar dados territoriais</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            Mapa Territorial do Ecossistema
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLayerPanel(!showLayerPanel)}
              className="gap-2"
            >
              <Layers className="h-4 w-4" />
              Camadas
            </Button>
            {(filters.states.length > 0 || filters.cities.length > 0) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-4 w-4" />
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Stats row */}
        {showStats && data?.stats && (
          <div className="grid grid-cols-4 md:grid-cols-7 gap-2 mt-4">
            <div className="flex flex-col items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-lg font-bold text-foreground">{data.stats.totalStates}</span>
              <span className="text-xs text-muted-foreground">Estados</span>
            </div>
            <div className="flex flex-col items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-lg font-bold text-foreground">{data.stats.totalCities}</span>
              <span className="text-xs text-muted-foreground">Cidades</span>
            </div>
            <div className="flex flex-col items-center p-2 bg-blue-500/10 rounded-lg">
              <span className="text-lg font-bold text-blue-600">{data.stats.activeOS}</span>
              <span className="text-xs text-muted-foreground">OP Ativas</span>
            </div>
            <div className="flex flex-col items-center p-2 bg-red-500/10 rounded-lg">
              <span className="text-lg font-bold text-red-600">{data.stats.slaBreaches}</span>
              <span className="text-xs text-muted-foreground">SLA Atrasado</span>
            </div>
            <div className="flex flex-col items-center p-2 bg-green-500/10 rounded-lg">
              <span className="text-lg font-bold text-green-600">{data.stats.activeLicensees}</span>
              <span className="text-xs text-muted-foreground">Licenciados</span>
            </div>
            <div className="flex flex-col items-center p-2 bg-amber-500/10 rounded-lg">
              <span className="text-lg font-bold text-amber-600">{data.stats.activePDVs}</span>
              <span className="text-xs text-muted-foreground">PDVs</span>
            </div>
            <div className="flex flex-col items-center p-2 bg-red-500/10 rounded-lg">
              <span className="text-lg font-bold text-red-600">{data.stats.stockAlerts}</span>
              <span className="text-xs text-muted-foreground">Alertas</span>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0 relative">
        {/* Layer control panel */}
        {showLayerPanel && (
          <div className="absolute top-4 right-4 z-[1000] bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border p-4 min-w-[200px]">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm">Camadas</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setShowLayerPanel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              {layers.map((layer) => (
                <div key={layer.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: layer.color }}
                    />
                    <Label htmlFor={layer.id} className="text-sm cursor-pointer">
                      {layer.label}
                    </Label>
                  </div>
                  <Switch
                    id={layer.id}
                    checked={layer.enabled}
                    onCheckedChange={() => toggleLayer(layer.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* State filter badge */}
        {selectedState && (
          <div className="absolute top-4 left-4 z-[1000]">
            <Badge variant="secondary" className="gap-2 px-3 py-1.5">
              <MapPin className="h-3 w-3" />
              Filtro: {selectedState}
              <button onClick={clearFilters} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          </div>
        )}

        {/* Map container */}
        <div ref={mapRef} style={{ height, width: "100%" }} />

        {/* Legend */}
        {showLegend && (
          <div className="absolute bottom-4 left-4 z-[1000] bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Legenda
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {layers.filter((l) => l.enabled).map((layer) => (
                <div key={layer.id} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full ring-2 ring-offset-1"
                    style={{ backgroundColor: layer.color }}
                  />
                  <span className="text-xs">{layer.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="text-xs text-red-600">Alerta/SLA</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
