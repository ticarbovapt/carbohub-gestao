import { useMemo, useState, useEffect, useRef } from "react";
import { LicenciadosSubNav } from "@/components/licenciados/LicenciadosSubNav";
import { useAuth } from "@/contexts/AuthContext";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Input } from "@/components/ui/input";
import { Brain, MapPin, Search, Info, Map as MapIcon, Table2, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNetworkMap, getCityCoords } from "@/hooks/useNetworkIntelligence";
import "leaflet/dist/leaflet.css";

// ─────────────────────────────────────────────────────────────────────────────
// Inteligência Territorial (espelho read-only).
//
// FONTE ÚNICA: tabela `machines` (parque de máquinas CarboVAPT cadastrado no
// Carbo Controle) + `licensees` para o nome do licenciado. TODOS os blocos
// desta tela derivam do MESMO conjunto de máquinas, para que os totais fechem
// entre si (antes, cidades/tiers e cobertura por estado usavam bases distintas).
//
// Máquinas sem coordenada continuam contando nos números; elas apenas não
// aparecem no mapa — e isso é informado explicitamente na tela.
// ─────────────────────────────────────────────────────────────────────────────

type DensityTier = "A" | "B" | "C";

/** Faixa de densidade por cidade, pela CONTAGEM DE MÁQUINAS instaladas.
 *  Não existe faixa "sem presença": os clusters nascem das próprias máquinas,
 *  logo toda cidade listada tem no mínimo 1. */
function getDensityTier(machineCount: number): DensityTier {
  if (machineCount >= 5) return "A";
  if (machineCount >= 3) return "B";
  return "C";
}

const DENSITY_CONFIG: Record<DensityTier, {
  label: string; desc: string;
  badge: "success" | "info" | "warning";
  kpi: "green" | "blue" | "warning";
}> = {
  A: { label: "Alta densidade", desc: "5+ máquinas", badge: "success", kpi: "green" },
  B: { label: "Média densidade", desc: "3–4 máquinas", badge: "info", kpi: "blue" },
  C: { label: "Baixa densidade", desc: "1–2 máquinas", badge: "warning", kpi: "warning" },
};

const TIER_COLORS_MAP: Record<string, string> = { A: "#22c55e", B: "#3b82f6", C: "#f59e0b" };

interface TerritoryCluster {
  state: string;
  city: string;
  machineCount: number;
  mappedCount: number;      // máquinas com coordenada (aparecem no mapa)
  licenseeNames: string[];
  tier: DensityTier;
}

/** Rodapé padrão de proveniência — todo bloco declara de onde veio o número. */
function SourceNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground mt-2">
      <Info className="h-3 w-3 mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

