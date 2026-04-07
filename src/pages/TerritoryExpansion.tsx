import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { LicenseeSubNav } from "@/components/licensees/LicenseeSubNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, TrendingUp, MapPin, Target, Users, ExternalLink, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTerritoryExpansion, useTerritories, type Territory } from "@/hooks/useNetworkIntelligence";
import { useCRMLeads } from "@/hooks/useCRMLeads";
import type { CRMLead } from "@/types/crm";

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

// ── Strategy Dialog ──────────────────────────────────────────────────────────
function StrategyDialog({
  opportunity,
  onClose,
}: {
  opportunity: Territory | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data: allLeads = [] } = useCRMLeads("f2");

  const opp = opportunity;

  // Match CRM leads (f2 = Licenciados) by city or state
  const regionalLeads = useMemo(() => {
    if (!opp) return [];
    return allLeads.filter((lead: CRMLead) => {
      return (
        lead.city?.toLowerCase() === (opp.city || "").toLowerCase() ||
        lead.state?.toUpperCase() === (opp.state || "").toUpperCase()
      );
    });
  }, [allLeads, opp]);

  const hotLeads = useMemo(
    () => regionalLeads.filter((l: CRMLead) =>
      ["em_negociacao", "proposta", "qualificado", "apresentacao", "due_diligence"].includes(l.stage || "")
    ),
    [regionalLeads]
  );

  // Integrated opportunity score
  const oppScore = useMemo(() => {
    if (!opp) return 0;
    const territoryPart = (opp.territory_score || 0) * 0.4;
    const leadsPart     = Math.min(hotLeads.length * 10, 40) * 0.3;
    const popPart       = Math.min((opp.population || 0) / 100_000, 20) * 0.15;
    const compPart      = Math.max(0, 100 - (opp.competition_level || 0) * 20) * 0.15;
    return Math.min(100, Math.round(territoryPart + leadsPart + popPart + compPart));
  }, [opp, hotLeads]);

  if (!opp) return null;

  const comp = getCompetitionLabel(opp.competition_level || 0);

  return (
    <Dialog open={!!opportunity} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-500" />
            Estratégia de Expansão
          </DialogTitle>
          <DialogDescription>
            {opp.city}, {opp.state} — score territorial: {Math.round(opp.territory_score)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Score integrado */}
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Score de Oportunidade Integrado</span>
              <Badge className={`${getScoreColor(oppScore)} text-white border-0`}>{oppScore}/100</Badge>
            </div>
            <Progress value={oppScore} className="h-2" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>📍 Território: {Math.round(opp.territory_score * 0.4)}pts</span>
              <span>🔥 Leads quentes: {Math.min(hotLeads.length * 10, 40) * 0.3}pts</span>
              <span>👥 Potencial pop.: {Math.min((opp.population || 0) / 100_000, 20) * 0.15}pts</span>
              <span>🏆 Baixa concorrência: {Math.max(0, 100 - (opp.competition_level || 0) * 20) * 0.15}pts</span>
            </div>
          </div>

          {/* Territory data */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">População</p>
              <p className="font-semibold">{opp.population?.toLocaleString("pt-BR") || "—"}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Renda Média</p>
              <p className="font-semibold">{opp.avg_income ? `R$ ${opp.avg_income.toLocaleString("pt-BR")}` : "—"}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Densidade Moto</p>
              <p className="font-semibold">{opp.motorcycle_density || "—"}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Competição</p>
              <Badge className={`${comp.color} text-white border-0 text-xs`}>{comp.label}</Badge>
            </div>
          </div>

          {/* CRM leads da região */}
          <div>
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              🎯 Leads CRM na região
              <Badge variant="secondary">{regionalLeads.length} total · {hotLeads.length} quentes</Badge>
            </p>
            {regionalLeads.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Nenhum lead mapeado para esta região ainda.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {regionalLeads.slice(0, 6).map((lead: CRMLead) => (
                  <div key={lead.id} className="flex items-center justify-between text-xs rounded-lg border px-3 py-2 bg-muted/20">
                    <span className="font-medium">{lead.trade_name || lead.legal_name || lead.contact_name || "Lead"}</span>
                    <span className="text-muted-foreground">{lead.stage || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => { navigate("/crm/f2"); onClose(); }}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir Funil B2B no CRM
            </Button>
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TerritoryExpansion() {
  const { data: opportunities = [], isLoading: loadingOpp } = useTerritoryExpansion();
  const { data: allTerritories = [], isLoading: loadingAll } = useTerritories();
  const [strategyTarget, setStrategyTarget] = useState<Territory | null>(null);

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-emerald-500" />
              Expansão Territorial
            </h1>
            <p className="text-muted-foreground mt-1">
              Oportunidades de expansão identificadas por inteligência territorial
            </p>
          </div>
        </div>

        <LicenseeSubNav />

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
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-2 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                        onClick={() => setStrategyTarget(opp)}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Criar Estratégia
                      </Button>
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
            <div className="rounded-xl border bg-card overflow-hidden">
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
      </div>

      {/* Strategy Dialog */}
      <StrategyDialog opportunity={strategyTarget} onClose={() => setStrategyTarget(null)} />
    </BoardLayout>
  );
}
