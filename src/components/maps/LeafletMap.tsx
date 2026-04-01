import React, { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Flag, Building, Map } from "lucide-react";
import type { GeographicData } from "@/hooks/useEcosystemTimeline";
import {
  patchLeafletIcons,
  STATE_COORDS,
  STATE_CAPITALS,
  NAME_TO_SIGLA,
  BRAZIL_CENTER,
  BRAZIL_ZOOM,
  createMarkerIcon,
  choroplethStyle,
} from "@/lib/mapUtils";

patchLeafletIcons();

const licenseeIcon = createMarkerIcon("#3BC770");
const machineIcon = createMarkerIcon("#4FA4E8");
const eventIcon = createMarkerIcon("#F59E0B");

interface LeafletMapProps {
  data: GeographicData[];
  title: string;
  description: string;
  type: "licensee" | "machine" | "event" | "all";
  isLoading?: boolean;
  onStateClick?: (stateSigla: string) => void;
  selectedState?: string | null;
}

const getStatusVariant = (status: string): "success" | "warning" | "destructive" | "secondary" => {
  switch (status) {
    case "active":
    case "operational":
    case "scheduled":
      return "success";
    case "pending":
    case "maintenance":
    case "in_progress":
      return "warning";
    case "inactive":
    case "offline":
    case "cancelled":
      return "destructive";
    default:
      return "secondary";
  }
};

