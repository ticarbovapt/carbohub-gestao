import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, BarChart3, Check, ChevronLeft, ChevronRight, Clock, Download, ExternalLink, Loader2, MessageCircle, MessageSquareWarning,
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
import { useAuth } from "@/contexts/AuthContext";
import { useMensagensDaConversa } from "@/hooks/useConversas";
import { useAtribuirCaso, mensagemDoErro } from "@/hooks/usePosVendaCasos";
import {
  MOTIVOS, ROTULO_ESTADO, ROTULO_MOTIVO, clienteRespondeu, compararPrioridade, ehAntiga, entrouEm, estadoDoCaso,
  motivoDe, passaFiltroCaso, prazoResposta, precisaDeAtencao, textoPrazo, tipoProvavel, type FiltroCasos, type Motivo,
} from "@/lib/posvendaFila";
import { toast } from "sonner";
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
// confuso"): TRÊS abas, cada uma respondendo uma pergunta. "Todos os pedidos"
// é a PRIMEIRA e a padrão; as listas vão em páginas de 50 (?pagina=).
//   · Para tratar — o que precisa de alguém agora, de qualquer data:
//     problema sem caso aberto nem tratativa encerrada, ou reclamação do
//     WhatsApp pendente (`carbo_posvenda(p_so_atencao)`, 20261181).
//   · Casos abertos — tipo, passo e prazo de cada caso.
//   · Todos os pedidos — semana/mês/período, busca e o botão Filtros.
// O pedido aberto (o caso no centro) não mudou.
//
// 23/11/2026, segunda rodada ("um pós-venda de verdade"): a fila tem MOTIVO
// (por que está aqui), PRAZO de 1ª resposta (24 h úteis) e ordem de
// PRIORIDADE; reclamação de mais de 30 dias vai para "Antigas"; conversa
// marcada resolvida tira a reclamação da fila (20261182). O caso tem
// responsável e estado, e "Casos abertos" filtra por eles. As regras puras
// moram em `lib/posvendaFila.ts`.
//
// ⚠️ Quem decide o que é problema é o BANCO; a tela não recalcula nada. O
// `precisaDeAtencao` daqui é o MESMO critério do banco (20261181) — mudou lá,
// mude aqui. Tudo menos o ML Full (20261172).
//
// Estado na URL: ?aba=todos|tratar|casos · ?pagina= · ?modo=semana|mes|periodo · ?de= · ?ate=
//                ?situacao= · ?caso= · ?canal= · ?busca= · ?pedido=
//                fila: ?motivo= · ?ordem=antigos|recentes · ?antigas=1   casos: ?casos=comigo|sem_dono|…
// Endereços antigos (?modo=casos, ?aba=antes|novos) continuam abrindo.
// ─────────────────────────────────────────────────────────────────────────────

const POR_PAGINA = 50;
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
              {r.resolvida_na_conversa && " · conversa resolvida"}
            </p>
          </div>
          {r.wa_id && r.numero_id && <UltimasMensagens numeroId={r.numero_id} waId={r.wa_id} />}
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

