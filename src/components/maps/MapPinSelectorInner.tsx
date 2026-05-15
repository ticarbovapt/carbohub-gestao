import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { patchLeafletIcons } from "@/lib/mapUtils";

patchLeafletIcons();

interface MapPinSelectorInnerProps {
  latitude: number;
  longitude: number;
  onPositionChange: (lat: number, lng: number) => void;
}

export default function MapPinSelectorInner({
  latitude,
  longitude,
  onPositionChange,
}: MapPinSelectorInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Mount map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
      [latitude, longitude],
      17
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const marker = L.marker([latitude, longitude], { draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onPositionChange(pos.lat, pos.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when coords change from parent (new geocode)
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    mapRef.current.setView([latitude, longitude], 17, { animate: true });
    markerRef.current.setLatLng([latitude, longitude]);
  }, [latitude, longitude]);

  return <div ref={containerRef} style={{ height: "280px", width: "100%" }} />;
}
