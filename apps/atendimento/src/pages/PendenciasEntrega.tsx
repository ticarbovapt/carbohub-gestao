import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, MessageCircle, PackageSearch, Search,
} from "lucide-react";
import { toast } from "sonner";
import { useParamUrl } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  COR_PROBLEMA, ETAPA_ROTULO, PROBLEMAS, ROTULO_PROBLEMA, ROTULO_SITUACAO, SITUACOES,
  ehFinal, lerErro, useHistoricoTrato, usePosVenda, useSalvarTrato,
  type Pendencia, type Problema, type SituacaoTrato,
} from "@/hooks/usePendenciasEntrega";

// ─────────────────────────────────────────────────────────────────────────────
// Pós-venda — `/pos-venda` (ex-`/pendencias`, Pendências de entrega).
//
// 17/11/2026, pedido do dono do processo: TODO pedido aparece, mesmo entregue
// ("depois de entregue pode ter problema também"), MENOS o ML Full (logística
// e pós-venda são do Mercado Livre) — quem tira o Full é o banco
// (`carbo_posvenda`, 20261172). A tela pagina por PERÍODO: semana (domingo a
// sábado, clicando, sem dropdown), mês ou intervalo livre.
//
// As duas abas continuam, cortadas em 06/11/2026: "Antes" é o passivo,
// "A partir" é o dia a dia. A semana que atravessa o corte aparece nas duas,
// cada uma com a sua parte.
//
// ⚠️ Quem decide o que é problema é o BANCO; a tela não recalcula nada. E o
// trato é anotação: marcar "Resolvido" aqui NÃO move o card da esteira.
//
// Estado na URL: ?aba=antes|novos · ?modo=semana|mes|periodo · ?de= · ?ate=
//                ?status= · ?problema= · ?tratativa= · ?canal= · ?busca= · ?pedido=
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

