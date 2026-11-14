import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Download, ExternalLink, Loader2, MessageCircle, PackageSearch, PackageX, Search,
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
import {
  COR_PROBLEMA, ETAPA_ROTULO, PROBLEMAS, ROTULO_PROBLEMA, ROTULO_SITUACAO, SITUACOES,
  ehFinal, lerErro, useHistoricoTrato, usePendenciasEntrega, useSalvarTrato,
  type Pendencia, type Problema, type SituacaoTrato,
} from "@/hooks/usePendenciasEntrega";

// ─────────────────────────────────────────────────────────────────────────────
// Pendências de entrega — `/pendencias` (13/11/2026).
//
// Duas listas, cortadas em 06/11/2026 (decisão do dono do processo):
//   Antes de 06/11      o passivo: resolver aos poucos, cliente a cliente.
//   A partir de 06/11   o acompanhamento do dia a dia.
//
// ⚠️ Quem decide o que é problema é o BANCO (`carbo_entrega_pendencias`); a
// tela não recalcula nada. E a situação do trato é anotação: marcar
// "Resolvido" aqui NÃO move o card da esteira.
//
// Estado na URL: ?aba=antes|novos · ?problema= · ?situacao=abertos|tratados|todos
//                ?canal= · ?busca= · ?pedido=<bling_id> (o trato aberto)
// ─────────────────────────────────────────────────────────────────────────────

const POR_PAGINA = 100;

