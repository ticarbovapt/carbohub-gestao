import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { ArrowLeft, MapPin } from "lucide-react";
import { useBoard, useBoardLive, type CardSummary } from "@/hooks/useBoards";
import { CardModal } from "@/components/board/CardModal";
import { ViewSwitcher } from "@/components/board/ViewSwitcher";

// Fix clássico do ícone default do Leaflet com bundlers (Vite): aponta os PNGs
// importados em vez de caminhos relativos quebrados.
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

// Ajusta o zoom pra caber todos os pontos.
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useMemo(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);
  return null;
}

export default function BoardMap() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useBoard(boardId ?? null);
  useBoardLive(boardId ?? null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const located = useMemo(
    () => (data?.cards ?? []).filter((c) => c.location_lat != null && c.location_lng != null),
    [data?.cards],
  );
  const points = located.map((c) => [c.location_lat!, c.location_lng!] as [number, number]);
  const semLoc = (data?.cards.length ?? 0) - located.length;

  if (!boardId) return null;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Carregando mapa…</div>;
  const { board } = data;
  const center: [number, number] = points[0] ?? [-14.235, -51.925]; // Brasil

  return (
    <div className="fixed inset-0 top-14 flex flex-col bg-background">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-wrap">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> {board.title}</h1>
        <ViewSwitcher boardId={boardId} current="mapa" />
        <span className="ml-auto text-xs text-muted-foreground">{located.length} com localização{semLoc > 0 ? ` · ${semLoc} sem localização` : ""}</span>
      </div>

      <div className="flex-1 relative">
        {located.length === 0 && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
            <p className="bg-card/90 border border-border rounded-lg px-4 py-2 text-sm text-muted-foreground">Nenhum cartão com localização — defina um endereço no cartão.</p>
          </div>
        )}
        <MapContainer center={center} zoom={points.length ? 12 : 4} className="h-full w-full" style={{ background: "#e5e7eb" }}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBounds points={points} />
          {located.map((c: CardSummary) => (
            <Marker key={c.id} position={[c.location_lat!, c.location_lng!]}>
              <Popup>
                <div className="space-y-1">
                  <p className="font-semibold text-sm">{c.title}</p>
                  {c.location_name && <p className="text-xs text-muted-foreground">{c.location_name}</p>}
                  <button onClick={() => setOpenCardId(c.mirrorOf ?? c.id)} className="text-xs text-primary underline">Abrir cartão</button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {openCardId && <CardModal cardId={openCardId} boardId={boardId} labels={data.labels} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
