import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  AlertTriangle, Activity, UserPlus, Trophy, XCircle, Clock, Settings2, Info, ArrowRight,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  useAcompanhamento, useStageSlas, useSaveStageSla,
  TRILHA_INICIO, DIAS_SUBCONTADOS,
} from "@/hooks/useAcompanhamento";
import { useVendedoresDir } from "@/hooks/useVendas";
import { FUNNEL_CONFIG, stageLabelAnywhere, type FunnelType } from "@/types/crm";

const PERIODOS = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
// Data-só é parseada como UTC por new Date("2026-07-30") e volta um dia no
// fuso do Brasil. Montamos a data local componente a componente.
const brDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export default function Acompanhamento() {
  const navigate = useNavigate();
  const [dias, setDias] = useState(30);
  const [slaAberto, setSlaAberto] = useState(false);

  const { desde, ate } = useMemo(() => {
    const hoje = new Date();
    const ini = new Date();
    ini.setDate(hoje.getDate() - (dias - 1));
    return { desde: iso(ini), ate: iso(hoje) };
  }, [dias]);

  const { data, isLoading, error } = useAcompanhamento(desde, ate);
  const { data: dir = [] } = useVendedoresDir();
  const nomeDe = (id: string | null) =>
    (id ? dir.find((d) => d.id === id)?.full_name : null) ?? "Sem dono";

  const serie = useMemo(
    () => (data?.serie ?? []).map((d) => ({ ...d, label: brDate(d.dia) })),
    [data],
  );

  // O período escolhido cobre dias sem trilha confiável? A tela precisa dizer,
  // senão o gestor lê "movimentação zero" como equipe parada.
  const avisoTrilha = desde < TRILHA_INICIO;
  const avisoLacuna = DIAS_SUBCONTADOS.some((d) => d >= desde && d <= ate);

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <CarboCard>
          <CarboCardContent className="p-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Não foi possível carregar o acompanhamento.</p>
              <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
            </div>
          </CarboCardContent>
        </CarboCard>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <CarboPageHeader
        title="Acompanhamento"
        description="Como a operação comercial se comportou no período"
        icon={Activity}
        actions={
          <div className="flex items-center gap-2">
            {PERIODOS.map((p) => (
              <Button
                key={p.dias}
                variant={dias === p.dias ? "default" : "outline"}
                size="sm"
                onClick={() => setDias(p.dias)}
              >
                {p.label}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSlaAberto(true)}>
              <Settings2 className="h-4 w-4 mr-1.5" /> Prazos
            </Button>
          </div>
        }
      />

      {(avisoTrilha || avisoLacuna) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            {avisoTrilha && (
              <p>
                <strong>A movimentação só é confiável a partir de 06/07/2026.</strong> Antes dessa
                data o registro de mudança de etapa não existia — os dias anteriores aparecem com
                zero por falta de registro, não por falta de trabalho.
              </p>
            )}
            {avisoLacuna && (
              <p className={avisoTrilha ? "mt-1" : ""}>
                <strong>24 e 25/07 estão subcontados.</strong> Cerca de 30 movimentos foram perdidos
                numa limpeza de duplicatas em 26/07.
              </p>
            )}
          </div>
        </div>
      )}

      {isLoading || !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <CarboSkeleton key={i} className="h-24 w-full" />)}
          </div>
          <CarboSkeleton className="h-72 w-full" />
        </div>
      ) : (
        <>
          {/* Faixa do dia — "esquecidos" em destaque por ser o único acionável agora */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={<UserPlus className="h-4 w-4" />} label="Criados hoje" value={data.hoje.criados} color="#3B82F6" />
            <Kpi icon={<Activity className="h-4 w-4" />} label="Movimentados hoje" value={data.hoje.movimentados} color="#8B5CF6" />
            <Kpi icon={<Trophy className="h-4 w-4" />} label="Ganhos hoje" value={data.hoje.ganhos} color="#22C55E" />
            <Kpi icon={<XCircle className="h-4 w-4" />} label="Perdidos hoje" value={data.hoje.perdidos} color="#EF4444" />
            <Kpi
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Esquecidos"
              value={data.hoje.esquecidos}
              color="#F59E0B"
              destaque
              hint={`${data.hoje.parados} parados de ${data.hoje.abertos} abertos`}
            />
          </div>

          {/* Série diária */}
          <CarboCard>
            <CarboCardContent className="p-4">
              <h2 className="text-sm font-bold mb-3">Movimento diário</h2>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8, fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="criados"   name="Criados"  fill="#3B82F6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="ganhos"    name="Ganhos"   fill="#22C55E" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="perdidos"  name="Perdidos" fill="#EF4444" radius={[3, 3, 0, 0]} />
                  <Line dataKey="movimentados" name="Movimentados" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Por pessoa — responde QUEM, sem isso a tela informa e não permite agir */}
            <CarboCard>
              <CarboCardContent className="p-4">
                <h2 className="text-sm font-bold mb-3">Por pessoa</h2>
                {data.por_pessoa.length === 0 ? (
                  <Vazio texto="Nenhum lead em aberto." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr className="border-b">
                          <th className="text-left font-medium py-1.5">Pessoa</th>
                          <th className="text-right font-medium">Abertos</th>
                          <th className="text-right font-medium">Parados</th>
                          <th className="text-right font-medium">Esquecidos</th>
                          <th className="text-right font-medium">Pior</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.por_pessoa.map((p) => (
                          <tr key={p.dono} className="border-b last:border-0">
                            <td className="py-1.5 truncate max-w-[160px]">{nomeDe(p.dono)}</td>
                            <td className="text-right tabular-nums">{p.abertos}</td>
                            <td className="text-right tabular-nums">{p.parados}</td>
                            <td className="text-right tabular-nums font-semibold"
                                style={{ color: p.esquecidos > 0 ? "#F59E0B" : undefined }}>
                              {p.esquecidos}
                            </td>
                            <td className="text-right tabular-nums text-muted-foreground">{p.pior_dias}d</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CarboCardContent>
            </CarboCard>

            {/* Por etapa — etapa que acumula é gargalo */}
            <CarboCard>
              <CarboCardContent className="p-4">
                <h2 className="text-sm font-bold mb-3">Funil agora</h2>
                {data.por_etapa.length === 0 ? (
                  <Vazio texto="Nenhum lead em aberto." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr className="border-b">
                          <th className="text-left font-medium py-1.5">Etapa</th>
                          <th className="text-right font-medium">Leads</th>
                          <th className="text-right font-medium">Parados</th>
                          <th className="text-right font-medium">Média</th>
                          <th className="text-right font-medium">Prazo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.por_etapa.map((e) => (
                          <tr key={`${e.funnel_type}-${e.stage}`} className="border-b last:border-0">
                            <td className="py-1.5">
                              <span className="text-muted-foreground">
                                {FUNNEL_CONFIG[e.funnel_type as FunnelType]?.shortName ?? e.funnel_type}
                              </span>{" · "}
                              {stageLabelAnywhere(e.stage, e.funnel_type as FunnelType)}
                            </td>
                            <td className="text-right tabular-nums">{e.leads}</td>
                            <td className="text-right tabular-nums font-semibold"
                                style={{ color: e.parados > 0 ? "#F59E0B" : undefined }}>
                              {e.parados}
                            </td>
                            <td className="text-right tabular-nums text-muted-foreground">{e.dias_medio}d</td>
                            <td className="text-right tabular-nums text-muted-foreground">{e.prazo_dias}d</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CarboCardContent>
            </CarboCard>
          </div>

          {/* Motivos — descarte de SDR e perda de closer são coisas diferentes */}
          <CarboCard>
            <CarboCardContent className="p-4">
              <h2 className="text-sm font-bold mb-3">Por que perdemos, no período</h2>
              {data.motivos.length === 0 ? (
                <Vazio texto="Nenhuma perda registrada no período." />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.motivos.map((m) => (
                    <span key={`${m.funnel_type}-${m.motivo}`}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                      <span className="text-muted-foreground">
                        {FUNNEL_CONFIG[m.funnel_type as FunnelType]?.shortName ?? m.funnel_type}
                      </span>
                      {m.motivo}
                      <span className="font-bold tabular-nums">{m.n}</span>
                    </span>
                  ))}
                </div>
              )}
            </CarboCardContent>
          </CarboCard>

          {/* Os esquecidos, clicáveis */}
          <CarboCard>
            <CarboCardContent className="p-4">
              <h2 className="text-sm font-bold mb-1">Esquecidos</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Passaram do prazo da etapa e não têm próximo passo agendado nem tarefa em aberto.
              </p>
              {data.lista_esquecidos.length === 0 ? (
                <Vazio texto="Nada esquecido. Todo lead parado tem próximo passo marcado." />
              ) : (
                <div className="divide-y">
                  {data.lista_esquecidos.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => navigate(`/crm/pipelines?funil=${l.funnel_type}&lead=${l.id}`)}
                      className="w-full flex items-center gap-3 py-2 text-left hover:bg-muted/50 rounded px-1"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{l.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {FUNNEL_CONFIG[l.funnel_type as FunnelType]?.shortName ?? l.funnel_type}
                          {" · "}
                          {stageLabelAnywhere(l.stage, l.funnel_type as FunnelType)}
                          {" · "}
                          {nomeDe(l.dono)}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums shrink-0"
                            style={{ color: "#F59E0B" }}>
                        <Clock className="h-3.5 w-3.5" />
                        {l.dias_parado}d
                        <span className="text-muted-foreground font-normal">/ {l.prazo_dias}d</span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </CarboCardContent>
          </CarboCard>
        </>
      )}

      <SlaDialog open={slaAberto} onClose={() => setSlaAberto(false)} />
    </div>
  );
}

function Kpi({ icon, label, value, color, destaque, hint }: {
  icon: React.ReactNode; label: string; value: number; color: string;
  destaque?: boolean; hint?: string;
}) {
  return (
    <CarboCard>
      <CarboCardContent
        className="p-3.5"
        style={destaque && value > 0 ? { borderColor: color, background: color + "0D" } : undefined}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span style={{ color }}>{icon}</span> {label}
        </div>
        <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: destaque && value > 0 ? color : undefined }}>
          {value}
        </p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </CarboCardContent>
    </CarboCard>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-xs text-muted-foreground py-6 text-center">{texto}</p>;
}

/** Edição dos prazos por etapa. Os valores iniciais são ponto de partida, não lei. */
function SlaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: slas = [], isLoading } = useStageSlas();
  const save = useSaveStageSla();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const porFunil = useMemo(() => {
    const m: Record<string, typeof slas> = {};
    for (const s of slas) (m[s.funnel_type] ||= []).push(s);
    return m;
  }, [slas]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prazo por etapa</DialogTitle>
          <DialogDescription>
            Quantos dias um lead pode ficar numa etapa sem se mover antes de contar como parado.
            Nutrição tolera 30 dias; Negociação, três. Um número só para todas as etapas viraria
            ruído.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <CarboSkeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-4">
            {Object.entries(porFunil).map(([funil, itens]) => (
              <div key={funil}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {FUNNEL_CONFIG[funil as FunnelType]?.name ?? funil}
                </p>
                <div className="space-y-1.5">
                  {itens.map((s) => {
                    const k = `${s.funnel_type}-${s.stage}`;
                    const valor = draft[k] ?? String(s.prazo_dias);
                    const num = Number(valor);
                    const invalido = !Number.isInteger(num) || num < 1 || num > 365;
                    const mudou = num !== s.prazo_dias;
                    return (
                      <div key={k} className="flex items-center gap-2">
                        <span className="flex-1 text-sm truncate">
                          {stageLabelAnywhere(s.stage, s.funnel_type as FunnelType)}
                        </span>
                        <Input
                          className="w-20 h-8 text-sm"
                          inputMode="numeric"
                          value={valor}
                          onChange={(e) => setDraft((p) => ({ ...p, [k]: e.target.value.replace(/\D/g, "") }))}
                        />
                        <span className="text-xs text-muted-foreground w-8">dias</span>
                        <Button
                          size="sm" variant="outline" className="h-8"
                          disabled={!mudou || invalido || save.isPending}
                          onClick={() => save.mutate({ ...s, prazo_dias: num })}
                        >
                          Salvar
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