// ── Mapa de bolhas ───────────────────────────────────────────────────────────
function BubbleMap({ clusters }: { clusters: TerritoryCluster[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  // Cria o mapa uma única vez.
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      const map = L.map(mapRef.current, {
        center: [-15.0, -52.0], zoom: 4, zoomControl: true, scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      LRef.current = L;
      layerRef.current = L.layerGroup().addTo(map);
      leafletMapRef.current = map;
      // força o desenho inicial das bolhas
      setLayerVersion((v) => v + 1);
    });

    return () => {
      cancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  const [layerVersion, setLayerVersion] = useState(0);

  // Redesenha as bolhas sempre que os clusters (JÁ FILTRADOS) mudarem.
  useEffect(() => {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    clusters.forEach((cluster) => {
      const coords = getCityCoords(cluster.city, cluster.state);
      if (!coords) return;
      const radius = Math.max(10, cluster.machineCount * 6);
      const color = TIER_COLORS_MAP[cluster.tier] || "#94a3b8";
      L.circleMarker(coords, {
        radius, fillColor: color, color: "#fff", weight: 2, opacity: 0.9, fillOpacity: 0.75,
      })
        .bindPopup(`
          <div style="min-width:160px">
            <strong style="font-size:13px">${cluster.city}, ${cluster.state}</strong><br/>
            <span style="color:${color};font-weight:600">Tier ${cluster.tier} · ${DENSITY_CONFIG[cluster.tier].label}</span><br/>
            <span>🔧 ${cluster.machineCount} máquina(s)</span><br/>
            ${cluster.licenseeNames.length ? `<span style="font-size:11px;color:#666">${cluster.licenseeNames.slice(0, 3).join(", ")}</span>` : ""}
          </div>
        `)
        .addTo(layer);
    });
  }, [clusters, layerVersion]);

  return <div ref={mapRef} style={{ height: "440px", borderRadius: "12px", zIndex: 0 }} />;
}

export default function TerritoryIntelligence() {
  const { canAdmin } = useAuth();
  const { data: machines = [], isLoading } = useNetworkMap();

  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");

  // ── Clusters por cidade — base única de toda a tela ──
  const { clusters, semCidade, semCoordenada } = useMemo(() => {
    const map = new Map<string, TerritoryCluster>();
    let semCidade = 0;
    let semCoordenada = 0;

    machines.forEach((m) => {
      const temCoord = m.latitude != null && m.longitude != null;
      if (!temCoord) semCoordenada++;
      if (!m.location_city || !m.location_state) { semCidade++; return; }

      const key = `${m.location_city}|${m.location_state}`;
      const existing = map.get(key);
      if (existing) {
        existing.machineCount++;
        if (temCoord) existing.mappedCount++;
        if (m.licensee_name && !existing.licenseeNames.includes(m.licensee_name)) {
          existing.licenseeNames.push(m.licensee_name);
        }
      } else {
        map.set(key, {
          state: m.location_state, city: m.location_city,
          machineCount: 1, mappedCount: temCoord ? 1 : 0,
          licenseeNames: m.licensee_name ? [m.licensee_name] : [],
          tier: "C",
        });
      }
    });

    const clusters = Array.from(map.values())
      .map((c) => ({ ...c, tier: getDensityTier(c.machineCount) }))
      .sort((a, b) => b.machineCount - a.machineCount);

    return { clusters, semCidade, semCoordenada };
  }, [machines]);

  const uniqueStates = useMemo(
    () => Array.from(new Set(clusters.map((c) => c.state))).sort(),
    [clusters]
  );

  const filtered = useMemo(() => clusters.filter((c) => {
    if (tierFilter !== "all" && c.tier !== tierFilter) return false;
    if (stateFilter !== "all" && c.state !== stateFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.city.toLowerCase().includes(q) && !c.state.toLowerCase().includes(q)
        && !c.licenseeNames.some((n) => n.toLowerCase().includes(q))) return false;
    }
    return true;
  }), [clusters, tierFilter, stateFilter, search]);

  const tierStats = useMemo(() => {
    const counts: Record<DensityTier, number> = { A: 0, B: 0, C: 0 };
    clusters.forEach((c) => counts[c.tier]++);
    return counts;
  }, [clusters]);

  // Cobertura por estado — derivada dos MESMOS clusters (fecha com os demais blocos).
  const statesCoverage = useMemo(() => {
    const byState = new Map<string, number>();
    clusters.forEach((c) => byState.set(c.state, (byState.get(c.state) ?? 0) + c.machineCount));
    return Array.from(byState.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);
  }, [clusters]);

  const totalMaquinasEmCidades = clusters.reduce((s, c) => s + c.machineCount, 0);
  const totalFiltrado = filtered.reduce((s, c) => s + c.machineCount, 0);
  const totalLicenciados = new Set(clusters.flatMap((c) => c.licenseeNames)).size;

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
          <Brain className="h-8 w-8 text-amber-500/70" />
          <p className="text-sm font-medium">Área restrita a gestores.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <div className="space-y-6">
        <CarboPageHeader
          icon={Brain}
          iconColor="blue"
          title="Inteligência Territorial"
          description="Onde a rede já está: densidade de máquinas CarboVAPT por cidade"
        />

        <LicenciadosSubNav />

        {/* Nota de proveniência da tela inteira */}
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Fonte:</strong> cadastro de máquinas do Carbo Controle
              (tabela <code className="font-mono bg-muted px-1 rounded">machines</code>), agrupado por cidade.
              Todos os blocos abaixo usam esse mesmo conjunto — os totais fecham entre si.
              É um retrato <strong className="text-foreground">acumulado do cadastro</strong> (sem recorte de período).
            </span>
          </p>
        </div>

        {/* Legenda de classificação */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground mr-1">Classificação por densidade:</span>
          {(["A", "B", "C"] as DensityTier[]).map((tier) => (
            <CarboBadge key={tier} variant={DENSITY_CONFIG[tier].badge}>
              Tier {tier}: {DENSITY_CONFIG[tier].desc}
            </CarboBadge>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <CarboKPI title="Cidades com máquina" value={clusters.length} icon={MapPin}
            iconColor="blue" loading={isLoading} />
          {(["A", "B", "C"] as DensityTier[]).map((tier) => (
            <CarboKPI key={tier} title={`Tier ${tier} · ${DENSITY_CONFIG[tier].label}`}
              value={tierStats[tier]} icon={Gauge} iconColor={DENSITY_CONFIG[tier].kpi} loading={isLoading} />
          ))}
        </div>

        {/* Avisos de qualidade do dado */}
        {(semCidade > 0 || semCoordenada > 0) && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1">
            {semCidade > 0 && (
              <p className="text-xs text-muted-foreground">
                <strong className="text-amber-500">{semCidade}</strong> máquina(s) sem cidade/UF no cadastro — fora de todos os números desta tela.
              </p>
            )}
            {semCoordenada > 0 && (
              <p className="text-xs text-muted-foreground">
                <strong className="text-amber-500">{semCoordenada}</strong> máquina(s) sem coordenada — contam nos números, mas não aparecem no mapa.
              </p>
            )}
          </div>
        )}

        {/* Cobertura por estado */}
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-2 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Cobertura por Estado</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {statesCoverage.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma máquina com UF cadastrada.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {statesCoverage.map(({ state, count }) => (
                  <div key={state} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
                    <span className="text-sm font-bold text-foreground">{state}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            )}
            <SourceNote>
              Número de máquinas por UF, somando as mesmas cidades listadas abaixo.
            </SourceNote>
          </CardContent>
        </Card>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar cidade, UF ou licenciado…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Densidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as densidades</SelectItem>
              {(["A", "B", "C"] as DensityTier[]).map((t) => (
                <SelectItem key={t} value={t}>Tier {t} — {DENSITY_CONFIG[t].desc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              {uniqueStates.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Contador do filtro */}
        <p className="text-xs text-muted-foreground">
          Mostrando <strong className="text-foreground">{filtered.length}</strong> de {clusters.length} cidades
          {" · "}<strong className="text-foreground">{totalFiltrado}</strong> máquinas no filtro
        </p>

        {/* Mapa + tabela (ambos respeitam o filtro) */}
        <Tabs defaultValue="mapa">
          <TabsList>
            <TabsTrigger value="mapa" className="gap-1.5"><MapIcon className="h-4 w-4" /> Mapa</TabsTrigger>
            <TabsTrigger value="tabela" className="gap-1.5"><Table2 className="h-4 w-4" /> Tabela</TabsTrigger>
          </TabsList>

          <TabsContent value="mapa" className="mt-4">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="p-4">
                <BubbleMap clusters={filtered} />
                <SourceNote>
                  O tamanho da bolha é proporcional ao nº de máquinas na cidade; a cor indica o Tier.
                  As bolhas seguem os filtros acima. Cidades sem coordenada conhecida não são plotadas.
                </SourceNote>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tabela" className="mt-4">
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                {filtered.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma cidade para o filtro selecionado.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/30">
                      <tr>
                        {["Cidade", "UF", "Densidade", "Máquinas", "Licenciados"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map((c) => (
                        <tr key={`${c.city}|${c.state}`} className="hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{c.city}</td>
                          <td className="px-4 py-3 text-muted-foreground">{c.state}</td>
                          <td className="px-4 py-3">
                            <CarboBadge variant={DENSITY_CONFIG[c.tier].badge} size="sm">
                              Tier {c.tier}
                            </CarboBadge>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-foreground">{c.machineCount}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {c.licenseeNames.length > 0 ? c.licenseeNames.join(", ") : "Sem licenciado vinculado"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-secondary/20 border-t border-border">
                      <tr>
                        <td className="px-4 py-3 font-semibold text-foreground" colSpan={3}>Total no filtro</td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-foreground">{totalFiltrado}</td>
                        <td className="px-4 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
