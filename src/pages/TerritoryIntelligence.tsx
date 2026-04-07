import { useMemo, useState, useEffect, useRef } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { LicenseeSubNav } from "@/components/licensees/LicenseeSubNav";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Brain, MapPin, Target, TrendingUp, Users, Search, BarChart3, Map as MapIcon, Table2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTerritories, useTerritoryExpansion, useNetworkMap, useNetworkStats, BRAZIL_CITIES_COORDS, getCityCoords } from "@/hooks/useNetworkIntelligence";
import "leaflet/dist/leaflet.css";

// ── Bubble Map Component ──────────────────────────────────────────────────────
interface BubbleMapProps {
  clusters: Array<{
    city: string;
    state: string;
    machineCount: number;
    licenseeNames: string[];
    tier: "A" | "B" | "C" | "D";
  }>;
}

const TIER_COLORS_MAP: Record<string, string> = {
  A: "#22c55e",
  B: "#3b82f6",
  C: "#f59e0b",
  D: "#ef4444",
};

function BubbleMap({ clusters }: BubbleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    import("leaflet").then((L) => {
      // Fix default icon path issues in bundlers
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [-15.0, -52.0],
        zoom: 4,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      clusters.forEach((cluster) => {
        const coords = getCityCoords(cluster.city, cluster.state);
        if (!coords) return;

        const radius = Math.max(10, cluster.machineCount * 6);
        const color = TIER_COLORS_MAP[cluster.tier] || "#94a3b8";

        L.circleMarker(coords, {
          radius,
          fillColor: color,
          color: "#fff",
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.75,
        })
          .bindPopup(`
            <div style="min-width:160px">
              <strong style="font-size:13px">${cluster.city}, ${cluster.state}</strong><br/>
              <span style="color:${color};font-weight:600">Tier ${cluster.tier}</span><br/>
              <span>🔧 ${cluster.machineCount} máquinas</span><br/>
              ${cluster.licenseeNames.length ? `<span style="font-size:11px;color:#666">${cluster.licenseeNames.slice(0,3).join(", ")}</span>` : ""}
            </div>
          `)
          .addTo(map);
      });

      leafletMapRef.current = map;
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Update bubbles when clusters change
  useEffect(() => {
    if (!leafletMapRef.current) return;
    // Re-render handled by full remount via key on parent
  }, [clusters]);

  return <div ref={mapRef} style={{ height: "440px", borderRadius: "12px", zIndex: 0 }} />;
}

type DensityTier = "A" | "B" | "C" | "D";

function getDensityTier(machineCount: number): DensityTier {
  if (machineCount >= 5) return "A";
  if (machineCount >= 3) return "B";
  if (machineCount >= 1) return "C";
  return "D";
}

const DENSITY_CONFIG: Record<DensityTier, { label: string; color: string; bg: string; desc: string }> = {
  A: { label: "Alta Densidade", color: "bg-green-500", bg: "bg-green-500/10 border-green-500/30", desc: "5+ máquinas" },
  B: { label: "Média Densidade", color: "bg-blue-500", bg: "bg-blue-500/10 border-blue-500/30", desc: "3-4 máquinas" },
  C: { label: "Baixa Densidade", color: "bg-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/30", desc: "1-2 máquinas" },
  D: { label: "Sem Presença", color: "bg-red-500", bg: "bg-red-500/10 border-red-500/30", desc: "0 máquinas" },
};

interface TerritoryCluster {
  state: string;
  city: string;
  machineCount: number;
  licenseeNames: string[];
  tier: DensityTier;
  hasLicensee: boolean;
}

export default function TerritoryIntelligence() {
  const { data: machines = [], isLoading: machinesLoading } = useNetworkMap();
  const { data: territories = [], isLoading: terrLoading } = useTerritories();
  const { data: opportunities = [], isLoading: oppLoading } = useTerritoryExpansion();
  const { data: stats, isLoading: statsLoading } = useNetworkStats();

  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");

  // Build territory clusters from machine data
  const clusters = useMemo(() => {
    const map = new Map<string, TerritoryCluster>();

    machines.forEach((m) => {
      const key = `${m.location_city}|${m.location_state}`;
      if (!m.location_city || !m.location_state) return;

      const existing = map.get(key);
      if (existing) {
        existing.machineCount++;
        if (m.licensee_name && !existing.licenseeNames.includes(m.licensee_name)) {
          existing.licenseeNames.push(m.licensee_name);
        }
      } else {
        map.set(key, {
          state: m.location_state,
          city: m.location_city,
          machineCount: 1,
          licenseeNames: m.licensee_name ? [m.licensee_name] : [],
          tier: "C",
          hasLicensee: !!m.licensee_name,
        });
      }
    });

    // Assign tiers
    const result = Array.from(map.values()).map((c) => ({
      ...c,
      tier: getDensityTier(c.machineCount),
    }));

    return result.sort((a, b) => b.machineCount - a.machineCount);
  }, [machines]);

  // Get unique states
  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    clusters.forEach((c) => states.add(c.state));
    return Array.from(states).sort();
  }, [clusters]);

  // Apply filters
  const filtered = useMemo(() => {
    return clusters.filter((c) => {
      if (tierFilter !== "all" && c.tier !== tierFilter) return false;
      if (stateFilter !== "all" && c.state !== stateFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.city.toLowerCase().includes(q) && !c.state.toLowerCase().includes(q) && !c.licenseeNames.some((n) => n.toLowerCase().includes(q))) {
          return false;
        }
      }
      return true;
    });
  }, [clusters, tierFilter, stateFilter, search]);

  // Stats by tier
  const tierStats = useMemo(() => {
    const counts: Record<DensityTier, number> = { A: 0, B: 0, C: 0, D: 0 };
    clusters.forEach((c) => counts[c.tier]++);
    return counts;
  }, [clusters]);

  // States coverage
  const statesCoverage = useMemo(() => {
    return stats?.machines_by_state || [];
  }, [stats]);

  const isLoading = machinesLoading || terrLoading || oppLoading || statsLoading;

  if (isLoading) {
    return (
      <BoardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </BoardLayout>
    );
  }

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
            <Brain className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Inteligência Territorial</h1>
            <p className="text-sm text-muted-foreground">
              Análise de densidade, cobertura e oportunidades de expansão
            </p>
          </div>
        </div>

        <LicenseeSubNav />

        {/* Density Legend */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground mr-1">Classificação:</span>
          {(["A", "B", "C", "D"] as DensityTier[]).map((tier) => (
            <Badge key={tier} className={`${DENSITY_CONFIG[tier].color} text-white border-transparent text-xs`}>
              Tier {tier}: {DENSITY_CONFIG[tier].desc}
            </Badge>
          ))}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <MapPin className="h-3.5 w-3.5" />
              <span>Cidades Atendidas</span>
            </div>
            <p className="text-2xl font-bold">{clusters.length}</p>
          </div>
          {(["A", "B", "C", "D"] as DensityTier[]).map((tier) => (
            <div key={tier} className={`rounded-xl border p-4 ${DENSITY_CONFIG[tier].bg}`}>
              <div className="flex items-center gap-2 text-xs mb-1">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${DENSITY_CONFIG[tier].color}`} />
                <span className="text-muted-foreground">Tier {tier}</span>
              </div>
              <p className="text-2xl font-bold">{tierStats[tier]}</p>
              <p className="text-xs text-muted-foreground">{DENSITY_CONFIG[tier].label}</p>
            </div>
          ))}
        </div>

        {/* State Coverage */}
        {statesCoverage.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              Cobertura por Estado
            </h3>
            <div className="flex flex-wrap gap-2">
              {statesCoverage.map((s) => (
                <div key={s.state} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border">
                  <span className="text-sm font-medium">{s.state}</span>
                  <Badge variant="secondary" className="text-xs">{s.count}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expansion Opportunities */}
        {opportunities.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Top Oportunidades de Expansão ({opportunities.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {opportunities.slice(0, 6).map((opp) => (
                <Card key={opp.id} className="hover:shadow-sm transition-shadow">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{opp.city}, {opp.state}</CardTitle>
                      <Badge className="bg-emerald-500 text-white border-0 text-xs">
                        {Math.round(opp.territory_score)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 text-xs text-muted-foreground space-y-1">
                    {opp.population && <p>Pop: {opp.population.toLocaleString("pt-BR")}</p>}
                    {opp.avg_income && <p>Renda: R$ {opp.avg_income.toLocaleString("pt-BR")}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cidade ou licenciado..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-full sm:w-44 h-10 rounded-xl">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tiers</SelectItem>
              {(["A", "B", "C", "D"] as DensityTier[]).map((t) => (
                <SelectItem key={t} value={t}>Tier {t} — {DENSITY_CONFIG[t].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-full sm:w-44 h-10 rounded-xl">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Estados</SelectItem>
              {uniqueStates.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Map + Table tabs */}
        <Tabs defaultValue="mapa">
          <TabsList className="mb-4">
            <TabsTrigger value="mapa" className="gap-2">
              <MapIcon className="h-4 w-4" /> Mapa de Bolhas
            </TabsTrigger>
            <TabsTrigger value="tabela" className="gap-2">
              <Table2 className="h-4 w-4" /> Tabela
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mapa">
            <div className="rounded-xl border bg-card overflow-hidden p-2">
              <BubbleMap key={clusters.length} clusters={clusters} />
              <p className="text-xs text-muted-foreground text-center mt-2 pb-1">
                Tamanho da bolha proporcional ao número de máquinas · Cor por Tier de densidade
              </p>
            </div>
          </TabsContent>

          <TabsContent value="tabela">
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Cidade</th>
                      <th className="px-4 py-3 text-left font-medium">UF</th>
                      <th className="px-4 py-3 text-left font-medium">Tier</th>
                      <th className="px-4 py-3 text-right font-medium">Máquinas</th>
                      <th className="px-4 py-3 text-left font-medium">Licenciados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          Nenhum território encontrado.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((c, i) => (
                        <tr key={`${c.city}-${c.state}-${i}`} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{c.city}</td>
                          <td className="px-4 py-3">{c.state}</td>
                          <td className="px-4 py-3">
                            <Badge className={`${DENSITY_CONFIG[c.tier].color} text-white border-transparent text-xs`}>
                              {c.tier}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{c.machineCount}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {c.licenseeNames.length > 0 ? c.licenseeNames.join(", ") : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </BoardLayout>
  );
}
