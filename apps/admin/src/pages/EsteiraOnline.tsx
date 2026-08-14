import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Truck, Package, FileText, CheckCircle2, ShoppingCart, Copy, XCircle, Loader2, MapPin, Phone,
  CalendarClock, ExternalLink, MessageSquare, AlertTriangle, Clock, Box, User, Hash, Search,
  Settings2, Link2, BellRing, BellOff, Repeat2, ShoppingBag, Mail, Timer,
} from "lucide-react";
import { toast } from "sonner";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useEsteiraOnline, useRastreios, useEcommerceAguardando, useFontesSaude,
  useAvisosDoPedido, useRecompraPipeline, useRecompraConfig,
  useCarrinhoPipeline, useCarrinhoConfig,
  ETAPAS, COLUNAS_RECOMPRA, COLUNAS_CARRINHO,
  type EsteiraRow, type EtapaEsteira, type RastreioCard, type AguardandoRow,
  type RecompraRow, type ColunaRecompra,
  type CarrinhoRow, type ColunaCarrinho,
} from "@/hooks/useEsteiraOnline";
import { useTemplatesMsg, ORDEM_ETAPAS, type EnvioMsg, type EtapaMsg } from "@/hooks/useMensagensCliente";
import { DatePickerInput } from "@/components/ui/date-picker-input";

/**
 * Esteira do On-line — quadro de acompanhamento da entrega.
 *
 * A tela NÃO decide etapa: quem decide é a view `bling2_esteira`. Aqui só se
 * desenha. Este arquivo é apresentação pura, e é assim que ele deve continuar.
 *
 * ── O que a hierarquia visual está tentando responder ─────────────────────
 *
 * Quem abre esta tela tem uma pergunta na cabeça, quase sempre a mesma: "onde
 * está o pedido do fulano, e quando chega?". A versão anterior tratava tudo
 * com o mesmo peso — o código de rastreio, em verde forte, era o elemento mais
 * chamativo do card, e é justamente o dado que ninguém LÊ (só copia).
 *
 * A ordem agora é: cliente → onde está → quando chega → o resto. Código de
 * rastreio virou rodapé discreto com botão de copiar, porque a função dele é
 * ser copiado, não lido.
 *
 * ── O que ganha destaque de cor ───────────────────────────────────────────
 *
 * Só exceção: atraso (vermelho) e pedido que não anda sozinho (âmbar). Cor em
 * tudo é cor em nada — se o normal também é colorido, o olho para de encontrar
 * o problema, que é exatamente o que a tela precisa entregar num relance.
 */

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (s: string | null) => (s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—");

const fmtDoc = (v: string | null) => {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v?.trim() || "—";
};
const fmtFone = (v: string | null) => {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return v?.trim() || "—";
};

const copiar = (texto: string, oque: string) => {
  navigator.clipboard.writeText(texto)
    .then(() => toast.success(`${oque} copiado`))
    .catch(() => toast.error("Não consegui copiar"));
};

const paraData = (s: string | null) =>
  s ? new Date(s.length <= 10 ? `${s}T12:00:00` : s) : null;

/** Data curta com dia da semana — "qui, 14/08". Numa previsão o dia da semana
 *  é metade da informação: "chega quinta" é o que se fala com o cliente. */
const diaCurto = (s: string | null) => {
  const d = paraData(s);
  return d ? d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }) : "—";
};

const dataHora = (s: string | null) => {
  const d = s ? new Date(s) : null;
  return d ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
};

/** "há 3d" — idade do pedido. Para logística, tempo parado é o sintoma; um
 *  pedido de ontem e um de três semanas na mesma coluna não são o mesmo caso. */
const idade = (s: string | null): string | null => {
  const d = paraData(s);
  if (!d) return null;
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias < 0) return null;
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias}d`;
};

/** Mensagem pronta para o cliente. O time copia e manda pelo canal dele —
 *  o disparo é manual até haver um canal oficial. */
function mensagemCliente(row: EsteiraRow, r?: RastreioCard): string {
  const nome = (row.cliente ?? "").split(" ")[0] || "Olá";
  const linhas = [
    `Oi, ${nome}! Aqui é da Carbo 👋`,
    ``,
    `Seu pedido${row.pedido_loja ? ` ${row.pedido_loja}` : ""} já está a caminho.`,
  ];
  if (row.transportadora) linhas.push(`Transportadora: ${row.transportadora}${row.servico ? ` (${row.servico})` : ""}`);
  if (row.rastreio) linhas.push(`Código de rastreio: ${row.rastreio}`);
  if (r?.url_rastreio) linhas.push(`Acompanhe aqui: ${r.url_rastreio}`);
  if (r?.previsao_entrega && !r.entregue_em) linhas.push(`Previsão de entrega: ${diaCurto(r.previsao_entrega)}`);
  linhas.push(``, `Qualquer dúvida é só chamar por aqui.`);
  return linhas.join("\n");
}

// ── Peças pequenas ──────────────────────────────────────────────────────────

/** Botão que não propaga o clique para o card. Existe para copiar o código sem
 *  precisar abrir o detalhe — atendimento faz isso o dia inteiro. */
function BotaoCopiar({ texto, oque, className = "", truncar = false }: {
  texto: string; oque: string; className?: string; truncar?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); copiar(texto, oque); }}
      title={`Copiar ${oque.toLowerCase()}`}
      className={`inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted hover:text-foreground ${className}`}
    >
      {/* Dois comportamentos, e a escolha errada quebra a tela.
          `break-all` no DIÁLOGO: a chave da NF tem 44 caracteres sem espaço e
          precisa aparecer inteira, senão vira palavra indivisível que estica o
          contêiner. `truncate` no CARD: em coluna de 243px (1366px de tela) um
          código de 26 caracteres quebrava em QUATRO linhas e dobrava a altura
          do card — medido no navegador, não suposto. */}
      <span className={`min-w-0 ${truncar ? "truncate" : "break-all"}`}>{texto}</span>
      <Copy className="h-3 w-3 shrink-0 opacity-60" />
    </button>
  );
}

/** Chip da previsão. Vermelho só quando atrasado — cor reservada ao problema. */
function ChipPrevisao({ r }: { r?: RastreioCard }) {
  if (!r) return null;
  if (r.entregue_em) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium leading-4 text-emerald-500">
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        entregue {diaCurto(r.entregue_em)}
      </span>
    );
  }
  if (!r.previsao_entrega) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium leading-4 ${
      r.atrasado ? "text-red-500" : "text-foreground"
    }`}>
      <CalendarClock className="h-3 w-3 shrink-0" />
      {r.atrasado ? "previa " : "chega "}{diaCurto(r.previsao_entrega)}
      {r.atrasado && " · atrasado"}
    </span>
  );
}

/* ── O aviso ao cliente, como sinal visual ─────────────────────────────────
 *
 * A pergunta que isto responde é "o cliente foi avisado desta etapa?", e ela
 * tem MAIS de duas respostas. Reduzir tudo a um ✓/✗ esconderia justamente os
 * casos que importam: a linha que ficou em `erro` porque o n8n caiu no meio do
 * envio, e a que virou `ignorado` porque o pedido não tinha telefone. Os dois
 * são "não recebeu", e cada um se resolve de um jeito diferente.
 *
 * ⚠️ A ausência de registro só vira alerta quando o template da etapa está
 * ATIVO. Com o aviso desligado não se espera envio nenhum, e pintar o quadro
 * inteiro de âmbar por causa de uma função que ninguém ligou é o tipo de ruído
 * que ensina a equipe a ignorar a cor — aí ela não serve no dia em que estiver
 * certa.
 */
type Sinal = { tom: string; rotulo: string; Icon: typeof BellRing } | null;

function sinalDoAviso(e: EnvioMsg | undefined, esperado: boolean, temFone: boolean): Sinal {
  // ⚠️ "sem telefone" vem ANTES de "sem aviso", e a ordem é a informação.
  //
  // Pedido sem telefone não entra na `carbo_msg_fila` — ela exige
  // `cliente_fone is not null`. Por não entrar, não gera linha em
  // `carbo_msg_envios`: não fica erro, não fica ignorado, fica INVISÍVEL. Sem
  // esta distinção o card diria "sem aviso", que manda investigar o disparo
  // quando o problema é o cadastro.
  //
  // No Mercado Livre isso é permanente: a plataforma não expõe o telefone do
  // comprador, nem para nós nem para o Bling. Dizer o motivo aqui é o que
  // impede a pergunta "por que o cliente do ML nunca recebe?" ficar sem
  // resposta dentro do sistema.
  if (!temFone && !e) {
    return esperado
      ? { tom: "text-amber-500", rotulo: "sem telefone", Icon: BellOff }
      : null;
  }
  if (e) {
    if (e.status === "enviado")  return { tom: "text-emerald-500", rotulo: "avisado",      Icon: BellRing };
    if (e.status === "erro")     return { tom: "text-red-500",     rotulo: "falhou",       Icon: BellOff  };
    if (e.status === "pendente") return { tom: "text-amber-500",   rotulo: "na fila",      Icon: Clock    };
    // `ignorado` é duas coisas. Sem telefone é problema e aparece; marco zero
    // (pedido que já existia quando o aviso foi ligado) é decisão nossa e some.
    if ((e.motivo ?? "").startsWith("telefone"))
      return { tom: "text-amber-500", rotulo: "sem telefone", Icon: BellOff };
    return null;
  }
  return esperado ? { tom: "text-amber-500", rotulo: "sem aviso", Icon: BellOff } : null;
}

