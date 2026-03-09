import { useState, useCallback } from "react";

export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
}

export function useGeocode() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const geocodeAddress = useCallback(async (
    address: string,
    city: string,
    state: string
  ): Promise<GeocodingResult | null> => {
    if (!city || !state) {
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build the search query
      const query = [address, city, state, "Brasil"]
        .filter(Boolean)
        .join(", ");

      // Use OpenStreetMap Nominatim API (free, no API key required)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=br`,
        {
          headers: {
            "Accept-Language": "pt-BR",
            "User-Agent": "CarboOPS/2.0",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Falha ao buscar coordenadas");
      }

      const data = await response.json();

      if (data && data.length > 0) {
        const result = data[0];
        return {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
          displayName: result.display_name,
        };
      }

      // If full address fails, try just city + state
      const fallbackQuery = [city, state, "Brasil"].join(", ");
      const fallbackResponse = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1&countrycodes=br`,
        {
          headers: {
            "Accept-Language": "pt-BR",
            "User-Agent": "CarboOPS/2.0",
          },
        }
      );

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        if (fallbackData && fallbackData.length > 0) {
          const result = fallbackData[0];
          return {
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon),
            displayName: result.display_name,
          };
        }
      }

      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao geocodificar endereço");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { geocodeAddress, isLoading, error };
}
