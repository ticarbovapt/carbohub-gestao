import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Info, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useAllProfiles } from "@/hooks/useBugReports";

// ─────────────────────────────────────────────────────────────────────────────
// Ranking do TI. Decisões que importam (e o porquê):
//  • Colunas independentes, SEM pontuação única e SEM pódio numerado. Com 2-5
//    pessoas, um score de "72 vs 68" comunica precisão que o dado não tem — e
//    vira alvo único de otimização.
//  • Quem tem menos de 5 entregas no período fica fora da ordenação (aparece
//    em "amostra em formação"). Mediana com n=2 é sorte, não desempenho.
//  • Velocidade é ÍNDICE contra a mediana do time no mesmo nível de prioridade,
//    não hora crua: pegar só demanda fácil não melhora o número.
//  • Nada de vermelho nas linhas de pessoas — vermelho fica pra fila.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_AMOSTRA = 5;

interface RankRow {
  person_id: string; person_name: string | null;
  entregas: number; pontos: number; criticas: number;
  assumidas: number; em_aberto: number; paradas: number;
  reabertas: number; sem_solicitante: number; idas_aguardando: number;
  amostra_tempo: number; minutos_ativos_med: number | null;
  indice_velocidade: number | null; fechadas_sem_execucao: number;
}
interface TimeRow {
  entregues: number; lead_p50_horas: number | null; lead_p90_horas: number | null;
  triagem_p50_horas: number | null; firmeza_pct: number | null; fila_envelhecida: number;
}

const PERIODOS = [
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
] as const;

const dur = (min: number | null) => {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)}min`;
  const h = min / 60;
  return h < 24 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;
};
const horas = (h: number | null) => (h == null ? "—" : h < 24 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`);

function useRanking(dias: number) {
  return useQuery({
    queryKey: ["ti_ranking", dias],
    queryFn: async (): Promise<RankRow[]> => {
      const from = new Date(Date.now() - dias * 86_400_000).toISOString();
      const { data, error } = await (supabase as any).rpc("carbo_ti_ranking", {
        p_from: from, p_to: new Date().toISOString(),
      });
      if (error) throw error;
      return (data ?? []) as RankRow[];
    },
  });
}
function useTimeMetrics(dias: number) {
  return useQuery({
    queryKey: ["ti_time", dias],
    queryFn: async (): Promise<TimeRow | null> => {
      const from = new Date(Date.now() - dias * 86_400_000).toISOString();
      const { data, error } = await (supabase as any).rpc("carbo_ti_time", {
        p_from: from, p_to: new Date().toISOString(),
      });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as TimeRow | null;
    },
  });
}

