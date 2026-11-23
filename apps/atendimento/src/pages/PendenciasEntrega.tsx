import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, BarChart3, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, MessageCircle, MessageSquareWarning,
  MoreHorizontal, PackageSearch, Search, SlidersHorizontal, Workflow,
} from "lucide-react";
import { useParamUrl } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import CasoPosVenda, { ChipDesfecho, ChipReembolso, ChipTipo, PrazoCaso } from "@/components/posvenda/CasoPosVenda";
import { FLUXOS, etapaDoReembolso, passoDe, rotuloDesfecho, rotuloTipo } from "@/lib/posvendaCasos";
import {
  COR_PROBLEMA, ETAPA_ROTULO, PROBLEMAS, ROTULO_PROBLEMA, ROTULO_SITUACAO,
  ehFinal, lerErro, useHistoricoTrato, usePosVenda, usePosVendaPedido,
  type Pendencia, type Problema, type SituacaoTrato,
} from "@/hooks/usePendenciasEntrega";

// ─────────────────────────────────────────────────────────────────────────────
// Pós-venda — `/pos-venda` (ex-`/pendencias`, Pendências de entrega).
//
// 23/11/2026, pedido do dono do processo ("muita informação, cheio de botões,
// confuso"): TRÊS abas, cada uma respondendo uma pergunta.
//   · Para tratar (padrão) — o que precisa de alguém agora, de qualquer data:
//     problema sem caso aberto nem tratativa encerrada, ou reclamação do
//     WhatsApp pendente (`carbo_posvenda(p_so_atencao)`, 20261181). O passivo
//     de antes do corte (06/11) vem numa segunda lista, logo abaixo.
//   · Casos abertos — tipo, passo e prazo de cada caso.
//   · Todos os pedidos — semana/mês/período, busca e o botão Filtros.
// O pedido aberto (o caso no centro) não mudou.
//
// ⚠️ Quem decide o que é problema é o BANCO; a tela não recalcula nada. O
// `precisaDeAtencao` daqui é o MESMO critério do banco (20261181) — mudou lá,
// mude aqui. Tudo menos o ML Full (20261172).
//
// Estado na URL: ?aba=tratar|casos|todos · ?modo=semana|mes|periodo · ?de= · ?ate=
//                ?situacao= · ?caso= · ?canal= · ?busca= · ?pedido=
// Endereços antigos (?modo=casos, ?aba=antes|novos) continuam abrindo.
// ─────────────────────────────────────────────────────────────────────────────

const POR_PAGINA = 100;
const ETAPAS_EM_ANDAMENTO = new Set(["confirmado", "nf_emitida", "etiqueta", "em_transito"]);

const brl = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "2026-11-06" → "06/11/26", sem passar por Date (fuso). */
function dia(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a.slice(2)}`;
}
const diaMes = (iso: string) => dia(iso).slice(0, 5);

// ── Contas de data: tudo em TEXTO "AAAA-MM-DD", sem fuso ──────────────────────
const isoUTC = (t: Date) => t.toISOString().slice(0, 10);
function maisDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return isoUTC(new Date(Date.UTC(a, m - 1, d + n)));
}
/** O domingo da semana do dia. */
function domingoDe(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return maisDias(iso.slice(0, 10), -t.getUTCDay());
}
const inicioDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;
function fimDoMes(iso: string) {
  const [a, m] = iso.split("-").map(Number);
  return isoUTC(new Date(Date.UTC(a, m, 0)));
}
function maisMeses(iso: string, n: number) {
  const [a, m] = iso.split("-").map(Number);
  return isoUTC(new Date(Date.UTC(a, m - 1 + n, 1)));
}
/** Hoje no dia de Brasília (nunca `toISOString()`, que é UTC). */
const hojeBrasilia = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const ehDia = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const maior = (a: string, b: string) => (a > b ? a : b);
const menor = (a: string, b: string) => (a < b ? a : b);

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "09/11 – 15/11" (domingo a sábado). */
const rotuloSemana = (domingo: string) => `${diaMes(domingo)} – ${diaMes(maisDias(domingo, 6))}`;

function diasDesde(iso: string | null | undefined) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

const so = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function casa(p: Pendencia, busca: string) {
  const q = busca.trim();
  if (!q) return true;
  const dq = digitos(q);
  if (dq.length >= 4) {
    const fone = digitos(p.cliente_fone);
    if (fone && fone.includes(dq.length >= 8 ? dq.slice(-8) : dq)) return true;
  }
  const alvo = so([p.cliente, p.pedido_codigo, p.pedido_numero, p.pedido_loja, p.rastreio, p.nf_numero, p.cidade, p.canal]
    .filter(Boolean).join(" "));
  return alvo.includes(so(q));
}

// ── O estado do pedido, para filtro e para a tela ────────────────────────────
type Status = "problema" | "andamento" | "entregue" | "cancelado";
const statusDe = (p: Pendencia): Status =>
  p.problema ? "problema" : p.etapa === "entregue" ? "entregue" : p.etapa === "cancelado" ? "cancelado" : "andamento";

const STATUS: { id: Status; rotulo: string; cor: string }[] = [
  { id: "problema",  rotulo: "Com problema", cor: "#dc2626" },
  { id: "andamento", rotulo: "Em andamento", cor: "#0284c7" },
  { id: "entregue",  rotulo: "Entregues",    cor: "#059669" },
  { id: "cancelado", rotulo: "Cancelados",   cor: "#64748b" },
];

function ChipProblema({ p }: { p: Problema }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${COR_PROBLEMA[p]}1a`, color: COR_PROBLEMA[p] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_PROBLEMA[p] }} />
      {ROTULO_PROBLEMA[p]}
    </span>
  );
}

