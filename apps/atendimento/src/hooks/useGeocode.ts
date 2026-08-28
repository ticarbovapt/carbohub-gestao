import { useState, useCallback } from "react";

// Geocodificação via OpenStreetMap Nominatim (grátis, sem chave). Retorna a
// posição APROXIMADA do endereço para conferência no mapa.
export interface GeocodingResult { lat: number; lng: number; displayName: string; }

async function query(q: string): Promise<GeocodingResult | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=br`,
    { headers: { "Accept-Language": "pt-BR" } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (data && data.length > 0) {
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name };
  }
  return null;
}

export function useGeocode() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const geocodeAddress = useCallback(async (address: string, city: string, state: string): Promise<GeocodingResult | null> => {
    if (!city || !state) return null;
    setIsLoading(true);
    setError(null);
    try {
      // 1ª tentativa: endereço completo. Fallback: só cidade + UF (posição aproximada).
      const full = [address, city, state, "Brasil"].filter(Boolean).join(", ");
      const r = await query(full);
      if (r) return r;
      return await query([city, state, "Brasil"].join(", "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao localizar o endereço");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { geocodeAddress, isLoading, error };
}
