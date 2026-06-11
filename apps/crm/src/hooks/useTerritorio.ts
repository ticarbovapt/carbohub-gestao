import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Território do Carbo Sales — dados REAIS do CORE (somente leitura).
// Lê licensees / pdvs / machines / territories do banco compartilhado.
// As tabelas são do CORE e os tipos gerados do CRM podem não conhecer todas as
// colunas, por isso o cliente é tratado como `any` aqui (cast isolado).
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
};

// ─── Tipos expostos para as telas ────────────────────────────────────────────

export interface TLicensee {
  id: string;
  name: string;
  code: string;
  status: string;
  state: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  totalMachines: number;
}

export interface TPDV {
  id: string;
  pdvCode: string;
  name: string;
  status: string;
  state: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  currentStock: number;
  minStockThreshold: number;
  hasStockAlert: boolean;
}

export interface TMachine {
  id: string;
  machine_id: string;
  model: string;
  status: string;
  location_state: string | null;
  location_city: string | null;
  latitude: number;
  longitude: number;
  licensee_name: string | null;
  licensee_code: string | null;
  hasActiveAlert: boolean;
  /** true = posição aproximada (coordenada da cidade), não é o GPS real. */
  estimatedLocation: boolean;
}

export interface TTerritory {
  id: string;
  city: string;
  state: string;
  licensee_id: string | null;
  licensee_name: string | null;
  machine_density: number;
  territory_score: number;
  population: number | null;
  avg_income: number | null;
  motorcycle_density: number | null;
  competition_level: number;
}

// ─── Constantes de mapa ──────────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  ativa: "#22c55e",
  manutencao: "#eab308",
  inativa: "#ef4444",
};

export const STATUS_LABELS: Record<string, string> = {
  ativa: "Ativa",
  manutencao: "Manutenção",
  inativa: "Inativa",
};

export const BRAZIL_CENTER: [number, number] = [-14.235, -51.9253];
export const BRAZIL_ZOOM = 4;

// ─── Coordenadas de cidades (fallback) ───────────────────────────────────────
// licensees/pdvs/machines podem não ter lat/lng no banco; usamos a coordenada
// aproximada da cidade para conseguir plotar no mapa. Key: "Cidade|UF".
const BRAZIL_CITIES_COORDS: Record<string, [number, number]> = {
  "São Paulo|SP": [-23.5505, -46.6333],
  "Guarulhos|SP": [-23.4543, -46.5333],
  "Barueri|SP": [-23.5042, -46.8761],
  "Campinas|SP": [-22.9056, -47.0608],
  "Santos|SP": [-23.9608, -46.3336],
  "Sorocaba|SP": [-23.5015, -47.4526],
  "Ribeirão Preto|SP": [-21.1704, -47.81],
  "Osasco|SP": [-23.5329, -46.7919],
  "São Bernardo do Campo|SP": [-23.6944, -46.565],
  "Santo André|SP": [-23.6639, -46.5383],
  "Diadema|SP": [-23.6861, -46.6228],
  "São José dos Campos|SP": [-23.1794, -45.8869],
  "Natal|RN": [-5.7945, -35.211],
  "Parnamirim|RN": [-5.9144, -35.264],
  "Mossoró|RN": [-5.1875, -37.3438],
  "Salvador|BA": [-12.9714, -38.5014],
  "Feira de Santana|BA": [-12.2664, -38.9663],
  "Vitória da Conquista|BA": [-14.8661, -40.8444],
  "Camaçari|BA": [-12.6997, -38.3244],
  "Recife|PE": [-8.0543, -34.8811],
  "Caruaru|PE": [-8.276, -35.9763],
  "Petrolina|PE": [-9.3989, -40.5001],
  "Olinda|PE": [-8.0089, -34.8536],
  "Garanhuns|PE": [-8.8907, -36.4966],
  "Belo Horizonte|MG": [-19.9167, -43.9345],
  "Uberlândia|MG": [-18.9186, -48.2772],
  "Contagem|MG": [-19.9317, -44.0536],
  "Montes Claros|MG": [-16.7286, -43.8611],
  "Governador Valadares|MG": [-18.8514, -41.9494],
  "Curitiba|PR": [-25.4284, -49.2733],
  "Maringá|PR": [-23.4205, -51.9333],
  "Londrina|PR": [-23.3045, -51.1696],
  "Cascavel|PR": [-24.9578, -53.4596],
  "Teresina|PI": [-5.092, -42.8038],
  "Parnaíba|PI": [-2.9058, -41.7769],
  "Fortaleza|CE": [-3.7319, -38.5267],
  "Juazeiro do Norte|CE": [-7.2133, -39.3153],
  "São Luís|MA": [-2.5297, -44.3028],
  "Florianópolis|SC": [-27.5954, -48.548],
  "Joinville|SC": [-26.3045, -48.8457],
  "Blumenau|SC": [-26.9195, -49.0661],
  "Porto Alegre|RS": [-30.0346, -51.2177],
  "Caxias do Sul|RS": [-29.1678, -51.1794],
  "Goiânia|GO": [-16.6864, -49.2643],
  "Brasília|DF": [-15.7797, -47.9297],
  "Manaus|AM": [-3.119, -60.0217],
  "Belém|PA": [-1.4558, -48.5044],
  "Rio de Janeiro|RJ": [-22.9068, -43.1729],
  "Niterói|RJ": [-22.8832, -43.1036],
  "Vitória|ES": [-20.3155, -40.3128],
  "Cuiabá|MT": [-15.601, -56.0975],
  "Campo Grande|MS": [-20.4697, -54.6201],
  "Maceió|AL": [-9.6658, -35.7353],
  "Aracaju|SE": [-10.9472, -37.0731],
  "Porto Velho|RO": [-8.7612, -63.9004],
  "Palmas|TO": [-10.2491, -48.3243],
};