function ChipEtapa({ p }: { p: Pendencia }) {
  const st = statusDe(p);
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
      st === "entregue" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
        : st === "cancelado" ? "bg-muted text-muted-foreground"
        : "bg-sky-500/15 text-sky-700 dark:text-sky-400")}>
      {ETAPA_ROTULO[p.etapa] ?? p.etapa}
    </span>
  );
}

/** O cliente reclamou no WhatsApp (assuntos do painel do atendimento). Vermelho
 *  quando ninguém está tratando; cinza quando já há caso para ela. */
function ChipReclamou({ p }: { p: Pendencia }) {
  const r = p.reclamacao;
  if (!r) return null;
  const assunto = r.assuntos[0]?.rotulo ?? "Reclamação";
  return (
    <span title={r.trecho ?? undefined}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        r.pendente ? "bg-red-500/15 text-red-700 dark:text-red-400" : "bg-muted text-muted-foreground")}>
      <MessageSquareWarning className="h-3 w-3 shrink-0" />
      <span className="truncate">Reclamou: {assunto}{r.assuntos.length > 1 ? ` +${r.assuntos.length - 1}` : ""}</span>
    </span>
  );
}

function ChipSituacao({ s }: { s: SituacaoTrato | null }) {
  const st = s ?? "aberto";
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
      ehFinal(st) ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
        : st === "aberto" ? "bg-muted text-muted-foreground"
        : "bg-sky-500/15 text-sky-700 dark:text-sky-400")}>
      {ROTULO_SITUACAO[st]}
    </span>
  );
}

