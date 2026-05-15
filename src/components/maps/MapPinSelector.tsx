import React, { Suspense, useState } from "react";
import { MapPin, Loader2, AlertTriangle } from "lucide-react";

const LazyMapPinSelectorInner = React.lazy(() => import("./MapPinSelectorInner"));

interface MapPinSelectorProps {
  latitude: number | null;
  longitude: number | null;
  address?: string;
  isLoading?: boolean;
  onPositionChange?: (lat: number, lng: number) => void;
  className?: string;
}

class MapPinErrorBoundary extends React.Component<
  { children: React.ReactNode; className?: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; className?: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className={`flex items-center justify-center bg-muted/30 rounded-lg border border-border h-[280px] ${this.props.className || ""}`}>
          <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
            <MapPin className="h-8 w-8" />
            <span>Mapa indisponível</span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function MapPinSelector({
  latitude,
  longitude,
  address,
  isLoading = false,
  onPositionChange,
  className = "",
}: MapPinSelectorProps) {
  const [tooFar, setTooFar] = useState(false);

  const hasCoordinates =
    latitude !== null &&
    longitude !== null &&
    !isNaN(latitude as number) &&
    !isNaN(longitude as number);

  const handlePositionChange = (lat: number, lng: number) => {
    if (!onPositionChange) return;
    if (hasCoordinates) {
      // Haversine distance in meters
      const R = 6371000;
      const dLat = ((lat - latitude!) * Math.PI) / 180;
      const dLng = ((lng - longitude!) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((latitude! * Math.PI) / 180) *
          Math.cos((lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      setTooFar(dist > 50);
    }
    onPositionChange(lat, lng);
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-lg border border-border h-[280px] ${className}`}>
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Buscando localização...</span>
        </div>
      </div>
    );
  }

  if (!hasCoordinates) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-lg border border-border h-[280px] ${className}`}>
        <div className="flex flex-col items-center gap-2 text-muted-foreground text-center px-6">
          <MapPin className="h-8 w-8" />
          <span className="text-sm">
            Preencha o endereço e clique em <strong>Localizar no mapa</strong> para visualizar e ajustar o ponto de entrega.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {tooFar && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            O pin está a mais de 50 m do endereço geocodificado. Verifique se está marcando o local correto.
          </span>
        </div>
      )}
      {address && (
        <p className="text-xs text-muted-foreground px-1">
          <MapPin className="inline h-3 w-3 mr-1" />
          {address} · <span className="font-medium">Arraste o marcador para ajustar o ponto exato</span>
        </p>
      )}
      <MapPinErrorBoundary>
        <div className="rounded-lg overflow-hidden border border-border">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-[280px] bg-muted/30">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <LazyMapPinSelectorInner
              latitude={latitude as number}
              longitude={longitude as number}
              onPositionChange={handlePositionChange}
            />
          </Suspense>
        </div>
      </MapPinErrorBoundary>
    </div>
  );
}
