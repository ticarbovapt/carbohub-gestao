import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { PainelAtendimento, PainelCelula } from "@/hooks/usePainelAtendimento";
import { DIAS_CURTOS, corDaEtiqueta, fmtMin, fmtNum, fmtPct, hhmm, horasDoExpediente, pct } from "@/lib/painelAtendimento";
import { Bolinha, Pilula, Secao, Vazio } from "./comum";

type Leitura = "demanda" | "sem_resposta" | "tempo" | "mensagens";

const LEITURAS: { id: Leitura; rotulo: string; rgb: string }[] = [
  { id: "demanda", rotulo: "Demanda", rgb: "147, 51, 234" },
  { id: "sem_resposta", rotulo: "Sem resposta", rgb: "220, 38, 38" },
  { id: "tempo", rotulo: "Tempo de resposta", rgb: "234, 88, 12" },
  { id: "mensagens", rotulo: "Mensagens da equipe", rgb: "147, 51, 234" },
];

function valorDa(c: PainelCelula | undefined, l: Leitura): number | null {
  if (!c) return null;
  if (l === "demanda") return c.pedem || null;
  if (l === "sem_resposta") return c.pedem ? pct(c.sem_resposta, c.pedem) : null;
  if (l === "tempo") return c.tmr_mediana;
  return c.mensagens || null;
}

const fmtValor = (v: number | null, l: Leitura) =>
  v == null ? "—" : l === "sem_resposta" ? fmtPct(v) : l === "tempo" ? fmtMin(v) : fmtNum(v);

/** Dias consecutivos (ISO 1–7) viram UM retângulo de contorno. */
function blocosDeDias(dias: number[]): [number, number][] {
  const s = [...new Set(dias)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const d of s) {
    const ult = out[out.length - 1];
    if (ult && ult[1] === d - 1) ult[1] = d; else out.push([d, d]);
  }
  return out;
}

