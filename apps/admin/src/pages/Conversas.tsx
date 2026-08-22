import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  MessagesSquare, Send, Loader2, AlertTriangle, Clock, ArrowLeft, Lock, Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useConversas, useResponder, janelaAberta, faltaDaJanela,
  type Conversa, type MensagemConversa,
} from "@/hooks/useConversas";

/**
 * Conversas do WhatsApp oficial.
 *
 * ⚠️ Esta tela não é conveniência: é o ÚNICO lugar onde essas mensagens
 * existem. Número da Cloud API não aparece na Caixa de Entrada do Meta Business
 * Suite — aquela tela só aceita número do aplicativo WhatsApp Business — e a
 * Cloud API não tem endpoint de histórico. Sem aqui, a resposta do cliente
 * existe só no celular dele.
 *
 * ── O relógio é a informação principal ─────────────────────────────────────
 *
 * Texto livre só passa enquanto a janela de 24 h estiver aberta, e ela abre
 * quando o CLIENTE escreve. Fechada, a Meta recusa com 131047 e nenhum dos seis
 * templates da esteira serve para responder dúvida. Por isso o tempo restante
 * aparece em cada linha da lista, não escondido dentro da conversa: uma
 * pergunta que ninguém viu a tempo não tem segunda chance.
 */

const hora = (s: string) =>
  new Date(s).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

const NOME_ETAPA: Record<string, string> = {
  confirmado: "Compra identificada", nf_emitida: "Nota fiscal emitida",
  etiqueta: "Aguardando coleta", em_transito: "A caminho",
  saiu_entrega: "Saiu para entrega", entregue: "Entregue",
};

/** Mídia não é baixada — guarda-se o id. A tela diz o que chegou em vez de
 *  fingir que não chegou nada. */
