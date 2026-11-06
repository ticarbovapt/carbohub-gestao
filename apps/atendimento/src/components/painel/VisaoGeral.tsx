import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PainelAtendimento, PainelFaixa } from "@/hooks/usePainelAtendimento";
import {
  COR_DESFECHO, FAIXA_ROTULO, FAIXA_TETO, fmtData, fmtDataHora, fmtMin, fmtNum, fmtPct, haQuanto,
  minutosDesde, pct,
} from "@/lib/painelAtendimento";
import { Bolinha, Secao, Vazio } from "./comum";
import type { Ver } from "./Indicadores";

const SERIES = [
  { chave: "respondidas", rotulo: "Respondidas", cor: COR_DESFECHO.respondida },
  { chave: "fechadas_sem_resposta", rotulo: "Fechadas sem resposta", cor: COR_DESFECHO.fechada_sem_resposta },
  { chave: "perdidas", rotulo: "Perdidas", cor: COR_DESFECHO.perdida },
  { chave: "aguardando", rotulo: "Aguardando", cor: COR_DESFECHO.aguardando },
] as const;

const EIXO = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const GRADE = "hsl(var(--border))";

export function Legenda({ itens }: { itens: { rotulo: string; cor: string; tracejado?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {itens.map((i) => (
        <span key={i.rotulo} className="inline-flex items-center gap-1.5">
          {i.tracejado
            ? <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: i.cor }} />
            : <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: i.cor }} />}
          {i.rotulo}
        </span>
      ))}
    </div>
  );
}

function CaixaTooltip({ titulo, linhas }: { titulo: string; linhas: { rotulo: string; valor: string; cor?: string }[] }) {
  return (
    <div className="min-w-[180px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-semibold">{titulo}</p>
      {linhas.map((l) => (
        <p key={l.rotulo} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {l.cor && <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: l.cor }} />}
            {l.rotulo}
          </span>
          <span className="font-medium tabular-nums">{l.valor}</span>
        </p>
      ))}
    </div>
  );
}

