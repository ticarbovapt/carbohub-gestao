import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Hourglass, MessageSquareOff, ShieldAlert, UserCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PainelAtendimento, PainelKpis } from "@/hooks/usePainelAtendimento";
import {
  fmtData, fmtMin, fmtNum, fmtPct, pct, variacaoPp, variacaoRel, type Variacao,
} from "@/lib/painelAtendimento";
import { VariacaoChip } from "./comum";

export type Ver = "util" | "corrido";
export type Aba = "geral" | "fila" | "atendentes" | "excecoes" | "horarios";

// ─────────────────────────────────────────────────────────────────────────────
// "Agora" — o trabalho parado neste instante. Não depende do período.
// ─────────────────────────────────────────────────────────────────────────────

function Bloco({ titulo, valor, sub, tom = "neutro", icone: Icone, onClick, href }: {
  titulo: string; valor: ReactNode; sub?: ReactNode; tom?: "vermelho" | "ambar" | "neutro";
  icone: typeof Clock; onClick?: () => void; href?: string;
}) {
  const cls = cn(
    "group flex min-w-0 flex-col gap-1 rounded-xl border p-3 text-left transition-colors hover:bg-muted/60",
    tom === "vermelho" && "border-red-500/50 bg-red-500/[0.07]",
    tom === "ambar" && "border-amber-500/50 bg-amber-500/[0.07]",
    tom === "neutro" && "bg-card",
  );
  const corpo = (
    <>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icone className={cn("h-3.5 w-3.5 shrink-0",
          tom === "vermelho" && "text-red-600 dark:text-red-400",
          tom === "ambar" && "text-amber-600 dark:text-amber-400")} />
        <span className="truncate">{titulo}</span>
      </span>
      <span className="text-2xl font-bold tabular-nums leading-tight">{valor}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </>
  );
  if (href) return <Link to={href} className={cls}>{corpo}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{corpo}</button>;
}

export function FaixaAgora({ p, irPara }: { p: PainelAtendimento; irPara: (aba: Aba, extra?: Record<string, string>) => void }) {
  const a = p.agora;
  const tomEsperando = a.janela_ate_2h > 0 ? "vermelho" : a.janela_ate_6h > 0 ? "ambar" : "neutro";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
      <Bloco
        titulo="Esperando resposta" icone={MessageSquareOff} tom={a.esperando > 0 ? tomEsperando : "neutro"}
        valor={fmtNum(a.esperando)}
        sub={a.esperando > 0 ? (
          <>
            <span className={cn(a.janela_ate_2h > 0 && "font-semibold text-red-600 dark:text-red-400")}>{a.janela_ate_2h} fecham em até 2 h</span>
            {" · "}
            <span className={cn(a.janela_ate_6h > 0 && "font-semibold text-amber-600 dark:text-amber-400")}>{a.janela_ate_6h} em até 6 h</span>
          </>
        ) : "fila vazia"}
        onClick={() => irPara("fila")}
      />
      <Bloco
        titulo="A mais antiga" icone={Hourglass}
        tom={a.mais_antiga_min != null && a.mais_antiga_min >= 60 ? "ambar" : "neutro"}
        valor={fmtMin(a.mais_antiga_min)} sub={a.mais_antiga_min != null ? "esperando" : undefined}
        onClick={() => irPara("fila")}
      />
      <Bloco
        titulo="Com risco" icone={ShieldAlert} tom={a.com_risco > 0 ? "vermelho" : "neutro"}
        valor={fmtNum(a.com_risco)} sub="na fila agora"
        onClick={() => irPara("fila", { risco: "1" })}
      />
      <Bloco
        titulo="Perdidas em 7 dias" icone={XCircle} tom={a.perdidas_7d > 0 ? "ambar" : "neutro"}
        valor={fmtNum(a.perdidas_7d)} sub="janela fechou sem resposta"
        onClick={() => irPara("fila", { ver_perdidas: "1" })}
      />
      <Bloco
        titulo="Aguardando o cliente" icone={Clock}
        valor={fmtNum(a.aguardando_cliente)}
        href="/conversas?aba=todas&status=aguardando"
      />
      <Bloco
        titulo="Em atendimento" icone={UserCheck}
        valor={fmtNum(a.em_atendimento)}
        onClick={() => irPara("atendentes")}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cartões de indicador — período atual × anterior, e contra a meta.
// ─────────────────────────────────────────────────────────────────────────────

function Meta({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
      ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400",
    )}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {texto}
    </span>
  );
}

