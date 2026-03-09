import React, { Suspense } from "react";
import { MapPin, Loader2 } from "lucide-react";

// Lazy-load the entire map inner component to avoid Context.Consumer crash
const LazyMapInner = React.lazy(() => import("./MapPreviewInner"));

interface MapPreviewProps {
  latitude: number | null;
  longitude: number | null;
  isLoading?: boolean;
  label?: string;
  className?: string;
}

class MapErrorBoundary extends React.Component<
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
  componentDidCatch(error: Error) {
    console.warn("MapPreview render error caught:", error.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className={`flex items-center justify-center bg-muted/30 rounded-lg border border-border h-[200px] ${this.props.className || ""}`}>
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <MapPin className="h-8 w-8" />
            <span className="text-sm">Mapa indisponível</span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function MapPreview({ 
  latitude, 
  longitude, 
  isLoading = false,
  label = "Localização",
  className = ""
}: MapPreviewProps) {
  const hasCoordinates = latitude !== null && longitude !== null && !isNaN(latitude) && !isNaN(longitude);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-lg border border-border h-[200px] ${className}`}>
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Buscando localização...</span>
        </div>
      </div>
    );
  }

  if (!hasCoordinates) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-lg border border-border h-[200px] ${className}`}>
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <MapPin className="h-8 w-8" />
          <span className="text-sm text-center px-4">
            Preencha o endereço para visualizar a localização no mapa
          </span>
        </div>
      </div>
    );
  }

  return (
    <MapErrorBoundary className={className}>
      <div className={`rounded-lg overflow-hidden border border-border ${className}`}>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-[200px] bg-muted/30">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <LazyMapInner latitude={latitude} longitude={longitude} label={label} />
        </Suspense>
      </div>
    </MapErrorBoundary>
  );
}
