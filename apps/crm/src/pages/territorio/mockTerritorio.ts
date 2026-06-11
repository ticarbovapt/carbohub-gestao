// ⚠️ PORT VISUAL — dados MOCK do ecossistema territorial Carbo (sem supabase, sem hooks reais).
// Recria o SHAPE de useTerritorialData / useNetworkIntelligence do Controle, mas estático.

export interface MockLicensee {
  id: string;
  name: string;
  code: string;
  status: "active" | "inactive";
  state: string;
  city: string;
  lat: number;
  lng: number;
  totalMachines: number;
}

export interface MockPDV {
  id: string;
  pdvCode: string;
  name: string;
  status: "active" | "inactive";
  state: string;
  city: string;
  lat: number;
  lng: number;
  currentStock: number;
  minStockThreshold: number;
  hasStockAlert: boolean;
}

export interface MockMachine {
  id: string;
  machine_id: string;
  model: string;
  status: "ativa" | "manutencao" | "inativa";
  location_state: string;
  location_city: string;
  latitude: number;
  longitude: number;
  licensee_name: string;
  licensee_code: string;
  hasActiveAlert: boolean;
}

export interface MockTerritory {
  id: string;
  city: string;
  state: string;
  licensee_id: string | null;
  licensee_name: string | null;
  machine_density: number;
  territory_score: number;
  population: number;
  avg_income: number;
  motorcycle_density: number;
  competition_level: number;
}

// ── Licenciados (bases) espalhados pelo Brasil ────────────────────────────────
export const MOCK_LICENSEES: MockLicensee[] = [
  { id: "l1", name: "Base Natal", code: "LIC-RN-01", status: "active", state: "RN", city: "Natal", lat: -5.7945, lng: -35.211, totalMachines: 18 },
  { id: "l2", name: "Base Recife", code: "LIC-PE-01", status: "active", state: "PE", city: "Recife", lat: -8.0543, lng: -34.8811, totalMachines: 24 },
  { id: "l3", name: "Base Fortaleza", code: "LIC-CE-01", status: "active", state: "CE", city: "Fortaleza", lat: -3.7319, lng: -38.5267, totalMachines: 15 },
  { id: "l4", name: "Base São Paulo", code: "LIC-SP-01", status: "active", state: "SP", city: "São Paulo", lat: -23.5505, lng: -46.6333, totalMachines: 42 },
  { id: "l5", name: "Base Rio de Janeiro", code: "LIC-RJ-01", status: "active", state: "RJ", city: "Rio de Janeiro", lat: -22.9068, lng: -43.1729, totalMachines: 30 },
  { id: "l6", name: "Base Belo Horizonte", code: "LIC-MG-01", status: "active", state: "MG", city: "Belo Horizonte", lat: -19.9167, lng: -43.9345, totalMachines: 21 },
  { id: "l7", name: "Base Curitiba", code: "LIC-PR-01", status: "active", state: "PR", city: "Curitiba", lat: -25.4284, lng: -49.2733, totalMachines: 17 },
  { id: "l8", name: "Base Salvador", code: "LIC-BA-01", status: "inactive", state: "BA", city: "Salvador", lat: -12.9714, lng: -38.5014, totalMachines: 0 },
  { id: "l9", name: "Base Porto Alegre", code: "LIC-RS-01", status: "active", state: "RS", city: "Porto Alegre", lat: -30.0346, lng: -51.2177, totalMachines: 12 },
  { id: "l10", name: "Base Brasília", code: "LIC-DF-01", status: "active", state: "DF", city: "Brasília", lat: -15.7797, lng: -47.9297, totalMachines: 14 },
];