export function GraficoDiario({ p, ver }: { p: PainelAtendimento; ver: Ver }) {
  const dados = useMemo(() => p.diario.map((d) => ({
    ...d,
    rotulo: fmtData(d.dia),
    mediana: ver === "util" ? d.tmr_util_mediana : d.tmr_mediana,
  })), [p.diario, ver]);
  const meta = ver === "util" ? p.config.meta_resposta_min : null;

  if (!dados.length) return <Secao titulo="Por dia"><Vazio>Nada no período.</Vazio></Secao>;

  return (
    <Secao titulo="Por dia" acoes={<Legenda itens={SERIES.map((s) => ({ rotulo: s.rotulo, cor: s.cor }))} />}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke={GRADE} strokeOpacity={0.6} />
            <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} />
            <YAxis tick={EIXO} tickLine={false} axisLine={false} allowDecimals={false} width={48} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof dados)[number];
                return (
                  <CaixaTooltip
                    titulo={new Date(`${d.dia}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    linhas={[
                      { rotulo: "Pediam resposta", valor: fmtNum(d.pedem) },
                      ...SERIES.map((s) => ({ rotulo: s.rotulo, valor: fmtNum(d[s.chave]), cor: s.cor })),
                      { rotulo: "Taxa de resposta", valor: fmtPct(pct(d.respondidas, d.pedem_encerradas)) },
                      { rotulo: "Dentro da meta", valor: `${fmtNum(d.dentro_meta)} · ${fmtPct(pct(d.dentro_meta, d.sla_base))}` },
                      { rotulo: "Só agradecimento", valor: fmtNum(d.nao_pedem) },
                      { rotulo: "Mensagens da equipe", valor: fmtNum(d.mensagens) },
                    ]}
                  />
                );
              }}
            />
            {SERIES.map((s) => (
              <Bar key={s.chave} dataKey={s.chave} stackId="d" fill={s.cor} stroke="hsl(var(--card))" strokeWidth={1} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Mediana de resposta {ver === "util" ? "(horário útil)" : "(corrido)"}
        </p>
        {meta != null && <Legenda itens={[{ rotulo: `meta ${meta} min`, cor: "hsl(var(--muted-foreground))", tracejado: true }]} />}
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRADE} strokeOpacity={0.6} />
            <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} />
            <YAxis tick={EIXO} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (v < 1 ? "0" : fmtMin(v))} />
            {meta != null && <ReferenceLine y={meta} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />}
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof dados)[number];
                return <CaixaTooltip titulo={fmtData(d.dia)} linhas={[{ rotulo: "Mediana", valor: fmtMin(d.mediana) }, { rotulo: "Respondidas", valor: fmtNum(d.respondidas) }]} />;
              }}
            />
            <Line type="monotone" dataKey="mediana" stroke="#9333EA" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Secao>
  );
}

export function Faixas({ p, ver }: { p: PainelAtendimento; ver: Ver }) {
  const faixas: PainelFaixa[] = useMemo(
    () => [...(ver === "util" ? p.faixas : p.faixas_corrido)].sort((a, b) => a.ordem - b.ordem),
    [p.faixas, p.faixas_corrido, ver],
  );
  const total = faixas.reduce((s, f) => s + f.n, 0);
  const max = Math.max(1, ...faixas.map((f) => f.n));
  const meta = p.config.meta_resposta_min;
  // A linha da meta cai na primeira faixa cujo teto alcança a meta.
  const faixaDaMeta = ver === "util" ? faixas.find((f) => (FAIXA_TETO[f.faixa] ?? -1) >= meta)?.faixa : undefined;

  const cor = (f: PainelFaixa) => {
    const teto = FAIXA_TETO[f.faixa];
    if (teto == null) return COR_DESFECHO[f.faixa as keyof typeof COR_DESFECHO] ?? COR_DESFECHO.aguardando;
    if (ver === "util") return teto <= meta ? COR_DESFECHO.respondida : "hsl(142 30% 62%)";
    return "hsl(142 40% 55%)";
  };

  return (
    <Secao titulo={`Tempo até a resposta ${ver === "util" ? "(horário útil)" : "(corrido)"}`}>
      {total === 0 ? <Vazio>Nada no período.</Vazio> : (
        <ul className="space-y-2">
          {faixas.map((f) => {
            const tempo = FAIXA_TETO[f.faixa] != null;
            return (
              <li key={f.faixa} className={cn(!tempo && f.faixa === "fechada_sem_resposta" && "mt-3 border-t pt-3")}>
                <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                  <span className={cn("flex items-center gap-1.5", !tempo && "font-medium")}>
                    {FAIXA_ROTULO[f.faixa] ?? f.faixa}
                    {f.faixa === faixaDaMeta && (
                      <span className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">meta {meta} min</span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{fmtNum(f.n)}</span> · {fmtPct(pct(f.n, total))}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full" style={{ width: `${(f.n / max) * 100}%`, backgroundColor: cor(f), minWidth: f.n ? 4 : 0 }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Secao>
  );
}

const ESQUECIDA_MIN = 2 * 24 * 60;

export function PorNumero({ p, ver, agora, onNumero }: { p: PainelAtendimento; ver: Ver; agora: number; onNumero: (id: string) => void }) {
  const linhas = [...p.por_numero].sort((a, b) => b.pedem - a.pedem);
  return (
    <Secao titulo="Por número" corpo="p-0">
      {linhas.length === 0 ? <Vazio>Nada no período.</Vazio> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Número</TableHead>
              <TableHead className="text-right">Pediam</TableHead>
              <TableHead className="text-right">Taxa</TableHead>
              <TableHead className="text-right">Mediana</TableHead>
              <TableHead className="text-right">SLA</TableHead>
              <TableHead className="text-right">Perdidas</TableHead>
              <TableHead className="text-right">Fechadas s/ resposta</TableHead>
              <TableHead className="pr-4">Última resposta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((n) => {
              const taxa = pct(n.respondidas, n.pedem_encerradas);
              const sla = pct(n.dentro_meta, n.sla_base);
              const desde = n.ultima_resposta_em ? minutosDesde(n.ultima_resposta_em, agora) : Infinity;
              const esquecida = desde > ESQUECIDA_MIN;
              return (
                <TableRow key={n.numero_id} className={cn(esquecida && "bg-red-500/[0.04]")}>
                  <TableCell className="pl-4">
                    <button type="button" onClick={() => onNumero(n.numero_id)} className="flex items-center gap-2 font-medium hover:underline">
                      <Bolinha cor={n.cor} /> <span className="whitespace-nowrap">{n.rotulo ?? n.numero_id}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(n.pedem)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium",
                    taxa != null && taxa < p.config.meta_taxa_resposta_pct && "text-red-600 dark:text-red-400")}>{fmtPct(taxa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMin(ver === "util" ? n.tmr_util_mediana : n.tmr_mediana)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPct(sla)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(n.perdidas)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", n.fechadas_sem_resposta > 0 && "font-semibold text-orange-600 dark:text-orange-400")}>
                    {fmtNum(n.fechadas_sem_resposta)}
                  </TableCell>
                  <TableCell className="pr-4">
                    {esquecida ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400"
                        title={fmtDataHora(n.ultima_resposta_em)}>
                        <AlertTriangle className="h-3 w-3" />
                        {n.ultima_resposta_em ? `sem resposta ${haQuanto(n.ultima_resposta_em, agora)}` : "nunca respondeu"}
                      </span>
                    ) : (
                      <span className="whitespace-nowrap text-xs text-muted-foreground" title={fmtDataHora(n.ultima_resposta_em)}>
                        {haQuanto(n.ultima_resposta_em, agora)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Secao>
  );
}

export function VisaoGeral({ p, ver, agora, onNumero }: { p: PainelAtendimento; ver: Ver; agora: number; onNumero: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2"><GraficoDiario p={p} ver={ver} /></div>
        <Faixas p={p} ver={ver} />
      </div>
      <PorNumero p={p} ver={ver} agora={agora} onNumero={onNumero} />
    </div>
  );
}
