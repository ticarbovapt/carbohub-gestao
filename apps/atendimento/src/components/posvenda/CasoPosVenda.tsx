import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote, Check, ChevronDown, ChevronRight, Clock, Copy, CornerUpLeft, ExternalLink, FileQuestion, GitBranch, Hourglass,
  Loader2, MessageSquarePlus, MoreHorizontal, PackageMinus, PackageSearch, PackageX, Replace, RotateCcw, Send, Undo2,
  UserX, Wrench, XCircle, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { confirmar, pedirTexto } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export const ICONE_TIPO: Record<TipoCaso, LucideIcon> = {
  faltante: PackageMinus, avaria: PackageX, defeito: Wrench, errado: Replace, arrependimento: RotateCcw,
  nao_recebido: PackageSearch, atraso: Clock, devolvido: CornerUpLeft, outro: FileQuestion,
};

/** O ícone do tipo num quadrado da cor dele. */
export function IconeTipo({ tipo, className }: { tipo: string; className?: string }) {
  const f = FLUXO[tipo as TipoCaso];
  const Icone = ICONE_TIPO[tipo as TipoCaso] ?? FileQuestion;
  const cor = f?.cor ?? "#64748b";
  return (
    <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", className)}
      style={{ background: `${cor}14`, color: cor }}>
      <Icone className="h-5 w-5" />
    </span>
  );
}

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

// ── A linha do tempo: o que já foi respondido ───────────────────────────────
// Campos gravados por passos sem formulário (o pagamento do Financeiro, o envio do comprovante).
const ROTULO_CAMPO: Record<string, string> = { pago_em: "Pago em", envio: "Enviado por", forma: "Como devolver", dados: "Dados" };
const ROTULO_OPCAO: Record<string, string> = { pago_financeiro: "Pago pelo Financeiro" };

/** Um ponto da linha do tempo; `ultimo` não desenha o traço para baixo. */
function Marco({ ultimo, ponto, children }: { ultimo?: boolean; ponto: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-3">
      {!ultimo && <span className="absolute left-[11px] top-7 bottom-0 w-px bg-border" aria-hidden />}
      <span className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">{ponto}</span>
      <div className={cn("min-w-0 flex-1", !ultimo && "pb-5")}>{children}</div>
    </li>
  );
}

const PontoFeito = () => (
  <span className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground">
    <Check className="h-3.5 w-3.5" />
  </span>
);

function ItemTrilha({ h, ultimo }: { h: HistCaso; ultimo?: boolean }) {
  const passo = h.tipo && h.passo ? passoDe(h.tipo, h.passo) : null;
  const opcao = passo?.opcoes.find((o) => o.id === h.opcao);
  const campos = Object.entries(h.campos ?? {}).filter(([, v]) => String(v ?? "").trim());
  const rotuloCampo = (id: string) => passo?.campos?.find((c) => c.id === id)?.rotulo ?? ROTULO_CAMPO[id] ?? id;

  let titulo: React.ReactNode;
  let resposta: React.ReactNode = null;
  if (h.acao === "abriu") titulo = <>Caso aberto como <span className="font-medium">{rotuloTipo(h.tipo ?? "")}</span></>;
  else if (h.acao === "nota") titulo = "Anotação";
  else if (h.acao === "encerrou") { titulo = "Caso encerrado"; resposta = rotuloDesfecho(h.desfecho); }
  else {
    titulo = passo?.titulo ?? h.passo;
    resposta = (
      <>
        {opcao?.rotulo ?? ROTULO_OPCAO[h.opcao ?? ""] ?? h.opcao}
        {h.acao === "mudou_tipo" && h.proximo && <span className="font-normal text-muted-foreground"> · mudou o tipo</span>}
      </>
    );
  }

  const ponto = h.acao === "nota"
    ? <span className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground"><MessageSquarePlus className="h-3 w-3" /></span>
    : <PontoFeito />;

  return (
    <Marco ultimo={ultimo} ponto={ponto}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm text-muted-foreground">{titulo}</p>
        <span className="text-[11px] text-muted-foreground tabular-nums">{quando(h.em)}{h.por ? ` · ${h.por}` : ""}</span>
      </div>
      {resposta && <p className="text-sm font-medium">{resposta}</p>}
      {(campos.length > 0 || (h.valor != null && h.acao !== "abriu")) && (
        <dl className="mt-1 space-y-0.5 text-xs">
          {campos.map(([k, v]) => (
            <div key={k}><dt className="inline text-muted-foreground">{rotuloCampo(k)}: </dt><dd className="inline break-words">{String(v)}</dd></div>
          ))}
          {h.valor != null && h.acao !== "abriu" && (
            <div><dt className="inline text-muted-foreground">Valor: </dt><dd className="inline tabular-nums">{brl(Number(h.valor))}</dd></div>
          )}
        </dl>
      )}
      {h.nota && <p className="mt-1.5 whitespace-pre-wrap break-words rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">{h.nota}</p>}
    </Marco>
  );
}