// ── PDVs (lojas) ──────────────────────────────────────────────────────────────
export const MOCK_PDVS: MockPDV[] = [
  { id: "p1", pdvCode: "PDV-001", name: "PDV Ponta Negra", status: "active", state: "RN", city: "Natal", lat: -5.8811, lng: -35.1716, currentStock: 120, minStockThreshold: 50, hasStockAlert: false },
  { id: "p2", pdvCode: "PDV-002", name: "PDV Boa Viagem", status: "active", state: "PE", city: "Recife", lat: -8.1228, lng: -34.9006, currentStock: 30, minStockThreshold: 50, hasStockAlert: true },
  { id: "p3", pdvCode: "PDV-003", name: "PDV Paulista", status: "active", state: "SP", city: "São Paulo", lat: -23.5613, lng: -46.6565, currentStock: 200, minStockThreshold: 80, hasStockAlert: false },
  { id: "p4", pdvCode: "PDV-004", name: "PDV Copacabana", status: "active", state: "RJ", city: "Rio de Janeiro", lat: -22.9711, lng: -43.1822, currentStock: 45, minStockThreshold: 60, hasStockAlert: true },
  { id: "p5", pdvCode: "PDV-005", name: "PDV Savassi", status: "inactive", state: "MG", city: "Belo Horizonte", lat: -19.9387, lng: -43.9347, currentStock: 0, minStockThreshold: 40, hasStockAlert: false },
  { id: "p6", pdvCode: "PDV-006", name: "PDV Batel", status: "active", state: "PR", city: "Curitiba", lat: -25.4419, lng: -49.2884, currentStock: 90, minStockThreshold: 50, hasStockAlert: false },
];

// ── Máquinas ──────────────────────────────────────────────────────────────────
export const MOCK_MACHINES: MockMachine[] = [
  { id: "m1", machine_id: "MAQ-RN-001", model: "Carbo 1L", status: "ativa", location_state: "RN", location_city: "Natal", latitude: -5.7965, longitude: -35.209, licensee_name: "Base Natal", licensee_code: "LIC-RN-01", hasActiveAlert: false },
  { id: "m2", machine_id: "MAQ-RN-002", model: "Carbo 100ml", status: "manutencao", location_state: "RN", location_city: "Natal", latitude: -5.79, longitude: -35.215, licensee_name: "Base Natal", licensee_code: "LIC-RN-01", hasActiveAlert: true },
  { id: "m3", machine_id: "MAQ-PE-001", model: "Carbo 1L", status: "ativa", location_state: "PE", location_city: "Recife", latitude: -8.056, longitude: -34.879, licensee_name: "Base Recife", licensee_code: "LIC-PE-01", hasActiveAlert: false },
  { id: "m4", machine_id: "MAQ-CE-001", model: "Carbo 1L", status: "ativa", location_state: "CE", location_city: "Fortaleza", latitude: -3.733, longitude: -38.524, licensee_name: "Base Fortaleza", licensee_code: "LIC-CE-01", hasActiveAlert: false },
  { id: "m5", machine_id: "MAQ-SP-001", model: "Carbo 1L", status: "ativa", location_state: "SP", location_city: "São Paulo", latitude: -23.552, longitude: -46.631, licensee_name: "Base São Paulo", licensee_code: "LIC-SP-01", hasActiveAlert: false },
  { id: "m6", machine_id: "MAQ-SP-002", model: "Carbo 100ml", status: "inativa", location_state: "SP", location_city: "São Paulo", latitude: -23.548, longitude: -46.638, licensee_name: "Base São Paulo", licensee_code: "LIC-SP-01", hasActiveAlert: false },
  { id: "m7", machine_id: "MAQ-RJ-001", model: "Carbo 1L", status: "ativa", location_state: "RJ", location_city: "Rio de Janeiro", latitude: -22.908, longitude: -43.176, licensee_name: "Base Rio de Janeiro", licensee_code: "LIC-RJ-01", hasActiveAlert: false },
  { id: "m8", machine_id: "MAQ-MG-001", model: "Carbo 1L", status: "manutencao", location_state: "MG", location_city: "Belo Horizonte", latitude: -19.918, longitude: -43.936, licensee_name: "Base Belo Horizonte", licensee_code: "LIC-MG-01", hasActiveAlert: true },
  { id: "m9", machine_id: "MAQ-PR-001", model: "Carbo 1L", status: "ativa", location_state: "PR", location_city: "Curitiba", latitude: -25.43, longitude: -49.271, licensee_name: "Base Curitiba", licensee_code: "LIC-PR-01", hasActiveAlert: false },
  { id: "m10", machine_id: "MAQ-RS-001", model: "Carbo 100ml", status: "ativa", location_state: "RS", location_city: "Porto Alegre", latitude: -30.036, longitude: -51.219, licensee_name: "Base Porto Alegre", licensee_code: "LIC-RS-01", hasActiveAlert: false },
  { id: "m11", machine_id: "MAQ-DF-001", model: "Carbo 1L", status: "ativa", location_state: "DF", location_city: "Brasília", latitude: -15.781, longitude: -47.931, licensee_name: "Base Brasília", licensee_code: "LIC-DF-01", hasActiveAlert: false },
];

