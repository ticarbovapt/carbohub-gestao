import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { patchLeafletIcons } from "@/lib/mapUtils";

patchLeafletIcons();

// Draggable marker that fires onPositionChange on drag end
function DraggableMarker({
  lat,
  lng,
  onPositionChange,
}: {
  lat: number;
  lng: number;
  onPositionChange: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);

  return (
    <Marker
      ref={markerRef}
      position={[lat, lng]}
      draggable
      eventHandlers={{
        dragend() {
          const marker = markerRef.current;
          if (marker) {
            const pos = marker.getLatLng();
            onPositionChange(pos.lat, pos.lng);
          }
        },
      }}
    />
  );
}

// Recenter map when coords prop changes
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMapEvents({});
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

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
  const [ready, setReady] = useState(false);
  const [markerPos, setMarkerPos] = useState<[number, number]>([latitude, longitude]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Sync marker if geocoded position changes from parent
  useEffect(() => {
    setMarkerPos([latitude, longitude]);
  }, [latitude, longitude]);

  const handleDrag = (lat: number, lng: number) => {
    setMarkerPos([lat, lng]);
    onPositionChange(lat, lng);
  };

  if (!ready) {
    return <div style={{ height: "280px", width: "100%" }} className="bg-muted/30" />;
  }

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={17}
      scrollWheelZoom={false}
      style={{ height: "280px", width: "100%" }}
      key={`pin-${latitude}-${longitude}`}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterMap lat={latitude} lng={longitude} />
      <DraggableMarker
        lat={markerPos[0]}
        lng={markerPos[1]}
        onPositionChange={handleDrag}
      />
    </MapContainer>
  );
}