function cityCoords(city: string | null, state: string | null): [number, number] | null {
  if (!city || !state) return null;
  return BRAZIL_CITIES_COORDS[`${city}|${state}`] || null;
}

// ─── Hook principal: dados do mapa territorial ───────────────────────────────
// Carrega licenciados, PDVs e máquinas em paralelo. Resolve coordenadas pelo
// lat/lng do banco; quando ausente, cai na coordenada aproximada da cidade.
// Itens sem qualquer coordenada possível são descartados (não dá pra plotar).
export interface TerritorioData {
  licensees: TLicensee[];
  pdvs: TPDV[];
  machines: TMachine[];
}

export function useTerritorioMapa() {
  return useQuery({
    queryKey: ["crm_territorio_mapa"],
    queryFn: async (): Promise<TerritorioData> => {
      const [licRes, pdvRes, machineRes] = await Promise.all([
        db
          .from("licensees")
          .select(
            "id, name, code, status, address_state, address_city, total_machines"
          )
          .order("name"),
        db
          .from("pdvs")
          .select(
            "id, pdv_code, name, status, address_state, address_city, latitude, longitude, current_stock, min_stock_threshold, has_stock_alert, assigned_licensee_id"
          )
          .order("name"),
        db
          .from("machines")
          .select(
            "id, machine_id, model, status, location_state, location_city, latitude, longitude, has_active_alert, licensee_id"
          )
          .order("machine_id"),
      ]);

      if (licRes.error) throw licRes.error;
      if (pdvRes.error) throw pdvRes.error;
      if (machineRes.error) throw machineRes.error;

      const licRows = (licRes.data ?? []) as any[];
      const pdvRows = (pdvRes.data ?? []) as any[];
      const machineRows = (machineRes.data ?? []) as any[];

      // Mapa id→{name, code} para enriquecer máquinas.
      const licMap = new Map<string, { name: string; code: string }>(
        licRows.map((l) => [l.id, { name: l.name, code: l.code }])
      );

      // Licenciados — sem lat/lng no banco; usa coordenada da cidade.
      const licensees: TLicensee[] = licRows
        .map((l): TLicensee => {
          const coords = cityCoords(l.address_city, l.address_state);
          return {
            id: l.id,
            name: l.name,
            code: l.code,
            status: l.status,
            state: l.address_state ?? null,
            city: l.address_city ?? null,
            lat: coords ? coords[0] : null,
            lng: coords ? coords[1] : null,
            totalMachines: l.total_machines ?? 0,
          };
        })
        .filter((l) => l.lat != null && l.lng != null);

      // PDVs — lat/lng do banco; fallback p/ cidade.
      const pdvs: TPDV[] = pdvRows
        .map((p): TPDV => {
          let lat = p.latitude != null ? Number(p.latitude) : null;
          let lng = p.longitude != null ? Number(p.longitude) : null;
          if (lat == null || lng == null) {
            const coords = cityCoords(p.address_city, p.address_state);
            if (coords) {
              lat = coords[0];
              lng = coords[1];
            }
          }
          return {
            id: p.id,
            pdvCode: p.pdv_code,
            name: p.name,
            status: p.status,
            state: p.address_state ?? null,
            city: p.address_city ?? null,
            lat,
            lng,
            currentStock: p.current_stock ?? 0,
            minStockThreshold: p.min_stock_threshold ?? 0,
            hasStockAlert: p.has_stock_alert ?? false,
          };
        })
        .filter((p) => p.lat != null && p.lng != null);

      // Máquinas — lat/lng do banco; fallback p/ cidade (com leve dispersão).
      const machines: TMachine[] = [];
      for (const m of machineRows) {
        let lat = m.latitude != null ? Number(m.latitude) : null;
        let lng = m.longitude != null ? Number(m.longitude) : null;
        let estimated = false;
        if (lat == null || lng == null) {
          const coords = cityCoords(m.location_city, m.location_state);
          if (coords) {
            lat = coords[0] + (Math.random() - 0.5) * 0.02;
            lng = coords[1] + (Math.random() - 0.5) * 0.02;
            estimated = true;
          }
        }
        if (lat == null || lng == null) continue;
        const lic = m.licensee_id ? licMap.get(m.licensee_id) : undefined;
        machines.push({
          id: m.id,
          machine_id: m.machine_id,
          model: m.model,
          status: m.status,
          location_state: m.location_state ?? null,
          location_city: m.location_city ?? null,
          latitude: lat,
          longitude: lng,
          licensee_name: lic?.name ?? null,
          licensee_code: lic?.code ?? null,
          hasActiveAlert: m.has_active_alert ?? false,
          estimatedLocation: estimated,
        });
      }

      return { licensees, pdvs, machines };
    },
    refetchInterval: 30000,
  });
}

