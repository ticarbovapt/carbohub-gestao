import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PainelAtendente, PainelAtendimento } from "@/hooks/usePainelAtendimento";
import { fmtDataHora, fmtMin, fmtNum, fmtPct, haQuanto, hhmm, pct } from "@/lib/painelAtendimento";
import { Secao, Vazio } from "./comum";
import type { Ver } from "./Indicadores";

/** Abaixo disso a mediana não diz muito sobre a pessoa — a tela a esmaece. */
export const POUCAS_RESPOSTAS = 5;

type Col = {
  chave: string; rotulo: string; titulo?: string;
  valor: (a: PainelAtendente) => number | string | null;
  render: (a: PainelAtendente) => ReactNode;
  alinhar?: "esq" | "dir";
  /** Some abaixo de 1536 px (o detalhe da pessoa tem o número). */
  secundaria?: boolean;
  /** Para ordenar: true = o MAIOR vem primeiro no primeiro clique. */
  maiorPrimeiro?: boolean;
};

// A cobrança vem primeiro (tempo, meta, fechou sem responder); volume depois.
const ORDEM_COLS = ["respondidas", "mediana", "p90", "sla", "fechadas", "resolvidas", "reabertas",
  "mensagens", "conversas", "dias", "notas", "agora", "ultima", "horario"];

export const ativo = (a: PainelAtendente) =>
  a.respondidas + a.mensagens + a.resolvidas + a.reabertas + a.fechadas_sem_resposta + a.notas + a.em_atendimento_agora > 0;