function Kpi({ titulo, valor, detalhe, n, variacao, meta, marca }: {
  titulo: string; valor: ReactNode; detalhe?: ReactNode; n?: ReactNode;
  variacao?: Variacao | null; meta?: { ok: boolean; texto: string } | null; marca?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
        {marca && <span className="shrink-0 text-[11px] text-muted-foreground">{marca}</span>}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-bold tabular-nums leading-none">{valor}</span>
        {meta && <Meta {...meta} />}
      </div>
      {detalhe && <div className="text-xs text-muted-foreground">{detalhe}</div>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 pt-1">
        {variacao !== undefined ? <VariacaoChip v={variacao ?? null} /> : <span />}
        {n != null && <span className="text-[11px] tabular-nums text-muted-foreground">{n}</span>}
      </div>
    </div>
  );
}

const neutro = (v: Variacao | null): Variacao | null => (v ? { ...v, tom: "neutro" } : v);

export function Indicadores({ p, ver }: { p: PainelAtendimento; ver: Ver }) {
  const a: PainelKpis | undefined = p.kpis.atual;
  const b: PainelKpis | undefined = p.kpis.anterior;
  const c = p.config;
  if (!a) return null;
  const util = ver === "util";

  // Histórico de quem fechou começa em `historico_desde`: antes disso, o número
  // não existe — e a comparação com um período anterior a ele não vale.
  const hist = p.historico_desde ? p.historico_desde.slice(0, 10) : null;
  const histNoPeriodo = hist && hist > p.periodo.de ? `desde ${fmtData(hist)}` : undefined;
  const histCobreAnterior = !hist || hist <= p.periodo.ant_de;

  const taxa = pct(a.respondidas, a.pedem), taxaAnt = b ? pct(b.respondidas, b.pedem) : null;
  const sla = pct(a.dentro_meta, a.pedem), slaAnt = b ? pct(b.dentro_meta, b.pedem) : null;
  const fcr = pct(a.fcr, a.atendimentos_respondidos), fcrAnt = b ? pct(b.fcr, b.atendimentos_respondidos) : null;

  const tmpr = util ? a.tmpr_util_mediana : a.tmpr_mediana;
  const tmprAnt = b ? (util ? b.tmpr_util_mediana : b.tmpr_mediana) : null;
  const tmr = util ? a.tmr_util_mediana : a.tmr_mediana;
  const tmrAnt = b ? (util ? b.tmr_util_mediana : b.tmr_mediana) : null;

  const reab = pct(p.atividade.reabertas, p.atividade.resolvidas);

  return (
    <div className="grid grid-cols-1 gap-2 min-[440px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Kpi
        titulo="Taxa de resposta" valor={fmtPct(taxa)}
        meta={taxa != null ? { ok: taxa >= c.meta_taxa_resposta_pct, texto: `meta ${c.meta_taxa_resposta_pct}%` } : null}
        detalhe={`${fmtNum(a.respondidas)} de ${fmtNum(a.pedem)} respondidas`}
        variacao={variacaoPp(taxa, taxaAnt)}
      />
      <Kpi
        titulo="1ª resposta (TMPR)" marca={util ? "horário útil" : "corrido"} valor={fmtMin(tmpr)}
        meta={util && tmpr != null ? { ok: tmpr <= c.meta_resposta_min, texto: `meta ${c.meta_resposta_min} min` } : null}
        detalhe={util
          ? `mediana · p90 ${fmtMin(a.tmpr_util_p90)}`
          : `mediana · p90 ${fmtMin(a.tmpr_p90)} · média ${fmtMin(a.tmpr_media)}`}
        variacao={variacaoRel(tmpr, tmprAnt, true)}
        n={`n ${fmtNum(a.atendimentos_respondidos ?? a.respondidas)}`}
      />
      <Kpi
        titulo="Tempo de resposta (TMR)" marca={util ? "horário útil" : "corrido"} valor={fmtMin(tmr)}
        detalhe={util
          ? `mediana de toda rodada · p90 ${fmtMin(a.tmr_util_p90)}`
          : `mediana de toda rodada · p90 ${fmtMin(a.tmr_p90)} · média ${fmtMin(a.tmr_media)}`}
        variacao={variacaoRel(tmr, tmrAnt, true)}
        n={`n ${fmtNum(a.respondidas)}`}
      />
      <Kpi
        titulo={`Dentro da meta (SLA ${c.meta_resposta_min} min)`} valor={fmtPct(sla)}
        meta={sla != null ? { ok: sla >= c.meta_sla_pct, texto: `meta ${c.meta_sla_pct}%` } : null}
        detalhe={`${fmtNum(a.dentro_meta)} de ${fmtNum(a.pedem)} que pediam`}
        variacao={variacaoPp(sla, slaAnt)}
      />
      <Kpi
        titulo="Duração do atendimento (TMA)" marca="corrido" valor={fmtMin(a.tma_mediana)}
        detalhe={`${a.msgs_por_atendimento != null ? a.msgs_por_atendimento.toLocaleString("pt-BR") : "—"} mensagens por atendimento · p90 ${fmtMin(a.tma_p90)}`}
        variacao={neutro(variacaoRel(a.tma_mediana, b?.tma_mediana))}
        n={`n ${fmtNum(a.atendimentos_respondidos)}`}
      />
      <Kpi
        titulo="Resolvidos no 1º contato (FCR)" valor={fmtPct(fcr)}
        detalhe={`${fmtNum(a.fcr)} de ${fmtNum(a.atendimentos_respondidos)} atendimentos`}
        variacao={variacaoPp(fcr, fcrAnt)}
      />
      <Kpi
        titulo="Fechadas sem resposta" valor={fmtNum(a.fechadas_sem_resposta)} marca={histNoPeriodo}
        detalhe={`${fmtPct(pct(a.fechadas_sem_resposta, a.pedem))} das que pediam`}
        variacao={histCobreAnterior ? variacaoRel(a.fechadas_sem_resposta, b?.fechadas_sem_resposta, true) : undefined}
      />
      <Kpi
        titulo="Perdidas (janela fechou)" valor={fmtNum(a.perdidas)}
        detalhe={`${fmtPct(pct(a.perdidas, a.pedem))} das que pediam`}
        variacao={variacaoRel(a.perdidas, b?.perdidas, true)}
      />
      <Kpi
        titulo="Reabertas" valor={fmtPct(reab)} marca={histNoPeriodo}
        detalhe={`${fmtNum(p.atividade.reabertas)} de ${fmtNum(p.atividade.resolvidas)} resolvidas`}
      />
      <Kpi
        titulo="Pediam resposta" valor={fmtNum(a.pedem)}
        detalhe={`+${fmtNum(a.nao_pedem ?? 0)} só agradecimento · ${fmtNum(a.clientes)} clientes`}
        variacao={neutro(variacaoRel(a.pedem, b?.pedem))}
      />
    </div>
  );
}