export function RankingTI() {
  const { user } = useAuth();
  const [dias, setDias] = useState<number>(90);
  const [comoOpen, setComoOpen] = useState(false);
  const { data: linhas = [], isLoading } = useRanking(dias);
  const { data: time } = useTimeMetrics(dias);
  const { data: dir = [] } = useAllProfiles();

  const avatarOf = (id: string) => dir.find((x) => x.id === id)?.avatar_url ?? null;

  // Só entra na ordenação quem tem amostra suficiente — o resto aparece à parte.
  const { rankeados, formando } = useMemo(() => {
    const comEntrega = linhas.filter((l) => l.entregas > 0 || l.assumidas > 0 || l.em_aberto > 0);
    return {
      rankeados: comEntrega.filter((l) => l.entregas >= MIN_AMOSTRA),
      formando: comEntrega.filter((l) => l.entregas < MIN_AMOSTRA),
    };
  }, [linhas]);

  // Destaques: com vários critérios, quase todo mundo leva um — sem inventar
  // prêmio de participação, cada um tem regra objetiva.
  const badges = useMemo(() => {
    const b = new Map<string, string[]>();
    const add = (id: string | undefined, txt: string) => {
      if (!id) return;
      b.set(id, [...(b.get(id) ?? []), txt]);
    };
    const elegiveis = rankeados;
    if (!elegiveis.length) return b;
    const max = <K extends keyof RankRow>(k: K) =>
      [...elegiveis].sort((x, y) => Number(y[k] ?? 0) - Number(x[k] ?? 0))[0];
    add(max("pontos")?.person_id, "mais entregas");
    const crit = max("criticas");
    if (crit && crit.criticas > 0) add(crit.person_id, "mais críticas");
    const rapido = [...elegiveis]
      .filter((x) => x.indice_velocidade != null && x.amostra_tempo >= MIN_AMOSTRA)
      .sort((x, y) => (x.indice_velocidade ?? 9) - (y.indice_velocidade ?? 9))[0];
    if (rapido) add(rapido.person_id, "mais rápido");
    const firme = elegiveis.filter((x) => x.reabertas === 0);
    firme.forEach((f) => add(f.person_id, "zero reaberturas"));
    return b;
  }, [rankeados]);

  const poucaGente = rankeados.length < 3;

  return (
    <CarboCard>
      <CarboCardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-carbo-green" /> Time de TI
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Como está o fluxo das demandas — não a produtividade das pessoas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-muted p-0.5">
              {PERIODOS.map((p) => (
                <button key={p.dias} onClick={() => setDias(p.dias)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                    dias === p.dias ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={() => setComoOpen((o) => !o)}
              className="text-muted-foreground hover:text-foreground p-1" title="Como é calculado">
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>

        {comoOpen && (
          <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-[11px] text-muted-foreground">
            <p><strong className="text-foreground">Entregas (pts):</strong> demandas concluídas, ponderadas por impacto (crítica 3,0 · alta 2,0 · média 1,3 · baixa 1,0). Uma entrega que reabre em até 14 dias vale zero.</p>
            <p><strong className="text-foreground">Velocidade:</strong> tempo em que a demanda esteve <em>na sua mão</em> (Em andamento + Em teste), dividido pela mediana do time no mesmo nível de prioridade. <strong>0,7×</strong> = leva 70% do tempo típico. Fila e “Aguardando solicitante” não entram.</p>
            <p><strong className="text-foreground">Assumidas / Em aberto:</strong> contexto de carga — não valem posição. Assumir muito e entregar pouco aparece na conversão.</p>
            <p>Só entra na lista quem tem {MIN_AMOSTRA}+ entregas no período. Prioridade mede <em>impacto para quem pediu</em>, não dificuldade técnica.</p>
          </div>
        )}

        {/* Bloco do TIME — o adversário é a fila, não o colega. */}
        {time && (
          <div className="rounded-lg border bg-muted/30 p-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span><strong className="text-foreground">{time.entregues}</strong> <span className="text-muted-foreground">entregues</span></span>
            <span className="text-muted-foreground">Do pedido à entrega: <strong className="text-foreground">{horas(time.lead_p50_horas)}</strong> <span className="text-[11px]">(90% em {horas(time.lead_p90_horas)})</span></span>
            <span className="text-muted-foreground">Até triar: <strong className="text-foreground">{horas(time.triagem_p50_horas)}</strong></span>
            {time.firmeza_pct != null && (
              <span className="text-muted-foreground">Firmeza: <strong className="text-foreground">{time.firmeza_pct}%</strong></span>
            )}
            {time.fila_envelhecida > 0 && (
              <span className="text-amber-500">{time.fila_envelhecida} na fila há +14d</span>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}</div>
        ) : rankeados.length === 0 && formando.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Ainda sem entregas registradas neste período.
          </p>
        ) : (
          <>
            {/* Com menos de 3 pessoas, lista ordenada = "o melhor e o pior". */}
            {poucaGente && rankeados.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Poucas pessoas no período — mostrando os números sem ordenação comparativa.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                    <th className="text-left font-medium py-2">Pessoa</th>
                    <th className="text-right font-medium py-2">Entregas</th>
                    <th className="text-right font-medium py-2">Velocidade</th>
                    <th className="text-right font-medium py-2">Firmeza</th>
                    <th className="text-right font-medium py-2 whitespace-nowrap">Assumidas / Em aberto</th>
                  </tr>
                </thead>
                <tbody>
                  {rankeados.map((r) => {
                    const eu = r.person_id === user?.id;
                    const firmeza = r.entregas > 0
                      ? Math.round(100 * (1 - r.reabertas / r.entregas)) : null;
                    const temTempo = r.indice_velocidade != null && r.amostra_tempo >= MIN_AMOSTRA;
                    return (
                      <tr key={r.person_id}
                        className={`border-b last:border-0 ${eu ? "bg-carbo-green/5" : ""}`}>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <ProfileAvatar userId={r.person_id} avatarUrl={avatarOf(r.person_id)}
                              fullName={r.person_name} size={24} />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{r.person_name || "—"}</p>
                              {!!badges.get(r.person_id)?.length && (
                                <p className="text-[10px] text-carbo-green truncate">
                                  {badges.get(r.person_id)!.join(" · ")}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          <span className="font-semibold">{r.pontos}</span>
                          <span className="text-[11px] text-muted-foreground"> pts ({r.entregas})</span>
                          {r.criticas > 0 && (
                            <p className="text-[10px] text-muted-foreground">{r.criticas} crítica(s)/alta(s)</p>
                          )}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {temTempo ? (
                            <>
                              <span className="font-medium">{r.indice_velocidade}×</span>
                              <p className="text-[10px] text-muted-foreground">
                                {dur(r.minutos_ativos_med)} · n={r.amostra_tempo}
                              </p>
                            </>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">
                              — <span className="text-[10px]">(n={r.amostra_tempo})</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {firmeza != null ? (
                            <span className={firmeza >= 90 ? "text-carbo-green font-medium" : ""}>{firmeza}%</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2.5 text-right tabular-nums whitespace-nowrap">
                          {r.assumidas} / {r.em_aberto}
                          {r.paradas > 0 && (
                            <p className="text-[10px] text-amber-500">{r.paradas} parada(s)</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {formando.length > 0 && (
              <p className="text-[11px] text-muted-foreground border-t pt-2.5 flex items-start gap-1.5">
                <Users className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Amostra em formação:{" "}
                  {formando.map((f) => `${f.person_name || "—"} (${f.entregas})`).join(" · ")}
                  {" "}— aparecem na lista a partir de {MIN_AMOSTRA} entregas.
                </span>
              </p>
            )}

            <p className="text-[10px] text-muted-foreground leading-relaxed border-t pt-2.5">
              Estes números medem o fluxo das demandas, não as pessoas. Tempo de fila, triagem e
              espera pelo solicitante não entram no número individual. Muito do trabalho do TI —
              ajudar alguém por telefone, plantão, documentação — não vira demanda e não aparece aqui.
              Histórico de tempo disponível a partir de 25/07/2026.
            </p>
          </>
        )}
      </CarboCardContent>
    </CarboCard>
  );
}
