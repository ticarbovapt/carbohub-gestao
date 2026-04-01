import React, { useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { NAME_TO_SIGLA, SIGLA_TO_NAME, BRAZIL_CENTER, normalizeStateSigla } from "@/lib/mapUtils";

interface LicenseeMiniMapProps {
  coverageStates?: string[];
  state?: string;
  className?: string;
}

export function LicenseeMiniMap({ coverageStates = [], state, className = "" }: LicenseeMiniMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);

  // Combine coverage states with the licensee's own state
  const allActiveStates = useMemo(() => {
    const states = new Set<string>();
    coverageStates.forEach((s) => {
      const sigla = normalizeStateSigla(s);
      if (sigla) states.add(sigla);
    });
    if (state) {
      const sigla = normalizeStateSigla(state);
      if (sigla) states.add(sigla);
    }
    return Array.from(states);
  }, [coverageStates, state]);

  const activeStatesKey = allActiveStates.sort().join(",");

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current) return;

    // Clean up if already exists
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Initialize mini map (no controls, minimal interaction)
    const map = L.map(mapRef.current, {
      center: BRAZIL_CENTER,
      zoom: 3,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });

    // Light tile layer
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png").addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update GeoJSON layer when states change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove existing layer
    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    // Fetch GeoJSON and add layer
    fetch("/data/brazil-states.geojson")
      .then((res) => res.json())
      .then((geoData) => {
        const layer = L.geoJSON(geoData, {
          style: (feature) => {
            const stateName = feature?.properties?.name;
            const stateSigla = NAME_TO_SIGLA[stateName] || "";
            const isActive = allActiveStates.includes(stateSigla);
            
            return {
              fillColor: isActive ? "#3BC770" : "#F3F4F6",
              fillOpacity: isActive ? 0.6 : 0.3,
              color: isActive ? "#22C55E" : "#D1D5DB",
              weight: isActive ? 1.5 : 0.5,
            };
          },
        });

        layer.addTo(map);
        geoJsonLayerRef.current = layer;
      })
      .catch(console.error);
  }, [activeStatesKey, allActiveStates]);

  if (allActiveStates.length === 0) {
    return (
      <div className={`bg-muted/30 rounded-lg flex items-center justify-center ${className}`}>
        <span className="text-xs text-muted-foreground">Sem cobertura</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border border-border ${className}`}>
      <div ref={mapRef} className="w-full h-full" style={{ minHeight: 80 }} />
      {/* Overlay with state count */}
      <div className="absolute bottom-1 right-1 bg-emerald-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
        {allActiveStates.length} UF{allActiveStates.length > 1 ? "s" : ""}
      </div>
    </div>
  );
}