function ChipAviso({ sinal }: { sinal: Sinal }) {
  if (!sinal) return null;
  const { tom, rotulo, Icon } = sinal;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-medium leading-4 ${tom}`}
          title={`Aviso ao cliente: ${rotulo}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {rotulo}
    </span>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
//
// ⚠️ ALTURA é o orçamento deste componente. A versão anterior tinha ~170px:
// numa coluna de 700px cabiam 3,5 cards, e era ISSO que fazia a tela parecer
// esticada e vazia — não a largura, não a fonte. O alvo aqui é ~100px, ou seis
// cards por coluna. Antes de acrescentar qualquer linha, pergunte de onde ela
// tira o espaço.
//
// A gordura removida: `p-3` → `py-2.5`, duas divisórias → uma, o badge do canal
// (20px de altura para exibir uma palavra) → texto puro na linha de contexto, e
// as três linhas do bloco de envio → `flex-wrap`, que junta o que couber lado a
// lado quando a coluna é larga.
function Card({ row, rastreio, cor, sinal, onClick }: {
  row: EsteiraRow; rastreio?: RastreioCard; cor: string; sinal: Sinal; onClick: () => void;
}) {
  const atrasado = rastreio?.atrasado && !rastreio?.entregue_em;
  const travado = !row.tem_status_da_plataforma && row.etapa !== "entregue" && row.etapa !== "cancelado";
  const quando = idade(row.data_pedido);
  const contexto = [
    row.canal,
    row.entrega_cidade ? `${row.entrega_cidade}/${row.entrega_uf}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={`group relative cursor-pointer rounded-lg border bg-card px-3 py-2.5 pl-3.5 transition-all
        hover:border-carbo-green/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-carbo-green/40
        ${atrasado ? "border-red-500/40" : ""}`}
    >
      {/* Faixa da etapa. Vira vermelha no atraso: é o único caso em que a cor
          da coluna perde para o estado do pedido. */}
      <span
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
        style={{ background: atrasado ? "#ef4444" : cor }}
      />

      {/* Nome ELÁSTICO, valor firme. Com `justify-between` sobrava um buraco de
          180px entre os dois numa coluna larga; com `flex-1` a folga vira nome
          visível — "Maria Aparecida da Silva Santos" deixa de truncar. */}
      <div className="flex items-baseline gap-2">
        {travado && (
          <AlertTriangle
            className="h-3 w-3 shrink-0 self-center text-amber-500"
            aria-label="não avança sozinho — plataforma não vinculada"
          />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight">
          {row.cliente ?? "—"}
        </span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums">
          {brl(row.total)}
        </span>
      </div>

      <div className="mt-1 flex items-baseline gap-2 text-[11px] leading-4 text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{contexto || "—"}</span>
        {/* O sinal do aviso mora AQUI, na linha de contexto, e não numa linha
            própria: o card tem orçamento de ~100px e uma linha nova custaria
            um sexto dele. Como o chip só aparece quando há o que dizer, na
            maior parte do tempo esta linha continua exatamente como era. */}
        <ChipAviso sinal={sinal} />
        {quando && <span className="shrink-0 tabular-nums">{quando}</span>}
      </div>

      {/* Onde está e quando chega — a razão de a tela existir, e por isso o
          único bloco em `text-foreground`. A transportadora desce para
          metadado: ela não muda decisão nenhuma no relance. */}
      {(row.transportadora || rastreio) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-2">
          <ChipPrevisao r={rastreio} />
          {rastreio?.eventos?.[0] && (
            <span className="flex min-w-0 items-center gap-1 text-xs font-medium leading-4">
              <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{rastreio.eventos[0].descricao}</span>
            </span>
          )}
          {row.transportadora && (
            <span className="flex min-w-0 items-center gap-1 text-[10px] leading-4 text-muted-foreground/70">
              <Truck className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {row.transportadora}{row.servico ? ` · ${row.servico}` : ""}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Rodapé sem divisória: separado por hierarquia, não por régua. O número
          da NF saiu — é dado de conferência, está no detalhe e na busca. Fica
          só o caso NEGATIVO, que é o que merece atenção. */}
      {/* NF, data e rastreio numa linha só. Eu tinha tirado NF e data por
          recomendação de "reduzir ruído" — foi um corte errado: são o que se
          confere ao falar com o cliente. Cabem aqui sem custar altura nenhuma,
          porque dividem a linha que o rastreio já ocupava. */}
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] leading-4 text-muted-foreground/70">
        <span className="shrink-0">
          {row.nf_numero
            ? <>NF {row.nf_numero} · {dia(row.data_pedido)}</>
            : <span className="text-amber-500/80">sem NF · {dia(row.data_pedido)}</span>}
        </span>
        {row.rastreio && (
          <BotaoCopiar texto={row.rastreio} oque="Rastreio" className="min-w-0 font-mono" />
        )}
      </div>
    </div>
  );
}

// ── Trajeto ─────────────────────────────────────────────────────────────────
//
// O caminho do volume, do mais recente para o mais antigo. Quem preenche são o
// `ecommerce-sync` (Mercado Envios) e o `rastreio-sync` (Melhor Envio). A tela
// só desenha: nenhuma etapa é deduzida aqui.
// ⚠️ Duas fontes contam a mesma história, e elas discordam.
//
// A COLUNA vem da plataforma (a Nuvemshop/ML avisa que entregou). O TRAJETO vem
// da transportadora, via Melhor Envio — que não expõe lista de eventos, só
// marcos, e às vezes fica dias atrás do que o site da transportadora já mostra.
//
// Um pedido apareceu na coluna "Entregue" com o trajeto parado em "Postado —
// coletado pela transportadora", em verde, como se fosse o estado atual. O
// pacote estava entregue desde a véspera. Quem abriu o card não teve como
// saber qual das duas acreditar, e essa dúvida é pior que informação faltando.
//
// A regra passa a ser explícita: a plataforma manda. Quando ela está à frente,
// o trajeto perde o destaque de "estado atual" e ganha um aviso dizendo que é
// leitura velha da transportadora — em vez de competir em silêncio.
function Trajeto({ r, etapa }: { r?: RastreioCard; etapa?: EtapaEsteira }) {
  const plataformaEntregou = etapa === "entregue";
  const rastreioAtrasado = plataformaEntregou && !r?.entregue_em;

  if (!r) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Ainda não consultamos este código. A coleta roda de hora em hora e busca
        primeiro os envios que não chegaram.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rastreioAtrasado && (
        <div className="flex items-start gap-1.5 rounded bg-carbo-green/10 px-2 py-1.5 text-[11px] text-carbo-green">
          <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>A plataforma já confirmou a entrega.</strong> O histórico abaixo é a
            última leitura da transportadora e ainda não alcançou — pode ignorar a
            diferença ao falar com o cliente.
          </span>
        </div>
      )}

      {r.erro && (
        <div className="flex items-start gap-1.5 rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
          <span>Não consegui ler o histórico desta transportadora: {r.erro}</span>
        </div>
      )}

      {r.eventos.length === 0 && !r.erro && (
        <p className="text-[11px] text-muted-foreground">
          A transportadora ainda não registrou movimentação neste código.
        </p>
      )}

      {r.eventos.length > 0 && (
        <ol className="relative">
          {r.eventos.map((e, i) => {
            // O ponto verde diz "é aqui que o pedido está". Quando a
            // plataforma já entregou, nenhum evento da transportadora tem esse
            // direito — era exatamente o "Postado" em verde num pacote já
            // entregue que causava a confusão.
            const atual = i === 0 && !rastreioAtrasado;
            return (
              <li key={`${e.ocorrido_em}-${i}`} className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <span className={`shrink-0 rounded-full ring-2 ring-background ${
                    atual ? "h-2.5 w-2.5 bg-carbo-green" : "h-2 w-2 bg-muted-foreground/40"
                  }`} />
                  {i < r.eventos.length - 1 && <span className="w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 pb-3">
                  <div className={`text-xs leading-snug ${atual ? "font-semibold" : "text-muted-foreground"}`}>
                    {e.descricao}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {dataHora(e.ocorrido_em)}
                    {(e.cidade || e.uf) && ` · ${[e.cidade, e.uf].filter(Boolean).join("/")}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-[10px] text-muted-foreground">
        Consultado {dataHora(r.consultado_em)}
      </p>
    </div>
  );
}

/* ── Histórico de avisos, dentro do card ──────────────────────────────────
 *
 * Fora do card cabe UM sinal: o da etapa atual. Aqui cabe a série inteira, e
 * ela é outra pergunta — "o cliente acompanhou o pedido, ou só soube no fim?".
 * Quem vai falar com um cliente irritado precisa saber o que ele já recebeu
 * antes de abrir a boca.
 *
 * `saiu_entrega` aparece na lista mesmo não sendo coluna da esteira: ela É uma
 * mensagem, vem do rastreio, e omiti-la aqui faria a série parecer completa
 * quando não está.
 */
function AvisosDoCliente({ row, avisos, templates }: {
  row: EsteiraRow;
  avisos?: Map<string, EnvioMsg>;
  templates?: Array<{ etapa: EtapaMsg; ativo: boolean; titulo: string }>;
}) {
  return (
    <ul className="space-y-1.5">
      {ORDEM_ETAPAS.map((etapa) => {
        const e = avisos?.get(`${row.bling_id}:${etapa}`);
        const t = templates?.find((x) => x.etapa === etapa);
        const marcoZero = e?.status === "ignorado" && !(e.motivo ?? "").startsWith("telefone");

        // Quatro estados, quatro leituras diferentes — e é por isso que isto
        // não é uma lista de ✓/✗.
        const { tom, texto } =
          e?.status === "enviado"  ? { tom: "text-emerald-500", texto: `enviado ${dataHora(e.enviado_em)}` }
        : e?.status === "erro"     ? { tom: "text-red-500",     texto: e.motivo ?? "falhou" }
        : e?.status === "pendente" ? { tom: "text-amber-500",   texto: e.motivo ?? "na fila" }
        : marcoZero                ? { tom: "text-muted-foreground/60", texto: "antes do aviso existir" }
        : e                        ? { tom: "text-amber-500",   texto: e.motivo ?? "não enviado" }
        : t?.ativo                 ? { tom: "text-amber-500",   texto: "sem registro de envio" }
        :                            { tom: "text-muted-foreground/60", texto: "aviso desligado" };

        return (
          <li key={etapa} className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {t?.titulo ?? etapa}
            </span>
            <span className={`shrink-0 ${tom}`}>{texto}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Detalhe ─────────────────────────────────────────────────────────────────

/**
 * ⚠️ Quem encolhe é o RÓTULO, não o valor.
 *
 * A primeira versão tinha `shrink-0` no rótulo. Com um item chamado
 * "Descarbonizante Carbozé Moto 10ml - Tratamento De Combustível E Proteção do
 * Motor", ele se recusava a encolher, esticava a linha, e a largura vazava para
 * o diálogo inteiro — que saía da tela pela esquerda com o valor espremido em
 * uma letra por linha.
 *
 * Valor é curto e previsível (moeda, data, número); rótulo é texto de terceiro
 * e pode ter qualquer tamanho. Então o valor fica firme e o rótulo cede.
 */
function Linha({ label, valor }: { label: React.ReactNode; valor: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="min-w-0 flex-1 break-words text-[11px] leading-snug text-muted-foreground">
        {label}
      </span>
      <span className="max-w-[60%] shrink-0 break-words text-right text-xs">{valor}</span>
    </div>
  );
}

function Bloco({ titulo, icon: Icon, children }: {
  titulo: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border bg-muted/20 p-3">
      <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {titulo}
      </h4>
      {children}
    </section>
  );
}

function Detalhe({ row, rastreio, avisos, templates, onClose }: {
  row: EsteiraRow; rastreio?: RastreioCard;
  avisos?: Map<string, EnvioMsg>;
  templates?: Array<{ etapa: EtapaMsg; ativo: boolean; titulo: string }>;
  onClose: () => void;
}) {
  const itens = Array.isArray(row.items) ? (row.items as any[]) : [];
  const endereco = [row.entrega_endereco, row.entrega_bairro].filter(Boolean).join(" — ");
  const cidade = [row.entrega_cidade, row.entrega_uf].filter(Boolean).join("/");
  const etapa = ETAPAS.find((e) => e.key === row.etapa);
  const atrasado = rastreio?.atrasado && !rastreio?.entregue_em;

  return (
    <Dialog open onOpenChange={onClose}>
      {/* Largura amarrada à janela: `max-w` sozinho não impede um filho de
          esticar o contêiner, e foi assim que o diálogo saiu da tela. */}
      <DialogContent className="w-[min(48rem,calc(100vw-2rem))] max-w-none max-h-[88vh] overflow-y-auto overflow-x-hidden p-0">
        {/* Cabeçalho fixo: quem é, em que etapa está e quanto vale. É o que a
            pessoa confere antes de falar com o cliente. */}
        <DialogHeader className="sticky top-0 z-10 border-b bg-background/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{row.cliente ?? "Cliente"}</DialogTitle>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <CarboBadge variant="secondary">{row.canal ?? "—"}</CarboBadge>
                {etapa && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium">
                    <span className="h-2 w-2 rounded-full" style={{ background: etapa.color }} />
                    {etapa.label}
                  </span>
                )}
                {atrasado && (
                  <span className="inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-500">
                    <AlertTriangle className="h-3 w-3" /> atrasado
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums">{brl(row.total)}</div>
              <div className="text-[11px] text-muted-foreground">{dia(row.data_pedido)}</div>
            </div>
          </div>

          {/* Ações no topo: são o motivo de a maioria abrir este detalhe. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="h-8 gap-1.5"
                    onClick={() => copiar(mensagemCliente(row, rastreio), "Mensagem")}>
              <MessageSquare className="h-3.5 w-3.5" /> Copiar mensagem ao cliente
            </Button>
            {rastreio?.url_rastreio && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" asChild>
                <a href={rastreio.url_rastreio} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Rastrear
                </a>
              </Button>
            )}
            {row.nf_pdf && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" asChild>
                <a href={row.nf_pdf} target="_blank" rel="noreferrer">
                  <FileText className="h-3.5 w-3.5" /> DANFE
                </a>
              </Button>
            )}
            {/* O link é montado da barra de endereço, não de uma constante:
                este arquivo é idêntico no admin e no Ops, e o caminho da tela
                difere entre os dois (/ecommerce/esteira × /logistica/esteira).
                Uma constante aqui mandaria metade do time para uma rota que não
                existe no app dela. */}
            <Button size="sm" variant="outline" className="h-8 gap-1.5"
                    onClick={() => copiar(
                      `${window.location.origin}${window.location.pathname}?card=${row.bling_id}`,
                      "Link do pedido",
                    )}>
              <Link2 className="h-3.5 w-3.5" /> Copiar link
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-3 px-5 pb-5">
          {/* Trajeto primeiro: é a pergunta mais frequente. Antes ele ficava
              no fim, depois de seis blocos de cadastro. */}
          {row.rastreio && (
            <Bloco titulo="Trajeto" icon={Truck}>
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini rotulo="Transportadora" valor={row.transportadora ?? "—"} />
                <Mini rotulo="Serviço" valor={row.servico ?? "—"} />
                <Mini
                  rotulo={rastreio?.entregue_em ? "Entregue em" : "Previsão"}
                  valor={diaCurto(rastreio?.entregue_em ?? rastreio?.previsao_entrega ?? null)}
                  destaque={atrasado ? "text-red-500" : rastreio?.entregue_em ? "text-emerald-500" : undefined}
                />
                <Mini rotulo="Volumes / peso"
                      valor={`${row.volumes ?? "—"}${row.peso_kg != null ? ` · ${row.peso_kg} kg` : ""}`} />
              </div>
              <div className="mb-3 flex items-center gap-1.5 text-xs">
                <span className="text-[11px] text-muted-foreground">Código</span>
                <BotaoCopiar texto={row.rastreio} oque="Rastreio" className="font-mono text-carbo-green" />
              </div>
              <Trajeto r={rastreio} etapa={row.etapa} />
            </Bloco>
          )}

          {/* Logo depois do trajeto, e antes dos blocos de cadastro: quem abre
              este diálogo para falar com um cliente precisa saber o que ele já
              recebeu ANTES de escrever a mensagem. */}
          <Bloco titulo="Avisos ao cliente" icon={MessageSquare}>
            <AvisosDoCliente row={row} avisos={avisos} templates={templates} />
          </Bloco>

          {!row.tem_status_da_plataforma && row.etapa !== "cancelado" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-500">
              <AlertTriangle className="h-4 w-4 mt-px shrink-0" />
              <span>
                A plataforma ainda não foi vinculada a este pedido — por isso ele não avança
                sozinho para “em trânsito” e “entregue”. Não é atraso da transportadora.
              </span>
            </div>
          )}

          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Bloco titulo="Pedido" icon={Hash}>
              {/* Primeiro o do CLIENTE: é este que vai na mensagem e é por ele
                  que a pessoa vai perguntar no atendimento. Os outros dois
                  continuam porque a operação fala com o Bling e com a loja por
                  eles — três números para três interlocutores. */}
              {row.pedido_codigo && (
                <Linha label="Nº do cliente"
                       valor={<BotaoCopiar texto={row.pedido_codigo} oque="Nº do cliente"
                                           className="font-mono text-carbo-green" />} />
              )}
              <Linha label="Nº no Bling" valor={row.pedido_numero ?? "—"} />
              <Linha label="Nº na loja" valor={row.pedido_loja ?? "—"} />
              {row.carboze_order_number && (
                <Linha label="No sistema" valor={row.carboze_order_number} />
              )}
            </Bloco>

            <Bloco titulo="Nota fiscal" icon={FileText}>
              <Linha label="Número" valor={row.nf_numero ?? <span className="text-muted-foreground">não emitida</span>} />
              <Linha label="Situação" valor={row.nf_situacao ?? "—"} />
              <Linha label="Emissão" valor={dia(row.nf_data)} />
              {row.nf_chave && (
                <Linha label="Chave" valor={
                  <BotaoCopiar texto={row.nf_chave} oque="Chave" className="font-mono text-[10px]" />
                } />
              )}
            </Bloco>

            <Bloco titulo="Cliente" icon={User}>
              <Linha label="Documento" valor={fmtDoc(row.cliente_doc)} />
              <Linha label="Telefone" valor={row.cliente_fone ? (
                <BotaoCopiar texto={row.cliente_fone} oque="Telefone" />
              ) : <span className="text-muted-foreground">não informado</span>} />
            </Bloco>

            <Bloco titulo="Entrega" icon={MapPin}>
              <Linha label="Endereço" valor={endereco || <span className="text-muted-foreground">não informado</span>} />
              <Linha label="Cidade" valor={cidade || "—"} />
              <Linha label="CEP" valor={row.entrega_cep ?? "—"} />
            </Bloco>
          </div>

          {itens.length > 0 && (
            <Bloco titulo="Itens" icon={Box}>
              {/* Nome do produto em cima, valor embaixo à direita. Em duas
                  colunas, um nome de 80 caracteres não cabe em largura
                  nenhuma — e era ele que estourava o diálogo. */}
              <ul className="space-y-1.5">
                {itens.map((it, i) => (
                  <li key={i} className="min-w-0 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                    <div className="break-words text-xs leading-snug">
                      <span className="text-muted-foreground">
                        {it?.quantidade ?? it?.quantity ?? 1}×
                      </span>{" "}
                      {it?.descricao ?? it?.name ?? "Produto"}
                    </div>
                    <div className="mt-0.5 text-right text-xs font-medium tabular-nums">
                      {brl(Number(it?.valor ?? it?.unit_price ?? 0))}
                    </div>
                  </li>
                ))}
              </ul>
            </Bloco>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Mini({ rotulo, valor, destaque }: {
  rotulo: string; valor: React.ReactNode; destaque?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className={`truncate text-xs font-medium ${destaque ?? ""}`}>{valor}</div>
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────

/**
 * Indicador inline, na barra de filtros.
 *
 * ⚠️ Já foi de dois jeitos errados: quatro cartões (110px de altura para quatro
 * números) e uma faixa de largura total (os quatro itens espalhados por 1850px,
 * cada um colado à esquerda da sua fatia, com um vão enorme no meio — "esticado
 * e pouco natural", e com razão).
 *
 * O certo é não ocupar largura que não precisa: os números entram na linha que
 * já existe, encostados à direita. A linha fica equilibrada (controles à
 * esquerda, leitura à direita), some um bloco inteiro de altura, e o quadro
 * ganha o espaço — que é o conteúdo desta tela.
 */
function Indicador({ icon: Icon, cor, rotulo, valor }: {
  icon: React.ElementType; cor: string; rotulo: string; valor: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" title={rotulo}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${cor}`} />
      <span className="text-sm font-semibold leading-none tabular-nums">{valor}</span>
      <span className="text-[11px] leading-none text-muted-foreground">{rotulo}</span>
    </div>
  );
}

// Card da coluna "Pago" — deliberadamente mais magro que o outro.
//
// Aqui não existe NF, etiqueta, transportadora nem previsão: o pedido acabou de
// ser pago e o Bling ainda não o faturou. Repetir a estrutura do card normal
// com quatro campos vazios daria a impressão de dado faltando, quando é dado
// que ainda não nasceu.
//
// O que importa nesta coluna é uma coisa só: há quanto tempo está parado. Pago
// há 20 minutos é o fluxo normal; pago há 6 horas é alguém para cutucar — e é
// por isso que o tempo é o único elemento com cor.
function CardPago({ row }: { row: AguardandoRow }) {
  const horas = row.minutos_parado / 60;
  const tom = horas >= 6 ? "text-red-500" : horas >= 2 ? "text-amber-500" : "text-muted-foreground";
  const tempo = row.minutos_parado < 60
    ? `${Math.max(1, Math.round(row.minutos_parado))} min`
    : `${Math.floor(horas)}h`;

  return (
    <div className="relative rounded-lg border bg-card px-3 py-2.5 pl-3.5">
      <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#f59e0b]" />

      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight">
          {row.cliente ?? `Pedido ${row.pedido_loja}`}
        </span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums">{brl(row.total)}</span>
      </div>

      <div className="mt-1 flex items-baseline gap-2 text-[11px] leading-4 text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {[row.canal, `#${row.pedido_loja}`].filter(Boolean).join(" · ")}
        </span>
        <span className={`shrink-0 font-medium tabular-nums ${tom}`}>{tempo}</span>
      </div>

      {/* O telefone aparece porque é a diferença entre poder e não poder avisar
          o cliente agora. Na Nuvemshop ele vem; ML e Amazon não expõem — e a
          ausência dita, em vez de omitida, evita a pergunta "cadê?". */}
      <div className="mt-1 flex items-center gap-1 text-[10px] leading-4 text-muted-foreground/70">
        <Phone className="h-3 w-3 shrink-0" />
        <span className="truncate">{row.cliente_fone ?? "sem telefone na plataforma"}</span>
      </div>
    </div>
  );
}

// ── Card da régua de recompra ───────────────────────────────────────────────
//
// Deliberadamente diferente do card de entrega: aqui não há NF, transportadora
// nem previsão — o pedido acabou. O que importa é quem é a pessoa, quanto tempo
// faz que ela recebeu, e se dá para falar com ela.
function CardRecompra({ row, cor }: { row: RecompraRow; cor: string }) {
  const dias = row.dias_desde_entrega;
  return (
    <div className="relative rounded-lg border bg-card px-3 py-2.5 pl-3.5">
      <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: cor }} />

      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight">
          {row.cliente ?? `Pedido ${row.pedido_loja}`}
        </span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums">{brl(row.total)}</span>
      </div>

      <div className="mt-1 flex items-baseline gap-2 text-[11px] leading-4 text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {[row.canal, row.entrega_cidade ? `${row.entrega_cidade}/${row.entrega_uf}` : null]
            .filter(Boolean).join(" · ")}
        </span>
        <span className="shrink-0 tabular-nums">
          {dias === 0 ? "hoje" : `há ${dias}d`}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2 text-[10px] leading-4 text-muted-foreground/70">
        <Phone className="h-3 w-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{row.cliente_fone ?? "sem telefone"}</span>
        {/* ⚠️ A origem da data aparece porque "estimada" e "confirmada" não
            podem ter a mesma cara. Um card cujo relógio é chute não pode
            parecer tão firme quanto um que veio da transportadora. */}
        {row.origem_da_data === "historico" && (
          <span className="shrink-0 text-amber-500">data estimada</span>
        )}
      </div>
    </div>
  );
}

// ── Card da recuperação de carrinho ─────────────────────────────────────────
//
// Diferente dos outros dois de novo, porque aqui não existe pedido: não há NF,
// nem rastreio, nem número que a pessoa reconheça. O que existe é o que ela
// escolheu, quanto tempo faz, e por onde dá para falar com ela.
//
// ⚠️ O produto aparece no card, e não só na mensagem. Sem ele o quadro vira uma
// lista de valores anônimos — e a primeira pergunta de quem olha ("o que essa
// gente estava comprando?") exigiria abrir a loja para responder.
function CardCarrinho({ row, cor }: { row: CarrinhoRow; cor: string }) {
  const min = row.minutos_parado;
  const idade = min < 60 ? `há ${Math.max(1, Math.round(min))} min`
              : min < 60 * 48 ? `há ${Math.floor(min / 60)}h`
              : `há ${Math.floor(min / 1440)}d`;

  // Quanto falta para a próxima mensagem. Negativo = já venceu e está na fila
  // esperando a próxima rodada do envio.
  const faltam = row.proxima_em
    ? Math.round((new Date(row.proxima_em).getTime() - Date.now()) / 60000)
    : null;
  const proxima = faltam === null ? null
    : faltam <= 0 ? "na fila"
    : faltam < 60 ? `em ${faltam} min`
    : `em ${Math.round(faltam / 60)}h`;

  return (
    <div className="relative rounded-lg border bg-card px-3 py-2.5 pl-3.5">
      <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: cor }} />

      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight">
          {row.cliente ?? row.email ?? "sem identificação"}
        </span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums">{brl(row.total)}</span>
      </div>

      {row.produtos && (
        <p className="mt-1 truncate text-[11px] leading-4 text-muted-foreground">{row.produtos}</p>
      )}

      <div className="mt-1 flex items-baseline gap-2 text-[11px] leading-4 text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{idade}</span>
        {proxima && (
          <span className="flex shrink-0 items-center gap-1 tabular-nums">
            <Timer className="h-3 w-3" />{proxima}
          </span>
        )}
      </div>

      {/* ⚠️ Telefone e e-mail juntos, e o telefone SEMPRE primeiro, mesmo
          ausente. É ele que decide se este card é trabalho ou só estatística —
          a pipeline inteira depende de haver um número, e omitir a ausência
          faria a coluna "sem telefone" parecer arbitrária. */}
      <div className="mt-1 flex items-center gap-2 text-[10px] leading-4 text-muted-foreground/70">
        <Phone className="h-3 w-3 shrink-0" />
        <span className="min-w-0 shrink truncate">
          {row.telefone ?? <span className="text-rose-500">sem telefone</span>}
        </span>
        {row.email && (
          <>
            <Mail className="h-3 w-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{row.email}</span>
          </>
        )}
      </div>

      {row.link && (
        <a href={row.link} target="_blank" rel="noreferrer"
           className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-sky-500 hover:underline">
          <ExternalLink className="h-3 w-3" />abrir o carrinho
        </a>
      )}
    </div>
  );
}

export default function EsteiraOnline() {
  /* ── Período: atalho OU intervalo livre ────────────────────────────────
   *
   * Antes eram três opções fixas (7/30/90) para uma pergunta com infinitas
   * respostas. "A primeira semana de julho" não cabia em nenhuma, e quem
   * precisava disso não tinha saída dentro da tela.
   *
   * Os atalhos continuam porque são o uso comum e um clique bate dois campos
   * de data. `periodo = 'custom'` revela as duas datas — que já são a verdade
   * usada na consulta nos dois casos, então não existe "modo" nenhum por baixo:
   * o atalho apenas PREENCHE as datas. Um caminho só, sem estado paralelo para
   * divergir. */
  const hojeISO = new Date().toISOString().slice(0, 10);
  const menosDias = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  /* Três pipelines na mesma tela, e a ordem no seletor é a do tempo do cliente
   * ao contrário — de propósito, porque é a ordem de importância operacional.
   *
   *   entrega    o quadro de sempre: da venda à entrega. Anda em minutos.
   *   recompra   o que vem DEPOIS: recebeu, descansa, é ofertado, volta ou não.
   *              Anda em dias.
   *   carrinho   o que vem ANTES: encheu o carrinho e não terminou. Anda em
   *              horas, e só existe na loja própria — ML e Amazon fazem a
   *              própria recuperação e não entregam o contato de quem abandonou.
   *
   * São quadros de naturezas diferentes e por isso não cabem lado a lado:
   * dividir a largura faria os três ficarem apertados para servir a perguntas
   * que ninguém faz ao mesmo tempo. */
  type Pipeline = "entrega" | "recompra" | "carrinho";
  const [pipeline, setPipeline] = useState<Pipeline>("entrega");
  const [filtroAviso, setFiltroAviso] = useState("all");
  const [periodo, setPeriodo] = useState("30");
  const [de, setDe]   = useState(() => menosDias(30));
  const [ate, setAte] = useState(hojeISO);

  const trocarPeriodo = (v: string) => {
    setPeriodo(v);
    if (v !== "custom") {
      setDe(menosDias(Number(v)));
      setAte(hojeISO);
    }
  };
  const [busca, setBusca] = useState("");
  const [canal, setCanal] = useState("all");
  /* ── O card tem endereço ──────────────────────────────────────────────
   *
   * Antes, o detalhe era estado da memória: quem abria um pedido e queria
   * mostrar para outra pessoa tinha de explicar o caminho ("abre a esteira,
   * filtra por fulano, clica no card"). Não dava para colar num chat.
   *
   * Agora o pedido aberto mora na URL (`?card=<bling_id>`), então a barra de
   * endereço já É o link — e o botão "Copiar link" existe só para poupar o
   * Ctrl+L. Abrir e fechar usam `replace`, senão cada card visitado vira uma
   * parada no botão "voltar" do navegador.
   *
   * ⚠️ O parâmetro é acrescentado ao que já existe, nunca substitui: a tela
   * de mensagens manda `?voltar=` e apagá-lo quebraria a volta.
   */
  const [params, setParams] = useSearchParams();
  const cardParam = params.get("card");
  const [soProblemas, setSoProblemas] = useState(false);
  // ⚠️ O caminho da Esteira difere entre os apps (/ecommerce/esteira no admin,
  // /logistica/esteira no Ops) e este arquivo é byte a byte idêntico nos dois.
  // Mandar o caminho ATUAL na URL faz o botão "voltar" da outra tela acertar
  // sozinho, sem o arquivo precisar saber em qual app está rodando.
  const { pathname } = useLocation();
  const { data, isLoading, error } = useEsteiraOnline(de, ate);
  const { data: aguardando } = useEcommerceAguardando();
  const { data: recompra = [] } = useRecompraPipeline();
  const { data: cfgRecompra } = useRecompraConfig();
  const { data: carrinhos = [] } = useCarrinhoPipeline();
  const { data: cfgCarrinho } = useCarrinhoConfig();
  const { data: fontes } = useFontesSaude();
  const paradas = (fontes ?? []).filter((f) => f.atrasada);

  // Avisos ao cliente. Os ids saem de `data` inteiro, não do filtrado: filtrar
  // por "sem aviso" precisa do estado de TODOS para decidir quem entra.
  const idsPedidos = useMemo(() => (data ?? []).map((r) => r.bling_id), [data]);
  const { data: avisos } = useAvisosDoPedido(idsPedidos);
  const { data: templates } = useTemplatesMsg();

  // Etapa da esteira → etapa da mensagem. São quase o mesmo conjunto, menos
  // `cancelado` (não existe aviso de cancelamento) e `saiu_entrega`, que não é
  // coluna da esteira — ela vem do rastreio.
  const sinalDe = (r: EsteiraRow): Sinal => {
    if (r.etapa === "cancelado") return null;
    const etapa = r.etapa as unknown as EtapaMsg;
    const ativo = (templates ?? []).find((t) => t.etapa === etapa)?.ativo ?? false;
    const temFone = Boolean((r.cliente_fone ?? "").trim());
    return sinalDoAviso(avisos?.get(`${r.bling_id}:${etapa}`), ativo, temFone);
  };

  const abrirCard = (r: EsteiraRow | null) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (r) n.set("card", String(r.bling_id));
      else n.delete("card");
      return n;
    }, { replace: true });
  };

  // O card aberto sai dos dados, não de um estado paralelo — assim o link
  // colado por outra pessoa abre o mesmo card, e o refetch de 2 min não
  // congela uma cópia velha da linha dentro do diálogo.
  const aberto = useMemo(
    () => (data ?? []).find((r) => String(r.bling_id) === cardParam) ?? null,
    [data, cardParam],
  );

  const canais = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.canal).filter(Boolean))) as string[],
    [data],
  );

  const linhas = useMemo(() => {
    let r = data ?? [];
    if (canal !== "all") r = r.filter((x) => x.canal === canal);
    const t = busca.trim().toLowerCase();
    if (t) {
      r = r.filter((x) =>
        (x.cliente ?? "").toLowerCase().includes(t) ||
        (x.rastreio ?? "").toLowerCase().includes(t) ||
        (x.nf_numero ?? "").toLowerCase().includes(t) ||
        (x.pedido_loja ?? "").toLowerCase().includes(t) ||
        (x.entrega_cidade ?? "").toLowerCase().includes(t));
    }
    if (filtroAviso !== "all") {
      r = r.filter((x) => {
        if (x.etapa === "cancelado") return false;
        const e = avisos?.get(`${x.bling_id}:${x.etapa}`);
        if (filtroAviso === "enviado") return e?.status === "enviado";
        if (filtroAviso === "erro")    return e?.status === "erro";
        // "sem aviso" inclui a fila e o telefone inválido — as três formas de
        // o cliente NÃO ter recebido. Marco zero fica de fora: aquilo foi
        // decisão nossa, não falha.
        return !e || e.status === "pendente"
          || (e.status === "ignorado" && (e.motivo ?? "").startsWith("telefone"));
      });
    }
    return r;
  }, [data, canal, busca, filtroAviso, avisos]);

  // Os mesmos filtros da tela valem para a coluna "Pago" — uma busca que
  // esconde o pedido em cinco colunas e o deixa visível na sexta seria só
  // confusão.
  // Quem não tem como ser avisado. Conta sobre o que está VISÍVEL (respeita os
  // filtros) e ignora cancelado, que não recebe aviso de nenhum jeito.
  const semTelefone = useMemo(
    () => linhas.filter((r) => r.etapa !== "cancelado"
                            && !(r.cliente_fone ?? "").trim()).length,
    [linhas],
  );

  // Régua: agrupa por coluna. `historico` fica FORA do quadro — ele não é
  // etapa da régua, é a base que existia antes dela, com data estimada.
  const porColunaRecompra = useMemo(() => {
    const m = new Map<ColunaRecompra, RecompraRow[]>();
    for (const c of COLUNAS_RECOMPRA) m.set(c.key, []);
    for (const r of recompra) {
      if (r.coluna === "historico") continue;
      m.get(r.coluna)?.push(r);
    }
    return m;
  }, [recompra]);

  const historico = useMemo(
    () => recompra.filter((r) => r.coluna === "historico"),
    [recompra],
  );

  // Carrinho: mesma ideia. `historico` (anterior ao marco zero) e `ignorado`
  // (abaixo do valor mínimo) ficam FORA do quadro — nenhum dos dois é etapa, os
  // dois são "nunca vai ser perseguido", e misturá-los com os abertos faria a
  // coluna de trabalho parecer maior do que é.
  const porColunaCarrinho = useMemo(() => {
    const m = new Map<ColunaCarrinho, CarrinhoRow[]>();
    for (const c of COLUNAS_CARRINHO) m.set(c.key, []);
    for (const r of carrinhos) m.get(r.coluna)?.push(r);
    return m;
  }, [carrinhos]);

  const foraDaRegua = useMemo(
    () => carrinhos.filter((r) => r.coluna === "historico" || r.coluna === "ignorado"),
    [carrinhos],
  );

  /* Os números do topo, quando o quadro é o do carrinho.
   *
   * ⚠️ Trocados junto com o quadro, e não deixados como estavam. "247 em
   * andamento · R$ 33.649 em trânsito" sobre uma tela de carrinhos abandonados
   * é a mesma armadilha do dashboard de vendas: o número está certo, é de outra
   * coisa, e quem bate o olho não tem como saber disso.
   *
   * "Em perseguição" é a soma do que ainda pode virar venda (aberto + as três
   * mensagens). Recuperado e perdido ficam fora: um já virou, o outro não vira
   * mais. */
  const carrinhoResumo = useMemo(() => {
    const ativos = carrinhos.filter(
      (r) => r.coluna === "aberto" || r.coluna === "msg1"
          || r.coluna === "msg2"   || r.coluna === "msg3");
    return {
      ativos: ativos.length,
      valor: ativos.reduce((s, r) => s + (r.total || 0), 0),
      recuperados: carrinhos.filter((r) => r.coluna === "recuperado").length,
      semFone: carrinhos.filter((r) => r.coluna === "sem_telefone").length,
    };
  }, [carrinhos]);

  const pagos = useMemo(() => {
    let r = aguardando ?? [];
    if (canal !== "all") r = r.filter((x) => x.canal === canal);
    const t = busca.trim().toLowerCase();
    if (t) {
      r = r.filter((x) =>
        (x.cliente ?? "").toLowerCase().includes(t) ||
        (x.pedido_loja ?? "").toLowerCase().includes(t));
    }
    return r;
  }, [aguardando, canal, busca]);

  // Os códigos visíveis, e só eles: quem some no filtro não precisa de trajeto.
  const codigos = useMemo(
    () => linhas.map((x) => x.rastreio).filter(Boolean) as string[],
    [linhas],
  );
  const { data: mapaRastreio } = useRastreios(codigos);
  const rastreioDe = (c: string | null) => (c ? mapaRastreio?.get(c) : undefined);

  /** Problema = atrasado ou parado por falta de vínculo. É a fila que precisa
   *  de gente, não de paciência — por isso ganha um filtro próprio. */
  const ehProblema = (r: EsteiraRow) => {
    if (r.etapa === "cancelado" || r.etapa === "entregue") return false;
    const t = rastreioDe(r.rastreio);
    return Boolean(t?.atrasado && !t?.entregue_em) || !r.tem_status_da_plataforma;
  };

  const visiveis = useMemo(
    () => (soProblemas ? linhas.filter(ehProblema) : linhas),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linhas, soProblemas, mapaRastreio],
  );

  /**
   * Ordem dentro da coluna: URGÊNCIA primeiro, data como desempate — e o mais
   * ANTIGO no topo.
   *
   * ⚠️ Era o inverso: data do pedido decrescente, o mais novo em cima. Numa
   * coluna com 48 cards isso empurra o pedido mais velho — justamente o
   * problemático — para a posição 48, alcançável só com rolagem. Numa esteira,
   * o topo tem que ser o que está parado há mais tempo.
   */
  const urgencia = (r: EsteiraRow) => {
    const t = rastreioDe(r.rastreio);
    if (t?.atrasado && !t?.entregue_em) return 0;   // atrasado
    if (!r.tem_status_da_plataforma) return 1;      // não anda sozinho
    return 2;
  };

  const porEtapa = useMemo(() => {
    const m = new Map<EtapaEsteira, EsteiraRow[]>();
    for (const e of ETAPAS) m.set(e.key, []);
    for (const r of visiveis) {
      if (r.etapa === "cancelado") continue;
      m.get(r.etapa)?.push(r);
    }
    for (const [etapa, lista] of m.entries()) {
      // "Entregue" é registro, não fila: a entrega mais recente no topo.
      // Nas filas ativas, o topo é quem está parado há mais tempo.
      if (etapa === "entregue") {
        lista.sort((a, b) => (b.data_pedido ?? "").localeCompare(a.data_pedido ?? ""));
        continue;
      }
      lista.sort((a, b) => {
        const u = urgencia(a) - urgencia(b);
        if (u !== 0) return u;
        return (a.data_pedido ?? "").localeCompare(b.data_pedido ?? "");
      });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, mapaRastreio]);

  const cancelados = visiveis.filter((r) => r.etapa === "cancelado");
  const emAndamento = visiveis.filter((r) => r.etapa !== "cancelado");
  const problemas = linhas.filter(ehProblema).length;

  return (
    /* `h-full min-h-0 flex-col`: a altura vem do <main>, que já é
       `flex-1 overflow-y-auto` dentro de um `h-screen overflow-hidden`.
       O `calc(100vh - 19rem)` anterior presumia a altura exata do cabeçalho,
       dos indicadores e dos filtros — e quebrava assim que os filtros
       passavam para duas linhas. ⚠️ TODO ancestral do scroller precisa de
       `min-h-0`, senão o `flex-1` para de encolher e o quadro estoura. */
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      {/* Os números vão no slot `actions` do cabeçalho: aquela faixa à direita
          do título já existia e estava vazia. Ficavam antes na linha dos
          filtros, que já tinha quatro controles — e o último item saía cortado
          na borda, porque a página também não tinha margem lateral. */}
      <CarboPageHeader
        icon={Truck}
        title="Esteira do On-line"
        description="Da venda à entrega, direto do Bling e das plataformas. Espelho: nada aqui se arrasta."
        actions={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {/* A configuração das mensagens automáticas mora aqui dentro, não
                num item de menu próprio: quem cuida da esteira é quem escreve
                o que o cliente lê a cada etapa dela. A rota continua valendo
                para quem tiver o link. */}
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
              <Link to={`/ecommerce/mensagens?voltar=${encodeURIComponent(pathname)}`}>
                <Settings2 className="h-3.5 w-3.5" /> Mensagens ao cliente
              </Link>
            </Button>
            {pipeline === "carrinho" ? (
              <>
                <Indicador icon={ShoppingBag} cor="text-amber-500"
                           rotulo="em perseguição" valor={String(carrinhoResumo.ativos)} />
                <Indicador icon={Package} cor="text-carbo-green"
                           rotulo="parados no carrinho" valor={brl(carrinhoResumo.valor)} />
                <Indicador icon={CheckCircle2} cor="text-emerald-500"
                           rotulo="recuperados" valor={String(carrinhoResumo.recuperados)} />
                {/* Aqui a ausência de telefone não é detalhe: é a taxa de perda
                    da pipeline inteira. Cada um destes é um carrinho que nunca
                    vai avançar, e o número mede o custo de a loja não pedir o
                    telefone antes do fim do checkout. */}
                <Indicador icon={Phone} cor="text-rose-500"
                           rotulo="sem telefone" valor={String(carrinhoResumo.semFone)} />
              </>
            ) : (
              <>
                <Indicador icon={ShoppingCart} cor="text-blue-500"
                           rotulo="em andamento" valor={String(emAndamento.length)} />
                <Indicador icon={Package} cor="text-carbo-green"
                           rotulo="em trânsito"
                           valor={brl(emAndamento.reduce((s, r) => s + (r.total || 0), 0))} />
                <Indicador icon={CheckCircle2} cor="text-emerald-500"
                           rotulo="entregues" valor={String(porEtapa.get("entregue")?.length ?? 0)} />
                <Indicador icon={AlertTriangle} cor="text-amber-500"
                           rotulo="precisam de atenção" valor={String(problemas)} />
                {/* ⚠️ Contador informativo, não alarme — por isso fica em cinza.
                    Pedido sem telefone não entra na fila de avisos e não deixa
                    registro: some, em vez de falhar. No Mercado Livre a ausência é
                    permanente (a plataforma não expõe o número do comprador), então
                    este número nunca vai a zero — e é justamente por isso que ele
                    precisa estar escrito em algum lugar. Sem ele, "o cliente do ML
                    nunca recebe mensagem" é uma pergunta sem resposta. */}
                <Indicador icon={Phone} cor="text-muted-foreground"
                           rotulo="sem telefone" valor={String(semTelefone)} />
              </>
            )}
          </div>
        }
      />

      {/* O seletor de pipeline vem ANTES da busca e fica sozinho na sua linha:
          ele troca o quadro inteiro, e um controle desse peso misturado aos
          filtros pareceria mais um filtro. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Select value={pipeline} onValueChange={(v) => setPipeline(v as Pipeline)}>
          <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="entrega">Da venda à entrega</SelectItem>
            <SelectItem value="recompra">Régua de recompra</SelectItem>
            <SelectItem value="carrinho">Recuperação de carrinho</SelectItem>
          </SelectContent>
        </Select>
        {pipeline === "recompra" && cfgRecompra && (
          <span className="text-[11px] text-muted-foreground">
            oferta {cfgRecompra.dias_para_ofertar} dias após a entrega ·
            {" "}desiste {cfgRecompra.dias_para_desistir} dias após a oferta
          </span>
        )}
        {/* ⚠️ As três janelas escritas na tela, com o "após" de cada uma. O
            encadeamento (a 2ª conta da 1ª, não do abandono) é justamente o que
            impede um carrinho velho de receber três mensagens seguidas — e é
            invisível se a régua não estiver dita em algum lugar. */}
        {pipeline === "carrinho" && cfgCarrinho && (
          <span className="text-[11px] text-muted-foreground">
            1ª {cfgCarrinho.minutos_1} min após o abandono ·
            {" "}2ª {cfgCarrinho.horas_2}h após a 1ª ·
            {" "}3ª {cfgCarrinho.horas_3}h após a 2ª
            {cfgCarrinho.valor_minimo > 0 && ` · mínimo ${brl(cfgCarrinho.valor_minimo)}`}
          </span>
        )}
      </div>

      <div className={`flex flex-wrap items-center gap-2 ${pipeline !== "entrega" ? "hidden" : ""}`}>
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                 placeholder="Cliente, rastreio, NF, cidade…" className="h-9 pl-8" />
        </div>
        <Select value={canal} onValueChange={setCanal}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            {canais.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodo} onValueChange={trocarPeriodo}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
            <SelectItem value="180">6 meses</SelectItem>
            <SelectItem value="365">12 meses</SelectItem>
            <SelectItem value="custom">Escolher datas…</SelectItem>
          </SelectContent>
        </Select>
        {periodo === "custom" && (
          <div className="flex items-center gap-1.5">
            <DatePickerInput value={de} onChange={setDe} clearable={false}
                             disableFuture className="h-9 w-36" />
            <span className="text-xs text-muted-foreground">até</span>
            <DatePickerInput value={ate} onChange={setAte} clearable={false}
                             disableFuture className="h-9 w-36" />
          </div>
        )}
        {/* Filtro de aviso. Fica ao lado do de atraso porque responde a mesma
            pergunta — "o que está fora do trilho?" — só que do lado do cliente
            em vez do lado da entrega. */}
        <Select value={filtroAviso} onValueChange={setFiltroAviso}>
          <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Aviso: todos</SelectItem>
            <SelectItem value="sem">Sem aviso enviado</SelectItem>
            <SelectItem value="erro">Aviso com erro</SelectItem>
            <SelectItem value="enviado">Aviso enviado</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant={soProblemas ? "default" : "outline"}
                className="h-9 gap-1.5" onClick={() => setSoProblemas((v) => !v)}>
          <AlertTriangle className="h-3.5 w-3.5" />
          Só os que precisam de atenção
          {problemas > 0 && (
            <span className="ml-0.5 rounded bg-background/20 px-1 tabular-nums">{problemas}</span>
          )}
        </Button>
      </div>

      {/* ⚠️ Fonte parada vem ANTES de tudo, inclusive do quadro.
          A esteira continua desenhando cards com o que tem em mãos — e foi
          justamente isso que escondeu 25 horas de silêncio: a tela parecia
          perfeita, só estava contando uma história velha. Um quadro que não
          avisa que os dados pararam é pior que um quadro em branco, porque
          o segundo pelo menos levanta a dúvida. */}
      {paradas.length > 0 && (
        <div className="shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">
          <div className="flex items-start gap-1.5 text-xs font-semibold text-red-500">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <span>
              {paradas.length === 1 ? "Uma fonte parou de atualizar" : `${paradas.length} fontes pararam de atualizar`}
              {" "}— o que está no quadro pode estar velho, e as mensagens ao cliente não estão saindo.
            </span>
          </div>
          <ul className="mt-1.5 space-y-0.5 pl-5">
            {paradas.map((f) => (
              <li key={f.fonte} className="text-[11px] leading-tight text-red-500/90">
                <strong>{f.fonte}</strong>
                {" — "}
                {f.minutos == null
                  ? "nunca rodou"
                  : f.minutos >= 120
                    ? `parada há ${Math.floor(f.minutos / 60)}h`
                    : `parada há ${f.minutos} min`}
                {" "}(limite: {f.limite_min >= 120 ? `${Math.floor(f.limite_min / 60)}h` : `${f.limite_min} min`})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Link recebido apontando para fora da janela de tempo. Sem este aviso o
          link "não faz nada" — o pior resultado possível para quem colou um
          endereço que outra pessoa mandou. */}
      {cardParam && !isLoading && !aberto && (
        <div className="flex shrink-0 items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            O pedido deste link não está no período selecionado. Amplie as datas no
            filtro acima para encontrá-lo.
          </span>
        </div>
      )}

      {/* ── Quadro da régua de recompra ─────────────────────────────────── */}
      {/* ── Quadro da recuperação de carrinho ───────────────────────────── */}
      {pipeline === "carrinho" ? (
        <>
          <div className="flex min-h-0 flex-1 items-start justify-center gap-3 overflow-x-auto overscroll-x-contain pb-2">
            {COLUNAS_CARRINHO.map((col) => {
              const cards = porColunaCarrinho.get(col.key) ?? [];
              const valor = cards.reduce((s, r) => s + (r.total || 0), 0);
              return (
                <div key={col.key}
                     className="flex max-h-full min-w-[240px] max-w-[400px] shrink-0 grow basis-0 flex-col overflow-hidden rounded-xl border bg-muted/20">
                  <div className="shrink-0 border-b bg-muted/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.color }} />
                        <span className="truncate text-xs font-semibold">{col.label}</span>
                      </span>
                      <span className="shrink-0 rounded bg-background px-1.5 text-[11px] font-medium tabular-nums">
                        {cards.length}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] leading-tight text-muted-foreground">{col.descricao}</span>
                      {cards.length > 0 && (
                        <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
                          {brl(valor)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2">
                    {cards.map((r) => (
                      <CardCarrinho key={r.checkout_id} row={r} cor={col.color} />
                    ))}
                    {cards.length === 0 && (
                      <p className="px-2 py-4 text-center text-[11px] text-muted-foreground/60">ninguém aqui</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ⚠️ Fora da régua: anteriores ao marco zero e abaixo do valor
              mínimo. Fechado e fora do quadro pelo mesmo motivo do histórico da
              recompra — nenhum deles vai receber mensagem, e deixá-los entre os
              abertos faria a coluna de trabalho parecer maior do que é. */}
          {foraDaRegua.length > 0 && (
            <details className="shrink-0 rounded-xl border p-3">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {foraDaRegua.length} fora da régua —{" "}
                {brl(foraDaRegua.reduce((s, r) => s + (r.total || 0), 0))}
              </summary>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Carrinhos abandonados <strong>antes</strong> desta pipeline existir
                {cfgCarrinho && ` (marco zero: ${new Date(cfgCarrinho.inicio_em).toLocaleDateString("pt-BR")})`}
                {" "}ou abaixo do valor mínimo. Não recebem mensagem automática — perseguir
                esta base é uma campanha à parte.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
                {foraDaRegua.slice(0, 30).map((r) => (
                  <CardCarrinho key={r.checkout_id} row={r} cor="#64748b" />
                ))}
              </div>
              {foraDaRegua.length > 30 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  mostrando 30 de {foraDaRegua.length}
                </p>
              )}
            </details>
          )}

          <p className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShoppingBag className="h-3 w-3 shrink-0" />
            Só a loja própria: Mercado Livre e Amazon fazem a própria recuperação e não
            entregam o contato de quem abandonou. As janelas são <strong>encadeadas</strong> —
            a 2ª conta a partir da 1ª, não do abandono —, e{" "}
            <strong>Recuperado</strong> é observação: o sistema vê que houve pedido do mesmo
            e-mail depois do abandono, não que ele veio da mensagem.
          </p>
        </>
      ) : pipeline === "recompra" ? (
        <>
          <div className="flex min-h-0 flex-1 items-start justify-center gap-3 overflow-x-auto overscroll-x-contain pb-2">
            {COLUNAS_RECOMPRA.map((col) => {
              const cards = porColunaRecompra.get(col.key) ?? [];
              const valor = cards.reduce((s, r) => s + (r.total || 0), 0);
              return (
                <div key={col.key}
                     className="flex max-h-full min-w-[240px] max-w-[400px] shrink-0 grow basis-0 flex-col overflow-hidden rounded-xl border bg-muted/20">
                  <div className="shrink-0 border-b bg-muted/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.color }} />
                        <span className="truncate text-xs font-semibold">{col.label}</span>
                      </span>
                      <span className="shrink-0 rounded bg-background px-1.5 text-[11px] font-medium tabular-nums">
                        {cards.length}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] leading-tight text-muted-foreground">{col.descricao}</span>
                      {cards.length > 0 && (
                        <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
                          {brl(valor)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2">
                    {cards.map((r) => (
                      <CardRecompra key={r.bling_id} row={r} cor={col.color} />
                    ))}
                    {cards.length === 0 && (
                      <p className="px-2 py-4 text-center text-[11px] text-muted-foreground/60">ninguém aqui</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ⚠️ O histórico fica fechado e fora do quadro de propósito. São
              pedidos entregues ANTES da régua existir, com data ESTIMADA — e
              eram todos eles que receberiam a oferta no mesmo segundo se
              entrassem no fluxo automático. Ofertar a essa base tem de ser uma
              decisão, não um efeito colateral de ligar uma função. */}
          {historico.length > 0 && (
            <details className="shrink-0 rounded-xl border p-3">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {historico.length} entregues antes da régua —{" "}
                {brl(historico.reduce((s, r) => s + (r.total || 0), 0))}
              </summary>
              <p className="mt-2 text-[11px] text-muted-foreground">
                A data de entrega destes é <strong>estimada</strong> (a régua nasceu depois deles),
                por isso ficam fora do disparo automático. Ofertar a esta base é uma campanha à parte.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
                {historico.slice(0, 30).map((r) => (
                  <CardRecompra key={r.bling_id} row={r} cor="#64748b" />
                ))}
              </div>
              {historico.length > 30 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  mostrando 30 de {historico.length}
                </p>
              )}
            </details>
          )}

          <p className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <Repeat2 className="h-3 w-3" />
            A coluna é calculada: dias desde a entrega e existência de venda nova do mesmo CPF.
            {" "}<strong>Recomprou</strong> é observação, não atribuição — o sistema vê que o cliente
            voltou, não que voltou por causa da oferta.
          </p>
        </>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando a esteira…
        </div>
      ) : error ? (
        <p className="text-sm text-red-500">Não consegui carregar: {(error as Error).message}</p>
      ) : (
        /* PISO + TETO, não uma regra só.

           "Esticado" e "sobra à direita" eram o mesmo defeito: largura fixa
           deixava vazio em tela larga, `flex-1` puro esticava a coluna até o
           card ficar oco no meio. Com `basis-0 grow` entre 264 e 360px, a soma
           dos tetos (4 × 360 + gaps) passa da largura da tela — então nada
           estica —, e o `grow` divide o que existe — então nada sobra.

           Limites MEDIDOS, não chutados (harness com o CSS compilado, de 1280
           a 2560):

             1366 → 243px   1440 → 258px   1920 → 354px   ← preenche exato
             2560 → 400px (teto) e o quadro centraliza
             1280 → 226px seria estreito demais, então o piso força rolagem

           O teto de 400 existe só para o ultrawide: sem ele a coluna iria a
           481px em 2560 e o card ficaria oco. O piso de 240 é o limite em que
           o nome do cliente ainda cabe. `justify-center` só age quando o teto
           morde — folga simétrica lê como intenção, buraco de um lado só não.

           `items-start` + `max-h-full` na coluna: ela ABRAÇA o conteúdo e só
           cresce até o limite da tela. Com altura fixa, "Confirmado" com um
           card virava uma caixa de 700px quase toda vazia — e era isso que
           continuava parecendo esticado depois de a largura já estar certa. */
        <div className="flex min-h-0 flex-1 items-start justify-center gap-3 overflow-x-auto overscroll-x-contain pb-2">
          {/* "Pago" só existe quando tem alguém dentro.
              As cinco colunas seguintes têm largura MEDIDA (240–400px) para
              caber sem rolagem de 1366 a 2560. Uma sexta fixa quebraria essa
              conta em telas de 1366/1440 — e a regra aqui é servir todos os
              monitores, não o maior. Como a fila normal é curta (o pedido fica
              aqui minutos, não dias), na maior parte do tempo o quadro volta
              exatamente ao que já estava medido; quando uma venda cai, a coluna
              aparece e ela é justamente a novidade que se quer ver. */}
          {pagos.length > 0 && (
            <div className="flex max-h-full min-w-[240px] max-w-[400px] shrink-0 grow basis-0 flex-col overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/[0.04]">
              <div className="shrink-0 border-b bg-muted/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#f59e0b]" />
                    <span className="truncate text-xs font-semibold">Pago</span>
                  </span>
                  <span className="shrink-0 rounded bg-background px-1.5 text-[11px] font-medium tabular-nums">
                    {pagos.length}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] leading-tight text-muted-foreground">
                    na loja, aguardando faturamento
                  </span>
                  <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {brl(pagos.reduce((s, r) => s + (r.total || 0), 0))}
                  </span>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2">
                {pagos.map((r) => (
                  <CardPago key={`${r.platform}-${r.pedido_loja}`} row={r} />
                ))}
              </div>
            </div>
          )}

          {ETAPAS.map((etapa) => {
            const cards = porEtapa.get(etapa.key) ?? [];
            const valor = cards.reduce((s, r) => s + (r.total || 0), 0);
            return (
              <div key={etapa.key}
                   className="flex max-h-full min-w-[240px] max-w-[400px] shrink-0 grow basis-0 flex-col overflow-hidden rounded-xl border bg-muted/20">
                <div className="shrink-0 border-b bg-muted/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: etapa.color }} />
                      <span className="truncate text-xs font-semibold">{etapa.label}</span>
                    </span>
                    <span className="shrink-0 rounded bg-background px-1.5 text-[11px] font-medium tabular-nums">
                      {cards.length}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] leading-tight text-muted-foreground">
                      {etapa.descricao}
                    </span>
                    {cards.length > 0 && (
                      <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
                        {brl(valor)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2">
                  {cards.map((r) => (
                    <Card key={r.bling_id} row={r} rastreio={rastreioDe(r.rastreio)}
                          cor={etapa.color} sinal={sinalDe(r)} onClick={() => abrirCard(r)} />
                  ))}
                  {cards.length === 0 && (
                    <p className="px-2 py-4 text-center text-[11px] text-muted-foreground/60">sem pedidos</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ⚠️ Estes dois blocos são da esteira de ENTREGA. Ficavam fora do
          ternário e vazavam para a régua de recompra — um bloco de cancelados
          e um rodapé sobre a coluna "Pago" numa tela que não tem nem uma coisa
          nem outra. */}
      {pipeline === "entrega" && cancelados.length > 0 && (
        <details className="shrink-0 rounded-xl border p-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
            <XCircle className="h-3.5 w-3.5 text-red-500" />
            {cancelados.length} cancelados — {brl(cancelados.reduce((s, r) => s + (r.total || 0), 0))}
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
            {cancelados.map((r) => (
              <Card key={r.bling_id} row={r} rastreio={rastreioDe(r.rastreio)}
                    cor="#ef4444" sinal={null} onClick={() => abrirCard(r)} />
            ))}
          </div>
        </details>
      )}

      {pipeline === "entrega" && (
      <p className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        "Pago" vem direto da loja e aparece segundos depois da compra; as etapas seguintes
        vêm do Bling (pedido, nota, etiqueta) e das plataformas (envio, entrega).
        A tela atualiza sozinha; nenhum card é arrastável de propósito.
      </p>
      )}

      {aberto && (
        <Detalhe row={aberto} rastreio={rastreioDe(aberto.rastreio)}
                 avisos={avisos} templates={templates}
                 onClose={() => abrirCard(null)} />
      )}
    </div>
  );
}