function Mapa({ p }: { p: PainelAtendimento }) {
  const [leitura, setLeitura] = useState<Leitura>("demanda");
  const cfg = LEITURAS.find((l) => l.id === leitura)!;
  const celulas = useMemo(() => new Map(p.heatmap.map((c) => [`${c.dow}:${c.hora}`, c])), [p.heatmap]);
  const max = useMemo(() => {
    if (leitura === "sem_resposta") return 100;
    let m = 0;
    for (const c of p.heatmap) { const v = valorDa(c, leitura); if (v != null && v > m) m = v; }
    return m || 1;
  }, [p.heatmap, leitura]);

  const horas = useMemo(() => [...horasDoExpediente(p.config)].sort((a, b) => a - b), [p.config]);
  const hIni = horas[0], hFim = horas[horas.length - 1];
  const blocos = blocosDeDias(p.config.dias);
  // No celular o mapa rola de lado: abre já no começo do expediente, não na madrugada.
  const rolagem = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rolagem.current;
    if (el && hIni != null && el.scrollWidth > el.clientWidth) el.scrollLeft = ((hIni - 1) / 24) * (el.scrollWidth - 40);
  }, [hIni, p.heatmap.length]);

  // Totais por hora e por dia — a borda do mapa, para ler o pico sem somar de cabeça.
  const totalHora = useMemo(() => Array.from({ length: 24 }, (_, h) =>
    p.heatmap.filter((c) => c.hora === h).reduce((s, c) => s + c.pedem, 0)), [p.heatmap]);

  return (
    <Secao
      titulo="Dia da semana × hora"
      acoes={<div className="flex flex-wrap gap-1.5">{LEITURAS.map((l) => (
        <Pilula key={l.id} ativo={leitura === l.id} onClick={() => setLeitura(l.id)}>{l.rotulo}</Pilula>
      ))}</div>}
    >
      {p.heatmap.length === 0 ? <Vazio>Nada no período.</Vazio> : (
        <TooltipProvider delayDuration={80}>
          <div ref={rolagem} className="overflow-x-auto pb-1">
            <div
              className="relative grid min-w-[640px] gap-[2px]"
              style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))", gridTemplateRows: "auto repeat(7, 1.75rem) auto" }}
            >
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="pb-1 text-center text-[10px] tabular-nums text-muted-foreground">{h % 2 === 0 ? `${h}h` : ""}</span>
              ))}

              {DIAS_CURTOS.map((rotulo, i) => {
                const dow = i + 1;
                return [
                  <span key={`r${dow}`} className="flex items-center text-xs font-medium text-muted-foreground" style={{ gridRow: dow + 1, gridColumn: 1 }}>{rotulo}</span>,
                  ...Array.from({ length: 24 }, (_, h) => {
                    const c = celulas.get(`${dow}:${h}`);
                    const v = valorDa(c, leitura);
                    const t = v == null ? 0 : Math.min(1, v / max);
                    return (
                      <Tooltip key={`${dow}:${h}`}>
                        <TooltipTrigger asChild>
                          <span
                            className={cn("rounded-[3px]", v == null && "bg-muted/60")}
                            style={{
                              gridRow: dow + 1, gridColumn: h + 2,
                              backgroundColor: v == null ? undefined : `rgba(${cfg.rgb}, ${0.12 + 0.88 * t})`,
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          <p className="font-semibold">{rotulo} · {String(h).padStart(2, "0")}h</p>
                          {c ? (
                            <div className="mt-0.5 space-y-0.5 tabular-nums">
                              <p>{fmtNum(c.pedem)} pediam resposta · {fmtNum(c.respondidas)} respondidas</p>
                              <p>{fmtNum(c.sem_resposta)} sem resposta ({fmtPct(pct(c.sem_resposta, c.pedem))})</p>
                              <p>Mediana {fmtMin(c.tmr_mediana)} · {fmtNum(c.mensagens)} mensagens da equipe</p>
                            </div>
                          ) : <p className="text-muted-foreground">Nada neste horário</p>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }),
                ];
              })}

              {/* O horário de atendimento: contorno sobre os dias e horas da configuração. */}
              {hIni != null && blocos.map(([d1, d2]) => (
                <span
                  key={`b${d1}`}
                  className="pointer-events-none -m-[2px] rounded-md border-2 border-foreground/70"
                  style={{ gridRow: `${d1 + 1} / ${d2 + 2}`, gridColumn: `${hIni + 2} / ${hFim + 3}` }}
                />
              ))}

              <span className="pt-1 text-[10px] text-muted-foreground" style={{ gridRow: 9, gridColumn: 1 }}>total</span>
              {totalHora.map((n, h) => (
                <span key={`t${h}`} className="pt-1 text-center text-[10px] tabular-nums text-muted-foreground" style={{ gridRow: 9, gridColumn: h + 2 }}>{n || ""}</span>
              ))}
            </div>
          </div>
        </TooltipProvider>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          {leitura === "sem_resposta" ? "0%" : leitura === "tempo" ? "rápido" : "pouco"}
          <span className="inline-block h-2.5 w-28 rounded-full"
            style={{ background: `linear-gradient(90deg, rgba(${cfg.rgb},0.12), rgba(${cfg.rgb},1))` }} />
          {fmtValor(max, leitura)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm border-2 border-foreground/70" />
          Horário de atendimento · {hhmm(p.config.hora_inicio)}–{hhmm(p.config.hora_fim)}
        </span>
      </div>
    </Secao>
  );
}

export function Horarios({ p }: { p: PainelAtendimento }) {
  const etiquetas = [...p.etiquetas].sort((a, b) => b.n - a.n);
  return (
    <div className="space-y-4">
      <Mapa p={p} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Secao titulo="Etiquetas">
          {etiquetas.length === 0 ? <Vazio>Nenhuma etiqueta no período.</Vazio> : (
            <ul className="space-y-1.5">
              {etiquetas.map((e) => (
                <li key={e.nome} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><Bolinha cor={corDaEtiqueta(e.cor)} /><span className="truncate">{e.nome}</span></span>
                  <span className="tabular-nums text-muted-foreground">{fmtNum(e.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>
    </div>
  );
}