/** As últimas mensagens da conversa do cliente: o que foi dito depois da reclamação. */
function UltimasMensagens({ numeroId, waId }: { numeroId: string; waId: string }) {
  const q = useMensagensDaConversa(numeroId, waId);
  const ultimas = (q.data ?? []).filter((m) => m.texto?.trim()).slice(-4);
  if (!ultimas.length) return null;
  return (
    <ul className="space-y-1.5">
      {ultimas.map((m) => (
        <li key={m.wamid} className={cn("flex", m.direcao === "saida" ? "justify-end" : "justify-start")}>
          <span className={cn("max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-snug",
            m.direcao === "saida" ? "bg-emerald-500/10" : "border bg-background")}>
            <span className="line-clamp-3 whitespace-pre-wrap break-words">{m.texto}</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {m.direcao === "saida" ? (m.enviado_por_nome ?? "Automática") : "Cliente"} ·{" "}
              {new Date(m.ocorrido_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </span>
        </li>
      ))}
    </ul>
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
const GRADE_TRATAR = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_8rem_7rem_1rem]";
const GRADE_CASOS = "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)_7.5rem_1rem]";
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
/** O que aconteceu: o tipo de caso PROVÁVEL (um palpite, a revisar ao abrir o
 *  caso) e, embaixo, o assunto que o cliente falou ou o problema da entrega.
 *  A mensagem inteira fica no passar do mouse e no pedido aberto. */
function Motivo({ p }: { p: Pendencia }) {
  const r = p.reclamacao?.pendente ? p.reclamacao : null;
  const tipo = tipoProvavel(p);
  const risco = motivoDe(p) === "risco";
  const assuntos = r ? r.assuntos.map((a) => a.rotulo) : [];
  const detalhe = r
    ? [haDias(r.ultima_em), assuntos.join(" · "), p.problema ? ROTULO_PROBLEMA[p.problema] : null]
    : [haDias(p.desde), p.problema && tipo ? ROTULO_PROBLEMA[p.problema] : null];
  return (
    <span className="flex min-w-0 flex-col gap-1" title={r?.trecho ?? undefined}>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        {tipo ? (
          <>
            <ChipTipo tipo={tipo} />
            <span className="text-[11px] text-muted-foreground">provável</span>
          </>
        ) : r ? (
          <span className="inline-flex whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80">
            {ROTULO_MOTIVO[motivoDe(p)]}
          </span>
        ) : p.problema ? <ChipProblema p={p.problema} /> : null}
        {risco && (
          <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" />risco
          </span>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        {r && <MessageSquareWarning className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{detalhe.filter(Boolean).join(" · ")}</span>
      </span>
    </span>
  );
}

function Fila({ grade, onAbrir, children }: { grade: string; onAbrir: () => void; children: React.ReactNode }) {
  // `div` com papel de botão: a linha tem botões dentro ("Pegar"), e botão
  // dentro de botão não existe.
  return (
    <div role="button" tabIndex={0} onClick={onAbrir}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onAbrir(); } }}
      className={cn("grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 lg:items-center", grade)}>
      {children}
    </div>
  );
}

const Valor = ({ p, className }: { p: Pendencia; className?: string }) => (
  <span className={cn("text-right text-sm tabular-nums", className)}>{brl(p.total)}</span>
);
const Seta = () => <ChevronRight className="hidden h-4 w-4 text-muted-foreground lg:block" />;

/** O prazo da 1ª resposta à reclamação (24 h úteis). */
function Responder({ p }: { p: Pendencia }) {
  const pz = p.reclamacao?.pendente ? prazoResposta(p) : null;
  if (!pz) return <span className="hidden text-sm text-muted-foreground lg:inline">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-sm tabular-nums",
      pz.situacao === "respondida" ? "text-emerald-700 dark:text-emerald-400"
        : pz.situacao === "atrasada" ? "font-semibold text-red-600 dark:text-red-400"
        : pz.situacao === "vence_logo" ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")}
      title={pz.limite ? `Responder até ${pz.limite.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : undefined}>
      {pz.situacao === "respondida" ? <Check className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
      {textoPrazo(pz)}
    </span>
  );
}

function LinhaTratar({ p, onAbrir }: { p: Pendencia; onAbrir: () => void }) {
  return (
    <Fila grade={GRADE_TRATAR} onAbrir={onAbrir}>
      <Quem p={p} />
      <Valor p={p} className="lg:order-4" />
      <span className="col-span-2 min-w-0 lg:order-2 lg:col-span-1"><Motivo p={p} /></span>
      <span className="col-span-2 lg:order-3 lg:col-span-1"><Responder p={p} /></span>
      <span className="lg:order-5"><Seta /></span>
    </Fila>
  );
}

const COR_ESTADO: Record<string, string> = {
  em_atendimento: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  aguardando_cliente: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  aguardando_terceiro: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  aguardando_financeiro: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
};

function ChipEstado({ p }: { p: Pendencia }) {
  const c = p.caso!;
  const est = estadoDoCaso(c);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", COR_ESTADO[est])}>
        {est === "aguardando_financeiro" ? "Aguardando Financeiro" : ROTULO_ESTADO[est]}
      </span>
      {clienteRespondeu(p) && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />Cliente respondeu
        </span>
      )}
    </span>
  );
}

function Responsavel({ p }: { p: Pendencia }) {
  const c = p.caso!;
  const { user } = useAuth();
  const atribuir = useAtribuirCaso(p.bling_id);
  if (c.responsavel && c.responsavel === user?.id) return <span className="text-sm font-medium">Você</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn("truncate text-sm", !c.responsavel && "text-muted-foreground")}>{c.responsavel_nome ?? (c.responsavel ? "—" : "Ninguém")}</span>
      {!c.responsavel && (
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={atribuir.isPending}
          onClick={(e) => {
            e.stopPropagation();
            atribuir.mutate({ caso: c.id }, {
              onError: (er) => toast.error("Não foi possível pegar o caso", { description: mensagemDoErro(er) }),
            });
          }}>
          Pegar
        </Button>
      )}
    </span>
  );
}

function LinhaCaso({ p, onAbrir }: { p: Pendencia; onAbrir: () => void }) {
  const c = p.caso!;
  const reemb = etapaDoReembolso(c.tipo, c.passo);
  return (
    <Fila grade={GRADE_CASOS} onAbrir={onAbrir}>
      <Quem p={p} />
      <span className="text-right lg:order-5 lg:text-left"><PrazoCaso tipo={c.tipo} abertoEm={c.aberto_em} /></span>
      <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 lg:order-2 lg:col-span-1">
        <ChipTipo tipo={c.tipo} />
        {reemb ? <ChipReembolso etapa={reemb} />
          : <span className="min-w-0 truncate text-sm text-muted-foreground">{passoDe(c.tipo, c.passo)?.titulo ?? c.passo}</span>}
      </span>
      <span className="min-w-0 lg:order-3"><ChipEstado p={p} /></span>
      <span className="min-w-0 text-right lg:order-4 lg:text-left"><Responsavel p={p} /></span>
      <span className="lg:order-6"><Seta /></span>
    </Fila>
  );
}

function LinhaTodos({ p, onAbrir }: { p: Pendencia; onAbrir: () => void }) {
  const c = p.caso;
  return (
    <Fila grade={GRADE_TODOS} onAbrir={onAbrir}>
      <Quem p={p} />
      <Valor p={p} className="lg:order-4" />
      <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 lg:order-2 lg:col-span-1">
        {p.problema ? <ChipProblema p={p.problema} /> : <ChipEtapa p={p} />}
        {c && <ChipTipo tipo={c.tipo} />}
        {c && c.status !== "aberto" && c.desfecho && <ChipDesfecho desfecho={c.desfecho} />}
        {p.reclamacao && (
          <MessageSquareWarning className={cn("h-4 w-4", p.reclamacao.pendente ? "text-red-600" : "text-muted-foreground")}
            aria-label="Reclamou no WhatsApp" />
        )}
      </span>
      <span className="col-span-2 min-w-0 lg:order-3 lg:col-span-1">
        <span className="block truncate text-sm">{p.transportadora ?? "—"}</span>
        {p.rastreio && <span className="block truncate font-mono text-xs text-muted-foreground">{p.rastreio}</span>}
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

function Lista({ vazio, cabecalho, children }: { vazio: string; cabecalho?: React.ReactNode; children: React.ReactNode[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {cabecalho}
      {children.length ? <div className="divide-y">{children}</div>
        : <p className="px-4 py-12 text-center text-sm text-muted-foreground">{vazio}</p>}
    </div>
  );
}

/** O cabeçalho de cada coluna (só no computador). */
function Colunas({ grade, nomes }: { grade: string; nomes: string[] }) {
  return (
    <div className={cn("hidden gap-x-4 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid", grade)}>
      {nomes.map((n, i) => <span key={i} className={n === "Valor" ? "text-right" : undefined}>{n}</span>)}
    </div>
  );
}

/** As páginas: 1 … 4 5 6 … 19, com as setas. */
function paginasVisiveis(atual: number, total: number): (number | "…")[] {
  const set = new Set([1, total, atual - 1, atual, atual + 1].filter((n) => n >= 1 && n <= total));
  const ns = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  ns.forEach((n, i) => { if (i && n - ns[i - 1] > 1) out.push("…"); out.push(n); });
  return out;
}

function Paginador({ pagina, total, itens, onTrocar }: { pagina: number; total: number; itens: number; onTrocar: (n: number) => void }) {
  if (total <= 1) return null;
  const de = (pagina - 1) * POR_PAGINA + 1;
  const ate = Math.min(itens, pagina * POR_PAGINA);
  return (
    <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
      <span className="text-sm tabular-nums text-muted-foreground">{de}–{ate} de {itens}</span>
      <div className="flex items-center gap-1">
        <BotaoSeta lado="antes" disabled={pagina <= 1} onClick={() => onTrocar(pagina - 1)} />
        {paginasVisiveis(pagina, total).map((n, i) => n === "…"
          ? <span key={`r${i}`} className="px-1 text-sm text-muted-foreground">…</span>
          : (
            <Button key={n} variant={n === pagina ? "default" : "ghost"} size="sm" className="h-9 min-w-9 px-2 tabular-nums"
              aria-current={n === pagina ? "page" : undefined} onClick={() => onTrocar(n)}>
              {n}
            </Button>
          ))}
        <BotaoSeta lado="depois" disabled={pagina >= total} onClick={() => onTrocar(pagina + 1)} />
      </div>
    </div>
  );
}

// ── A tela ───────────────────────────────────────────────────────────────────
type Aba = "tratar" | "casos" | "todos";
type Modo = "semana" | "mes" | "periodo";

export default function PendenciasEntrega() {
  const [abaUrl, setAba] = useParamUrl("aba", "todos");
  const [modoUrl, setModo] = useParamUrl("modo", "semana");
  // Endereços antigos: ?modo=casos e ?aba=antes|novos continuam abrindo.
  const aba: Aba = modoUrl === "casos" || abaUrl === "casos" ? "casos" : abaUrl === "tratar" ? "tratar" : "todos";
  const modo: Modo = modoUrl === "mes" || modoUrl === "periodo" ? modoUrl : "semana";
  const [deUrl, setDe] = useParamUrl("de", "");
  const [ateUrl, setAte] = useParamUrl("ate", "");
  const [situacao, setSituacao] = useParamUrl("situacao", "");
  const [canal, setCanal] = useParamUrl("canal", "");
  const [casoTipo, setCasoTipo] = useParamUrl("caso", "");
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [pedidoUrl, setPedido] = useParamUrl("pedido", "");
  const [paginaUrl, setPagina] = useParamUrl("pagina", "");
  const [motivoUrl, setMotivo] = useParamUrl("motivo", "");
  const [ordem, setOrdem] = useParamUrl("ordem", "");
  const [antigasUrl, setAntigas] = useParamUrl("antigas", "");
  const [casosUrl, setFiltroCasos] = useParamUrl("casos", "");
  const verAntigas = aba === "tratar" && antigasUrl === "1";
  const motivo = MOTIVOS.some((m) => m.id === motivoUrl) ? (motivoUrl as Motivo) : null;
  const FILTROS_CASOS: FiltroCasos[] = ["comigo", "sem_dono", "cliente", "terceiro", "financeiro"];
  const filtroCasos: FiltroCasos = FILTROS_CASOS.includes(casosUrl as FiltroCasos) ? (casosUrl as FiltroCasos) : "todos";
  const { user } = useAuth();

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
    if (algum?.primeiro !== undefined) setPrimeiro(algum.primeiro ? algum.primeiro.slice(0, 10) : null);
  }, [algum?.primeiro]);

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
    setAba(a === "todos" ? "" : a); setModo(""); setDe(""); setAte(""); setSituacao(""); setCasoTipo(""); setCanal("");
    setMotivo(""); setOrdem(""); setAntigas(""); setFiltroCasos("");
  };
  // Mudou o que se vê ⇒ volta à página 1 (menos na primeira montagem: o link
  // com ?pagina= tem de abrir naquela página).
  const montou = useRef(false);
  useEffect(() => {
    if (!montou.current) { montou.current = true; return; }
    setPagina("");
  }, [aba, modo, situacao, casoTipo, canal, busca, janela.de, janela.ate, motivo, ordem, verAntigas, filtroCasos]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── As listas ──
  const casos = useMemo(() => (qCasos.data?.itens ?? []).filter((p) => p.caso?.status === "aberto")
    .sort((a, b) => a.caso!.aberto_em.localeCompare(b.caso!.aberto_em)), [qCasos.data]);
  // A fila (o que precisa de alguém) e as "Antigas" (só reclamação de mais de 30 dias).
  const atencao = useMemo(() => (qTratar.data?.itens ?? []).filter(precisaDeAtencao), [qTratar.data]);
  const fila = useMemo(() => atencao.filter((p) => !ehAntiga(p)), [atencao]);
  const antigas = useMemo(() => atencao.filter(ehAntiga), [atencao]);
  const tratar = verAntigas ? antigas : fila;
  const porMotivo = useMemo(() => {
    const n = new Map<Motivo, number>();
    for (const p of tratar) n.set(motivoDe(p), (n.get(motivoDe(p)) ?? 0) + 1);
    return n;
  }, [tratar]);
  const porFiltroCaso = (f: FiltroCasos) => casos.filter((p) => passaFiltroCaso(p, f, user?.id ?? null)).length;
  const todos = useMemo(() => (qTodos.data?.itens ?? [])
    .filter((p) => p.data_pedido >= periodo.de && p.data_pedido <= periodo.ate),
    [qTodos.data, periodo.de, periodo.ate]);  

  const passaSituacao = (p: Pendencia) => !situacao ? true
    : situacao === "reclamou" ? !!p.reclamacao : situacao === "problema" ? !!p.problema
    : (PROBLEMAS.some((x) => x.id === situacao) ? p.problema === situacao : statusDe(p) === situacao);
  const base = aba === "tratar" ? tratar : aba === "casos" ? casos : todos;
  const lista = useMemo(() => {
    const l = base.filter((p) => casa(p, busca)
      && (aba !== "todos" || (passaSituacao(p) && (!canal || p.canal === canal)
        && (!casoTipo || (casoTipo === "sem" ? !p.caso : p.caso?.tipo === casoTipo))))
      && (aba !== "tratar" || ((!motivo || motivoDe(p) === motivo) && (!canal || p.canal === canal)))
      && (aba !== "casos" || ((!casoTipo || p.caso?.tipo === casoTipo) && passaFiltroCaso(p, filtroCasos, user?.id ?? null))));
    if (aba !== "tratar") return l;
    const agora = new Date();
    return ordem === "antigos" ? [...l].sort((a, b) => String(entrouEm(a)).localeCompare(String(entrouEm(b))))
      : ordem === "recentes" ? [...l].sort((a, b) => String(entrouEm(b)).localeCompare(String(entrouEm(a))))
      : [...l].sort((a, b) => compararPrioridade(a, b, agora));
  }, [base, busca, aba, situacao, canal, casoTipo, motivo, ordem, filtroCasos, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const canais = useMemo(() => [...new Set((aba === "tratar" ? tratar : todos).map((p) => p.canal).filter(Boolean))].sort() as string[],
    [aba, tratar, todos]);

  const achado = pedidoUrl ? [...atencao, ...casos, ...todos].find((p) => String(p.bling_id) === pedidoUrl) ?? null : null;
  const [ultimoAberto, setUltimoAberto] = useState<Pendencia | null>(null);
  useEffect(() => { if (achado) setUltimoAberto(achado); }, [achado]);
  const doUltimo = pedidoUrl && ultimoAberto && String(ultimoAberto.bling_id) === pedidoUrl ? ultimoAberto : null;
  const idAvulso = pedidoUrl && d && !achado && /^-?\d+$/.test(pedidoUrl) ? Number(pedidoUrl) : null;
  const avulso = usePosVendaPedido(idAvulso);
  const aberto = achado ?? doUltimo ?? (idAvulso != null ? avulso.data ?? null : null);
  const carregandoOutro = q.isPlaceholderData || (q.isFetching && !q.isRefetching);
  const abrir = (p: Pendencia) => setPedido(String(p.bling_id));

  const nomeArquivo = `pos-venda-${aba === "todos" ? `${periodo.de}-a-${periodo.ate}` : aba === "casos" ? "casos-abertos" : verAntigas ? "reclamacoes-antigas" : "para-tratar"}.csv`;
  const filtrosAtivos = [situacao, canal, casoTipo].filter(Boolean).length;

  const ordenada = lista;
  const totalPaginas = Math.max(1, Math.ceil(ordenada.length / POR_PAGINA));
  const pagina = Math.min(totalPaginas, Math.max(1, Number(paginaUrl) || 1));
  const daPagina = ordenada.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const irPara = (n: number) => {
    setPagina(n <= 1 ? "" : String(n));
    document.querySelector("main")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };
  const LinhaDaAba = aba === "tratar" ? LinhaTratar : aba === "casos" ? LinhaCaso : LinhaTodos;

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
          { id: "todos", rotulo: "Todos os pedidos", curto: "Todos" },
          { id: "tratar", rotulo: "Para tratar", n: qTratar.data ? fila.length : undefined, alerta: true },
          { id: "casos", rotulo: "Casos abertos", curto: "Casos", n: qCasos.data ? casos.length : undefined },
        ]} />

        {aba === "tratar" && (
          <>
            {verAntigas && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="-ml-2 h-8" onClick={() => { setAntigas(""); setMotivo(""); }}>
                  <ChevronLeft className="mr-1 h-4 w-4" />Fila
                </Button>
                <span className="text-sm font-medium">Reclamações com mais de 30 dias</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]">
              <Cartao ativo={!motivo} rotulo="Tudo" n={tratar.length} onClick={() => setMotivo("")} />
              {MOTIVOS.filter((m) => porMotivo.get(m.id)).map((m) => (
                <Cartao key={m.id} ativo={motivo === m.id} rotulo={ROTULO_MOTIVO[m.id]} n={porMotivo.get(m.id) ?? 0}
                  alerta={m.id === "risco"} onClick={() => setMotivo(motivo === m.id ? "" : m.id)} />
              ))}
            </div>
          </>
        )}
        {aba === "casos" && (
          <Segmentos ativo={filtroCasos} onTrocar={(f) => setFiltroCasos(f === "todos" ? "" : f)} itens={[
            { id: "comigo" as FiltroCasos, rotulo: "Comigo", n: porFiltroCaso("comigo") },
            { id: "sem_dono" as FiltroCasos, rotulo: "Sem responsável", n: porFiltroCaso("sem_dono"), alerta: true },
            { id: "todos" as FiltroCasos, rotulo: "Abertos", n: casos.length },
            { id: "cliente" as FiltroCasos, rotulo: "Aguardando cliente", n: porFiltroCaso("cliente") },
            { id: "terceiro" as FiltroCasos, rotulo: "Aguardando terceiro", n: porFiltroCaso("terceiro") },
            { id: "financeiro" as FiltroCasos, rotulo: "Aguardando Financeiro", n: porFiltroCaso("financeiro") },
          ]} />
        )}

        {/* A barra: busca em todas; filtros de cada aba */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 basis-full sm:basis-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={buscaLocal} onChange={(e) => setBuscaLocal(e.target.value)}
              placeholder="Cliente, telefone, pedido, rastreio…" className="h-9 pl-8" />
          </div>
          {aba === "tratar" && (
            <>
              {canais.length > 1 && (
                <Select value={canal || "todos"} onValueChange={(v) => setCanal(v === "todos" ? "" : v)}>
                  <SelectTrigger className="h-9 w-auto gap-2"><span className="text-muted-foreground">Canal:</span><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">todos</SelectItem>
                    {canais.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={ordem || "prioridade"} onValueChange={(v) => setOrdem(v === "prioridade" ? "" : v)}>
                <SelectTrigger className="h-9 w-auto gap-2"><span className="text-muted-foreground">Ordenar:</span><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prioridade">mais urgente</SelectItem>
                  <SelectItem value="antigos">mais antigos</SelectItem>
                  <SelectItem value="recentes">mais recentes</SelectItem>
                </SelectContent>
              </Select>

            </>
          )}
          {aba === "casos" && (
            <Select value={casoTipo || "todos"} onValueChange={(v) => setCasoTipo(v === "todos" ? "" : v)}>
              <SelectTrigger className="h-9 w-auto gap-2"><span className="text-muted-foreground">Tipo:</span><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">todos</SelectItem>
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
          <span className="ml-auto inline-flex items-center gap-3 text-sm text-muted-foreground tabular-nums">
            {aba === "tratar" && !verAntigas && antigas.length > 0 && (
              <button type="button" className="inline-flex items-center gap-1.5 hover:text-foreground"
                onClick={() => { setAntigas("1"); setMotivo(""); }}>
                <Clock className="h-4 w-4" />Antigas {antigas.length}
              </button>
            )}
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

            <Lista
              vazio={busca || filtrosAtivos || motivo || (aba === "casos" && filtroCasos !== "todos") ? "Nada encontrado."
                : verAntigas ? "Nenhuma reclamação antiga." : aba === "tratar" ? "Nada para tratar." : aba === "casos" ? "Nenhum caso aberto." : "Nenhum pedido neste período."}
              cabecalho={<Colunas grade={aba === "tratar" ? GRADE_TRATAR : aba === "casos" ? GRADE_CASOS : GRADE_TODOS}
                nomes={aba === "tratar" ? ["Cliente", "O que aconteceu", "Responder", "Valor", ""]
                  : aba === "casos" ? ["Cliente", "Caso", "Estado", "Responsável", "Prazo", ""]
                  : ["Cliente", "Situação", "Entrega", "Valor", ""]} />}>
              {daPagina.map((p) => (
                <LinhaDaAba key={p.bling_id} p={p} onAbrir={() => abrir(p)} />
              ))}
            </Lista>

            <Paginador pagina={pagina} total={totalPaginas} itens={ordenada.length} onTrocar={irPara} />
          </div>
        )}

        {aberto && <DialogoPedido key={aberto.bling_id} p={aberto} onFechar={() => setPedido("")} />}
      </div>
    </div>
  );
}

/** Um cartão de contagem que também é filtro (o motivo da fila). */
function Cartao({ ativo, rotulo, n, alerta, onClick }: {
  ativo: boolean; rotulo: string; n: number; alerta?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={cn("flex min-w-0 flex-col items-start rounded-xl border bg-card px-3.5 py-2.5 text-left transition-colors",
        ativo ? "border-primary ring-1 ring-primary/30" : "hover:border-foreground/20")}>
      <span className={cn("flex items-center gap-1 truncate text-xs",
        alerta ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
        {alerta && <AlertTriangle className="h-3 w-3 shrink-0" />}{rotulo}
      </span>
      <span className={cn("text-xl font-semibold tabular-nums", alerta && "text-red-600 dark:text-red-400")}>{n}</span>
    </button>
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