/** O cartão do passo atual: cabeçalho, corpo e a barra de ações no rodapé. */
function CartaoPasso({ titulo, cdc, icone, tom = "primario", children, rodape }: {
  titulo: string; cdc?: string; icone?: React.ReactNode; tom?: "primario" | "espera" | "pago";
  children?: React.ReactNode; rodape?: React.ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-sm",
      tom === "primario" && "border-primary/40 ring-1 ring-primary/15",
      tom === "espera" && "border-amber-500/40",
      tom === "pago" && "border-teal-500/40")}>
      <div className={cn("flex items-start justify-between gap-3 border-b px-4 py-3",
        tom === "primario" && "bg-primary/[0.04]", tom === "espera" && "bg-amber-500/[0.06]", tom === "pago" && "bg-teal-500/[0.05]")}>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Passo atual</p>
          <p className="mt-0.5 flex items-center gap-2 font-semibold leading-snug">{icone}{titulo}</p>
        </div>
        <CdcBadge cdc={cdc} />
      </div>
      {children && <div className="space-y-4 px-4 py-4">{children}</div>}
      {rodape && <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-3">{rodape}</div>}
    </div>
  );
}

/** A mensagem pronta para o cliente, com o botão de copiar. */
function MensagemPronta({ texto }: { texto: string }) {
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); toast.success("Mensagem copiada"); }
    catch { toast.error("Não foi possível copiar"); }
  };
  return (
    <div className="rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">Mensagem para o cliente</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={copiar}>
          <Copy className="mr-1 h-3.5 w-3.5" />Copiar
        </Button>
      </div>
      <p className="whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-relaxed">{texto}</p>
    </div>
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

  const ocupado = responder.isPending || solicitar.isPending;

  return (
    <CartaoPasso titulo={passo.titulo} cdc={passo.cdc}
      rodape={(
        <>
          {passo.opcoes.map((o) => (
            <Button key={o.id} type="button" disabled={ocupado}
              variant={o.tom === "nao" ? "outline" : "default"}
              className={cn("h-auto min-h-9 whitespace-normal text-left",
                o.tom === "nao" && "border-red-500/40 bg-background text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400")}
              onClick={() => escolher(o)}>
              {enviando === o.id && <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin" />}
              {o.rotulo}
              {o.mudaPara && <span className="ml-1.5 text-xs opacity-80">→ {rotuloTipo(o.mudaPara)}</span>}
            </Button>
          ))}
          {nota.trim() && (
            <Button type="button" variant="ghost" className="ml-auto" disabled={anotar.isPending} onClick={soAnotar}>
              <MessageSquarePlus className="mr-1.5 h-4 w-4" />Só anotar
            </Button>
          )}
        </>
      )}>
      {passo.texto && <p className="text-sm leading-relaxed text-muted-foreground">{passo.texto}</p>}
      {caso.tipo === "arrependimento" && passo.id === "prazo" && (
        <p className={cn("rounded-md border px-3 py-2 text-sm",
          diasDaEntrega != null && diasDaEntrega > 7 ? "border-red-500/40 bg-red-500/[0.05] text-red-700 dark:text-red-400" : "bg-muted/40")}>
          {p.entregue_em
            ? `Entregue em ${dia(p.entregue_em)} · há ${diasDaEntrega} ${diasDaEntrega === 1 ? "dia" : "dias"}`
            : "Sem data de entrega no rastreio: confirme com o cliente."}
        </p>
      )}

      {mensagem && <MensagemPronta texto={mensagem} />}

      {(passo.campos ?? []).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(passo.campos ?? []).map((c) => {
            // ⚠️ Escolha é GRUPO, nunca <label>: o label rotula o primeiro botão de
            // dentro, e clicar no rótulo marcava a primeira opção.
            const Envolve = c.tipo === "escolha" ? "div" : "label";
            const idRotulo = `campo-${passo.id}-${c.id}`;
            return (
            <Envolve key={c.id} className={cn("block space-y-1.5", (c.tipo === "longo" || c.tipo === "escolha") && "sm:col-span-2")}
              {...(c.tipo === "escolha" ? { role: "group", "aria-labelledby": idRotulo } : {})}>
              <span id={idRotulo} className="block text-sm font-medium">{c.rotulo}{c.obrigatorio && <span className="text-red-600"> *</span>}</span>
              {c.tipo === "escolha" ? (
                <div className="flex flex-wrap gap-2">
                  {(c.escolhas ?? []).map((e) => (
                    <button key={e.id} type="button"
                      onClick={() => setValores((v) => ({ ...v, [c.id]: e.id }))}
                      aria-pressed={valores[c.id] === e.id}
                      className={cn("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                        valores[c.id] === e.id ? "border-primary bg-primary/10 font-medium text-primary" : "bg-background hover:bg-muted")}>
                      {valores[c.id] === e.id && <Check className="h-3.5 w-3.5" />}
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
            </Envolve>
            );
          })}
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Anotação <span className="font-normal text-muted-foreground">(opcional)</span></span>
        <Textarea rows={2} maxLength={4000} value={nota} onChange={(e) => setNota(e.target.value)} />
      </label>
    </CartaoPasso>
  );
}

// ── Reembolso: esperando o Financeiro ────────────────────────────────────────
function DadosDoPedido({ r }: { r: Reembolso }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">Valor</dt><dd className="font-semibold tabular-nums">{brl(Number(r.valor))}</dd>
      <dt className="text-muted-foreground">Como</dt><dd>{rotuloForma(r.forma)}</dd>
      {r.dados && (<><dt className="text-muted-foreground">Dados</dt><dd className="whitespace-pre-wrap break-words">{r.dados}</dd></>)}
      <dt className="text-muted-foreground">Pedido em</dt>
      <dd>{quando(r.solicitado_em)}{r.solicitado_por ? ` · ${r.solicitado_por}` : ""}</dd>
      {r.nota && (<><dt className="text-muted-foreground">Anotação</dt><dd className="whitespace-pre-wrap break-words">{r.nota}</dd></>)}
    </dl>
  );
}

function EsperaFinanceiro({ r }: { r: Reembolso | null }) {
  return (
    <CartaoPasso tom="espera" titulo="Aguardando o Financeiro pagar" icone={<Hourglass className="h-4 w-4 text-amber-600" />}>
      {r ? <DadosDoPedido r={r} /> : <p className="text-sm text-muted-foreground">Pedido de reembolso não encontrado.</p>}
    </CartaoPasso>
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

  return (
    <CartaoPasso tom="pago" titulo={passo.titulo} icone={<Banknote className="h-4 w-4 text-teal-600" />}
      rodape={(
        <>
          {r?.comprovante_path && waId && (
            <Button type="button" disabled={enviandoWa || responder.isPending} onClick={enviarWa}>
              {enviandoWa ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}Enviar pelo WhatsApp
            </Button>
          )}
          <Button type="button" variant="outline" className="bg-background" disabled={enviandoWa || responder.isPending} onClick={() => encerrar("Outro meio")}>
            {responder.isPending && !enviandoWa && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Já enviei por outro meio
          </Button>
        </>
      )}>
      {r ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Pago</dt>
            <dd className="font-semibold tabular-nums">{brl(Number(r.valor_pago ?? r.valor))}{r.pago_em ? ` em ${dia(r.pago_em)}` : ""}</dd>
            <dt className="text-muted-foreground">Por</dt><dd>{r.pago_por ?? "Financeiro"}</dd>
            <dt className="text-muted-foreground">Como</dt><dd>{rotuloForma(r.forma)}</dd>
            {r.nota_financeiro && (<><dt className="text-muted-foreground">Financeiro</dt><dd className="whitespace-pre-wrap break-words">{r.nota_financeiro}</dd></>)}
          </dl>
          {r.comprovante_path && (
            <Button type="button" variant="outline" size="sm" disabled={abrindo} onClick={ver}>
              {abrindo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}Ver comprovante
            </Button>
          )}
        </div>
      ) : <p className="text-sm text-muted-foreground">Pagamento não encontrado.</p>}

      {mensagem && <MensagemPronta texto={mensagem} />}
    </CartaoPasso>
  );
}

// ── Escolher o tipo ──────────────────────────────────────────────────────────
function AbrirCaso({ p, novo }: { p: Pendencia; novo?: boolean }) {
  const abrir = useAbrirCaso(p.bling_id);
  const [qual, setQual] = useState<TipoCaso | null>(null);
  // O que o cliente reclamou no WhatsApp SUGERE o tipo (vem primeiro, marcado).
  const sugeridos = tiposSugeridos((p.reclamacao?.assuntos ?? []).map((a) => a.codigo));
  const ordem = [...FLUXOS].sort((a, b) => Number(sugeridos.includes(b.tipo)) - Number(sugeridos.includes(a.tipo)));
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{novo ? "Abrir novo caso" : "Abrir caso"}</h2>
          <p className="text-sm text-muted-foreground">Tipo do problema</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link to="/pos-venda/fluxos"><GitBranch className="mr-1.5 h-3.5 w-3.5" />Fluxos</Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ordem.map((f) => {
          const sugerido = sugeridos.includes(f.tipo);
          return (
            <button key={f.tipo} type="button" disabled={abrir.isPending}
              onClick={() => {
                setQual(f.tipo);
                abrir.mutate({ tipo: f.tipo, passo: f.inicio }, {
                  onError: (e) => toast.error("Não foi possível abrir o caso", { description: mensagemDoErro(e) }),
                  onSettled: () => setQual(null),
                });
              }}
              className={cn("group relative flex items-start gap-3 rounded-xl border bg-card p-3.5 text-left shadow-sm transition-all",
                "hover:border-foreground/20 hover:shadow-md disabled:opacity-60",
                sugerido && "border-primary/50 ring-1 ring-primary/20")}>
              <IconeTipo tipo={f.tipo} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {f.rotulo}
                  {qual === f.tipo && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{f.resumo}</span>
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  {f.cdc && <CdcBadge cdc={f.cdc} />}
                  {sugerido && (
                    <span className="whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                      Cliente reclamou disso
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Um caso ──────────────────────────────────────────────────────────────────
/** A cabeça do caso: o tipo, o prazo, e as ações que NÃO são o passo (no ⋯). */
function CabecaDoCaso({ caso, acoes }: { caso: Caso; acoes?: React.ReactNode }) {
  const f = FLUXO[caso.tipo as TipoCaso];
  return (
    <div className="flex items-start gap-3">
      <IconeTipo tipo={caso.tipo} className="h-11 w-11" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold leading-tight">{rotuloTipo(caso.tipo)}</h2>
          <CdcBadge cdc={f?.cdc} />
          {caso.status !== "aberto" && caso.desfecho && <ChipDesfecho desfecho={caso.desfecho} />}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>Aberto em {quando(caso.aberto_em)}</span>
          {caso.status === "aberto" && <PrazoCaso tipo={caso.tipo} abertoEm={caso.aberto_em} />}
        </p>
      </div>
      {acoes}
    </div>
  );
}

/** Abre a confirmação DEPOIS de o menu fechar: no mesmo tique os dois brigam pelo foco. */
const depoisDoMenu = (fn: () => void) => () => { setTimeout(fn, 0); };

function CasoAberto({ caso, hist, reembolsos, p }: { caso: Caso; hist: HistCaso[]; reembolsos: Reembolso[]; p: Pendencia }) {
  const voltar = useVoltarCaso(p.bling_id);
  const encerrar = useEncerrarCaso(p.bling_id);
  const passo = passoDe(caso.tipo, caso.passo);
  const trilha = useMemo(() => trilhaValida(hist), [hist]);
  // Histórico longo empurra o passo atual para fora da tela: mostra os 3 últimos.
  const [tudo, setTudo] = useState(false);
  const escondidos = tudo || trilha.length <= 4 ? 0 : trilha.length - 3;
  // O pagamento do Financeiro não se desfaz daqui (o banco recusa).
  const ultima = [...trilha].reverse().find((h) => h.acao === "respondeu" || h.acao === "mudou_tipo");
  const podeVoltar = !!ultima && ultima.opcao !== "pago_financeiro";
  const noFinanceiro = !!passo?.financeiro;
  const comprovante = !!passo?.comprovante;
  const podeEncerrar = !noFinanceiro && !comprovante;
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

  const paginaDoFluxo = `/pos-venda/fluxos?tipo=${caso.tipo}`;
  const acoes = (
    <div className="flex shrink-0 items-center gap-1">
      {podeVoltar && (
        <Button type="button" variant="outline" size="sm" className="h-8" disabled={voltar.isPending} onClick={fazerVoltar}>
          <Undo2 className="mr-1.5 h-3.5 w-3.5" />{noFinanceiro ? "Cancelar pedido" : "Voltar passo"}
        </Button>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Mais ações">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link to={paginaDoFluxo}><GitBranch className="mr-2 h-4 w-4" />Ver o fluxo deste caso</Link>
          </DropdownMenuItem>
          {podeEncerrar && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={encerrar.isPending} onSelect={depoisDoMenu(() => fazerEncerrar("sem_retorno"))}>
                <UserX className="mr-2 h-4 w-4" />Cliente não respondeu
              </DropdownMenuItem>
              <DropdownMenuItem disabled={encerrar.isPending} className="text-red-600 focus:text-red-600"
                onSelect={depoisDoMenu(() => fazerEncerrar("cancelado"))}>
                <XCircle className="mr-2 h-4 w-4" />Aberto por engano
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <section className="space-y-5">
      <CabecaDoCaso caso={caso} acoes={acoes} />

      <ol className="space-y-0">
        {escondidos > 0 && (
          <Marco ponto={<span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed bg-background text-[10px] font-semibold text-muted-foreground">{escondidos}</span>}>
            <button type="button" onClick={() => setTudo(true)}
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Mostrar {escondidos === 1 ? "1 passo anterior" : `${escondidos} passos anteriores`}
            </button>
          </Marco>
        )}
        {trilha.slice(escondidos).map((h) => <ItemTrilha key={h.id} h={h} />)}
        <Marco ultimo ponto={<span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary ring-4 ring-primary/15"><span className="h-2 w-2 rounded-full bg-primary-foreground" /></span>}>
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
        </Marco>
      </ol>
    </section>
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
    <div className="overflow-hidden rounded-xl border bg-card">
      <button type="button" onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50">
        <IconeTipo tipo={caso.tipo} className="h-8 w-8 [&_svg]:h-4 [&_svg]:w-4" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {rotuloTipo(caso.tipo)}
            {caso.desfecho && <ChipDesfecho desfecho={caso.desfecho} />}
            {caso.valor != null && <span className="text-xs tabular-nums text-muted-foreground">{brl(Number(caso.valor))}</span>}
          </span>
          <span className="block text-xs text-muted-foreground">
            {caso.encerrado_em ? `Encerrado em ${quando(caso.encerrado_em)}` : `Aberto em ${quando(caso.aberto_em)}`}
          </span>
        </span>
        {aberto ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {aberto && (
        <div className="space-y-3 border-t px-4 py-4">
          <ol>{trilha.map((h, i) => <ItemTrilha key={h.id} h={h} ultimo={i === trilha.length - 1} />)}</ol>
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" disabled={voltar.isPending} onClick={reabrir}>
              <Undo2 className="mr-1.5 h-3.5 w-3.5" />Reabrir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CasoPosVenda({ p }: { p: Pendencia }) {
  const q = useCasosDoPedido(p.bling_id);
  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3"><Skeleton className="h-11 w-11 rounded-lg" /><Skeleton className="h-5 w-56" /></div>
        <Skeleton className="h-16 w-full" /><Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }
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
    <div className="space-y-8">
      {aberto && <CasoAberto caso={aberto} hist={doCaso(aberto.id)} reembolsos={reembolsos.filter((r) => r.caso_id === aberto.id)} p={p} />}
      {encerrados.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {encerrados.length === 1 ? "Caso encerrado" : `Casos encerrados (${encerrados.length})`}
          </h3>
          {encerrados.map((c) => <CasoEncerrado key={c.id} caso={c} hist={doCaso(c.id)} p={p} />)}
        </section>
      )}
      {!aberto && <AbrirCaso p={p} novo={encerrados.length > 0} />}
    </div>
  );
}