// ── Territórios (expansão) ────────────────────────────────────────────────────
export const MOCK_TERRITORIES: MockTerritory[] = [
  // Oportunidades (sem licenciado)
  { id: "t1", city: "Goiânia", state: "GO", licensee_id: null, licensee_name: null, machine_density: 0, territory_score: 82, population: 1536000, avg_income: 2400, motorcycle_density: 310, competition_level: 2 },
  { id: "t2", city: "Manaus", state: "AM", licensee_id: null, licensee_name: null, machine_density: 0, territory_score: 74, population: 2255000, avg_income: 1900, motorcycle_density: 280, competition_level: 1 },
  { id: "t3", city: "Florianópolis", state: "SC", licensee_id: null, licensee_name: null, machine_density: 0, territory_score: 68, population: 516000, avg_income: 3100, motorcycle_density: 190, competition_level: 4 },
  { id: "t4", city: "Vitória", state: "ES", licensee_id: null, licensee_name: null, machine_density: 0, territory_score: 55, population: 365000, avg_income: 2800, motorcycle_density: 150, competition_level: 6 },
  { id: "t5", city: "Cuiabá", state: "MT", licensee_id: null, licensee_name: null, machine_density: 0, territory_score: 47, population: 650000, avg_income: 2200, motorcycle_density: 220, competition_level: 7 },
  { id: "t6", city: "Campo Grande", state: "MS", licensee_id: null, licensee_name: null, machine_density: 0, territory_score: 38, population: 906000, avg_income: 2100, motorcycle_density: 240, competition_level: 8 },
  // Atribuídos (com licenciado)
  { id: "t7", city: "Natal", state: "RN", licensee_id: "l1", licensee_name: "Base Natal", machine_density: 18, territory_score: 88, population: 890000, avg_income: 2300, motorcycle_density: 260, competition_level: 2 },
  { id: "t8", city: "São Paulo", state: "SP", licensee_id: "l4", licensee_name: "Base São Paulo", machine_density: 42, territory_score: 95, population: 12300000, avg_income: 3500, motorcycle_density: 410, competition_level: 5 },
  { id: "t9", city: "Recife", state: "PE", licensee_id: "l2", licensee_name: "Base Recife", machine_density: 24, territory_score: 79, population: 1650000, avg_income: 2200, motorcycle_density: 300, competition_level: 3 },
];

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

export const MOCK_STATS = {
  totalStates: 10,
  totalCities: 10,
  activeLicensees: MOCK_LICENSEES.filter((l) => l.status === "active").length,
  activePDVs: MOCK_PDVS.filter((p) => p.status === "active").length,
  stockAlerts: MOCK_PDVS.filter((p) => p.hasStockAlert).length,
  totalMachines: MOCK_MACHINES.length,
  activeMachines: MOCK_MACHINES.filter((m) => m.status === "ativa").length,
};

export const BRAZIL_CENTER: [number, number] = [-14.235, -51.9253];
export const BRAZIL_ZOOM = 4;