function Balao({ m }: { m: MensagemConversa }) {
  const nossa = m.direcao === "saida";
  const semTexto = !m.texto;
  return (
    <div className={`flex ${nossa ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-lg p-2.5 ${
        nossa ? "rounded-br-sm bg-carbo-green/10" : "rounded-bl-sm border bg-muted/40"}`}>
        {m.midia_id && (
          <p className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            {m.tipo}{m.texto ? "" : " — sem legenda"}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
          {m.texto ?? (
            <span className="text-muted-foreground">
              {m.midia_id ? "arquivo" : `mensagem do tipo "${m.tipo}"`}
            </span>
          )}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">{hora(m.ocorrido_em)}</p>
        {semTexto && !m.midia_id && (
          <p className="mt-0.5 text-[10px] text-amber-500">
            formato que a tela ainda não sabe mostrar — o conteúdo está gravado
          </p>
        )}
      </div>
    </div>
  );
}

function Conversa({ c }: { c: Conversa }) {
  const responder = useResponder();
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const aberta = janelaAberta(c.janela_ate);

  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [c.mensagens.length]);

  const enviar = () => {
    const t = texto.trim();
    if (!t) return;
    responder.mutate({ wa_id: c.wa_id, texto: t }, {
      onSuccess: () => { setTexto(""); toast.success("Enviada"); },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <CarboCard className="flex h-full min-h-0 flex-col">
      <CarboCardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{c.cliente ?? c.wa_id}</h3>
            <p className="text-[11px] text-muted-foreground">
              {c.wa_id}
              {c.sobre_a_etapa && ` · sobre "${NOME_ETAPA[c.sobre_a_etapa] ?? c.sobre_a_etapa}"`}
            </p>
          </div>
          {aberta ? (
            <CarboBadge variant="secondary" className="gap-1 text-emerald-500">
              <Clock className="h-3 w-3" /> {faltaDaJanela(c.janela_ate)} de janela
            </CarboBadge>
          ) : (
            <CarboBadge variant="secondary" className="gap-1 text-muted-foreground">
              <Lock className="h-3 w-3" /> janela fechada
            </CarboBadge>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {c.mensagens.map((m) => <Balao key={m.wamid} m={m} />)}
          <div ref={fim} />
        </div>

        {aberta ? (
          <div className="space-y-1.5 border-t pt-2">
            <Textarea
              value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Responder…" rows={3} maxLength={4096}
              className="resize-y text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar(); }
              }}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-8 gap-1.5"
                      disabled={!texto.trim() || responder.isPending} onClick={enviar}>
                {responder.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5" />}
                Enviar
              </Button>
              <span className="text-[10px] text-muted-foreground">
                ⌘/Ctrl + Enter · {texto.length}/4096
              </span>
            </div>
          </div>
        ) : (
          /* ⚠️ Sem campo de texto quando a janela fechou. Deixá-lo ali, para
             falhar no clique, é pior do que não ter: a pessoa escreve a
             resposta inteira antes de descobrir que não vai. */
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
            <p className="flex items-start gap-1.5 text-[11px] text-amber-500">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              <span>
                Passaram-se mais de 24 h desde a última mensagem do cliente. A Meta
                só aceita <strong>template aprovado</strong> agora — e nenhum dos seis
                da esteira serve para responder dúvida. Se precisar falar, use outro
                canal.
              </span>
            </p>
          </div>
        )}
      </CarboCardContent>
    </CarboCard>
  );
}

export default function Conversas() {
  const [params] = useSearchParams();
  const voltar = params.get("voltar") || "/ecommerce/mensagens";

  const { data: conversas, isLoading, error } = useConversas();
  const [aberta, setAberta] = useState<string | null>(null);

  const lista = conversas ?? [];
  const atual = useMemo(
    () => lista.find((c) => c.wa_id === aberta) ?? lista[0] ?? null,
    [lista, aberta],
  );

  const esperando = lista.filter((c) => c.aguardando > 0).length;
  /* Quem espera resposta E ainda dá para responder. É o número que importa —
     "3 esperando" com as três janelas fechadas é outra conversa. */
  const urgentes = lista.filter((c) => c.aguardando > 0 && janelaAberta(c.janela_ate)).length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <CarboPageHeader
        icon={MessagesSquare}
        title="Conversas"
        description="As respostas dos clientes no WhatsApp oficial. É o único lugar onde elas existem — número da Cloud API não aparece na Caixa de Entrada da Meta."
        actions={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {urgentes > 0 && (
              <span className="text-xs font-medium text-amber-500">
                {urgentes} esperando resposta
              </span>
            )}
            {esperando > urgentes && (
              <span className="text-[11px] text-muted-foreground">
                {esperando - urgentes} com a janela já fechada
              </span>
            )}
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
              <Link to={voltar}><ArrowLeft className="h-3.5 w-3.5" /> Voltar</Link>
            </Button>
          </div>
        }
      />

      {/* ⚠️ Erro e vazio são coisas diferentes, e mostrá-los igual já custou
          caro nesta base: a tela de estoque dos vendedores dizia "ninguém tem
          caixa" quando o que havia era falha de permissão. */}
      {error && (
        <CarboCard>
          <CarboCardContent className="p-4">
            <p className="flex items-start gap-1.5 text-xs text-red-500">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              Não consegui carregar: {(error as Error).message}
            </p>
          </CarboCardContent>
        </CarboCard>
      )}

      {!error && isLoading && (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      )}

      {!error && !isLoading && lista.length === 0 && (
        <CarboCard>
          <CarboCardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma conversa ainda.
            </p>
            <p className="mx-auto mt-1 max-w-lg text-[11px] text-muted-foreground/80">
              Ela aparece quando um cliente responder a uma mensagem da esteira. Três
              dos seis templates pedem resposta — “é só responder esta mensagem”,
              “responda aqui que a gente resolve”, “deu tudo certo com a entrega?”.
            </p>
          </CarboCardContent>
        </CarboCard>
      )}

      {lista.length > 0 && (
        <div className="grid gap-3 lg:h-[calc(100vh-13rem)] lg:grid-cols-[20rem_1fr]">
          <CarboCard className="min-h-0 overflow-hidden">
            <CarboCardContent className="max-h-[24rem] space-y-1 overflow-y-auto p-2 lg:max-h-none lg:h-full">
              {lista.map((c) => {
                const aberto = janelaAberta(c.janela_ate);
                const selecionada = atual?.wa_id === c.wa_id;
                return (
                  <button key={c.wa_id} type="button"
                          onClick={() => setAberta(c.wa_id)}
                          className={`w-full rounded-md border p-2 text-left transition-colors ${
                            selecionada ? "border-carbo-green/50 bg-carbo-green/5"
                                        : "hover:bg-muted/40"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">
                        {c.cliente ?? c.wa_id}
                      </span>
                      {c.aguardando > 0 && (
                        <CarboBadge variant="secondary"
                                    className={`shrink-0 text-[10px] ${
                                      aberto ? "text-amber-500" : "text-muted-foreground"}`}>
                          {c.aguardando}
                        </CarboBadge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {c.ultima_direcao === "saida" && "você: "}
                      {c.ultima_texto ?? "(arquivo)"}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/80">
                      {hora(c.ultima_em)}
                      {aberto
                        ? <span className="text-emerald-500">· {faltaDaJanela(c.janela_ate)}</span>
                        : <span>· fechada</span>}
                    </p>
                  </button>
                );
              })}
            </CarboCardContent>
          </CarboCard>

          {atual && <Conversa key={atual.wa_id} c={atual} />}
        </div>
      )}
    </div>
  );
}
