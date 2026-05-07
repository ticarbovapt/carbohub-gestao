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
  tier: "Elite" | "Gold" | "Silver" | "Bronze";
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

// ─── Brazil Cities Fallback Coordinates ─────────────────────────────────────
// Used when machines.latitude / machines.longitude is NULL in the database.
// Key format: "Cidade|UF"
export const BRAZIL_CITIES_COORDS: Record<string, [number, number]> = {
  // SP
  "São Paulo|SP":          [-23.5505, -46.6333],
  "Guarulhos|SP":          [-23.4543, -46.5333],
  "Barueri|SP":            [-23.5042, -46.8761],
  "Campinas|SP":           [-22.9056, -47.0608],
  "Santos|SP":             [-23.9608, -46.3336],
  "Sorocaba|SP":           [-23.5015, -47.4526],
  "Ribeirão Preto|SP":     [-21.1704, -47.8100],
  "Osasco|SP":             [-23.5329, -46.7919],
  "São Bernardo do Campo|SP": [-23.6944, -46.5650],
  "Santo André|SP":        [-23.6639, -46.5383],
  "Diadema|SP":            [-23.6861, -46.6228],
  "Pirituba|SP":           [-23.4989, -46.7219],
  "Mooca|SP":              [-23.5599, -46.5889],
  "Tupã|SP":               [-21.9336, -50.5115],
  "São José dos Campos|SP": [-23.1794, -45.8869],
  // RN
  "Natal|RN":              [-5.7945, -35.2110],
  "Parnamirim|RN":         [-5.9144, -35.2640],
  "Mossoró|RN":            [-5.1875, -37.3438],
  // BA
  "Salvador|BA":           [-12.9714, -38.5014],
  "Feira de Santana|BA":   [-12.2664, -38.9663],
  "Vitória da Conquista|BA":[-14.8661, -40.8444],
  "Camaçari|BA":           [-12.6997, -38.3244],
  "Balsas|MA":             [-7.5329, -46.0361],
  // PE
  "Recife|PE":             [-8.0543, -34.8811],
  "Caruaru|PE":            [-8.2760, -35.9763],
  "Petrolina|PE":          [-9.3989, -40.5001],
  "Olinda|PE":             [-8.0089, -34.8536],
  "Garanhuns|PE":          [-8.8907,  -36.4966],
  "Fernando de Noronha|PE": [-3.8567, -32.4241],
  // MG
  "Belo Horizonte|MG":     [-19.9167, -43.9345],
  "Uberlândia|MG":         [-18.9186, -48.2772],
  "Contagem|MG":           [-19.9317, -44.0536],
  "Montes Claros|MG":      [-16.7286, -43.8611],
  "Muriaé|MG":             [-21.1294, -42.3700],
  "Governador Valadares|MG": [-18.8514, -41.9494],
  "Araguari|MG":           [-18.6484, -48.1859],
  // PR
  "Curitiba|PR":           [-25.4284, -49.2733],
  "Maringá|PR":            [-23.4205, -51.9333],
  "Londrina|PR":           [-23.3045, -51.1696],
  "Cascavel|PR":           [-24.9578, -53.4596],
  "Araucária|PR":          [-25.5845, -49.4114],
  // PI
  "Teresina|PI":           [-5.0920, -42.8038],
  "Parnaíba|PI":           [-2.9058, -41.7769],
  // CE
  "Fortaleza|CE":          [-3.7319, -38.5267],
  "Juazeiro do Norte|CE":  [-7.2133, -39.3153],
  "Itaitinga|CE":          [-4.0058,  -38.5275],
  // MA
  "São Luís|MA":           [-2.5297, -44.3028],
  // SC
  "Florianópolis|SC":      [-27.5954, -48.5480],
  "Joinville|SC":          [-26.3045, -48.8457],
  "Blumenau|SC":           [-26.9195, -49.0661],
  "Tubarão|SC":            [-28.4679, -49.0053],
  // RS
  "Porto Alegre|RS":       [-30.0346, -51.2177],
  "Caxias do Sul|RS":      [-29.1678, -51.1794],
  // GO
  "Goiânia|GO":            [-16.6864, -49.2643],
  // DF
  "Brasília|DF":           [-15.7797, -47.9297],
  // AM
  "Manaus|AM":             [-3.1190, -60.0217],
  // PA
  "Belém|PA":              [-1.4558, -48.5044],
  // RJ
  "Rio de Janeiro|RJ":     [-22.9068, -43.1729],
  "Niterói|RJ":            [-22.8832, -43.1036],
  // ES
  "Vitória|ES":            [-20.3155, -40.3128],
  // MT
  "Cuiabá|MT":             [-15.6010, -56.0975],
  // MS
  "Campo Grande|MS":       [-20.4697, -54.6201],
  // AL
  "Maceió|AL":             [-9.6658, -35.7353],
  // SE
  "Aracaju|SE":            [-10.9472, -37.0731],
  // RO
  "Porto Velho|RO":        [-8.7612, -63.9004],
  // TO
  "Palmas|TO":             [-10.2491, -48.3243],
};

