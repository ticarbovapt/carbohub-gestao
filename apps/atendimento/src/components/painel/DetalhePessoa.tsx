import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useDetalhePessoa, type DetalhePessoa as Detalhe, type PainelAtendimento, type PainelNumero,
} from "@/hooks/usePainelAtendimento";
import {
  ACENTO, diasEntre, fmtData, fmtDataHora, fmtFone, fmtMin, fmtNum, fmtPct, haQuanto, hhmm, horasDoExpediente, pct,
} from "@/lib/painelAtendimento";
import { AbrirConversa, MostrarMais, NumeroChip, Pilula, RiscoBadge, TemaBadge, Vazio, useFatia } from "./comum";
import { POUCAS_RESPOSTAS } from "./Atendentes";
import type { Ver } from "./Indicadores";

const EIXO = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "ruim" | "fraco" }) {
  return (
    <div className="min-w-0 rounded-lg border px-3 py-2">
      <p className="truncate text-[11px] text-muted-foreground">{rotulo}</p>
      <p className={cn("text-lg font-bold tabular-nums leading-tight",
        tom === "ruim" && "text-orange-600 dark:text-orange-400",
        tom === "fraco" && "text-muted-foreground/60")}>{valor}</p>
    </div>
  );
}

function Dica({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <p className="font-semibold">{titulo}</p>
      <p className="tabular-nums text-muted-foreground">{valor}</p>
    </div>
  );
}

function Cliente({ nome, waId, numero, numeroId }: { nome: string | null; waId: string; numero?: PainelNumero; numeroId: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{nome || fmtFone(waId)}</p>
      <NumeroChip id={numeroId} numero={numero} />
    </div>
  );
}

