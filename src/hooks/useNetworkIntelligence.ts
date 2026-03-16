import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NetworkMachine {
  id: string;
  machine_id: string;
  model: string;
  machine_type: string | null;
  latitude: number;
  longitude: number;
  location_city: string | null;
  location_state: string | null;
  status: string;
  licensee_name: string | null;
  licensee_code: string | null;
  installation_date: string | null;
}

export interface RankedLicensee {
  id: string;
  code: string;
  name: string;
  responsavel: string | null;
  instagram: string | null;
  address_city: string | null;
  address_state: string | null;
  status: string;
  performance_score: number | null;
  total_machines: number | null;
  machines_1l: number | null;
  machines_100ml: number | null;
  current_level: string | null;
  computed_score: number;
  tier: "S" | "A" | "B" | "C" | "D";
}

export interface Territory {
  id: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  licensee_id: string | null;
  licensee_name?: string | null;
  machine_density: number;
  territory_score: number;
  population: number | null;
  avg_income: number | null;
  motorcycle_density: number | null;
  competition_level: number;
}

export interface NetworkStats {
  total_licensees: number;
  total_machines: number;
  total_active_machines: number;
  total_territories: number;
  avg_score: number;
  machines_by_state: { state: string; count: number }[];
  machines_by_type: { type: string; count: number }[];
}

// ─── Tier Assignment ─────────────────────────────────────────────────────────

function assignTier(rank: number, total: number): "S" | "A" | "B" | "C" | "D" {
  const pct = rank / total;
  if (pct <= 0.1) return "S";
  if (pct <= 0.3) return "A";
  if (pct <= 0.55) return "B";
  if (pct <= 0.8) return "C";
  return "D";
}

// ─── 1. Licensee Ranking ─────────────────────────────────────────────────────

export function useLicenseeRanking() {
  return useQuery({
    queryKey: ["licensee_ranking"],
    queryFn: async (): Promise<RankedLicensee[]> => {
      const { data, error } = await (supabase as any)
        .from("licensees")
        .select("id, code, name, responsavel, instagram, address_city, address_state, status, performance_score, total_machines, machines_1l, machines_100ml, current_level")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Compute scores
      const scored = data.map((l: any) => {
        const m100 = l.machines_100ml || 0;
        const m1l = l.machines_1l || 0;
        const perf = l.performance_score || 0;
        const computed_score = (m100 * 3) + (m1l * 1) + (perf * 2);
        return { ...l, computed_score };
      });

      // Sort by score DESC
      scored.sort((a: any, b: any) => b.computed_score - a.computed_score);

      // Assign tiers
      const total = scored.length;
      return scored.map((l: any, i: number) => ({
        ...l,
        tier: assignTier(i + 1, total),
      }));
    },
  });
}

// ─── 2. Network Map ──────────────────────────────────────────────────────────

export function useNetworkMap() {
  return useQuery({
    queryKey: ["network_map"],
    queryFn: async (): Promise<NetworkMachine[]> => {
      const { data: machines, error } = await (supabase as any)
        .from("machines")
        .select("id, machine_id, model, machine_type, latitude, longitude, location_city, location_state, status, installation_date, licensee_id")
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (error) throw error;
      if (!machines || machines.length === 0) return [];

      // Fetch licensees for names
      const licenseeIds = [...new Set(machines.map((m: any) => m.licensee_id).filter(Boolean))];
      let licenseeMap = new Map<string, { name: string; code: string }>();

      if (licenseeIds.length > 0) {
        const { data: licensees } = await (supabase as any)
          .from("licensees")
          .select("id, name, code")
          .in("id", licenseeIds);

        if (licensees) {
          licenseeMap = new Map(licensees.map((l: any) => [l.id, { name: l.name, code: l.code }]));
        }
      }

      return machines.map((m: any) => {
        const lic = licenseeMap.get(m.licensee_id);
        return {
          id: m.id,
          machine_id: m.machine_id,
          model: m.model,
          machine_type: m.machine_type,
          latitude: Number(m.latitude),
          longitude: Number(m.longitude),
          location_city: m.location_city,
          location_state: m.location_state,
          status: m.status,
          installation_date: m.installation_date,
          licensee_name: lic?.name || null,
          licensee_code: lic?.code || null,
        };
      });
    },
  });
}

// ─── 3. Territories ──────────────────────────────────────────────────────────