export function Atendentes({ p, ver, agora, onPessoa }: { p: PainelAtendimento; ver: Ver; agora: number; onPessoa: (chave: string) => void }) {
  const util = ver === "util";
  const [ordem, setOrdem] = useState<{ col: string; desc: boolean }>({ col: "respondidas", desc: true });
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const cols: Col[] = useMemo(() => ([
    { chave: "respondidas", rotulo: "Respondidas", valor: (a) => a.respondidas, render: (a) => fmtNum(a.respondidas), maiorPrimeiro: true },
    {
      chave: "mediana", rotulo: "Mediana", titulo: util ? "Tempo de resposta, horário útil" : "Tempo de resposta, corrido",
      valor: (a) => (util ? a.tmr_util_mediana : a.tmr_mediana),
      render: (a) => (
        <span className={cn(a.respondidas < POUCAS_RESPOSTAS && "text-muted-foreground/60")}
          title={a.respondidas < POUCAS_RESPOSTAS ? `Só ${a.respondidas} respondidas` : undefined}>
          {fmtMin(util ? a.tmr_util_mediana : a.tmr_mediana)}
        </span>
      ),
    },
    {
      chave: "p90", rotulo: "p90", titulo: "Tempo corrido",
      valor: (a) => a.tmr_p90,
      render: (a) => <span className={cn(a.respondidas < POUCAS_RESPOSTAS && "text-muted-foreground/60")}>{fmtMin(a.tmr_p90)}</span>,
    },
    {
      chave: "sla", rotulo: "Na meta", titulo: `Respondidas em até ${p.config.meta_resposta_min} min de horário útil`,
      valor: (a) => pct(a.dentro_meta, a.respondidas),
      render: (a) => {
        const v = pct(a.dentro_meta, a.respondidas);
        return <span className={cn(v != null && v < p.config.meta_sla_pct && a.respondidas >= POUCAS_RESPOSTAS && "text-red-600 dark:text-red-400")}>{fmtPct(v)}</span>;
      },
      maiorPrimeiro: true,
    },
    { chave: "mensagens", rotulo: "Mensagens", valor: (a) => a.mensagens, render: (a) => (
      <>{fmtNum(a.mensagens)}{a.falharam > 0 && <span className="ml-1 text-[11px] text-red-600 dark:text-red-400" title="Falharam no envio">({a.falharam} ✕)</span>}</>
    ), maiorPrimeiro: true },
    { chave: "conversas", secundaria: true, rotulo: "Conversas", valor: (a) => a.conversas, render: (a) => fmtNum(a.conversas), maiorPrimeiro: true },
    { chave: "dias", rotulo: "Dias", titulo: "Dias com mensagem no período", valor: (a) => a.dias_ativos, render: (a) => fmtNum(a.dias_ativos), maiorPrimeiro: true },
    { chave: "resolvidas", rotulo: "Resolvidas", valor: (a) => a.resolvidas, render: (a) => fmtNum(a.resolvidas), maiorPrimeiro: true },
    {
      chave: "reabertas", rotulo: "Reabertas", titulo: "Das resolvidas há 7+ dias, quantas o cliente reabriu",
      valor: (a) => pct(a.reabertas_maduras, a.resolvidas_maduras), maiorPrimeiro: true,
      render: (a) => (
        <span className="whitespace-nowrap">
          {fmtNum(a.reabertas)}
          {a.resolvidas_maduras > 0 && <span className="ml-1 text-[11px] text-muted-foreground">({fmtPct(pct(a.reabertas_maduras, a.resolvidas_maduras))})</span>}
        </span>
      ),
    },
    {
      chave: "fechadas", rotulo: "Fechou sem responder", titulo: "Marcou resolvido/aguardando sem ter respondido", valor: (a) => a.fechadas_sem_resposta, maiorPrimeiro: true,
      render: (a) => a.fechadas_sem_resposta > 0
        ? <span className="inline-flex rounded-full bg-orange-500/15 px-2 py-0.5 font-semibold text-orange-700 dark:text-orange-400">{fmtNum(a.fechadas_sem_resposta)}</span>
        : "0",
    },
    { chave: "notas", secundaria: true, rotulo: "Notas", valor: (a) => a.notas, render: (a) => fmtNum(a.notas), maiorPrimeiro: true },
    { chave: "agora", rotulo: "Agora", titulo: "Em atendimento agora", valor: (a) => a.em_atendimento_agora, render: (a) => fmtNum(a.em_atendimento_agora), maiorPrimeiro: true },
    {
      chave: "ultima", rotulo: "Última", titulo: "Última resposta", alinhar: "esq", valor: (a) => a.ultima_resposta_em, maiorPrimeiro: true,
      render: (a) => <span className="whitespace-nowrap text-xs text-muted-foreground" title={fmtDataHora(a.ultima_resposta_em)}>{haQuanto(a.ultima_resposta_em, agora)}</span>,
    },
    {
      chave: "horario", secundaria: true, rotulo: "Horário", alinhar: "esq", titulo: "Primeira e última mensagem do dia (no período)",
      valor: (a) => a.primeira_hora,
      render: (a) => <span className="whitespace-nowrap text-xs text-muted-foreground">{a.primeira_hora ? `${hhmm(a.primeira_hora)}–${hhmm(a.ultima_hora)}` : "—"}</span>,
    },
  ] as Col[]).sort((x, y) => ORDEM_COLS.indexOf(x.chave) - ORDEM_COLS.indexOf(y.chave)),
  [util, agora, p.config.meta_resposta_min, p.config.meta_sla_pct]);

  const ordenar = (lista: PainelAtendente[]) => {
    const col = cols.find((c) => c.chave === ordem.col);
    const nome = (a: PainelAtendente) => a.nome ?? "";
    return [...lista].sort((a, b) => {
      if (ordem.col === "nome") return (ordem.desc ? -1 : 1) * nome(a).localeCompare(nome(b), "pt-BR");
      if (!col) return 0;
      const va = col.valor(a), vb = col.valor(b);
      if (va == null && vb == null) return nome(a).localeCompare(nome(b), "pt-BR");
      if (va == null) return 1; // sem valor vai para o fim nos dois sentidos
      if (vb == null) return -1;
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return (ordem.desc ? -r : r) || nome(a).localeCompare(nome(b), "pt-BR");
    });
  };

  const ativos = ordenar(p.atendentes.filter(ativo));
  const inativos = p.atendentes.filter((a) => !ativo(a)).sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));

  const clicar = (c: string, maiorPrimeiro?: boolean) =>
    setOrdem((o) => (o.col === c ? { col: c, desc: !o.desc } : { col: c, desc: !!maiorPrimeiro }));

  const Seta = ({ c }: { c: string }) => (ordem.col !== c ? null : ordem.desc
    ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />);

  return (
    <div className="space-y-4">
      <Secao titulo={`Quem atendeu · ${ativos.length}`} corpo="p-0">
        {ativos.length === 0 ? <Vazio>Ninguém atendeu no período.</Vazio> : (
          <Table className="[&_td]:px-2.5 [&_th]:px-2.5">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card !pl-4">
                  <button type="button" onClick={() => clicar("nome")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Pessoa <Seta c="nome" />
                  </button>
                </TableHead>
                {cols.map((c) => (
                  <TableHead key={c.chave} className={cn("whitespace-nowrap", c.secundaria && "hidden 2xl:table-cell", c.alinhar === "esq" ? "text-left" : "text-right", (c.chave === "horario" || c.chave === "ultima") && "!pr-4")}>
                    <button type="button" title={c.titulo} onClick={() => clicar(c.chave, c.maiorPrimeiro)}
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", ordem.col === c.chave && "text-foreground")}>
                      {c.rotulo} <Seta c={c.chave} />
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ativos.map((a) => (
                <TableRow
                  key={a.chave} tabIndex={0} role="button"
                  onClick={() => onPessoa(a.chave)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPessoa(a.chave); } }}
                  className="group cursor-pointer"
                >
                  <TableCell className="sticky left-0 z-10 bg-card !pl-4 font-medium group-hover:bg-muted">
                    <span className="whitespace-nowrap underline-offset-2 group-hover:underline">{a.nome ?? "Sem nome"}</span>
                  </TableCell>
                  {cols.map((c) => (
                    <TableCell key={c.chave} className={cn("tabular-nums", c.secundaria && "hidden 2xl:table-cell", c.alinhar === "esq" ? "text-left" : "text-right", (c.chave === "horario" || c.chave === "ultima") && "!pr-4")}>
                      {c.render(a)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Secao>

      {inativos.length > 0 && (
        <div className="rounded-xl border bg-card">
          <button type="button" onClick={() => setMostrarInativos((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold">
            {mostrarInativos ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Sem atividade no período · {inativos.length}
          </button>
          {mostrarInativos && (
            <ul className="flex flex-wrap gap-2 border-t px-4 py-3">
              {inativos.map((a) => (
                <li key={a.chave} className="rounded-full border px-3 py-1 text-xs text-muted-foreground">{a.nome ?? "Sem nome"}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