export function getCityCoords(city: string | null, state: string | null): [number, number] | null {
  if (!city || !state) return null;
  return BRAZIL_CITIES_COORDS[`${city}|${state}`] || null;
}

// ─── Tier Assignment ─────────────────────────────────────────────────────────

function assignTier(rank: number, total: number): "Elite" | "Gold" | "Silver" | "Bronze" {
  const pct = rank / total;
  if (pct <= 0.1) return "Elite";
  if (pct <= 0.3) return "Gold";
  if (pct <= 0.6) return "Silver";
  return "Bronze";
}

// ─── Score Calculation ──────────────────────────────────────────────────────

function computeLicenseeScore(l: any): number {
  const machineCount = l.total_machines || 0;
  const territoryCoverage = ((l.machines_1l || 0) + (l.machines_100ml || 0)) * 0.5;
  const activityLevel = l.performance_score || 0;
  const growthRate = Math.min((l.machines_100ml || 0) * 2, 100);
  return (machineCount * 0.4) + (territoryCoverage * 0.2) + (activityLevel * 0.2) + (growthRate * 0.2);
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

      // Compute scores using new model
      const scored = data.map((l: any) => {
        const computed_score = computeLicenseeScore(l);
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
      // Fetch ALL machines — lat/long may be null in DB, we apply city fallback below
      const { data: machines, error } = await (supabase as any)
        .from("machines")
        .select("id, machine_id, model, latitude, longitude, location_city, location_state, status, installation_date, licensee_id");

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

      const result: NetworkMachine[] = [];
      for (const m of machines) {
        // Resolve coordinates: DB value → city fallback
        let lat = m.latitude != null ? Number(m.latitude) : null;
        let lng = m.longitude != null ? Number(m.longitude) : null;

        if (lat === null || lng === null) {
          const fallback = getCityCoords(m.location_city, m.location_state);
          if (fallback) {
            // Add slight jitter (±0.01°) so stacked machines spread visually
            lat = fallback[0] + (Math.random() - 0.5) * 0.02;
            lng = fallback[1] + (Math.random() - 0.5) * 0.02;
          }
        }

        // Skip if we still have no coords
        if (lat === null || lng === null) continue;

        const lic = licenseeMap.get(m.licensee_id);
        result.push({
          id: m.id,
          machine_id: m.machine_id,
          model: m.model,
          machine_type: null,
          latitude: lat,
          longitude: lng,
          location_city: m.location_city,
          location_state: m.location_state,
          status: m.status,
          installation_date: m.installation_date,
          licensee_name: lic?.name || null,
          licensee_code: lic?.code || null,
        });
      }
      return result;
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

      // Compute scores using new model
      const scored = licensees.map((l: any) => ({
        id: l.id,
        score: computeLicenseeScore(l),
      }));

      scored.sort((a: any, b: any) => b.score - a.score);

      // Assign tiers and update
      const total = scored.length;
      for (let i = 0; i < scored.length; i++) {
        const tier = assignTier(i + 1, total);
        const tierMap: Record<string, string> = { Elite: "elite", Gold: "ouro", Silver: "prata", Bronze: "bronze" };

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
        (supabase as any).from("machines").select("id, status, location_state"),
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