export function useTerritories() {
  return useQuery({
    queryKey: ["territories"],
    queryFn: async (): Promise<Territory[]> => {
      const { data, error } = await (supabase as any)
        .from("territories")
        .select("*")
        .order("territory_score", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Fetch licensee names
      const licenseeIds = [...new Set(data.map((t: any) => t.licensee_id).filter(Boolean))];
      let licenseeMap = new Map<string, string>();

      if (licenseeIds.length > 0) {
        const { data: licensees } = await (supabase as any)
          .from("licensees")
          .select("id, name")
          .in("id", licenseeIds);

        if (licensees) {
          licenseeMap = new Map(licensees.map((l: any) => [l.id, l.name]));
        }
      }

      return data.map((t: any) => ({
        ...t,
        licensee_name: licenseeMap.get(t.licensee_id) || null,
      }));
    },
  });
}

// ─── 4. Territory Expansion ──────────────────────────────────────────────────

export function useTerritoryExpansion() {
  return useQuery({
    queryKey: ["territory_expansion"],
    queryFn: async (): Promise<Territory[]> => {
      const { data, error } = await (supabase as any)
        .from("territories")
        .select("*")
        .is("licensee_id", null)
        .order("territory_score", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as Territory[];
    },
  });
}

// ─── 5. Create Territory ─────────────────────────────────────────────────────

export function useCreateTerritory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (territory: {
      city: string;
      state: string;
      latitude?: number;
      longitude?: number;
      licensee_id?: string;
      population?: number;
      avg_income?: number;
      motorcycle_density?: number;
      competition_level?: number;
    }) => {
      // Calculate territory_score
      const pop = territory.population || 0;
      const income = territory.avg_income || 0;
      const moto = territory.motorcycle_density || 0;
      const comp = territory.competition_level || 0;
      const territory_score = (pop * 0.3) + (income * 0.2) + (moto * 0.3) - (comp * 0.2);

      const { error } = await (supabase as any)
        .from("territories")
        .insert({ ...territory, territory_score });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["territories"] });
      queryClient.invalidateQueries({ queryKey: ["territory_expansion"] });
      toast.success("Território criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar território: ${error.message}`);
    },
  });
}

// ─── 6. Create Machine Event ─────────────────────────────────────────────────

export function useCreateMachineEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: {
      machine_id: string;
      event_type: string;
      description?: string;
      event_data?: Record<string, any>;
    }) => {
      const { error } = await (supabase as any)
        .from("machine_events")
        .insert(event);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machine_events"] });
      toast.success("Evento registrado!");
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });
}

// ─── 7. Update Licensee Rankings (recalculate all) ───────────────────────────

export function useUpdateLicenseeRanking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Fetch all licensees
      const { data: licensees, error } = await (supabase as any)
        .from("licensees")
        .select("id, machines_1l, machines_100ml, performance_score, total_machines");

      if (error) throw error;
      if (!licensees || licensees.length === 0) return;

      // Compute scores
      const scored = licensees.map((l: any) => ({
        id: l.id,
        score: ((l.machines_100ml || 0) * 3) + ((l.machines_1l || 0) * 1) + ((l.performance_score || 0) * 2),
      }));

      scored.sort((a: any, b: any) => b.score - a.score);

      // Assign tiers and update
      const total = scored.length;
      for (let i = 0; i < scored.length; i++) {
        const tier = assignTier(i + 1, total);
        const tierMap: Record<string, string> = { S: "ouro", A: "prata", B: "bronze", C: "bronze", D: "bronze" };

        await (supabase as any)
          .from("licensees")
          .update({
            current_score: scored[i].score,
            current_level: tierMap[tier] || "bronze",
          })
          .eq("id", scored[i].id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["licensee_ranking"] });
      toast.success("Rankings atualizados!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar rankings: ${error.message}`);
    },
  });
}

// ─── 8. Network Stats ────────────────────────────────────────────────────────

export function useNetworkStats() {
  return useQuery({
    queryKey: ["network_stats"],
    queryFn: async (): Promise<NetworkStats> => {
      // Parallel queries
      const [licenseeRes, machineRes, territoryRes] = await Promise.all([
        (supabase as any).from("licensees").select("id, current_score, status"),
        (supabase as any).from("machines").select("id, status, location_state, machine_type"),
        (supabase as any).from("territories").select("id"),
      ]);

      const licensees = licenseeRes.data || [];
      const machines = machineRes.data || [];
      const territories = territoryRes.data || [];

      const total_licensees = licensees.length;
      const total_machines = machines.length;
      const total_active_machines = machines.filter((m: any) => m.status === "ativa").length;
      const total_territories = territories.length;
      const scores = licensees.map((l: any) => l.current_score || 0).filter((s: number) => s > 0);
      const avg_score = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;

      // Group machines by state
      const stateMap = new Map<string, number>();
      machines.forEach((m: any) => {
        const state = m.location_state || "Desconhecido";
        stateMap.set(state, (stateMap.get(state) || 0) + 1);
      });
      const machines_by_state = Array.from(stateMap.entries())
        .map(([state, count]) => ({ state, count }))
        .sort((a, b) => b.count - a.count);

      // Group machines by type
      const typeMap = new Map<string, number>();
      machines.forEach((m: any) => {
        const type = m.machine_type || "Não classificada";
        typeMap.set(type, (typeMap.get(type) || 0) + 1);
      });
      const machines_by_type = Array.from(typeMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      return {
        total_licensees,
        total_machines,
        total_active_machines,
        total_territories,
        avg_score: Math.round(avg_score * 10) / 10,
        machines_by_state,
        machines_by_type,
      };
    },
  });
}
