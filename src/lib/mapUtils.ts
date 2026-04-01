import L from "leaflet";

// Fix for default marker icons in Leaflet with Vite
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Run once to patch Leaflet defaults
let _patched = false;
export function patchLeafletIcons() {
  if (_patched) return;
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  });
  _patched = true;
}

// Brazil state coordinates (centroids)
export const STATE_COORDS: Record<string, [number, number]> = {
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

// Brazilian state capitals
export const STATE_CAPITALS: Record<string, string> = {
  AC: "Rio Branco", AL: "Maceio", AP: "Macapa", AM: "Manaus", BA: "Salvador",
  CE: "Fortaleza", DF: "Brasilia", ES: "Vitoria", GO: "Goiania", MA: "Sao Luis",
  MT: "Cuiaba", MS: "Campo Grande", MG: "Belo Horizonte", PA: "Belem",
  PB: "Joao Pessoa", PR: "Curitiba", PE: "Recife", PI: "Teresina", RJ: "Rio de Janeiro",
  RN: "Natal", RS: "Porto Alegre", RO: "Porto Velho", RR: "Boa Vista",
  SC: "Florianopolis", SP: "Sao Paulo", SE: "Aracaju", TO: "Palmas",
};

// State name ↔ sigla mapping
export const NAME_TO_SIGLA: Record<string, string> = {
  "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM",
  "Bahia": "BA", "Ceará": "CE", "Distrito Federal": "DF", "Espírito Santo": "ES",
  "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS",
  "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR",
  "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
  "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR", "Santa Catarina": "SC",
  "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO",
};

export const SIGLA_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_TO_SIGLA).map(([name, sigla]) => [sigla, name])
);

// Default map center (Brazil)
export const BRAZIL_CENTER: [number, number] = [-14.235, -51.9253];
export const BRAZIL_ZOOM = 4;

// Marker icon factory — teardrop shape
export function createMarkerIcon(color: string) {
  return new L.DivIcon({
    className: "custom-marker",
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
}

// Marker icon factory — circle with emoji
export function createEmojiIcon(color: string, emoji: string) {
  return new L.DivIcon({
    className: "custom-territorial-marker",
    html: `<div style="
      background-color: ${color};
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 14px;
    ">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

// Resolve lat/lng from explicit coordinates or state fallback
export function resolveCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
  state: string | null | undefined,
): [number, number] | null {
  if (lat && lng) return [lat, lng];
  if (state && STATE_COORDS[state]) {
    const [baseLat, baseLng] = STATE_COORDS[state];
    return [baseLat + (Math.random() - 0.5) * 2, baseLng + (Math.random() - 0.5) * 2];
  }
  return null;
}

// GeoJSON choropleth style helper
export function choroplethStyle(
  stateSigla: string,
  activeStates: Set<string> | string[],
  selectedState: string | null | undefined,
) {
  const isActive = activeStates instanceof Set
    ? activeStates.has(stateSigla)
    : activeStates.includes(stateSigla);
  const isSelected = selectedState === stateSigla;

  return {
    fillColor: isSelected ? "#FCD34D" : isActive ? "#3BC770" : "#E5E7EB",
    fillOpacity: isSelected ? 0.6 : isActive ? 0.4 : 0.1,
    color: isSelected ? "#F59E0B" : isActive ? "#22C55E" : "#9CA3AF",
    weight: isSelected ? 3 : isActive ? 2 : 1,
  };
}

// Normalize a state string (name or sigla) to sigla
export function normalizeStateSigla(s: string): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && SIGLA_TO_NAME[upper]) return upper;
  if (NAME_TO_SIGLA[trimmed]) return NAME_TO_SIGLA[trimmed];
  return null;
}
