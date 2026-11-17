import { useMemo, useState } from "react";
import { Banknote, Check, ChevronDown, ChevronRight, Copy, ExternalLink, Hourglass, Loader2, MessageSquarePlus, Send, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { confirmar, pedirTexto } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DESFECHOS, FLUXO, FLUXOS, FORMAS_REEMBOLSO, faltando, tiposSugeridos, lerValor, passoDe, prazoDoCaso, preencherMensagem,
  rotuloDesfecho, rotuloTipo, type Desfecho, type Opcao, type Passo, type TipoCaso,
} from "@/lib/posvendaCasos";
import {
  arquivoDoComprovante, linkDoComprovante, mensagemDoErro, trilhaValida, useAbrirCaso, useAnotarCaso, useCasosDoPedido,
  useEncerrarCaso, useResponderCaso, useSolicitarReembolso, useVoltarCaso, type Caso, type HistCaso, type Reembolso,
} from "@/hooks/usePosVendaCasos";
import { useEnviarMidia, useNumeros } from "@/hooks/useConversas";
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

/** Onde está o reembolso: com o Financeiro, ou pago e esperando o comprovante ir ao cliente. */
export function ChipReembolso({ etapa }: { etapa: "financeiro" | "comprovante" }) {
  return etapa === "financeiro" ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
      <Hourglass className="h-3 w-3" />Reembolso no Financeiro
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-800 dark:text-teal-300">
      <Banknote className="h-3 w-3" />Pago · enviar comprovante
    </span>
  );
}

const rotuloForma = (f: string) => FORMAS_REEMBOLSO.find((x) => x.id === f)?.rotulo ?? f;

function CdcBadge({ cdc }: { cdc?: string }) {
  if (!cdc) return null;
  return <span className="whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">CDC {cdc}</span>;
}