/** O que o pedido é agora: o problema, ou a etapa com a data que importa. */
function Situacao({ p }: { p: Pendencia }) {
  if (p.problema) {
    const d = diasDesde(p.desde);
    return (
      <>
        <ChipProblema p={p.problema} />
        {d != null && (
          <div className="mt-0.5 text-xs text-muted-foreground">{d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`}</div>
        )}
      </>
    );
  }
  const nota = p.etapa === "entregue" && p.entregue_em ? `em ${diaMes(p.entregue_em.slice(0, 10))}`
    : p.etapa === "em_transito" && p.previsao ? `previsão ${diaMes(p.previsao)}` : null;
  return (
    <>
      <ChipEtapa p={p} />
      {nota && <div className="mt-0.5 text-xs text-muted-foreground">{nota}</div>}
    </>
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
    "Atualizado por", "Atualizado em"];
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
  ].map(cel).join(";"));
  // BOM + `;`: abre direto no Excel com acento e coluna certos.
  const blob = new Blob(["﻿" + [cab.join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
}

// ── O trato de um pedido ─────────────────────────────────────────────────────
function DialogoTrato({ p, onFechar }: { p: Pendencia; onFechar: () => void }) {
  const salvar = useSalvarTrato();
  const hist = useHistoricoTrato(p.bling_id);
  const [situacao, setSituacao] = useState<SituacaoTrato>(p.trato?.situacao ?? "em_contato");
  const [obs, setObs] = useState(p.trato?.observacao ?? "");
  const mudou = situacao !== (p.trato?.situacao ?? null) || (obs.trim() || null) !== (p.trato?.observacao ?? null);

  const enviar = () => {
    salvar.mutate({ bling_id: p.bling_id, situacao, observacao: obs.trim() || null }, {
      onSuccess: () => { toast.success("Tratativa salva"); onFechar(); },
      onError: (e: any) => toast.error("Não foi possível salvar", { description: String(e?.message ?? e) }),
    });
  };

  const fone = digitos(p.cliente_fone);
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {p.pedido_codigo ?? p.pedido_numero ?? `#${Math.abs(p.bling_id)}`}
            {p.problema ? <ChipProblema p={p.problema} /> : <ChipEtapa p={p} />}
          </DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Cliente</dt>
          <dd className="truncate">{p.cliente ?? "—"}</dd>
          <dt className="text-muted-foreground">Telefone</dt>
          <dd>{p.cliente_fone ?? <span className="text-amber-700 dark:text-amber-400">sem telefone</span>}</dd>
          <dt className="text-muted-foreground">Pedido</dt>
          <dd>{dia(p.data_pedido)} · {p.canal ?? "—"} · {brl(p.total)}</dd>
          <dt className="text-muted-foreground">Entrega</dt>
          <dd className="truncate">{[p.cidade, p.uf].filter(Boolean).join(" / ") || "—"}</dd>
          <dt className="text-muted-foreground">Esteira</dt>
          <dd>
            {ETAPA_ROTULO[p.etapa] ?? p.etapa}{p.nf_numero ? ` · NF ${p.nf_numero}` : ""}
            {p.entregue_em ? ` · entregue em ${dia(p.entregue_em)}` : ""}
          </dd>
          <dt className="text-muted-foreground">Rastreio</dt>
          <dd className="truncate">
            {p.transportadora ?? "—"}{p.rastreio ? ` · ${p.rastreio}` : ""}
            {p.previsao ? ` · previsão ${dia(p.previsao)}` : ""}
            {p.rastreio_status ? ` · ${p.rastreio_status}` : ""}
          </dd>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/ecommerce/esteira?pedido=${p.bling_id}`}><PackageSearch className="mr-1.5 h-4 w-4" />Ver na esteira</Link>
          </Button>
          {fone.length >= 8 && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/conversas?busca=${fone.slice(-8)}`}><MessageCircle className="mr-1.5 h-4 w-4" />Conversa</Link>
            </Button>
          )}
          {p.url_rastreio && (
            <Button asChild variant="outline" size="sm">
              <a href={p.url_rastreio} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />Rastreio</a>
            </Button>
          )}
        </div>

        <div className="space-y-3 border-t pt-3">
          <Select value={situacao} onValueChange={(v) => setSituacao(v as SituacaoTrato)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SITUACOES.map((s) => <SelectItem key={s.id} value={s.id}>{s.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} maxLength={4000}
            placeholder="O que foi feito, o que o cliente disse, próximo passo…" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
            <Button onClick={enviar} disabled={!mudou || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </div>
        </div>

        {(hist.data?.length ?? 0) > 0 && (
          <div className="max-h-48 space-y-2 overflow-y-auto border-t pt-3">
            {hist.data!.map((h) => (
              <div key={h.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <ChipSituacao s={h.situacao} />
                  <span className="text-xs text-muted-foreground">
                    {new Date(h.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    {h.por ? ` · ${h.por}` : ""}
                  </span>
                </div>
                {h.observacao && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{h.observacao}</p>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── O seletor de período ─────────────────────────────────────────────────────
type Modo = "semana" | "mes" | "periodo";

function BotaoSeta({ lado, disabled, onClick }: { lado: "antes" | "depois"; disabled: boolean; onClick: () => void }) {
  const Icone = lado === "antes" ? ChevronLeft : ChevronRight;
  return (
    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" disabled={disabled} onClick={onClick}
      aria-label={lado === "antes" ? "Anterior" : "Seguinte"}>
      <Icone className="h-4 w-4" />
    </Button>
  );
}

// ── A tela ───────────────────────────────────────────────────────────────────
export default function PendenciasEntrega() {
  const [abaUrl, setAba] = useParamUrl("aba", "antes");
  const aba = abaUrl === "novos" ? "novos" : "antes";
  const [modoUrl, setModo] = useParamUrl("modo", "semana");
  const modo: Modo = modoUrl === "mes" || modoUrl === "periodo" ? modoUrl : "semana";
  const [deUrl, setDe] = useParamUrl("de", "");
  const [ateUrl, setAte] = useParamUrl("ate", "");
  const [statusUrl, setStatus] = useParamUrl("status", "");
  const status = STATUS.some((s) => s.id === statusUrl) ? (statusUrl as Status) : "";
  const [problema, setProblema] = useParamUrl("problema", "");
  const [tratativaUrl, setTratativa] = useParamUrl("tratativa", "todas");
  const tratativa = tratativaUrl === "abertas" || tratativaUrl === "encerradas" ? tratativaUrl : "todas";
  const [canal, setCanal] = useParamUrl("canal", "");
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [pedidoUrl, setPedido] = useParamUrl("pedido", "");
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  // A busca escreve na URL só quando a pessoa para de digitar.
  const [buscaLocal, setBuscaLocal] = useState(busca);
  useEffect(() => { setBuscaLocal(busca); }, [busca]);
  useEffect(() => {
    if (buscaLocal === busca) return;
    const t = setTimeout(() => setBusca(buscaLocal), 300);
    return () => clearTimeout(t);
  }, [buscaLocal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── O período ──
  // O corte e o dia mais antigo vêm do banco; até a 1ª resposta valem os
  // conhecidos (o corte é fixo desde 13/11).
  const [corte, setCorte] = useState("2026-11-06");
  const [primeiro, setPrimeiro] = useState<string | null>(null);
  const hoje = hojeBrasilia();
  // Os limites da aba: "Antes" vai até a véspera do corte; "A partir", até hoje.
  const limite = aba === "antes"
    ? { de: primeiro ?? "2020-01-01", ate: maisDias(corte, -1) }
    : { de: corte, ate: hoje };
  const ancora = ehDia(deUrl) ? deUrl : limite.ate;
  const janela = modo === "semana"
    ? { de: domingoDe(ancora), ate: maisDias(domingoDe(ancora), 6) }
    : modo === "mes"
    ? { de: inicioDoMes(ancora), ate: fimDoMes(ancora) }
    : (() => {
        const a = ehDia(deUrl) ? deUrl : maisDias(limite.ate, -29);
        const b = ehDia(ateUrl) ? ateUrl : limite.ate;
        return a <= b ? { de: a, ate: b } : { de: b, ate: a };
      })();
  // O que se pede ao banco: a janela dentro dos limites da aba.
  const recorte = { de: maior(janela.de, limite.de), ate: menor(janela.ate, limite.ate) };
  const periodo = recorte.de <= recorte.ate ? recorte : null;

  const q = usePosVenda(periodo);
  const d = q.data;
  const erro = q.error ? lerErro(q.error) : null;
  useEffect(() => {
    if (d?.corte) setCorte(d.corte.slice(0, 10));
    if (d?.primeiro !== undefined) setPrimeiro(d.primeiro ? d.primeiro.slice(0, 10) : null);
  }, [d?.corte, d?.primeiro]);

  const passo = (n: number) => {
    if (modo === "semana") setDe(maisDias(janela.de, 7 * n));
    else if (modo === "mes") setDe(maisMeses(janela.de, n));
  };
  const temAntes = janela.de > limite.de;
  const temDepois = janela.ate < limite.ate;
  const trocarModo = (m: Modo) => {
    if (m === modo) return;
    setModo(m === "semana" ? "" : m);
    if (m === "periodo") { setDe(recorte.de); setAte(recorte.ate); }
    else { setDe(recorte.ate); setAte(""); }
  };
  const trocarAba = (a: "antes" | "novos") => {
    setAba(a === "antes" ? "" : a); setDe(""); setAte(""); setProblema(""); setStatus("");
  };

  useEffect(() => { setMostrar(POR_PAGINA); }, [aba, status, problema, tratativa, canal, busca, janela.de, janela.ate]);

  // ── A lista ──
  const daAba = useMemo(
    () => (d?.itens ?? []).filter((p) => (aba === "antes") === p.antes_do_corte
      && periodo != null && p.data_pedido >= periodo.de && p.data_pedido <= periodo.ate),
    [d, aba, periodo?.de, periodo?.ate], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const passaTratativa = (p: Pendencia) =>
    tratativa === "todas" ? true : tratativa === "encerradas" ? ehFinal(p.trato?.situacao) : !ehFinal(p.trato?.situacao);
  const passaResto = (p: Pendencia) => passaTratativa(p) && (!canal || p.canal === canal) && casa(p, busca);
  // Cada contagem usa os OUTROS filtros e solta o dela.
  const contaStatus = useMemo(() => {
    const m = new Map<Status | "todos", number>();
    for (const p of daAba) if (passaResto(p)) {
      m.set("todos", (m.get("todos") ?? 0) + 1);
      m.set(statusDe(p), (m.get(statusDe(p)) ?? 0) + 1);
    }
    return m;
  }, [daAba, tratativa, canal, busca]); // eslint-disable-line react-hooks/exhaustive-deps
  const contaProblema = useMemo(() => {
    const m = new Map<Problema, number>();
    for (const p of daAba) if (p.problema && passaResto(p)) m.set(p.problema, (m.get(p.problema) ?? 0) + 1);
    return m;
  }, [daAba, tratativa, canal, busca]); // eslint-disable-line react-hooks/exhaustive-deps
  const canais = useMemo(() => [...new Set(daAba.map((p) => p.canal).filter(Boolean))].sort() as string[], [daAba]);

  const lista = useMemo(
    () => daAba.filter((p) => (!status || statusDe(p) === status)
      && (!problema || p.problema === problema) && passaResto(p)),
    [daAba, status, problema, tratativa, canal, busca], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Fora da semana, a lista vem com um cabeçalho por semana.
  const agrupa = modo !== "semana";
  const cabecalhoDe = (p: Pendencia, i: number, pagina: Pendencia[]) => {
    if (!agrupa) return null;
    const k = domingoDe(p.data_pedido);
    if (i > 0 && domingoDe(pagina[i - 1].data_pedido) === k) return null;
    const daSemana = lista.filter((x) => domingoDe(x.data_pedido) === k);
    return { rotulo: `Semana ${rotuloSemana(k)}`, n: daSemana.length, problemas: daSemana.filter((x) => x.problema).length };
  };
  const aberto = pedidoUrl ? (d?.itens ?? []).find((p) => String(p.bling_id) === pedidoUrl) ?? null : null;
  const carregandoOutro = q.isPlaceholderData || (q.isFetching && !q.isRefetching);

  const corteCurto = diaMes(corte);
  const rotuloJanela = modo === "semana" ? `Semana ${rotuloSemana(janela.de)}`
    : modo === "mes" ? rotuloMes(janela.de) : `${dia(janela.de)} a ${dia(janela.ate)}`;
  const nomeArquivo = `pos-venda-${aba === "antes" ? "antes" : "a-partir"}-de-${corteCurto.replace("/", "-")}-${recorte.de}-a-${recorte.ate}.csv`;

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <CarboPageHeader
          title="Pós-venda"
          icon={PackageSearch}
          actions={d && (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                {q.isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
                Atualizado às {new Date(d.gerado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <Button variant="outline" size="sm" disabled={!lista.length} onClick={() => baixarPlanilha(lista, nomeArquivo)}>
                <Download className="mr-1.5 h-4 w-4" /> Baixar planilha
              </Button>
            </>
          )}
        />

        <div role="tablist" className="inline-flex h-10 rounded-lg border p-1">
          {(["antes", "novos"] as const).map((a) => (
            <button key={a} role="tab" type="button" aria-selected={aba === a} onClick={() => trocarAba(a)}
              className={cn("inline-flex items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                aba === a ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {a === "antes" ? `Antes de ${corteCurto}` : `A partir de ${corteCurto}`}
              {d && (
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  d.abertos[a] > 0 ? "bg-red-500/15 text-red-700 dark:text-red-400" : "bg-foreground/10")}>
                  {d.abertos[a]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* O período: semana a semana (padrão), mês a mês ou intervalo livre */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div role="tablist" className="inline-flex h-9 shrink-0 self-start rounded-md border p-0.5">
            {([["semana", "Semana"], ["mes", "Mês"], ["periodo", "Período"]] as const).map(([m, r]) => (
              <button key={m} role="tab" type="button" aria-selected={modo === m} onClick={() => trocarModo(m)}
                className={cn("rounded px-3 text-sm font-medium transition-colors",
                  modo === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {r}
              </button>
            ))}
          </div>
          {modo === "semana" && (
            <div className="flex items-center gap-1.5">
              <BotaoSeta lado="antes" disabled={!temAntes} onClick={() => passo(-1)} />
              <span className="min-w-44 text-center text-sm font-semibold tabular-nums">
                {diaMes(janela.de)} a {diaMes(janela.ate)} de {janela.ate.slice(0, 4)}
              </span>
              <BotaoSeta lado="depois" disabled={!temDepois} onClick={() => passo(1)} />
            </div>
          )}
          {modo === "mes" && (
            <div className="flex items-center gap-1.5">
              <BotaoSeta lado="antes" disabled={!temAntes} onClick={() => passo(-1)} />
              <span className="min-w-44 text-center text-sm font-semibold">{maiuscula(rotuloMes(janela.de))}</span>
              <BotaoSeta lado="depois" disabled={!temDepois} onClick={() => passo(1)} />
            </div>
          )}
          {modo === "periodo" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40"><DatePickerInput value={janela.de} onChange={(v) => v && setDe(v)} /></div>
              <span className="text-sm text-muted-foreground">a</span>
              <div className="w-40"><DatePickerInput value={janela.ate} onChange={(v) => v && setAte(v)} /></div>
            </div>
          )}
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
        ) : !periodo ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            {aba === "antes" ? `${rotuloJanela} é depois de ${corteCurto}.` : `${rotuloJanela} é antes de ${corteCurto}.`}
          </div>
        ) : !d ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full max-w-3xl" />
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <>
            {erro && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">Não foi possível atualizar: {erro.mensagem}</span>
              </p>
            )}

            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {([{ id: "" as const, rotulo: "Todos", cor: "" }, ...STATUS]).map((st) => {
                const n = contaStatus.get(st.id || "todos") ?? 0;
                const ativo = status === st.id;
                return (
                  <button key={st.id || "todos"} type="button" aria-pressed={ativo}
                    onClick={() => { setStatus(st.id); setProblema(""); }}
                    className={cn("inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      ativo ? "border-transparent bg-foreground text-background" : "hover:bg-muted")}
                    style={ativo && st.cor ? { background: st.cor, color: "white" } : undefined}>
                    {!ativo && st.cor && <span className="h-2 w-2 rounded-full" style={{ background: st.cor }} />}
                    {st.rotulo}
                    <span className="font-semibold tabular-nums">{n}</span>
                  </button>
                );
              })}
            </div>

            {status === "problema" && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
                {PROBLEMAS.map((pr) => {
                  const n = contaProblema.get(pr.id) ?? 0;
                  const ativo = problema === pr.id;
                  if (!n && !ativo) return null;
                  return (
                    <button key={pr.id} type="button" aria-pressed={ativo}
                      onClick={() => setProblema(ativo ? "" : pr.id)}
                      className={cn("inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
                        ativo ? "border-transparent text-white" : "hover:bg-muted")}
                      style={ativo ? { background: pr.cor } : undefined}>
                      {!ativo && <span className="h-2 w-2 rounded-full" style={{ background: pr.cor }} />}
                      {pr.rotulo}
                      <span className="font-semibold tabular-nums">{n}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 basis-full md:basis-80">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={buscaLocal} onChange={(e) => setBuscaLocal(e.target.value)}
                  placeholder="Cliente, telefone, pedido, rastreio, NF…" className="h-9 pl-8" />
              </div>
              <Select value={tratativa} onValueChange={(v) => setTratativa(v === "todas" ? "" : v)}>
                <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-52 sm:flex-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as tratativas</SelectItem>
                  <SelectItem value="abertas">Tratativa em aberto</SelectItem>
                  <SelectItem value="encerradas">Tratativa encerrada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={canal || "todos"} onValueChange={(v) => setCanal(v === "todos" ? "" : v)}>
                <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-48 sm:flex-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os canais</SelectItem>
                  {canais.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                {carregandoOutro && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {lista.length} {lista.length === 1 ? "pedido" : "pedidos"}
              </span>
            </div>

            {!lista.length ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Nenhum pedido aqui.
              </div>
            ) : (
              <div className={cn("space-y-4 transition-opacity", carregandoOutro && "opacity-50")}>
                {/* Celular: cards */}
                <div className="divide-y rounded-xl border md:hidden">
                  {lista.slice(0, mostrar).map((p, i, pagina) => {
                    const cab = cabecalhoDe(p, i, pagina);
                    return (
                      <Fragment key={p.bling_id}>
                        {cab && (
                          <div className="flex items-baseline justify-between gap-2 bg-muted/50 px-3 py-2">
                            <span className="text-sm font-semibold">{cab.rotulo}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {cab.n} {cab.n === 1 ? "pedido" : "pedidos"}{cab.problemas ? ` · ${cab.problemas} com problema` : ""}
                            </span>
                          </div>
                        )}
                        <button type="button" onClick={() => setPedido(String(p.bling_id))}
                          className="block w-full space-y-1.5 p-3 text-left hover:bg-muted/50">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{p.cliente ?? "—"}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {p.pedido_codigo ?? p.pedido_numero} · {p.canal} · {dia(p.data_pedido)}
                              </p>
                            </div>
                            {p.trato && <ChipSituacao s={p.trato.situacao} />}
                          </div>
                          <div className="flex flex-wrap items-center gap-2"><Situacao p={p} /></div>
                          {p.trato?.observacao && <p className="line-clamp-2 text-xs text-muted-foreground">{p.trato.observacao}</p>}
                        </button>
                      </Fragment>
                    );
                  })}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden overflow-x-auto rounded-xl border md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Pedido</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium">Situação</th>
                        <th className="px-3 py-2 font-medium">Rastreio</th>
                        <th className="px-3 py-2 font-medium">Tratativa</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lista.slice(0, mostrar).map((p, i, pagina) => {
                        const cab = cabecalhoDe(p, i, pagina);
                        return (
                          <Fragment key={p.bling_id}>
                            {cab && (
                              <tr className="bg-muted/50">
                                <td colSpan={6} className="px-3 py-2">
                                  <span className="font-semibold">{cab.rotulo}</span>
                                  <span className="ml-3 text-xs tabular-nums text-muted-foreground">
                                    {cab.n} {cab.n === 1 ? "pedido" : "pedidos"}{cab.problemas ? ` · ${cab.problemas} com problema` : ""}
                                  </span>
                                </td>
                              </tr>
                            )}
                            <tr className="cursor-pointer hover:bg-muted/40" onClick={() => setPedido(String(p.bling_id))}>
                              <td className="px-3 py-2 align-top">
                                <p className="font-medium">{p.pedido_codigo ?? p.pedido_numero ?? `#${Math.abs(p.bling_id)}`}</p>
                                <p className="text-xs text-muted-foreground">{p.canal} · {dia(p.data_pedido)} · {brl(p.total)}</p>
                              </td>
                              <td className="max-w-[16rem] px-3 py-2 align-top">
                                <p className="truncate">{p.cliente ?? "—"}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {p.cliente_fone ?? "sem telefone"}{p.cidade ? ` · ${p.cidade}/${p.uf ?? ""}` : ""}
                                </p>
                              </td>
                              <td className="px-3 py-2 align-top"><Situacao p={p} /></td>
                              <td className="max-w-[14rem] px-3 py-2 align-top">
                                <p className="truncate">{p.transportadora ?? "—"}</p>
                                <p className="truncate font-mono text-xs text-muted-foreground">{p.rastreio ?? ""}</p>
                              </td>
                              <td className="max-w-[18rem] px-3 py-2 align-top">
                                {p.trato ? <ChipSituacao s={p.trato.situacao} /> : <span className="text-xs text-muted-foreground">—</span>}
                                {p.trato?.observacao && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.trato.observacao}</p>}
                              </td>
                              <td className="px-3 py-2 text-right align-top">
                                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setPedido(String(p.bling_id)); }}>
                                  Tratar
                                </Button>
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {lista.length > mostrar && (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => setMostrar((n) => n + POR_PAGINA)}>
                      Mostrar mais ({lista.length - mostrar})
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {aberto && <DialogoTrato key={aberto.bling_id} p={aberto} onFechar={() => setPedido("")} />}
      </div>
    </div>
  );
}
