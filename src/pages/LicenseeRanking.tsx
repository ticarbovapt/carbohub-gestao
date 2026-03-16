import { useState, useMemo } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trophy, Loader2, Search } from "lucide-react";
import { useLicenseeRanking } from "@/hooks/useNetworkIntelligence";

const TIERS = [
  { label: "S", color: "bg-purple-500" },
  { label: "A", color: "bg-blue-500" },
  { label: "B", color: "bg-green-500" },
  { label: "C", color: "bg-yellow-500" },
  { label: "D", color: "bg-gray-500" },
] as const;

const TIER_COLORS: Record<string, string> = {
  S: "bg-purple-500",
  A: "bg-blue-500",
  B: "bg-green-500",
  C: "bg-yellow-500",
  D: "bg-gray-500",
};

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-green-500",
  inativo: "bg-red-500",
  suspenso: "bg-yellow-500",
};

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  suspenso: "Suspenso",
};

export default function LicenseeRanking() {
  const { data: ranking = [], isLoading } = useLicenseeRanking();
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let items = [...ranking];

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (item) =>
          item.name?.toLowerCase().includes(q) ||
          item.code?.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) =>
      sortAsc ? (a.score ?? 0) - (b.score ?? 0) : (b.score ?? 0) - (a.score ?? 0)
    );

    return items;
  }, [ranking, search, sortAsc]);

  const totalLicenciados = ranking.length;
  const scoreMedio =
    ranking.length > 0
      ? (ranking.reduce((sum, r) => sum + (r.score ?? 0), 0) / ranking.length).toFixed(1)
      : "0";
  const tierSCount = ranking.filter((r) => r.tier === "S").length;
  const totalMaquinas = ranking.reduce((sum, r) => sum + (r.total_machines ?? 0), 0);

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10">
            <Trophy className="h-5 w-5 text-yellow-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Ranking de Licenciados</h1>
            <p className="text-sm text-muted-foreground">
              Performance e classificação da rede CarboVAPT
            </p>
          </div>
        </div>

        {/* Tier Legend */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground mr-1">Tiers:</span>
          {TIERS.map((tier) => (
            <Badge
              key={tier.label}
              className={`${tier.color} text-white border-transparent text-xs`}
            >
              {tier.label}
            </Badge>
          ))}
        </div>

        {/* Stats Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">Total Licenciados</p>
                <p className="text-2xl font-bold text-foreground mt-1">{totalLicenciados}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">Score Medio</p>
                <p className="text-2xl font-bold text-foreground mt-1">{scoreMedio}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">Tier S</p>
                <p className="text-2xl font-bold text-purple-500 mt-1">{tierSCount}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">Total Maquinas</p>
                <p className="text-2xl font-bold text-foreground mt-1">{totalMaquinas}</p>
              </div>
            </div>

            {/* Search + Sort */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou codigo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg border bg-card"
              >
                Score {sortAsc ? "\u2191 ASC" : "\u2193 DESC"}
              </button>
            </div>

            {/* Ranking Table */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">#</th>
                      <th className="px-4 py-3 text-left font-medium">Licenciado</th>
                      <th className="px-4 py-3 text-left font-medium">Cidade/UF</th>
                      <th className="px-4 py-3 text-left font-medium">Tier</th>
                      <th className="px-4 py-3 text-left font-medium">Score</th>
                      <th className="px-4 py-3 text-right font-medium">Maquinas Total</th>
                      <th className="px-4 py-3 text-right font-medium">1L</th>
                      <th className="px-4 py-3 text-right font-medium">100ml</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                          Nenhum licenciado encontrado.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((item, i) => (
                        <tr key={item.id} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium text-muted-foreground">
                            {i + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-foreground">{item.name}</p>
                              <p className="text-xs text-muted-foreground">{item.code}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {item.city && item.uf
                              ? `${item.city}/${item.uf}`
                              : item.city || item.uf || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              className={`${TIER_COLORS[item.tier] || "bg-gray-500"} text-white border-transparent text-xs`}
                            >
                              {item.tier || "-"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {item.score?.toFixed(1) ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">
                            {item.total_machines ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">
                            {item.machines_1l ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">
                            {item.machines_100ml ?? 0}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              className={`${STATUS_COLORS[item.status] || "bg-gray-500"} text-white border-transparent text-xs`}
                            >
                              {STATUS_LABELS[item.status] || item.status || "-"}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </BoardLayout>
  );
}