const brl = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "2026-11-06" → "06/11/26", sem passar por Date (fuso). */
function dia(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

/** O domingo da semana do dia ("AAAA-MM-DD"), em texto, sem fuso. */
function domingoDe(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  t.setUTCDate(t.getUTCDate() - t.getUTCDay());
  return t.toISOString().slice(0, 10);
}
function maisDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
/** "26/10 – 01/11" (domingo a sábado). */
const rotuloSemana = (domingo: string) => `${dia(domingo).slice(0, 5)} – ${dia(maisDias(domingo, 6)).slice(0, 5)}`;

function diasDesde(iso: string | null) {
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

function ChipProblema({ p }: { p: Problema }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${COR_PROBLEMA[p]}1a`, color: COR_PROBLEMA[p] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_PROBLEMA[p] }} />
      {ROTULO_PROBLEMA[p]}
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

function Ha({ p }: { p: Pendencia }) {
  const d = diasDesde(p.desde);
  if (d == null) return null;
  return <span className="text-xs text-muted-foreground">{d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`}</span>;
}

// ── A planilha ───────────────────────────────────────────────────────────────
function baixarPlanilha(itens: Pendencia[], nome: string) {
  const cab = ["Semana", "Pedido", "Nº loja", "Canal", "Data do pedido", "Cliente", "Telefone", "Cidade", "UF", "Valor",
    "Problema", "Desde", "Etapa na esteira", "Transportadora", "Rastreio", "NF", "Situação", "Observação",
    "Atualizado por", "Atualizado em"];
  const cel = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = itens.map((p) => [
    rotuloSemana(domingoDe(p.data_pedido)), p.pedido_codigo ?? p.pedido_numero, p.pedido_loja, p.canal, dia(p.data_pedido), p.cliente, p.cliente_fone,
    p.cidade, p.uf, p.total != null ? p.total.toFixed(2).replace(".", ",") : "",
    ROTULO_PROBLEMA[p.problema], dia(p.desde), ETAPA_ROTULO[p.etapa] ?? p.etapa, p.transportadora, p.rastreio,
    p.nf_numero, ROTULO_SITUACAO[p.trato?.situacao ?? "aberto"], p.trato?.observacao,
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
            <ChipProblema p={p.problema} />
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
          <dd>{ETAPA_ROTULO[p.etapa] ?? p.etapa}{p.nf_numero ? ` · NF ${p.nf_numero}` : ""}</dd>
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

// ── A tela ───────────────────────────────────────────────────────────────────
export default function PendenciasEntrega() {
  const q = usePendenciasEntrega();
  const d = q.data;
  const erro = q.error ? lerErro(q.error) : null;

  const [abaUrl, setAba] = useParamUrl("aba", "antes");
  const aba = abaUrl === "novos" ? "novos" : "antes";
  const [problema, setProblema] = useParamUrl("problema", "");
  const [situacaoUrl, setSituacao] = useParamUrl("situacao", "abertos");
  const situacao = situacaoUrl === "tratados" || situacaoUrl === "todos" ? situacaoUrl : "abertos";
  const [canal, setCanal] = useParamUrl("canal", "");
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [pedidoUrl, setPedido] = useParamUrl("pedido", "");
  // Só na aba "Antes": a semana (o domingo) que se está tratando.
  const [semanaUrl, setSemana] = useParamUrl("semana", "");
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  // A busca escreve na URL só quando a pessoa para de digitar.
  const [buscaLocal, setBuscaLocal] = useState(busca);
  useEffect(() => { setBuscaLocal(busca); }, [busca]);
  useEffect(() => {
    if (buscaLocal === busca) return;
    const t = setTimeout(() => setBusca(buscaLocal), 300);
    return () => clearTimeout(t);
  }, [buscaLocal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMostrar(POR_PAGINA); }, [aba, problema, situacao, canal, busca, semanaUrl]);

  const corte = d ? dia(d.corte).slice(0, 5) : "06/11";
  const daAba = useMemo(
    () => (d?.itens ?? []).filter((p) => (aba === "antes") === p.antes_do_corte),
    [d, aba],
  );
  const contaAbas = useMemo(() => {
    const abertos = (p: Pendencia) => !ehFinal(p.trato?.situacao);
    const it = d?.itens ?? [];
    return {
      antes: it.filter((p) => p.antes_do_corte && abertos(p)).length,
      novos: it.filter((p) => !p.antes_do_corte && abertos(p)).length,
    };
  }, [d]);
  const passaSituacao = (p: Pendencia) =>
    situacao === "todos" ? true : situacao === "tratados" ? ehFinal(p.trato?.situacao) : !ehFinal(p.trato?.situacao);
  const semana = aba === "antes" && /^\d{4}-\d{2}-\d{2}$/.test(semanaUrl) ? semanaUrl : "";
  const passaResto = (p: Pendencia) =>
    (!canal || p.canal === canal) && (!semana || domingoDe(p.data_pedido) === semana) && casa(p, busca);
  // As semanas da aba "Antes", da mais recente para a mais antiga, com quantos
  // estão em aberto e quantos ao todo.
  const semanas = useMemo(() => {
    if (aba !== "antes") return [];
    const m = new Map<string, { abertos: number; total: number }>();
    for (const p of daAba) {
      const k = domingoDe(p.data_pedido);
      const s = m.get(k) ?? { abertos: 0, total: 0 };
      s.total++;
      if (!ehFinal(p.trato?.situacao)) s.abertos++;
      m.set(k, s);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([domingo, s]) => ({ domingo, ...s }));
  }, [daAba, aba]);

  // Cada pílula conta com os OUTROS filtros aplicados e o dela solto.
  const contaProblema = useMemo(() => {
    const m = new Map<Problema, number>();
    for (const p of daAba) if (passaSituacao(p) && passaResto(p)) m.set(p.problema, (m.get(p.problema) ?? 0) + 1);
    return m;
  }, [daAba, situacao, canal, busca, semana]); // eslint-disable-line react-hooks/exhaustive-deps
  const canais = useMemo(() => [...new Set(daAba.map((p) => p.canal).filter(Boolean))].sort() as string[], [daAba]);

  const lista = useMemo(() => {
    const l = daAba.filter((p) => (!problema || p.problema === problema) && passaSituacao(p) && passaResto(p));
    // Na aba "Antes" a lista vem por SEMANA, da mais recente para a mais
    // antiga; dentro da semana, por data do pedido.
    if (aba === "antes") {
      l.sort((a, b) => domingoDe(b.data_pedido).localeCompare(domingoDe(a.data_pedido))
        || a.data_pedido.localeCompare(b.data_pedido) || a.bling_id - b.bling_id);
    }
    return l;
  }, [daAba, aba, problema, situacao, canal, busca, semana]); // eslint-disable-line react-hooks/exhaustive-deps
  // O cabeçalho de semana sai antes do 1º pedido de cada semana da página.
  const cabecalhoDe = (p: Pendencia, i: number, pagina: Pendencia[]) => {
    if (aba !== "antes") return null;
    const k = domingoDe(p.data_pedido);
    if (i > 0 && domingoDe(pagina[i - 1].data_pedido) === k) return null;
    const s = semanas.find((x) => x.domingo === k);
    const n = lista.filter((x) => domingoDe(x.data_pedido) === k).length;
    return { k, rotulo: `Semana ${rotuloSemana(k)}`, n, abertos: s?.abertos ?? 0, total: s?.total ?? 0 };
  };
  const aberto = pedidoUrl ? (d?.itens ?? []).find((p) => String(p.bling_id) === pedidoUrl) ?? null : null;

  const nomeArquivo = semana
    ? `pendencias-semana-${semana}.csv`
    : `pendencias-${aba === "antes" ? "antes" : "a-partir"}-de-${corte.replace("/", "-")}-${new Date().toISOString().slice(0, 10)}.csv`;

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <CarboPageHeader
          title="Pendências de entrega"
          icon={PackageX}
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
            <button key={a} role="tab" type="button" aria-selected={aba === a} onClick={() => { setAba(a); setProblema(""); setSemana(""); }}
              className={cn("inline-flex items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                aba === a ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {a === "antes" ? `Antes de ${corte}` : `A partir de ${corte}`}
              {d && (
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  contaAbas[a] > 0 ? "bg-red-500/15 text-red-700 dark:text-red-400" : "bg-foreground/10")}>
                  {contaAbas[a]}
                </span>
              )}
            </button>
          ))}
        </div>

        {erro && !d ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/[0.06] p-8 text-center">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            <p className="font-semibold">
              {erro.tipo === "sem_funcao" ? "As pendências ainda não foram instaladas no banco."
                : erro.tipo === "sem_permissao" ? "Sem acesso às pendências."
                : "Não foi possível carregar as pendências."}
            </p>
            {erro.tipo === "outro" && <p className="max-w-xl break-words text-sm text-muted-foreground">{erro.mensagem}</p>}
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
              {PROBLEMAS.map((pr) => {
                const n = contaProblema.get(pr.id) ?? 0;
                const ativo = problema === pr.id;
                return (
                  <button key={pr.id} type="button" aria-pressed={ativo}
                    onClick={() => setProblema(ativo ? "" : pr.id)}
                    disabled={!n && !ativo}
                    className={cn("inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-40",
                      ativo ? "border-transparent text-white" : "hover:bg-muted")}
                    style={ativo ? { background: pr.cor } : undefined}>
                    {!ativo && <span className="h-2 w-2 rounded-full" style={{ background: pr.cor }} />}
                    {pr.rotulo}
                    <span className="font-semibold tabular-nums">{n}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 basis-full md:basis-80">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={buscaLocal} onChange={(e) => setBuscaLocal(e.target.value)}
                  placeholder="Cliente, telefone, pedido, rastreio, NF…" className="h-9 pl-8" />
              </div>
              {aba === "antes" && semanas.length > 0 && (
                <Select value={semana || "todas"} onValueChange={(v) => setSemana(v === "todas" ? "" : v)}>
                  <SelectTrigger className="h-9 min-w-0 basis-full sm:w-64 sm:basis-auto sm:flex-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as semanas</SelectItem>
                    {semanas.map((w) => (
                      <SelectItem key={w.domingo} value={w.domingo}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span>{rotuloSemana(w.domingo)}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {w.abertos ? `${w.abertos} em aberto` : "tudo tratado"}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={situacao} onValueChange={setSituacao}>
                <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-48 sm:flex-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="abertos">Em aberto</SelectItem>
                  <SelectItem value="tratados">Tratados</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={canal || "todos"} onValueChange={(v) => setCanal(v === "todos" ? "" : v)}>
                <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-48 sm:flex-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os canais</SelectItem>
                  {canais.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                {lista.length} {lista.length === 1 ? "pedido" : "pedidos"}
              </span>
            </div>

            {!lista.length ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Nenhum pedido aqui.
              </div>
            ) : (
              <>
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
                          {cab.total - cab.abertos} de {cab.total} tratados
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
                        <ChipSituacao s={p.trato?.situacao ?? null} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ChipProblema p={p.problema} /><Ha p={p} />
                      </div>
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
                        <th className="px-3 py-2 font-medium">Problema</th>
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
                                {cab.n} {cab.n === 1 ? "pedido" : "pedidos"} · {cab.total - cab.abertos} de {cab.total} tratados
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
                          <td className="px-3 py-2 align-top">
                            <ChipProblema p={p.problema} />
                            <div className="mt-0.5"><Ha p={p} /></div>
                          </td>
                          <td className="max-w-[14rem] px-3 py-2 align-top">
                            <p className="truncate">{p.transportadora ?? "—"}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">{p.rastreio ?? ""}</p>
                          </td>
                          <td className="max-w-[18rem] px-3 py-2 align-top">
                            <ChipSituacao s={p.trato?.situacao ?? null} />
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
              </>
            )}
          </>
        )}

        {aberto && <DialogoTrato key={aberto.bling_id} p={aberto} onFechar={() => setPedido("")} />}
      </div>
    </div>
  );
}
