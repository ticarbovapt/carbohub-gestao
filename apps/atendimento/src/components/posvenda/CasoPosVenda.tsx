import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Loader2, MessageSquarePlus, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { confirmar, pedirTexto } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DESFECHOS, FLUXO, FLUXOS, faltando, lerValor, passoDe, prazoDoCaso, preencherMensagem, rotuloDesfecho, rotuloTipo,
  type Desfecho, type Opcao, type Passo, type TipoCaso,
} from "@/lib/posvendaCasos";
import {
  mensagemDoErro, trilhaValida, useAbrirCaso, useAnotarCaso, useCasosDoPedido, useEncerrarCaso, useResponderCaso,
  useVoltarCaso, type Caso, type HistCaso,
} from "@/hooks/usePosVendaCasos";
import type { Pendencia } from "@/hooks/usePendenciasEntrega";

// ─────────────────────────────────────────────────────────────────────────────
// O caso de pós-venda de um pedido: escolher o tipo, seguir o roteiro passo a
// passo (`lib/posvendaCasos.ts`) e ver o histórico. Fica no diálogo do pedido
// da tela Pós-venda. Toda escrita passa pelas funções do banco (20261173).
// ─────────────────────────────────────────────────────────────────────────────

const dia = (iso: string | null | undefined) => {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ChipTipo({ tipo, className }: { tipo: string; className?: string }) {
  const cor = FLUXO[tipo as TipoCaso]?.cor ?? "#64748b";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", className)}
      style={{ background: `${cor}1a`, color: cor }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
      {rotuloTipo(tipo)}
    </span>
  );
}

export function ChipDesfecho({ desfecho }: { desfecho: string }) {
  const cor = DESFECHOS[desfecho as Desfecho]?.cor ?? "#64748b";
  return (
    <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${cor}1a`, color: cor }}>
      {rotuloDesfecho(desfecho)}
    </span>
  );
}

/** "Faltam 12 dias" / "Venceu há 3 dias" do prazo do caso (só os vícios têm prazo). */
export function PrazoCaso({ tipo, abertoEm, className }: { tipo: string; abertoEm: string; className?: string }) {
  const pz = prazoDoCaso(tipo, abertoEm);
  if (!pz) return null;
  const txt = pz.vencido
    ? `prazo venceu há ${-pz.restam} ${-pz.restam === 1 ? "dia" : "dias"}`
    : pz.restam === 0 ? "prazo vence hoje" : `prazo: ${pz.restam} ${pz.restam === 1 ? "dia" : "dias"}`;
  return (
    <span className={cn("text-xs tabular-nums",
      pz.vencido ? "font-semibold text-red-600 dark:text-red-400" : pz.restam <= 5 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
      className)}
      title={`Até ${pz.limite.toLocaleDateString("pt-BR")} (${pz.rotulo})`}>
      {txt}
    </span>
  );
}

function CdcBadge({ cdc }: { cdc?: string }) {
  if (!cdc) return null;
  return <span className="whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">CDC {cdc}</span>;
}

// ── A trilha: o que já foi respondido ────────────────────────────────────────
function ItemTrilha({ h }: { h: HistCaso }) {
  const passo = h.tipo && h.passo ? passoDe(h.tipo, h.passo) : null;
  const opcao = passo?.opcoes.find((o) => o.id === h.opcao);
  const campos = Object.entries(h.campos ?? {}).filter(([, v]) => String(v ?? "").trim());
  const rotuloCampo = (id: string) => passo?.campos?.find((c) => c.id === id)?.rotulo ?? id;

  let titulo: React.ReactNode;
  if (h.acao === "abriu") titulo = <>Caso aberto: <ChipTipo tipo={h.tipo ?? ""} /></>;
  else if (h.acao === "nota") titulo = "Anotação";
  else if (h.acao === "encerrou") titulo = <>Encerrado: {rotuloDesfecho(h.desfecho)}</>;
  else titulo = (
    <>
      <span className="text-muted-foreground">{passo?.titulo ?? h.passo}</span>
      {" → "}
      <span className="font-medium">{opcao?.rotulo ?? h.opcao}</span>
      {h.acao === "mudou_tipo" && h.proximo && <span className="text-muted-foreground"> (mudou o tipo)</span>}
    </>
  );

  return (
    <li className="relative pl-5 text-sm">
      <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-muted-foreground/40" />
      <div className="break-words">{titulo}</div>
      {campos.map(([k, v]) => (
        <div key={k} className="text-xs"><span className="text-muted-foreground">{rotuloCampo(k)}:</span> {String(v)}</div>
      ))}
      {h.valor != null && h.acao !== "abriu" && <div className="text-xs"><span className="text-muted-foreground">Valor:</span> {brl(Number(h.valor))}</div>}
      {h.nota && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">{h.nota}</p>}
      <div className="text-[11px] text-muted-foreground">{quando(h.em)}{h.por ? ` · ${h.por}` : ""}</div>
    </li>
  );
}

// ── O passo atual ────────────────────────────────────────────────────────────
function PassoAtual({ caso, passo, p }: { caso: Caso; passo: Passo; p: Pendencia }) {
  const responder = useResponderCaso(p.bling_id);
  const anotar = useAnotarCaso(p.bling_id);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);

  const mensagem = passo.mensagem ? preencherMensagem(passo.mensagem, {
    nome: p.cliente, pedido: p.pedido_codigo ?? p.pedido_numero,
    entregue: dia(p.entregue_em), previsao: dia(p.previsao), rastreio: p.rastreio,
  }) : null;

  // No arrependimento, o prazo de 7 dias se confere pela data da entrega.
  const diasDaEntrega = p.entregue_em ? Math.floor((Date.now() - new Date(p.entregue_em).getTime()) / 86_400_000) : null;

  const escolher = (o: Opcao) => {
    const falta = faltando(passo, valores);
    if (falta.length) { toast.error(`Preencha: ${falta.join(", ")}`); return; }
    const campoValor = passo.campos?.find((c) => c.tipo === "valor");
    let valor: number | null = null;
    if (campoValor && (valores[campoValor.id] ?? "").trim()) {
      valor = lerValor(valores[campoValor.id]);
      if (valor == null) { toast.error(`${campoValor.rotulo}: valor inválido`); return; }
    }
    const campos = Object.fromEntries(Object.entries(valores).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
    setEnviando(o.id);
    responder.mutate({
      caso: caso.id, passo: passo.id, opcao: o.id,
      proximo: o.mudaPara ? FLUXO[o.mudaPara].inicio : o.proximo ?? null,
      desfecho: o.desfecho ?? null,
      tipo: o.mudaPara ?? null,
      nota: nota.trim() || null, campos, valor,
    }, {
      onSuccess: () => {
        setValores({}); setNota("");
        if (o.desfecho) toast.success(`Caso encerrado: ${rotuloDesfecho(o.desfecho)}`);
        else if (o.mudaPara) toast.success(`Agora é ${rotuloTipo(o.mudaPara)}`);
      },
      onError: (e) => toast.error("Não foi possível salvar", { description: mensagemDoErro(e) }),
      onSettled: () => setEnviando(null),
    });
  };

  const soAnotar = () => {
    anotar.mutate({ caso: caso.id, nota: nota.trim() }, {
      onSuccess: () => { setNota(""); toast.success("Anotado"); },
      onError: (e) => toast.error("Não foi possível anotar", { description: mensagemDoErro(e) }),
    });
  };

  const copiar = async () => {
    if (!mensagem) return;
    try { await navigator.clipboard.writeText(mensagem); toast.success("Mensagem copiada"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <div className="space-y-3 rounded-lg border-2 border-primary/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold leading-snug">{passo.titulo}</p>
        <CdcBadge cdc={passo.cdc} />
      </div>
      {passo.texto && <p className="text-sm text-muted-foreground">{passo.texto}</p>}
      {caso.tipo === "arrependimento" && passo.id === "prazo" && (
        <p className={cn("text-sm", diasDaEntrega != null && diasDaEntrega > 7 ? "text-red-600 dark:text-red-400" : "")}>
          {p.entregue_em
            ? `Entregue em ${dia(p.entregue_em)} · há ${diasDaEntrega} ${diasDaEntrega === 1 ? "dia" : "dias"}`
            : "Sem data de entrega no rastreio: confirme com o cliente."}
        </p>
      )}

      {mensagem && (
        <div className="rounded-md bg-muted/60 p-2.5">
          <p className="whitespace-pre-wrap break-words text-sm">{mensagem}</p>
          <div className="mt-2 flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={copiar}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar mensagem</Button>
          </div>
        </div>
      )}

      {(passo.campos ?? []).map((c) => (
        <label key={c.id} className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{c.rotulo}{c.obrigatorio ? " *" : ""}</span>
          {c.tipo === "longo" ? (
            <Textarea rows={2} maxLength={2000} value={valores[c.id] ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))} />
          ) : (
            <Input inputMode={c.tipo === "valor" ? "decimal" : undefined} maxLength={200}
              placeholder={c.tipo === "valor" ? "0,00" : undefined} value={valores[c.id] ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))} />
          )}
        </label>
      ))}

      <Textarea rows={2} maxLength={4000} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Anotação (opcional)" />

      <div className="flex flex-wrap gap-2">
        {passo.opcoes.map((o) => (
          <Button key={o.id} type="button" disabled={responder.isPending}
            variant={o.tom === "nao" ? "outline" : "default"}
            className={cn("h-auto min-h-9 whitespace-normal text-left", o.tom === "nao" && "border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-400")}
            onClick={() => escolher(o)}>
            {enviando === o.id && <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin" />}
            {o.rotulo}
            {o.mudaPara && <span className="ml-1.5 text-xs opacity-80">→ {rotuloTipo(o.mudaPara)}</span>}
          </Button>
        ))}
        {nota.trim() && (
          <Button type="button" variant="ghost" disabled={anotar.isPending} onClick={soAnotar}>
            <MessageSquarePlus className="mr-1.5 h-4 w-4" />Só anotar
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Escolher o tipo ──────────────────────────────────────────────────────────
function AbrirCaso({ p }: { p: Pendencia }) {
  const abrir = useAbrirCaso(p.bling_id);
  const [qual, setQual] = useState<TipoCaso | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Abrir caso</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {FLUXOS.map((f) => (
          <button key={f.tipo} type="button" disabled={abrir.isPending}
            onClick={() => {
              setQual(f.tipo);
              abrir.mutate({ tipo: f.tipo, passo: f.inicio }, {
                onError: (e) => toast.error("Não foi possível abrir o caso", { description: mensagemDoErro(e) }),
                onSettled: () => setQual(null),
              });
            }}
            className="flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted disabled:opacity-60">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.cor }} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {f.rotulo}
                {qual === f.tipo && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </span>
              <span className="block text-xs text-muted-foreground">{f.resumo}{f.cdc ? ` · CDC ${f.cdc}` : ""}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Um caso ──────────────────────────────────────────────────────────────────
function CasoAberto({ caso, hist, p }: { caso: Caso; hist: HistCaso[]; p: Pendencia }) {
  const voltar = useVoltarCaso(p.bling_id);
  const encerrar = useEncerrarCaso(p.bling_id);
  const passo = passoDe(caso.tipo, caso.passo);
  const trilha = useMemo(() => trilhaValida(hist), [hist]);
  const podeVoltar = trilha.some((h) => h.acao === "respondeu" || h.acao === "mudou_tipo");

  const fazerVoltar = async () => {
    if (!(await confirmar({ titulo: "Voltar um passo?", mensagem: "A última resposta é desfeita e fica no histórico.", confirmar: "Voltar" }))) return;
    voltar.mutate(caso.id, { onError: (e) => toast.error("Não foi possível voltar", { description: mensagemDoErro(e) }) });
  };
  const fazerEncerrar = async (desfecho: "sem_retorno" | "cancelado") => {
    const nota = await pedirTexto({
      titulo: desfecho === "sem_retorno" ? "Encerrar: cliente não respondeu" : "Encerrar: aberto por engano",
      rotulo: "Anotação", multilinha: true, confirmar: "Encerrar", perigo: true,
    });
    if (nota === null) return;
    encerrar.mutate({ caso: caso.id, desfecho, nota: nota || null }, {
      onSuccess: () => toast.success("Caso encerrado"),
      onError: (e) => toast.error("Não foi possível encerrar", { description: mensagemDoErro(e) }),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ChipTipo tipo={caso.tipo} />
        <CdcBadge cdc={FLUXO[caso.tipo as TipoCaso]?.cdc} />
        <PrazoCaso tipo={caso.tipo} abertoEm={caso.aberto_em} />
        <span className="ml-auto flex flex-wrap gap-1">
          {podeVoltar && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={voltar.isPending} onClick={fazerVoltar}>
              <Undo2 className="mr-1 h-3.5 w-3.5" />Voltar passo
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={encerrar.isPending} onClick={() => fazerEncerrar("sem_retorno")}>
            Cliente não respondeu
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" disabled={encerrar.isPending}
            onClick={() => fazerEncerrar("cancelado")}>
            <XCircle className="mr-1 h-3.5 w-3.5" />Aberto por engano
          </Button>
        </span>
      </div>

      {trilha.length > 0 && (
        <ol className="space-y-2 border-l pl-1">
          {trilha.map((h) => <ItemTrilha key={h.id} h={h} />)}
        </ol>
      )}

      {passo ? (
        <PassoAtual key={`${caso.tipo}:${caso.passo}`} caso={caso} passo={passo} p={p} />
      ) : (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Passo "{caso.passo}" não existe mais no roteiro de {rotuloTipo(caso.tipo)}. Volte um passo ou encerre o caso.
        </p>
      )}
    </div>
  );
}

function CasoEncerrado({ caso, hist, p }: { caso: Caso; hist: HistCaso[]; p: Pendencia }) {
  const [aberto, setAberto] = useState(false);
  const voltar = useVoltarCaso(p.bling_id);
  const trilha = useMemo(() => trilhaValida(hist), [hist]);
  const reabrir = async () => {
    if (!(await confirmar({ titulo: "Reabrir o caso?", mensagem: "O encerramento é desfeito e fica no histórico.", confirmar: "Reabrir" }))) return;
    voltar.mutate(caso.id, { onError: (e) => toast.error("Não foi possível reabrir", { description: mensagemDoErro(e) }) });
  };
  return (
    <div className="rounded-lg border">
      <button type="button" onClick={() => setAberto((a) => !a)}
        className="flex w-full flex-wrap items-center gap-2 p-2.5 text-left hover:bg-muted/50">
        {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <ChipTipo tipo={caso.tipo} />
        {caso.desfecho && <ChipDesfecho desfecho={caso.desfecho} />}
        {caso.valor != null && <span className="text-xs tabular-nums">{brl(Number(caso.valor))}</span>}
        <span className="ml-auto text-xs text-muted-foreground">
          {caso.encerrado_em ? `encerrado em ${quando(caso.encerrado_em)}` : quando(caso.aberto_em)}
        </span>
      </button>
      {aberto && (
        <div className="space-y-2 border-t p-2.5">
          <ol className="space-y-2 border-l pl-1">{trilha.map((h) => <ItemTrilha key={h.id} h={h} />)}</ol>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" disabled={voltar.isPending} onClick={reabrir}>
              <Undo2 className="mr-1 h-3.5 w-3.5" />Reabrir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CasoPosVenda({ p }: { p: Pendencia }) {
  const q = useCasosDoPedido(p.bling_id);
  if (q.isLoading) return <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-28 w-full" /></div>;
  if (q.error) {
    return (
      <p className="rounded-md border border-red-500/40 bg-red-500/[0.06] px-3 py-2 text-sm text-red-700 dark:text-red-400">
        {mensagemDoErro(q.error)}
      </p>
    );
  }
  const casos = q.data?.casos ?? [];
  const hist = q.data?.hist ?? [];
  const aberto = casos.find((c) => c.status === "aberto") ?? null;
  const encerrados = casos.filter((c) => c.status === "encerrado");
  const doCaso = (id: string) => hist.filter((h) => h.caso_id === id);

  return (
    <div className="space-y-4">
      {aberto ? <CasoAberto caso={aberto} hist={doCaso(aberto.id)} p={p} /> : <AbrirCaso p={p} />}
      {encerrados.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Check className="h-4 w-4" />Casos encerrados</p>
          {encerrados.map((c) => <CasoEncerrado key={c.id} caso={c} hist={doCaso(c.id)} p={p} />)}
        </div>
      )}
    </div>
  );
}