export function LeafletMap({ data, title, description, type, isLoading, onStateClick, selectedState }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const mappedData = useMemo(() => {
    return data
      .map((item) => {
        if (item.lat && item.lng) return { ...item, lat: item.lat, lng: item.lng };
        if (item.state && STATE_COORDS[item.state]) {
          const [baseLat, baseLng] = STATE_COORDS[item.state];
          const offset = () => (Math.random() - 0.5) * 2;
          return { ...item, lat: baseLat + offset(), lng: baseLng + offset() };
        }
        return null;
      })
      .filter((item): item is GeographicData & { lat: number; lng: number } => item !== null);
  }, [data]);

  const stats = useMemo(() => {
    const activeStates = new Set<string>();
    const activeCities = new Set<string>();
    const activeCapitals = new Set<string>();

    mappedData.forEach((item) => {
      if (item.state) activeStates.add(item.state);
      if (item.city) {
        activeCities.add(item.city);
        Object.entries(STATE_CAPITALS).forEach(([, capital]) => {
          if (item.city?.toLowerCase().includes(capital.toLowerCase()) ||
              capital.toLowerCase().includes(item.city?.toLowerCase() || "")) {
            activeCapitals.add(capital);
          }
        });
      }
    });

    return {
      states: activeStates.size,
      cities: activeCities.size,
      capitals: activeCapitals.size,
      activeStatesList: Array.from(activeStates),
    };
  }, [mappedData]);

  const getIcon = (itemType: string) => {
    switch (itemType) {
      case "licensee": return licenseeIcon;
      case "machine": return machineIcon;
      case "event": return eventIcon;
      default: return licenseeIcon;
    }
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || isLoading) return;

    const map = L.map(mapRef.current, {
      center: BRAZIL_CENTER,
      zoom: BRAZIL_ZOOM,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);

    fetch("/data/brazil-states.geojson")
      .then((res) => res.json())
      .then((geoData) => {
        const geoJsonLayer = L.geoJSON(geoData, {
          style: (feature) => {
            const stateSigla = NAME_TO_SIGLA[feature?.properties?.name] || "";
            return choroplethStyle(stateSigla, stats.activeStatesList, selectedState);
          },
          onEachFeature: (feature, layer) => {
            const stateName = feature?.properties?.name;
            const stateSigla = NAME_TO_SIGLA[stateName] || "";
            const isActive = stats.activeStatesList.includes(stateSigla);

            layer.on({
              click: () => { if (onStateClick && isActive) onStateClick(stateSigla); },
              mouseover: (e) => {
                e.target.setStyle({ weight: 3, fillOpacity: selectedState === stateSigla ? 0.8 : isActive ? 0.7 : 0.3 });
                e.target.bringToFront();
              },
              mouseout: (e) => { geoJsonLayer.resetStyle(e.target); },
            });

            layer.bindTooltip(`
              <div class="font-semibold">${stateName} (${stateSigla})</div>
              <div class="text-xs ${isActive ? "text-emerald-600" : "text-gray-500"}">
                ${isActive ? "✓ Operação ativa" : "Sem operação"}
                ${onStateClick && isActive ? "<br><span class='text-amber-600'>Clique para filtrar</span>" : ""}
              </div>
            `, { sticky: true, className: "map-tooltip" });
          },
        });

        geoJsonRef.current = geoJsonLayer;
        geoJsonLayer.addTo(map);
      })
      .catch((err) => console.error("Failed to load GeoJSON:", err));

    mapInstanceRef.current = map;
    setMapReady(true);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        geoJsonRef.current = null;
      }
    };
  }, [isLoading, stats.activeStatesList, onStateClick, selectedState]);

  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady) return;
    const map = mapInstanceRef.current;

    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    mappedData.forEach((item) => {
      const marker = L.marker([item.lat, item.lng], { icon: getIcon(item.type) });
      marker.bindPopup(`
        <div class="p-2 min-w-[200px]">
          <div class="font-semibold text-sm mb-2">${item.name}</div>
          <div class="text-xs text-gray-600 space-y-1">
            ${item.city && item.state ? `<p>${item.city}, ${item.state}</p>` : ""}
            ${item.details ? `<p>${item.details}</p>` : ""}
            <p class="font-medium">${item.status}</p>
          </div>
        </div>
      `);
      marker.addTo(map);
    });

    if (mappedData.length > 0) {
      const points = mappedData.map((d) => [d.lat, d.lng] as [number, number]);
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
    }
  }, [mappedData, mapReady]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <div className="p-2 bg-carbo-green/10 rounded-lg">
                <MapPin className="h-5 w-5 text-carbo-green" />
              </div>
              {title}
            </CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
          <div className="flex flex-col items-center justify-center p-3 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 rounded-xl border border-emerald-500/20 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-emerald-500/10">
            <Flag className="h-5 w-5 text-emerald-500 mb-1" />
            <span className="text-2xl font-bold text-emerald-600">{stats.states}</span>
            <span className="text-xs text-muted-foreground font-medium">Estados</span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-gradient-to-br from-blue-500/15 to-blue-500/5 rounded-xl border border-blue-500/20 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/10">
            <Building className="h-5 w-5 text-blue-500 mb-1" />
            <span className="text-2xl font-bold text-blue-600">{stats.capitals}</span>
            <span className="text-xs text-muted-foreground font-medium">Capitais</span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-gradient-to-br from-amber-500/15 to-amber-500/5 rounded-xl border border-amber-500/20 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/10">
            <Map className="h-5 w-5 text-amber-500 mb-1" />
            <span className="text-2xl font-bold text-amber-600">{stats.cities}</span>
            <span className="text-xs text-muted-foreground font-medium">Cidades</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {mappedData.length > 0 ? (
          <div className="relative">
            <div ref={mapRef} className="h-[420px] w-full" style={{ zIndex: 0 }} />

            <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border border-border p-3 z-[1000]">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Legenda</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#3BC770] ring-2 ring-[#3BC770]/20" />
                  <span className="text-xs font-medium">Licenciados</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#4FA4E8] ring-2 ring-[#4FA4E8]/20" />
                  <span className="text-xs font-medium">Máquinas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#F59E0B] ring-2 ring-[#F59E0B]/20" />
                  <span className="text-xs font-medium">Eventos</span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Estados</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-3 rounded-sm bg-[#3BC770]/40 border border-[#3BC770]" />
                    <span className="text-xs">Com operação</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-3 rounded-sm bg-gray-200/40 border border-gray-300" />
                    <span className="text-xs">Sem operação</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000]">
              {selectedState && (
                <button
                  onClick={() => onStateClick?.(selectedState)}
                  className="bg-amber-500 text-white px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 hover:bg-amber-600 transition-colors"
                >
                  <span className="text-xs font-bold">Filtro: {selectedState}</span>
                  <span className="text-xs">&#x2715;</span>
                </button>
              )}
              {stats.states > 0 && (
                <div className="bg-emerald-500 text-white px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  <span className="text-xs font-bold">{stats.states} estados ativos</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-[420px] flex items-center justify-center bg-gradient-to-br from-muted/30 to-muted/10 m-4 rounded-xl border-2 border-dashed border-muted">
            <div className="text-center p-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-muted/50 rounded-full flex items-center justify-center">
                <MapPin className="h-8 w-8 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Nenhum dado geográfico disponível</p>
              <p className="text-xs text-muted-foreground/70 mt-1 max-w-[250px]">
                Cadastre licenciados, máquinas ou eventos com localização para visualizar no mapa
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
