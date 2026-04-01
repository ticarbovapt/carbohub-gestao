import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { patchLeafletIcons } from "@/lib/mapUtils";

patchLeafletIcons();

interface MapPreviewInnerProps {
  latitude: number;
  longitude: number;
  label: string;
}

export default function MapPreviewInner({ latitude, longitude, label }: MapPreviewInnerProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!ready) {
    return <div style={{ height: "200px", width: "100%" }} className="bg-muted/30" />;
  }

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={15}
      scrollWheelZoom={false}
      style={{ height: "200px", width: "100%" }}
      key={`${latitude}-${longitude}`}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]}>
        <Popup>{label}</Popup>
      </Marker>
    </MapContainer>
  );
}