function Listas({ d, ver, numeros, meta }: { d: Detalhe; ver: Ver; numeros: Map<string, PainelNumero>; meta: number }) {
  const [ordem, setOrdem] = useState<"lentas" | "recentes">("lentas");
  const util = ver === "util";
  const respondidas = useMemo(() => [...d.respondidas].sort((a, b) => ordem === "lentas"
    ? (util ? b.min_util - a.min_util : b.min_resp - a.min_resp)
    : b.respondido_em.localeCompare(a.respondido_em)), [d.respondidas, ordem, util]);
  const fechadas = useMemo(() => [...d.fechadas_sem_resposta].sort((a, b) => b.fechada_em.localeCompare(a.fechada_em)), [d.fechadas_sem_resposta]);
  const reabertas = useMemo(() => [...d.reabertas].sort((a, b) => b.voltou_em.localeCompare(a.voltou_em)), [d.reabertas]);

  const fR = useFatia(respondidas, 25, ordem + ver);
  const fF = useFatia(fechadas, 25);
  const fA = useFatia(reabertas, 25);

  return (
    <Tabs defaultValue={d.fechadas_sem_resposta.length ? "fechadas" : "respondidas"}>
      <TabsList className="w-full justify-start">
        <TabsTrigger value="respondidas">Respondidas · {d.respondidas.length}</TabsTrigger>
        <TabsTrigger value="fechadas" className={cn(d.fechadas_sem_resposta.length > 0 && "text-orange-700 dark:text-orange-400")}>
          Fechadas sem resposta · {d.fechadas_sem_resposta.length}
        </TabsTrigger>
        <TabsTrigger value="reabertas">Reabertas · {d.reabertas.length}</TabsTrigger>
      </TabsList>

      <TabsContent value="respondidas" className="space-y-2">
        <div className="flex gap-1.5">
          <Pilula ativo={ordem === "lentas"} onClick={() => setOrdem("lentas")}>Mais lentas</Pilula>
          <Pilula ativo={ordem === "recentes"} onClick={() => setOrdem("recentes")}>Mais recentes</Pilula>
        </div>
        {respondidas.length === 0 ? <Vazio>Nenhuma no período.</Vazio> : (
          <ul className="divide-y rounded-lg border">
            {fR.visiveis.map((r) => {
              const t = util ? r.min_util : r.min_resp;
              return (
                <li key={`${r.wa_id}:${r.respondido_em}`} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Cliente nome={r.nome} waId={r.wa_id} numeroId={r.numero_id} numero={numeros.get(r.numero_id)} />
                    <p className="line-clamp-2 break-words text-xs text-muted-foreground">{r.texto}</p>
                    <div className="flex flex-wrap items-center gap-1.5"><TemaBadge tema={r.tema} />{r.risco && <RiscoBadge />}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn("text-sm font-semibold tabular-nums",
                      !r.dentro_meta && "text-red-600 dark:text-red-400")} title={`meta ${meta} min de horário útil`}>{fmtMin(t)}</span>
                    <span className="text-[11px] text-muted-foreground">{fmtDataHora(r.respondido_em)}</span>
                    <AbrirConversa numeroId={r.numero_id} waId={r.wa_id} compacto />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <MostrarMais resto={fR.resto} onClick={fR.mais} />
      </TabsContent>

      <TabsContent value="fechadas" className="space-y-2">
        {fechadas.length === 0 ? <Vazio>Nenhuma no período.</Vazio> : (
          <ul className="divide-y rounded-lg border">
            {fF.visiveis.map((r) => (
              <li key={`${r.wa_id}:${r.fechada_em}`} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <Cliente nome={r.nome} waId={r.wa_id} numeroId={r.numero_id} numero={numeros.get(r.numero_id)} />
                  <p className="line-clamp-2 break-words text-xs text-muted-foreground">{r.texto}</p>
                  <div className="flex flex-wrap items-center gap-1.5"><TemaBadge tema={r.tema} />{r.risco && <RiscoBadge />}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                    {r.como === "resolvido" ? "Resolvido" : "Aguardando"} sem responder
                  </span>
                  <span className="text-[11px] text-muted-foreground">escreveu {fmtDataHora(r.desde)}</span>
                  <span className="text-[11px] text-muted-foreground">fechou {fmtDataHora(r.fechada_em)}</span>
                  <AbrirConversa numeroId={r.numero_id} waId={r.wa_id} compacto />
                </div>
              </li>
            ))}
          </ul>
        )}
        <MostrarMais resto={fF.resto} onClick={fF.mais} />
      </TabsContent>

      <TabsContent value="reabertas" className="space-y-2">
        {reabertas.length === 0 ? <Vazio>Nenhuma no período.</Vazio> : (
          <ul className="divide-y rounded-lg border">
            {fA.visiveis.map((r) => (
              <li key={`${r.wa_id}:${r.voltou_em}`} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <Cliente nome={r.nome} waId={r.wa_id} numeroId={r.numero_id} numero={numeros.get(r.numero_id)} />
                  {r.texto && <p className="line-clamp-2 break-words text-xs text-muted-foreground">{r.texto}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <span className="text-[11px] text-muted-foreground">resolveu {fmtDataHora(r.resolvida_em)}</span>
                  <span className="text-[11px] font-medium">voltou {fmtDataHora(r.voltou_em)}</span>
                  <AbrirConversa numeroId={r.numero_id} waId={r.wa_id} compacto />
                </div>
              </li>
            ))}
          </ul>
        )}
        <MostrarMais resto={fA.resto} onClick={fA.mais} />
      </TabsContent>
    </Tabs>
  );
}

export function DetalhePessoaSheet({ p, pessoa, numero, ver, agora, numeros, onFechar }: {
  p: PainelAtendimento; pessoa: string; numero: string | null; ver: Ver; agora: number;
  numeros: Map<string, PainelNumero>; onFechar: () => void;
}) {
  const a = p.atendentes.find((x) => x.chave === pessoa);
  const q = useDetalhePessoa(p.periodo.de, p.periodo.ate, pessoa, numero);
  const util = ver === "util";

  const diario = useMemo(() => {
    const m = new Map(p.atendentes_diario.filter((d) => d.chave === pessoa).map((d) => [d.dia, d]));
    return diasEntre(p.periodo.de, p.periodo.ate).map((dia) => ({
      dia, rotulo: fmtData(dia), mensagens: m.get(dia)?.mensagens ?? 0, conversas: m.get(dia)?.conversas ?? 0,
    }));
  }, [p.atendentes_diario, p.periodo.de, p.periodo.ate, pessoa]);

  const expediente = useMemo(() => horasDoExpediente(p.config), [p.config]);
  const porHora = useMemo(() => {
    const m = new Map((q.data?.por_hora ?? []).map((h) => [h.hora, h.mensagens]));
    return Array.from({ length: 24 }, (_, h) => ({ hora: h, rotulo: String(h), mensagens: m.get(h) ?? 0 }));
  }, [q.data?.por_hora]);

  const sla = a ? pct(a.dentro_meta, a.respondidas) : null;
  const pouca = !!a && a.respondidas < POUCAS_RESPOSTAS;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="pr-8 text-left">
          <SheetTitle>{a?.nome ?? "Pessoa"}</SheetTitle>
          {a && (
            <p className="text-xs text-muted-foreground">
              Última resposta {haQuanto(a.ultima_resposta_em, agora)}
              {a.primeira_hora && <> · mensagens entre {hhmm(a.primeira_hora)} e {hhmm(a.ultima_hora)}</>}
            </p>
          )}
        </SheetHeader>

        {!a ? <Vazio>Sem dados desta pessoa no período.</Vazio> : (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Numero rotulo="Respondidas" valor={fmtNum(a.respondidas)} />
              <Numero rotulo={`Mediana ${util ? "(útil)" : "(corrido)"}`} valor={fmtMin(util ? a.tmr_util_mediana : a.tmr_mediana)} tom={pouca ? "fraco" : undefined} />
              <Numero rotulo="p90 (corrido)" valor={fmtMin(a.tmr_p90)} tom={pouca ? "fraco" : undefined} />
              <Numero rotulo={`Na meta (${p.config.meta_resposta_min} min)`} valor={fmtPct(sla)} tom={pouca ? "fraco" : undefined} />
              <Numero rotulo="Mensagens" valor={fmtNum(a.mensagens)} />
              <Numero rotulo="Conversas" valor={fmtNum(a.conversas)} />
              <Numero rotulo="Dias ativos" valor={fmtNum(a.dias_ativos)} />
              <Numero rotulo="Em atendimento agora" valor={fmtNum(a.em_atendimento_agora)} />
              <Numero rotulo="Resolvidas" valor={fmtNum(a.resolvidas)} />
              <Numero rotulo="Reabertas" valor={fmtNum(a.reabertas)} />
              <Numero rotulo="Fechadas sem resposta" valor={fmtNum(a.fechadas_sem_resposta)} tom={a.fechadas_sem_resposta > 0 ? "ruim" : undefined} />
              <Numero rotulo="Notas internas" valor={fmtNum(a.notas)} />
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Mensagens por dia</p>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={diario} margin={{ top: 4, right: 0, left: -28, bottom: 0 }} barCategoryGap="15%">
                    <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
                    <YAxis tick={EIXO} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                    <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as (typeof diario)[number];
                        return <Dica titulo={fmtData(d.dia)} valor={`${d.mensagens} mensagens · ${d.conversas} conversas`} />;
                      }} />
                    <Bar dataKey="mensagens" fill={ACENTO} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Mensagens por hora</p>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: ACENTO }} /> no horário
                  <span className="ml-2 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: ACENTO, opacity: 0.35 }} /> fora
                </span>
              </div>
              <div className="h-24">
                {q.isLoading ? (
                  <div className="flex h-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porHora} margin={{ top: 4, right: 0, left: -28, bottom: 0 }} barCategoryGap="12%">
                      <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} interval={2} />
                      <YAxis tick={EIXO} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                      <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as (typeof porHora)[number];
                          return <Dica titulo={`${String(d.hora).padStart(2, "0")}h`} valor={`${d.mensagens} mensagens`} />;
                        }} />
                      <Bar dataKey="mensagens" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                        {porHora.map((h) => <Cell key={h.hora} fill={ACENTO} fillOpacity={expediente.has(h.hora) ? 1 : 0.35} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {q.isError ? (
              <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
                {(q.error as { message?: string })?.message ?? "Não foi possível carregar o detalhe."}
              </p>
            ) : q.isLoading || !q.data ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <Listas d={q.data} ver={ver} numeros={numeros} meta={p.config.meta_resposta_min} />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