// ── A trilha: o que já foi respondido ────────────────────────────────────────
// Campos gravados por passos sem formulário (o pagamento do Financeiro, o envio do comprovante).
const ROTULO_CAMPO: Record<string, string> = { pago_em: "Pago em", envio: "Enviado por", forma: "Como devolver", dados: "Dados" };
const ROTULO_OPCAO: Record<string, string> = { pago_financeiro: "Pago pelo Financeiro" };
function ItemTrilha({ h }: { h: HistCaso }) {
  const passo = h.tipo && h.passo ? passoDe(h.tipo, h.passo) : null;
  const opcao = passo?.opcoes.find((o) => o.id === h.opcao);
  const campos = Object.entries(h.campos ?? {}).filter(([, v]) => String(v ?? "").trim());
  const rotuloCampo = (id: string) => passo?.campos?.find((c) => c.id === id)?.rotulo ?? ROTULO_CAMPO[id] ?? id;

  let titulo: React.ReactNode;
  if (h.acao === "abriu") titulo = <>Caso aberto: <ChipTipo tipo={h.tipo ?? ""} /></>;
  else if (h.acao === "nota") titulo = "Anotação";
  else if (h.acao === "encerrou") titulo = <>Encerrado: {rotuloDesfecho(h.desfecho)}</>;
  else titulo = (
    <>
      <span className="text-muted-foreground">{passo?.titulo ?? h.passo}</span>
      {" → "}
      <span className="font-medium">{opcao?.rotulo ?? ROTULO_OPCAO[h.opcao ?? ""] ?? h.opcao}</span>
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
  const solicitar = useSolicitarReembolso(p.bling_id);
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
    // Reembolso: quem atende PEDE; o Financeiro paga (20261175).
    if (passo.reembolso && o.proximo === passo.reembolso.aguarda) {
      solicitar.mutate({
        caso: caso.id, passo: passo.id, opcao: o.id, tipo: passo.reembolso.tipo, valor: valor!,
        forma: valores.forma, dados: (valores.dados ?? "").trim() || null, nota: nota.trim() || null,
        aguarda: passo.reembolso.aguarda, depois: passo.reembolso.depois,
      }, {
        onSuccess: () => { setValores({}); setNota(""); toast.success("Reembolso enviado ao Financeiro"); },
        onError: (e) => toast.error("Não foi possível enviar ao Financeiro", { description: mensagemDoErro(e) }),
        onSettled: () => setEnviando(null),
      });
      return;
    }
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
          {c.tipo === "escolha" ? (
            <div className="flex flex-wrap gap-1.5">
              {(c.escolhas ?? []).map((e) => (
                <button key={e.id} type="button"
                  onClick={() => setValores((v) => ({ ...v, [c.id]: e.id }))}
                  className={cn("rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                    valores[c.id] === e.id ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted")}>
                  {e.rotulo}
                </button>
              ))}
            </div>
          ) : c.tipo === "longo" ? (
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
          <Button key={o.id} type="button" disabled={responder.isPending || solicitar.isPending}
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

// ── Reembolso: esperando o Financeiro ────────────────────────────────────────
function DadosDoPedido({ r }: { r: Reembolso }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
      <dt className="text-muted-foreground">Valor</dt><dd className="font-semibold tabular-nums">{brl(Number(r.valor))}</dd>
      <dt className="text-muted-foreground">Como</dt><dd>{rotuloForma(r.forma)}</dd>
      {r.dados && (<><dt className="text-muted-foreground">Dados</dt><dd className="whitespace-pre-wrap break-words">{r.dados}</dd></>)}
      <dt className="text-muted-foreground">Pedido</dt>
      <dd>{quando(r.solicitado_em)}{r.solicitado_por ? ` · ${r.solicitado_por}` : ""}</dd>
      {r.nota && (<><dt className="text-muted-foreground">Anotação</dt><dd className="whitespace-pre-wrap break-words">{r.nota}</dd></>)}
    </dl>
  );
}

function EsperaFinanceiro({ r }: { r: Reembolso | null }) {
  return (
    <div className="space-y-2 rounded-lg border-2 border-amber-500/40 bg-amber-500/[0.05] p-3">
      <p className="flex items-center gap-2 font-semibold"><Hourglass className="h-4 w-4 text-amber-600" />Aguardando o Financeiro pagar</p>
      {r ? <DadosDoPedido r={r} /> : <p className="text-sm text-muted-foreground">Pedido de reembolso não encontrado.</p>}
      <p className="text-xs text-muted-foreground">Para corrigir ou cancelar o pedido, use Voltar passo.</p>
    </div>
  );
}

/** wa_id da conversa: a da reclamação, ou o telefone do pedido (com 55). */
function destinoDoCliente(p: Pendencia): string | null {
  if (p.reclamacao?.wa_id) return p.reclamacao.wa_id;
  const d = (p.cliente_fone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

function EnviarComprovante({ caso, passo, p, r }: { caso: Caso; passo: Passo; p: Pendencia; r: Reembolso | null }) {
  const responder = useResponderCaso(p.bling_id);
  const enviarMidia = useEnviarMidia();
  const numeros = useNumeros();
  const [abrindo, setAbrindo] = useState(false);
  const [enviandoWa, setEnviandoWa] = useState(false);

  const waId = destinoDoCliente(p);
  const numeroId = p.reclamacao?.numero_id ?? numeros.data?.find((n) => n.funcao === "servico")?.phone_number_id ?? null;
  const valor = r?.valor_pago ?? r?.valor ?? null;
  const mensagem = passo.mensagem ? preencherMensagem(passo.mensagem, {
    nome: p.cliente, pedido: p.pedido_codigo ?? p.pedido_numero, valor: valor != null ? brl(Number(valor)) : null,
  }) : "";
  const opcao = passo.opcoes[0];

  const encerrar = (envio: string) => responder.mutate({
    caso: caso.id, passo: passo.id, opcao: opcao.id, desfecho: opcao.desfecho ?? null, campos: { envio },
  }, {
    onSuccess: () => toast.success(`Caso encerrado: ${rotuloDesfecho(opcao.desfecho)}`),
    onError: (e) => toast.error("Não foi possível encerrar", { description: mensagemDoErro(e) }),
  });

  const ver = async () => {
    if (!r?.comprovante_path) return;
    setAbrindo(true);
    try { window.open(await linkDoComprovante(r.comprovante_path), "_blank", "noopener"); }
    catch (e) { toast.error("Não foi possível abrir o comprovante", { description: mensagemDoErro(e) }); }
    finally { setAbrindo(false); }
  };

  const enviarWa = async () => {
    if (!r?.comprovante_path || !waId) return;
    if (!(await confirmar({ titulo: "Enviar o comprovante ao cliente?", mensagem: "O arquivo vai pelo WhatsApp com a mensagem acima, e o caso é encerrado.", confirmar: "Enviar" }))) return;
    setEnviandoWa(true);
    try {
      const arquivo = await arquivoDoComprovante(r.comprovante_path);
      await enviarMidia.mutateAsync({ wa_id: waId, arquivo, legenda: mensagem, numero_id: numeroId });
      encerrar("WhatsApp");
    } catch (e) {
      toast.error("Não foi possível enviar pelo WhatsApp", { description: mensagemDoErro(e) });
    } finally { setEnviandoWa(false); }
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(mensagem); toast.success("Mensagem copiada"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <div className="space-y-3 rounded-lg border-2 border-teal-500/40 bg-teal-500/[0.04] p-3">
      <p className="flex items-center gap-2 font-semibold"><Banknote className="h-4 w-4 text-teal-600" />{passo.titulo}</p>
      {r ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-muted-foreground">Pago</dt>
          <dd className="font-semibold tabular-nums">{brl(Number(r.valor_pago ?? r.valor))}{r.pago_em ? ` em ${dia(r.pago_em)}` : ""}</dd>
          <dt className="text-muted-foreground">Por</dt><dd>{r.pago_por ?? "Financeiro"}</dd>
          <dt className="text-muted-foreground">Como</dt><dd>{rotuloForma(r.forma)}</dd>
          {r.nota_financeiro && (<><dt className="text-muted-foreground">Financeiro</dt><dd className="whitespace-pre-wrap break-words">{r.nota_financeiro}</dd></>)}
        </dl>
      ) : <p className="text-sm text-muted-foreground">Pagamento não encontrado.</p>}

      {mensagem && (
        <div className="rounded-md bg-muted/60 p-2.5">
          <p className="whitespace-pre-wrap break-words text-sm">{mensagem}</p>
          <div className="mt-2 flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={copiar}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar mensagem</Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {r?.comprovante_path && (
          <Button type="button" variant="outline" disabled={abrindo} onClick={ver}>
            {abrindo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}Ver comprovante
          </Button>
        )}
        {r?.comprovante_path && waId && (
          <Button type="button" disabled={enviandoWa || responder.isPending} onClick={enviarWa}>
            {enviandoWa ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}Enviar pelo WhatsApp
          </Button>
        )}
        <Button type="button" variant="outline" disabled={enviandoWa || responder.isPending} onClick={() => encerrar("Outro meio")}>
          {responder.isPending && !enviandoWa && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Já enviei por outro meio
        </Button>
      </div>
    </div>
  );
}

// ── Escolher o tipo ──────────────────────────────────────────────────────────
function AbrirCaso({ p }: { p: Pendencia }) {
  const abrir = useAbrirCaso(p.bling_id);
  const [qual, setQual] = useState<TipoCaso | null>(null);
  // O que o cliente reclamou no WhatsApp SUGERE o tipo (vem primeiro, marcado).
  const sugeridos = tiposSugeridos((p.reclamacao?.assuntos ?? []).map((a) => a.codigo));
  const ordem = [...FLUXOS].sort((a, b) => Number(sugeridos.includes(b.tipo)) - Number(sugeridos.includes(a.tipo)));
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Abrir caso</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ordem.map((f) => (
          <button key={f.tipo} type="button" disabled={abrir.isPending}
            onClick={() => {
              setQual(f.tipo);
              abrir.mutate({ tipo: f.tipo, passo: f.inicio }, {
                onError: (e) => toast.error("Não foi possível abrir o caso", { description: mensagemDoErro(e) }),
                onSettled: () => setQual(null),
              });
            }}
            className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted disabled:opacity-60",
              sugeridos.includes(f.tipo) && "border-red-500/50 bg-red-500/[0.04]")}>
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.cor }} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {f.rotulo}
                {qual === f.tipo && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </span>
              <span className="block text-xs text-muted-foreground">{f.resumo}{f.cdc ? ` · CDC ${f.cdc}` : ""}</span>
              {sugeridos.includes(f.tipo) && (
                <span className="mt-1 inline-block whitespace-nowrap rounded-full bg-red-500/15 px-1.5 text-[11px] font-semibold text-red-700 dark:text-red-400">
                  o cliente reclamou disso
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Um caso ──────────────────────────────────────────────────────────────────
function CasoAberto({ caso, hist, reembolsos, p }: { caso: Caso; hist: HistCaso[]; reembolsos: Reembolso[]; p: Pendencia }) {
  const voltar = useVoltarCaso(p.bling_id);
  const encerrar = useEncerrarCaso(p.bling_id);
  const passo = passoDe(caso.tipo, caso.passo);
  const trilha = useMemo(() => trilhaValida(hist), [hist]);
  // O pagamento do Financeiro não se desfaz daqui (o banco recusa).
  const ultima = [...trilha].reverse().find((h) => h.acao === "respondeu" || h.acao === "mudou_tipo");
  const podeVoltar = !!ultima && ultima.opcao !== "pago_financeiro";
  const noFinanceiro = !!passo?.financeiro;
  const comprovante = !!passo?.comprovante;
  const pedidoAberto = reembolsos.find((r) => r.status === "solicitado" && r.passo_aguarda === caso.passo) ?? null;
  const pago = reembolsos.find((r) => r.status === "pago" && r.passo_depois === caso.passo) ?? null;

  const fazerVoltar = async () => {
    if (!(await confirmar(noFinanceiro
      ? { titulo: "Cancelar o pedido ao Financeiro?", mensagem: "O reembolso sai da fila do Financeiro e o caso volta ao passo de pedir.", confirmar: "Cancelar pedido", perigo: true }
      : { titulo: "Voltar um passo?", mensagem: "A última resposta é desfeita e fica no histórico.", confirmar: "Voltar" }))) return;
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
              <Undo2 className="mr-1 h-3.5 w-3.5" />{noFinanceiro ? "Cancelar pedido ao Financeiro" : "Voltar passo"}
            </Button>
          )}
          {!noFinanceiro && !comprovante && (
            <>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={encerrar.isPending} onClick={() => fazerEncerrar("sem_retorno")}>
                Cliente não respondeu
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" disabled={encerrar.isPending}
                onClick={() => fazerEncerrar("cancelado")}>
                <XCircle className="mr-1 h-3.5 w-3.5" />Aberto por engano
              </Button>
            </>
          )}
        </span>
      </div>

      {trilha.length > 0 && (
        <ol className="space-y-2 border-l pl-1">
          {trilha.map((h) => <ItemTrilha key={h.id} h={h} />)}
        </ol>
      )}

      {passo?.financeiro ? (
        <EsperaFinanceiro r={pedidoAberto} />
      ) : passo?.comprovante ? (
        <EnviarComprovante key={`${caso.tipo}:${caso.passo}`} caso={caso} passo={passo} p={p} r={pago} />
      ) : passo ? (
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
  const reembolsos = q.data?.reembolsos ?? [];
  const aberto = casos.find((c) => c.status === "aberto") ?? null;
  const encerrados = casos.filter((c) => c.status === "encerrado");
  const doCaso = (id: string) => hist.filter((h) => h.caso_id === id);

  return (
    <div className="space-y-4">
      {aberto
        ? <CasoAberto caso={aberto} hist={doCaso(aberto.id)} reembolsos={reembolsos.filter((r) => r.caso_id === aberto.id)} p={p} />
        : <AbrirCaso p={p} />}
      {encerrados.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Check className="h-4 w-4" />Casos encerrados</p>
          {encerrados.map((c) => <CasoEncerrado key={c.id} caso={c} hist={doCaso(c.id)} p={p} />)}
        </div>
      )}
    </div>
  );
}
