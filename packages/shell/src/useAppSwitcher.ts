import { useEffect, useState } from "react";
import { buildSwitcherApps, type SwitcherApp, type SwitcherProfile } from "./apps";

// Busca as flags de acesso do perfil e devolve a lista de apps do switcher.
// Recebe o client do Supabase por parâmetro (sem dependência de tipos).
export function useAppSwitcher(opts: {
  supabase: { from: (t: string) => any };
  userId?: string | null;
  currentKey: string;
}): { apps: SwitcherApp[]; loading: boolean } {
  const { supabase, userId, currentKey } = opts;
  const [apps, setApps] = useState<SwitcherApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setApps(buildSwitcherApps(null, currentKey)); // pelo menos Início + app atual
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    supabase
      .from("profiles")
      .select("allowed_interfaces, department, funcao, secondary_department, secondary_funcao")
      .eq("id", userId)
      .maybeSingle()
      .then(
        ({ data }: { data: SwitcherProfile | null }) => {
          if (!active) return;
          setApps(buildSwitcherApps(data, currentKey));
          setLoading(false);
        },
        () => {
          if (!active) return;
          setApps(buildSwitcherApps(null, currentKey)); // fallback resiliente
          setLoading(false);
        },
      );
    return () => { active = false; };
  }, [supabase, userId, currentKey]);

  return { apps, loading };
}