// ─── Hook: territórios (expansão / atribuídos) ───────────────────────────────
export function useTerritorios() {
  return useQuery({
    queryKey: ["crm_territorios"],
    queryFn: async (): Promise<TTerritory[]> => {
      const { data, error } = await db
        .from("territories")
        .select("*")
        .order("territory_score", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      if (rows.length === 0) return [];

      const licenseeIds = [
        ...new Set(rows.map((t) => t.licensee_id).filter(Boolean)),
      ] as string[];
      const licMap = new Map<string, string>();
      if (licenseeIds.length > 0) {
        const { data: lics } = await db
          .from("licensees")
          .select("id, name")
          .in("id", licenseeIds);
        for (const l of (lics ?? []) as any[]) licMap.set(l.id, l.name);
      }

      return rows.map((t): TTerritory => ({
        id: t.id,
        city: t.city,
        state: t.state,
        licensee_id: t.licensee_id ?? null,
        licensee_name: t.licensee_id ? licMap.get(t.licensee_id) ?? null : null,
        machine_density: t.machine_density ?? 0,
        territory_score: t.territory_score ?? 0,
        population: t.population ?? null,
        avg_income: t.avg_income ?? null,
        motorcycle_density: t.motorcycle_density ?? null,
        competition_level: t.competition_level ?? 0,
      }));
    },
  });
}