// ── A planilha ───────────────────────────────────────────────────────────────
function baixarPlanilha(itens: Pendencia[], nome: string) {
  const cab = ["Semana", "Pedido", "Nº loja", "Canal", "Data do pedido", "Cliente", "Telefone", "Cidade", "UF", "Valor",
    "Etapa", "Problema", "Desde", "Entregue em", "Transportadora", "Rastreio", "NF", "Tratativa", "Observação",
    "Atualizado por", "Atualizado em", "Caso", "Passo do caso", "Desfecho", "Valor do caso"];
  const cel = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = itens.map((p) => [
    rotuloSemana(domingoDe(p.data_pedido)), p.pedido_codigo ?? p.pedido_numero, p.pedido_loja, p.canal, dia(p.data_pedido),
    p.cliente, p.cliente_fone, p.cidade, p.uf, p.total != null ? p.total.toFixed(2).replace(".", ",") : "",
    ETAPA_ROTULO[p.etapa] ?? p.etapa, p.problema ? ROTULO_PROBLEMA[p.problema] : "", p.problema ? dia(p.desde) : "",
    p.entregue_em ? dia(p.entregue_em) : "", p.transportadora, p.rastreio,
    p.nf_numero, p.trato ? ROTULO_SITUACAO[p.trato.situacao] : "", p.trato?.observacao,
    p.trato?.por, p.trato ? new Date(p.trato.em).toLocaleString("pt-BR") : "",
    p.caso ? rotuloTipo(p.caso.tipo) : "",
    p.caso?.status === "aberto" ? passoDe(p.caso.tipo, p.caso.passo)?.titulo ?? p.caso.passo : "",
    p.caso?.desfecho ? rotuloDesfecho(p.caso.desfecho) : "",
    p.caso?.valor != null ? Number(p.caso.valor).toFixed(2).replace(".", ",") : "",
  ].map(cel).join(";"));
  // BOM + `;`: abre direto no Excel com acento e coluna certos.
  const blob = new Blob(["﻿" + [cab.join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
}

// ── O pedido aberto: o CASO no centro, os dados do pedido ao lado ────────────
/** "84991015838" → "(84) 99101-5838". */
function foneBonito(f: string | null) {
  const d = digitos(f).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return f;
}

function Bloco({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

function LateralDoPedido({ p }: { p: Pendencia }) {
  const hist = useHistoricoTrato(p.bling_id);
  // A tratativa antiga só mostra o que alguém ESCREVEU; as trocas automáticas
  // feitas pelo caso já estão no histórico do caso.
  const notasAntigas = (hist.data ?? []).filter((h) => h.observacao);
  const fone = digitos(p.cliente_fone);
  const r = p.reclamacao;
  return (
    <div className="space-y-6">
      <Bloco titulo="Cliente"
        acao={fone.length >= 8 && (
          <Button asChild variant="ghost" size="sm" className="-my-1 h-7 px-2 text-xs">
            <Link to={`/conversas?busca=${fone.slice(-8)}`}><MessageCircle className="mr-1 h-3.5 w-3.5" />Conversa</Link>
          </Button>
        )}>
        <div>
          <p className="font-medium leading-snug">{p.cliente ?? "—"}</p>
          <p className="text-sm text-muted-foreground">
            {p.cliente_fone ? foneBonito(p.cliente_fone) : <span className="text-amber-700 dark:text-amber-400">sem telefone</span>}
          </p>
          <p className="text-sm text-muted-foreground">{[p.cidade, p.uf].filter(Boolean).join(" / ") || "—"}</p>
        </div>
      </Bloco>

      {r && (
        <Bloco titulo="Reclamação no WhatsApp"
          acao={r.wa_id && (
            <Button asChild variant="ghost" size="sm" className="-my-1 h-7 px-2 text-xs">
              <Link to={`/conversas?numero=${r.numero_id ?? ""}&de=${r.wa_id}`}><MessageCircle className="mr-1 h-3.5 w-3.5" />Abrir</Link>
            </Button>
          )}>
          <div className={cn("space-y-2 rounded-lg border p-3",
            r.pendente ? "border-red-500/30 bg-red-500/[0.04]" : "bg-background")}>
            {r.trecho && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">“{r.trecho}”</p>}
            <div className="flex flex-wrap gap-1">
              {r.assuntos.map((a) => (
                <span key={a.codigo} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{a.rotulo}</span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {r.n > 1 ? `${r.n} mensagens · última ` : ""}
              {new Date(r.ultima_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </p>
          </div>
        </Bloco>
      )}

      <Bloco titulo="Pedido"
        acao={(
          <Button asChild variant="ghost" size="sm" className="-my-1 h-7 px-2 text-xs">
            <Link to={`/ecommerce/esteira?pedido=${p.bling_id}`}><PackageSearch className="mr-1 h-3.5 w-3.5" />Esteira</Link>
          </Button>
        )}>
        <dl className="space-y-1.5">
          <Linha rotulo="Data">{dia(p.data_pedido)}</Linha>
          <Linha rotulo="Canal">{p.canal ?? "—"}</Linha>
          <Linha rotulo="Valor"><span className="tabular-nums">{brl(p.total)}</span></Linha>
          {p.nf_numero && <Linha rotulo="Nota fiscal">{p.nf_numero}</Linha>}
          <Linha rotulo="Etapa">{ETAPA_ROTULO[p.etapa] ?? p.etapa}</Linha>
        </dl>
      </Bloco>

      <Bloco titulo="Entrega"
        acao={p.url_rastreio && (
          <Button asChild variant="ghost" size="sm" className="-my-1 h-7 px-2 text-xs">
            <a href={p.url_rastreio} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Rastrear</a>
          </Button>
        )}>
        <dl className="space-y-1.5">
          <Linha rotulo="Transportadora">{p.transportadora ?? "—"}</Linha>
          {p.rastreio && <Linha rotulo="Rastreio"><span className="font-mono text-xs">{p.rastreio}</span></Linha>}
          {p.previsao && <Linha rotulo="Previsão">{dia(p.previsao)}</Linha>}
          {p.entregue_em && <Linha rotulo="Entregue em">{dia(p.entregue_em)}</Linha>}
          {p.rastreio_status && <Linha rotulo="Transportadora diz">{p.rastreio_status}</Linha>}
        </dl>
      </Bloco>

      {notasAntigas.length > 0 && (
        <Bloco titulo="Anotações anteriores">
          <ul className="space-y-3">
            {notasAntigas.map((h) => (
              <li key={h.id} className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <ChipSituacao s={h.situacao} />
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(h.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    {h.por ? ` · ${h.por}` : ""}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-muted-foreground">{h.observacao}</p>
              </li>
            ))}
          </ul>
        </Bloco>
      )}
    </div>
  );
}

function DialogoPedido({ p, onFechar }: { p: Pendencia; onFechar: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 outline-none sm:max-w-6xl lg:h-[min(920px,calc(100dvh-2rem))]">
        <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
            {p.pedido_codigo ?? p.pedido_numero ?? `#${Math.abs(p.bling_id)}`}
            {p.problema ? <ChipProblema p={p.problema} /> : <ChipEtapa p={p} />}
            {p.reclamacao && <ChipReclamou p={p} />}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {[p.cliente, p.canal, dia(p.data_pedido), brl(p.total)].filter(Boolean).join(" · ")}
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden">
          <div className="min-w-0 p-5 sm:p-6 lg:overflow-y-auto">
            <CasoPosVenda p={p} />
          </div>
          <aside className="border-t bg-muted/30 p-5 sm:p-6 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <LateralDoPedido p={p} />
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── As linhas da lista: uma por aba, cada uma só com o que aquela aba pergunta ─
const GRADE_TRATAR = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_7rem_1rem]";
const GRADE_CASOS = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_minmax(0,1fr)_1rem]";
const GRADE_TODOS = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_7rem_1rem]";

function Quem({ p }: { p: Pendencia }) {
  const codigo = p.pedido_codigo ?? p.pedido_numero ?? `#${Math.abs(p.bling_id)}`;
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium">{p.cliente ?? "Cliente"}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {[codigo, p.canal, dia(p.data_pedido)].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

const haDias = (iso: string | null | undefined) => {
  const d = diasDesde(iso);
  return d == null ? null : d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`;
};

/** Por que o pedido está na fila: a reclamação vem primeiro (é o cliente falando). */
function Motivo({ p }: { p: Pendencia }) {
  const r = p.reclamacao?.pendente ? p.reclamacao : null;
  return (
    <span className="flex min-w-0 flex-col gap-1">
      {r && (
        <span className="flex min-w-0 items-center gap-1.5 text-sm">
          <MessageSquareWarning className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <span className="truncate font-medium text-red-700 dark:text-red-400">{r.assuntos[0]?.rotulo ?? "Reclamou no WhatsApp"}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{haDias(r.ultima_em)}</span>
        </span>
      )}
      {p.problema && (
        <span className="flex min-w-0 items-center gap-1.5">
          <ChipProblema p={p.problema} />
          <span className="shrink-0 text-xs text-muted-foreground">{haDias(p.desde)}</span>
        </span>
      )}
    </span>
  );
}

function Fila({ grade, onAbrir, children }: { grade: string; onAbrir: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onAbrir}
      className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/40 lg:items-center", grade)}>
      {children}
    </button>
  );
}

const Valor = ({ p, className }: { p: Pendencia; className?: string }) => (
  <span className={cn("text-right text-sm tabular-nums", className)}>{brl(p.total)}</span>
);
const Seta = () => <ChevronRight className="hidden h-4 w-4 text-muted-foreground lg:block" />;

function LinhaTratar({ p, onAbrir }: { p: Pendencia; onAbrir: () => void }) {
  return (
    <Fila grade={GRADE_TRATAR} onAbrir={onAbrir}>
      <Quem p={p} />
      <Valor p={p} className="lg:order-3" />
      <span className="col-span-2 min-w-0 lg:order-2 lg:col-span-1"><Motivo p={p} /></span>
      <span className="lg:order-4"><Seta /></span>
    </Fila>
  );
}

function LinhaCaso({ p, onAbrir }: { p: Pendencia; onAbrir: () => void }) {
  const c = p.caso!;
  const reemb = etapaDoReembolso(c.tipo, c.passo);
  return (
    <Fila grade={GRADE_CASOS} onAbrir={onAbrir}>
      <Quem p={p} />
      <span className="text-right lg:order-3 lg:text-left"><PrazoCaso tipo={c.tipo} abertoEm={c.aberto_em} /></span>
      <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 lg:order-2 lg:col-span-1">
        <ChipTipo tipo={c.tipo} />
        {reemb ? <ChipReembolso etapa={reemb} />
          : <span className="min-w-0 truncate text-sm text-muted-foreground">{passoDe(c.tipo, c.passo)?.titulo ?? c.passo}</span>}
      </span>
      <span className="lg:order-4"><Seta /></span>
    </Fila>
  );
}

function LinhaTodos({ p, onAbrir }: { p: Pendencia; onAbrir: () => void }) {
  const c = p.caso;
  return (
    <Fila grade={GRADE_TODOS} onAbrir={onAbrir}>
      <Quem p={p} />
      <Valor p={p} className="lg:order-4" />
      <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 lg:order-2 lg:col-span-1">
        {p.problema ? <ChipProblema p={p.problema} /> : <ChipEtapa p={p} />}
        {p.reclamacao && (
          <MessageSquareWarning className={cn("h-4 w-4", p.reclamacao.pendente ? "text-red-600" : "text-muted-foreground")}
            aria-label="Reclamou no WhatsApp" />
        )}
      </span>
      <span className={cn("col-span-2 min-w-0 lg:order-3 lg:col-span-1", !c && "hidden lg:block")}>
        {c ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <ChipTipo tipo={c.tipo} />
            {c.status !== "aberto" && c.desfecho && <ChipDesfecho desfecho={c.desfecho} />}
          </span>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </span>
      <span className="lg:order-5"><Seta /></span>
    </Fila>
  );
}

/** Abas e modos: o controle segmentado dos Reembolsos. */
function Segmentos<T extends string>({ itens, ativo, onTrocar, grande }: {
  itens: { id: T; rotulo: string; curto?: string; n?: number; alerta?: boolean }[]; ativo: T; onTrocar: (id: T) => void; grande?: boolean;
}) {
  return (
    <div role="tablist" className="inline-flex max-w-full shrink-0 self-start overflow-x-auto rounded-lg border bg-muted/40 p-1">
      {itens.map((it) => (
        <button key={it.id} role="tab" type="button" aria-selected={ativo === it.id} onClick={() => onTrocar(it.id)}
          className={cn("inline-flex items-center whitespace-nowrap rounded-md transition-colors",
            grande ? "px-3 py-2 text-sm sm:px-4" : "px-3 py-1.5 text-sm",
            ativo === it.id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {it.curto ? <><span className="sm:hidden">{it.curto}</span><span className="hidden sm:inline">{it.rotulo}</span></> : it.rotulo}
          {it.n != null && it.n > 0 && (
            <span className={cn("ml-2 rounded-full px-1.5 text-xs font-semibold tabular-nums",
              it.alerta ? "bg-destructive text-destructive-foreground" : "bg-primary/15 text-primary")}>
              {it.n}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function BotaoSeta({ lado, disabled, onClick }: { lado: "antes" | "depois"; disabled: boolean; onClick: () => void }) {
  const Icone = lado === "antes" ? ChevronLeft : ChevronRight;
  return (
    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" disabled={disabled} onClick={onClick}
      aria-label={lado === "antes" ? "Anterior" : "Seguinte"}>
      <Icone className="h-4 w-4" />
    </Button>
  );
}

function Lista({ titulo, n, vazio, children }: { titulo?: string; n?: number; vazio: string; children: React.ReactNode[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {titulo && (
        <div className="flex items-baseline justify-between gap-3 border-b bg-muted/30 px-4 py-2">
          <span className="text-sm font-semibold">{titulo}</span>
          {n != null && <span className="text-xs tabular-nums text-muted-foreground">{n}</span>}
        </div>
      )}
      {children.length ? <div className="divide-y">{children}</div>
        : <p className="px-4 py-12 text-center text-sm text-muted-foreground">{vazio}</p>}
    </div>
  );
}

// ── A tela ───────────────────────────────────────────────────────────────────
type Aba = "tratar" | "casos" | "todos";
type Modo = "semana" | "mes" | "periodo";

/** Precisa de alguém: reclamou e ninguém trata, ou tem problema e não há caso
 *  aberto nem tratativa encerrada. */
const precisaDeAtencao = (p: Pendencia) =>
  !!p.reclamacao?.pendente || (!!p.problema && p.caso?.status !== "aberto" && !ehFinal(p.trato?.situacao));

export default function PendenciasEntrega() {
  const [abaUrl, setAba] = useParamUrl("aba", "tratar");
  const [modoUrl, setModo] = useParamUrl("modo", "semana");
  // Endereços antigos: ?modo=casos e ?aba=antes|novos continuam abrindo.
  const aba: Aba = modoUrl === "casos" || abaUrl === "casos" ? "casos"
    : abaUrl === "todos" || abaUrl === "antes" || abaUrl === "novos" ? "todos" : "tratar";
  const modo: Modo = modoUrl === "mes" || modoUrl === "periodo" ? modoUrl : "semana";
  const [deUrl, setDe] = useParamUrl("de", "");
  const [ateUrl, setAte] = useParamUrl("ate", "");
  const [situacao, setSituacao] = useParamUrl("situacao", "");
  const [canal, setCanal] = useParamUrl("canal", "");
  const [casoTipo, setCasoTipo] = useParamUrl("caso", "");
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [pedidoUrl, setPedido] = useParamUrl("pedido", "");
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  const [buscaLocal, setBuscaLocal] = useState(busca);
  useEffect(() => { setBuscaLocal(busca); }, [busca]);
  useEffect(() => {
    if (buscaLocal === busca) return;
    const t = setTimeout(() => setBusca(buscaLocal), 300);
    return () => clearTimeout(t);
  }, [buscaLocal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── As três leituras: a fila e os casos sempre (são pequenas e dão os números
  // das abas); o período só na aba "Todos os pedidos".
  const qTratar = usePosVenda("atencao");
  const qCasos = usePosVenda("casos");
  const [primeiro, setPrimeiro] = useState<string | null>(null);
  const [corte, setCorte] = useState("2026-11-06");
  const hoje = hojeBrasilia();
  const limite = { de: primeiro ?? "2020-01-01", ate: hoje };
  const ancora = ehDia(deUrl) ? deUrl : hoje;
  const janela = modo === "semana"
    ? { de: domingoDe(ancora), ate: maisDias(domingoDe(ancora), 6) }
    : modo === "mes"
    ? { de: inicioDoMes(ancora), ate: fimDoMes(ancora) }
    : (() => {
        const a = ehDia(deUrl) ? deUrl : maisDias(hoje, -29);
        const b = ehDia(ateUrl) ? ateUrl : hoje;
        return a <= b ? { de: a, ate: b } : { de: b, ate: a };
      })();
  const periodo = { de: maior(janela.de, limite.de), ate: menor(janela.ate, limite.ate) };
  const qTodos = usePosVenda(aba === "todos" ? periodo : null);
  const q = aba === "tratar" ? qTratar : aba === "casos" ? qCasos : qTodos;
  const d = q.data;
  const erro = q.error ? lerErro(q.error) : null;
  const algum = qTratar.data ?? qCasos.data ?? qTodos.data;
  useEffect(() => {
    if (algum?.corte) setCorte(algum.corte.slice(0, 10));
    if (algum?.primeiro !== undefined) setPrimeiro(algum.primeiro ? algum.primeiro.slice(0, 10) : null);
  }, [algum?.corte, algum?.primeiro]);

  const passo = (n: number) => {
    if (modo === "semana") setDe(maisDias(janela.de, 7 * n));
    else if (modo === "mes") setDe(maisMeses(janela.de, n));
  };
  const trocarModo = (m: Modo) => {
    if (m === modo) return;
    setModo(m === "semana" ? "" : m);
    if (m === "periodo") { setDe(periodo.de); setAte(periodo.ate); } else { setDe(periodo.ate); setAte(""); }
  };
  const trocarAba = (a: Aba) => {
    setAba(a === "tratar" ? "" : a); setModo(""); setDe(""); setAte(""); setSituacao(""); setCasoTipo(""); setCanal("");
  };
  useEffect(() => { setMostrar(POR_PAGINA); }, [aba, modo, situacao, casoTipo, canal, busca, janela.de, janela.ate]);

  // ── As listas ──
  const tratar = useMemo(() => (qTratar.data?.itens ?? []).filter(precisaDeAtencao)
    .sort((a, b) => Number(!!b.reclamacao?.pendente) - Number(!!a.reclamacao?.pendente)
      || String(a.desde ?? a.data_pedido).localeCompare(String(b.desde ?? b.data_pedido))), [qTratar.data]);
  const casos = useMemo(() => (qCasos.data?.itens ?? []).filter((p) => p.caso?.status === "aberto")
    .sort((a, b) => a.caso!.aberto_em.localeCompare(b.caso!.aberto_em)), [qCasos.data]);
  const todos = useMemo(() => (qTodos.data?.itens ?? [])
    .filter((p) => p.data_pedido >= periodo.de && p.data_pedido <= periodo.ate),
    [qTodos.data, periodo.de, periodo.ate]);  

  const passaSituacao = (p: Pendencia) => !situacao ? true
    : situacao === "reclamou" ? !!p.reclamacao : situacao === "problema" ? !!p.problema
    : (PROBLEMAS.some((x) => x.id === situacao) ? p.problema === situacao : statusDe(p) === situacao);
  const base = aba === "tratar" ? tratar : aba === "casos" ? casos : todos;
  const lista = useMemo(() => base.filter((p) => casa(p, busca)
      && (aba !== "todos" || (passaSituacao(p) && (!canal || p.canal === canal)
        && (!casoTipo || (casoTipo === "sem" ? !p.caso : p.caso?.tipo === casoTipo))))
      && (aba !== "casos" || !casoTipo || p.caso?.tipo === casoTipo)),
    [base, busca, aba, situacao, canal, casoTipo]); // eslint-disable-line react-hooks/exhaustive-deps
  const canais = useMemo(() => [...new Set(todos.map((p) => p.canal).filter(Boolean))].sort() as string[], [todos]);

  const achado = pedidoUrl ? [...tratar, ...casos, ...todos].find((p) => String(p.bling_id) === pedidoUrl) ?? null : null;
  const [ultimoAberto, setUltimoAberto] = useState<Pendencia | null>(null);
  useEffect(() => { if (achado) setUltimoAberto(achado); }, [achado]);
  const doUltimo = pedidoUrl && ultimoAberto && String(ultimoAberto.bling_id) === pedidoUrl ? ultimoAberto : null;
  const idAvulso = pedidoUrl && d && !achado && /^-?\d+$/.test(pedidoUrl) ? Number(pedidoUrl) : null;
  const avulso = usePosVendaPedido(idAvulso);
  const aberto = achado ?? doUltimo ?? (idAvulso != null ? avulso.data ?? null : null);
  const carregandoOutro = q.isPlaceholderData || (q.isFetching && !q.isRefetching);
  const abrir = (p: Pendencia) => setPedido(String(p.bling_id));

  const corteCurto = diaMes(corte);
  const nomeArquivo = `pos-venda-${aba === "todos" ? `${periodo.de}-a-${periodo.ate}` : aba === "casos" ? "casos-abertos" : "para-tratar"}.csv`;
  const filtrosAtivos = [situacao, canal, casoTipo].filter(Boolean).length;

  // A fila em duas partes: o dia a dia primeiro, o passivo de antes do corte depois.
  const novos = lista.filter((p) => !p.antes_do_corte);
  const antigos = lista.filter((p) => p.antes_do_corte);

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <CarboPageHeader
          title="Pós-venda"
          icon={PackageSearch}
          actions={(
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/pos-venda/acompanhamento"><BarChart3 className="mr-1.5 h-4 w-4" />Acompanhamento</Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Mais"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild><Link to="/pos-venda/fluxos"><Workflow className="mr-2 h-4 w-4" />Fluxos de atendimento</Link></DropdownMenuItem>
                  <DropdownMenuItem disabled={!lista.length} onSelect={() => baixarPlanilha(lista, nomeArquivo)}>
                    <Download className="mr-2 h-4 w-4" />Baixar planilha desta lista
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        />

        <Segmentos grande ativo={aba} onTrocar={trocarAba} itens={[
          { id: "tratar", rotulo: "Para tratar", n: qTratar.data ? tratar.length : undefined, alerta: true },
          { id: "casos", rotulo: "Casos abertos", curto: "Casos", n: qCasos.data ? casos.length : undefined },
          { id: "todos", rotulo: "Todos os pedidos", curto: "Todos" },
        ]} />

        {/* A barra: só a busca nas filas; período e filtros em "Todos os pedidos" */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 basis-full sm:basis-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={buscaLocal} onChange={(e) => setBuscaLocal(e.target.value)}
              placeholder="Cliente, telefone, pedido, rastreio…" className="h-9 pl-8" />
          </div>
          {aba === "casos" && (
            <Select value={casoTipo || "todos"} onValueChange={(v) => setCasoTipo(v === "todos" ? "" : v)}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {FLUXOS.map((f) => <SelectItem key={f.tipo} value={f.tipo}>{f.rotulo}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {aba === "todos" && (
            <>
              <div className="flex items-center gap-1.5">
                {modo !== "periodo" && <BotaoSeta lado="antes" disabled={janela.de <= limite.de} onClick={() => passo(-1)} />}
                <Select value={modo} onValueChange={(v) => trocarModo(v as Modo)}>
                  <SelectTrigger className="h-9 w-auto min-w-44 gap-2 font-medium">
                    <span>{modo === "semana" ? `${diaMes(janela.de)} a ${diaMes(janela.ate)}`
                      : modo === "mes" ? maiuscula(rotuloMes(janela.de)) : "Período"}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semana">Semana</SelectItem>
                    <SelectItem value="mes">Mês</SelectItem>
                    <SelectItem value="periodo">Escolher período</SelectItem>
                  </SelectContent>
                </Select>
                {modo !== "periodo" && <BotaoSeta lado="depois" disabled={janela.ate >= limite.ate} onClick={() => passo(1)} />}
              </div>
              {modo === "periodo" && (
                <div className="flex items-center gap-2">
                  <div className="w-40"><DatePickerInput value={janela.de} onChange={(v) => v && setDe(v)} /></div>
                  <span className="text-sm text-muted-foreground">a</span>
                  <div className="w-40"><DatePickerInput value={janela.ate} onChange={(v) => v && setAte(v)} /></div>
                </div>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <SlidersHorizontal className="mr-1.5 h-4 w-4" />Filtros
                    {filtrosAtivos > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{filtrosAtivos}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 space-y-3">
                  <FiltroSelect rotulo="Situação" valor={situacao} onTrocar={setSituacao} opcoes={[
                    ["problema", "Com problema"], ["reclamou", "Reclamou no WhatsApp"], ["andamento", "Em andamento"],
                    ["entregue", "Entregue"], ["cancelado", "Cancelado"], ...PROBLEMAS.map((x) => [x.id, x.rotulo] as [string, string]),
                  ]} />
                  <FiltroSelect rotulo="Caso" valor={casoTipo} onTrocar={setCasoTipo}
                    opcoes={[["sem", "Sem caso"], ...FLUXOS.map((f) => [f.tipo, f.rotulo] as [string, string])]} />
                  <FiltroSelect rotulo="Canal" valor={canal} onTrocar={setCanal} opcoes={canais.map((c) => [c, c] as [string, string])} />
                  {filtrosAtivos > 0 && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => { setSituacao(""); setCasoTipo(""); setCanal(""); }}>
                      Limpar filtros
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
            </>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
            {(carregandoOutro || q.isFetching) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {d && `${lista.length} ${lista.length === 1 ? "pedido" : "pedidos"}`}
          </span>
        </div>

        {erro && !d ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/[0.06] p-8 text-center">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            <p className="font-semibold">
              {erro.tipo === "sem_funcao" ? "O pós-venda ainda não foi instalado no banco."
                : erro.tipo === "sem_permissao" ? "Sem acesso ao pós-venda."
                : "Não foi possível carregar os pedidos."}
            </p>
            {erro.tipo === "outro" && <p className="max-w-xl break-words text-sm text-muted-foreground">{erro.mensagem}</p>}
          </div>
        ) : !d ? (
          <div className="space-y-2 rounded-xl border bg-card p-4">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className={cn("space-y-4 transition-opacity", carregandoOutro && "opacity-50")}>
            {erro && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">Não foi possível atualizar: {erro.mensagem}</span>
              </p>
            )}

            {aba === "tratar" && (
              <>
                <Lista titulo={`A partir de ${corteCurto}`} n={novos.length} vazio={busca ? "Nada encontrado." : "Nada para tratar."}>
                  {novos.slice(0, mostrar).map((p) => <LinhaTratar key={p.bling_id} p={p} onAbrir={() => abrir(p)} />)}
                </Lista>
                {antigos.length > 0 && (
                  <Lista titulo={`Antes de ${corteCurto}`} n={antigos.length} vazio="">
                    {antigos.slice(0, mostrar).map((p) => <LinhaTratar key={p.bling_id} p={p} onAbrir={() => abrir(p)} />)}
                  </Lista>
                )}
              </>
            )}
            {aba === "casos" && (
              <Lista vazio={busca ? "Nada encontrado." : "Nenhum caso aberto."}>
                {lista.slice(0, mostrar).map((p) => <LinhaCaso key={p.bling_id} p={p} onAbrir={() => abrir(p)} />)}
              </Lista>
            )}
            {aba === "todos" && (
              <Lista vazio={busca || filtrosAtivos ? "Nada encontrado." : "Nenhum pedido neste período."}>
                {lista.slice(0, mostrar).map((p) => <LinhaTodos key={p.bling_id} p={p} onAbrir={() => abrir(p)} />)}
              </Lista>
            )}

            {Math.max(novos.length, antigos.length, aba === "tratar" ? 0 : lista.length) > mostrar && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => setMostrar((n) => n + POR_PAGINA)}>Mostrar mais</Button>
              </div>
            )}
          </div>
        )}

        {aberto && <DialogoPedido key={aberto.bling_id} p={aberto} onFechar={() => setPedido("")} />}
      </div>
    </div>
  );
}

function FiltroSelect({ rotulo, valor, onTrocar, opcoes }: {
  rotulo: string; valor: string; onTrocar: (v: string) => void; opcoes: [string, string][];
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{rotulo}</span>
      <Select value={valor || "todos"} onValueChange={(v) => onTrocar(v === "todos" ? "" : v)}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos</SelectItem>
          {opcoes.map(([id, r]) => <SelectItem key={id} value={id}>{r}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}
