import { useState, useEffect } from "react";

// Estado que sobrevive ao F5 (guardado em localStorage). Use pra filtros/abas
// que não deveriam resetar quando a pessoa recarrega a página.
export function usePersistedState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* storage cheio/indisponível — ignora */
    }
  }, [key, state]);

  return [state, setState] as const;
}
