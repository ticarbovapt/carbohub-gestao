import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, MapPin, Target, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { useAuth } from "@/contexts/AuthContext";
import { LicenciadosSubNav } from "@/components/licenciados/LicenciadosSubNav";
import { useTerritoryExpansion, useTerritories } from "@/hooks/useNetworkIntelligence";

function getCompetitionLabel(level: number) {
  if (level < 3) return { label: "Baixa", color: "bg-green-500" };
  if (level <= 6) return { label: "Média", color: "bg-yellow-500" };
  return { label: "Alta", color: "bg-red-500" };
}

function getScoreColor(score: number) {
  if (score >= 70) return "bg-green-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <Target className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

// Espelho read-only da Expansão Territorial do controle. O botão "Criar
// Estratégia" (que abria o funil do CRM) foi removido — Admin é só leitura.
export default function TerritoryExpansion() {
  const { canAdmin } = useAuth();
  const { data: opportunities = [], isLoading: loadingOpp } = useTerritoryExpansion();
  const { data: allTerritories = [], isLoading: loadingAll } = useTerritories();

  const claimedTerritories = useMemo(
    () => allTerritories.filter((t) => t.licensee_id),
    [allTerritories]
  );

  const avgScore = useMemo(() => {
    if (opportunities.length === 0) return 0;
    return Math.round(
      opportunities.reduce((sum, t) => sum + (t.territory_score || 0), 0) / opportunities.length
    );
  }, [opportunities]);

  const isLoading = loadingOpp || loadingAll;

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <RestrictedNotice />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={TrendingUp}
        iconColor="green"
        title="Expansão Territorial"
        description="Oportunidades de expansão identificadas por inteligência territorial"
      />

      <LicenciadosSubNav />

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <>
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <MapPin className="h-4 w-4" />
              <span>Territórios Mapeados</span>
            </div>
            <p className="text-2xl font-bold">{allTerritories.length}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-emerald-500 text-sm">
              <Target className="h-4 w-4" />
              <span>Oportunidades</span>
            </div>
            <p className="text-2xl font-bold">{opportunities.length}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-blue-500 text-sm">
              <TrendingUp className="h-4 w-4" />
              <span>Score Médio</span>
            </div>
            <p className="text-2xl font-bold">{avgScore}</p>
          </div>
        </div>

        {/* Expansion Opportunities */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Oportunidades de Expansão</h2>
          {opportunities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Nenhuma oportunidade identificada</p>
              <p className="text-sm">Cadastre territórios para ver as oportunidades.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {opportunities.map((opp) => {
                const comp = getCompetitionLabel(opp.competition_level || 0);
                return (
                  <Card key={opp.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          {opp.city}, {opp.state}
                        </CardTitle>
                        <Badge className={`${getScoreColor(opp.territory_score)} text-white border-0`}>
                          Score: {Math.round(opp.territory_score)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                        <div>
                          <span className="font-medium text-foreground">População:</span>{" "}
                          {opp.population?.toLocaleString("pt-BR") || "—"}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Renda Média:</span>{" "}
                          {opp.avg_income ? `R$ ${opp.avg_income.toLocaleString("pt-BR")}` : "—"}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Densidade Moto:</span>{" "}
                          {opp.motorcycle_density || "—"}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-foreground">Competição:</span>
                          <Badge variant="outline" className={`${comp.color} text-white border-0 text-xs`}>
                            {comp.label}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Claimed Territories */}
        {claimedTerritories.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Territórios Atribuídos
            </h2>
            <div className="rounded-xl border bg-card overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Cidade</th>
                    <th className="px-4 py-3 text-left font-medium">UF</th>
                    <th className="px-4 py-3 text-left font-medium">Licenciado</th>
                    <th className="px-4 py-3 text-left font-medium">Densidade</th>
                    <th className="px-4 py-3 text-left font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {claimedTerritories.map((t) => (
                    <tr key={t.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{t.city}</td>
                      <td className="px-4 py-3">{t.state}</td>
                      <td className="px-4 py-3">{t.licensee_name || "—"}</td>
                      <td className="px-4 py-3">{t.machine_density}</td>
                      <td className="px-4 py-3">
                        <Badge className={`${getScoreColor(t.territory_score)} text-white border-0 text-xs`}>
                          {Math.round(t.territory_score)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
      )}
    </main>
  );
}
