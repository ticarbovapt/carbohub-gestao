import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Building2, Cpu, Calendar, MapPin } from "lucide-react";
import type { GeographicData } from "@/hooks/useEcosystemTimeline";

// Fix for default marker icons in Leaflet with Vite
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Custom icons for different types
const createCustomIcon = (color: string) =>
  new L.DivIcon({
    className: "custom-marker",
    html: `<div style="\
      background-color: ${color};\
      width: 24px;\
      height: 24px;\
      border-radius: 50% 50% 50% 0;\
      transform: rotate(-45deg);\
      border: 2px solid white;\
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);\
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });

const licenseeIcon = createCustomIcon("#3BC770");
const machineIcon = createCustomIcon("#4FA4E8");
const eventIcon = createCustomIcon("#F59E0B");

// Brazil state coordinates for approximate positioning
const STATE_COORDS: Record<string, [number, number]> = {
  AC: [-9.0238, -70.812],
  AL: [-9.5713, -36.782],
  AP: [0.902, -52.003],
  AM: [-3.4168, -65.8561],
  BA: [-12.5797, -41.7007],
  CE: [-5.4984, -39.3206],
  DF: [-15.8267, -47.9218],
  ES: [-19.1834, -40.3089],
  GO: [-15.827, -49.8362],
  MA: [-4.9609, -45.2744],
  MT: [-12.6819, -56.9211],
  MS: [-20.7722, -54.7852],
  MG: [-18.5122, -44.555],
  PA: [-3.4168, -52.2167],
  PB: [-7.24, -36.782],
  PR: [-25.2521, -52.0215],
  PE: [-8.8137, -36.9541],
  PI: [-7.7183, -42.7289],
  RJ: [-22.2587, -42.6592],
  RN: [-5.4026, -36.9541],
  RS: [-30.0346, -51.2177],
  RO: [-11.5057, -63.5806],
  RR: [2.7376, -62.0751],
  SC: [-27.2423, -50.2189],
  SP: [-23.5505, -46.6333],
  SE: [-10.9091, -37.0677],
  TO: [-10.1753, -48.2982],
};

interface MapCenterProps {
  bounds: L.LatLngBoundsExpression | null;
}

function MapCenter({ bounds }: MapCenterProps) {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, bounds]);

  return null;
}

interface GeographicMapProps {
  data: GeographicData[];
  title: string;
  description: string;
  type: "licensee" | "machine" | "event" | "all";
  isLoading?: boolean;
}

export function GeographicMap({ data, title, description, type, isLoading }: GeographicMapProps) {
  // Assign coordinates to items based on state/city or existing lat/lng
  const mappedData = useMemo(() => {
    return data
      .map((item) => {
        // If already has coordinates, use them
        if (item.lat && item.lng) {
          return { ...item, lat: item.lat, lng: item.lng };
        }
        // Otherwise, use state coordinates with some randomization
        if (item.state && STATE_COORDS[item.state]) {
          const [baseLat, baseLng] = STATE_COORDS[item.state];
          // Add small random offset to avoid overlapping
          const offset = () => (Math.random() - 0.5) * 2;
          return {
            ...item,
            lat: baseLat + offset(),
            lng: baseLng + offset(),
          };
        }
        return null;
      })
      .filter((item): item is GeographicData & { lat: number; lng: number } => item !== null);
  }, [data]);

  const bounds = useMemo(() => {
    if (mappedData.length === 0) return null;
    const points = mappedData.map((d) => [d.lat, d.lng] as [number, number]);
    return L.latLngBounds(points);
  }, [mappedData]);

  const getIcon = (itemType: string) => {
    switch (itemType) {
      case "licensee":
        return licenseeIcon;
      case "machine":
        return machineIcon;
      case "event":
        return eventIcon;
      default:
        return licenseeIcon;
    }
  };

  const getTypeIcon = (itemType: string) => {
    switch (itemType) {
      case "licensee":
        return <Building2 className="h-4 w-4" />;
      case "machine":
        return <Cpu className="h-4 w-4" />;
      case "event":
        return <Calendar className="h-4 w-4" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

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
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-carbo-green" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {mappedData.length > 0 ? (
          <div className="h-[400px] rounded-xl overflow-hidden border border-border">
            <MapContainer
              center={[-14.235, -51.9253]}
              zoom={4}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapCenter bounds={bounds} />
              {mappedData.map((item) => (
                <Marker key={`${item.type}-${item.id}`} position={[item.lat, item.lng]} icon={getIcon(item.type)}>
                  <Popup>
                    <div className="p-2 min-w-[200px]">
                      <div className="flex items-center gap-2 mb-2">
                        {getTypeIcon(item.type)}
                        <span className="font-semibold text-sm">{item.name}</span>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {item.city && item.state && (
                          <p>
                            {item.city}, {item.state}
                          </p>
                        )}
                        {item.details && <p>{item.details}</p>}
                        <div className="pt-1">
                          <CarboBadge variant={getStatusVariant(item.status)} size="sm" dot>
                            {item.status}
                          </CarboBadge>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        ) : (
          <div className="h-[400px] flex items-center justify-center bg-muted/30 rounded-xl border border-border">
            <div className="text-center text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nenhum dado geográfico disponível</p>
              <p className="text-xs mt-1">Cadastre itens com localização para visualizar no mapa</p>
            </div>
          </div>
        )}

        {/* Legend */}
        {(type === "all" || mappedData.length > 0) && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t">
            <span className="text-xs text-muted-foreground">Legenda:</span>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#3BC770]" />
              <span className="text-xs">Licenciados</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#4FA4E8]" />
              <span className="text-xs">Máquinas</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#F59E0B]" />
              <span className="text-xs">Eventos</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
