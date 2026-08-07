import { useMemo, useState } from "react";
import {
  Truck, Package, FileText, CheckCircle2, ShoppingCart, Copy, XCircle, Loader2, MapPin, Phone,
  CalendarClock, ExternalLink, MessageSquare, AlertTriangle, Clock, Box, User, Hash, Search,
} from "lucide-react";
import { toast } from "sonner";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useEsteiraOnline, useRastreios, ETAPAS,
  type EsteiraRow, type EtapaEsteira, type RastreioCard,
} from "@/hooks/useEsteiraOnline";

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
function BotaoCopiar({ texto, oque, className = "" }: {
  texto: string; oque: string; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); copiar(texto, oque); }}
      title={`Copiar ${oque.toLowerCase()}`}
      className={`inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted hover:text-foreground ${className}`}
    >
      {/* `break-all`: a chave da NF tem 44 caracteres sem um espaço. Sem isto
          ela vira uma palavra indivisível que estica o diálogo inteiro. */}
      <span className="min-w-0 break-all">{texto}</span>
      <Copy className="h-3 w-3 shrink-0 opacity-60" />
    </button>
  );
}

/** Chip da previsão. Vermelho só quando atrasado — cor reservada ao problema. */
function ChipPrevisao({ r }: { r?: RastreioCard }) {
  if (!r) return null;
  if (r.entregue_em) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500">
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        entregue {diaCurto(r.entregue_em)}
      </span>
    );
  }
  if (!r.previsao_entrega) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${
      r.atrasado ? "font-medium text-red-500" : "text-muted-foreground"
    }`}>
      <CalendarClock className="h-3 w-3 shrink-0" />
      {r.atrasado ? "previa " : "chega "}{diaCurto(r.previsao_entrega)}
      {r.atrasado && " · atrasado"}
    </span>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
function Card({ row, rastreio, cor, onClick }: {
  row: EsteiraRow; rastreio?: RastreioCard; cor: string; onClick: () => void;
}) {
  const atrasado = rastreio?.atrasado && !rastreio?.entregue_em;
  const travado = !row.tem_status_da_plataforma && row.etapa !== "entregue" && row.etapa !== "cancelado";
  const quando = idade(row.data_pedido);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={`group relative cursor-pointer rounded-lg border bg-card p-3 pl-3.5 transition-all
        hover:border-carbo-green/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-carbo-green/40
        ${atrasado ? "border-red-500/40" : ""}`}
    >
      {/* Faixa da etapa. Vira vermelha no atraso: é o único caso em que a cor
          da coluna perde para o estado do pedido. */}
      <span
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
        style={{ background: atrasado ? "#ef4444" : cor }}
      />

      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold leading-tight truncate">
          {row.cliente ?? "—"}
        </span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums">
          {brl(row.total)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <CarboBadge variant="secondary" className="shrink-0">{row.canal ?? "—"}</CarboBadge>
          {row.entrega_cidade && (
            <span className="truncate">{row.entrega_cidade}/{row.entrega_uf}</span>
          )}
        </span>
        {quando && <span className="shrink-0 tabular-nums">{quando}</span>}
      </div>

      {/* Bloco do envio: onde está e quando chega — a pergunta que traz alguém
          a esta tela. Fica junto e separado do resto por uma linha. */}
      {(row.transportadora || rastreio) && (
        <div className="mt-2 space-y-1 border-t pt-2">
          {row.transportadora && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Truck className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {row.transportadora}{row.servico ? ` · ${row.servico}` : ""}
              </span>
            </div>
          )}
          <ChipPrevisao r={rastreio} />
          {rastreio?.eventos?.[0] && (
            <div className="flex items-start gap-1.5 text-[11px]">
              <MapPin className="h-3 w-3 mt-px shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{rastreio.eventos[0].descricao}</span>
            </div>
          )}
        </div>
      )}

      {travado && (
        <div className="mt-2 flex items-start gap-1.5 rounded bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="h-3 w-3 mt-px shrink-0" />
          <span>não avança sozinho — plataforma não vinculada</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-[10px] text-muted-foreground">
        <span className="shrink-0">{row.nf_numero ? `NF ${row.nf_numero}` : "sem NF"}</span>
        {row.rastreio ? (
          <BotaoCopiar texto={row.rastreio} oque="Rastreio" className="font-mono truncate" />
        ) : (
          <span className="tabular-nums">{dia(row.data_pedido)}</span>
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
function Trajeto({ r }: { r?: RastreioCard }) {
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
            const atual = i === 0;
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

function Detalhe({ row, rastreio, onClose }: {
  row: EsteiraRow; rastreio?: RastreioCard; onClose: () => void;
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
              <Trajeto r={rastreio} />
            </Bloco>
          )}

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

function Indicador({ icon: Icon, cor, rotulo, valor }: {
  icon: React.ElementType; cor: string; rotulo: string; valor: string;
}) {
  return (
    <CarboCard>
      <CarboCardContent className="flex items-center gap-2.5 p-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cor}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] leading-none text-muted-foreground">{rotulo}</div>
          <div className="mt-1 truncate text-base font-bold leading-none tabular-nums">{valor}</div>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

export default function EsteiraOnline() {
  const [dias, setDias] = useState("30");
  const [busca, setBusca] = useState("");
  const [canal, setCanal] = useState("all");
  const [aberto, setAberto] = useState<EsteiraRow | null>(null);
  const [soProblemas, setSoProblemas] = useState(false);
  const { data, isLoading, error } = useEsteiraOnline(Number(dias));

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
    return r;
  }, [data, canal, busca]);

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

  const porEtapa = useMemo(() => {
    const m = new Map<EtapaEsteira, EsteiraRow[]>();
    for (const e of ETAPAS) m.set(e.key, []);
    for (const r of visiveis) {
      if (r.etapa === "cancelado") continue;
      m.get(r.etapa)?.push(r);
    }
    return m;
  }, [visiveis]);

  const cancelados = visiveis.filter((r) => r.etapa === "cancelado");
  const emAndamento = visiveis.filter((r) => r.etapa !== "cancelado");
  const problemas = linhas.filter(ehProblema).length;

  return (
    <div className="space-y-4">
      <CarboPageHeader
        icon={Truck}
        title="Esteira do On-line"
        description="Da venda à entrega, direto do Bling e das plataformas. Espelho: nada aqui se arrasta."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador icon={ShoppingCart} cor="bg-blue-500/10 text-blue-500"
                   rotulo="Em andamento" valor={String(emAndamento.length)} />
        <Indicador icon={Package} cor="bg-carbo-green/10 text-carbo-green"
                   rotulo="Valor em trânsito"
                   valor={brl(emAndamento.reduce((s, r) => s + (r.total || 0), 0))} />
        <Indicador icon={CheckCircle2} cor="bg-emerald-500/10 text-emerald-500"
                   rotulo="Entregues" valor={String(porEtapa.get("entregue")?.length ?? 0)} />
        <Indicador icon={AlertTriangle} cor="bg-amber-500/10 text-amber-500"
                   rotulo="Precisam de atenção" valor={String(problemas)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        <Select value={dias} onValueChange={setDias}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
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

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando a esteira…
        </div>
      ) : error ? (
        <p className="text-sm text-red-500">Não consegui carregar: {(error as Error).message}</p>
      ) : (
        /* Quadro com rolagem horizontal e coluna de largura fixa: é o formato
           que as pessoas já conhecem de quadro kanban, e evita a coluna
           espremida em que o texto quebra em cinco linhas. */
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ETAPAS.map((etapa) => {
            const cards = porEtapa.get(etapa.key) ?? [];
            const valor = cards.reduce((s, r) => s + (r.total || 0), 0);
            return (
              <div key={etapa.key} className="flex w-[280px] shrink-0 flex-col rounded-xl border bg-muted/20">
                <div className="sticky top-0 z-10 rounded-t-xl border-b bg-muted/40 px-3 py-2 backdrop-blur">
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

                <div className="max-h-[62vh] space-y-2 overflow-y-auto p-2">
                  {cards.map((r) => (
                    <Card key={r.bling_id} row={r} rastreio={rastreioDe(r.rastreio)}
                          cor={etapa.color} onClick={() => setAberto(r)} />
                  ))}
                  {cards.length === 0 && (
                    <p className="py-8 text-center text-[11px] text-muted-foreground">vazio</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cancelados.length > 0 && (
        <details className="rounded-xl border p-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
            <XCircle className="h-3.5 w-3.5 text-red-500" />
            {cancelados.length} cancelados — {brl(cancelados.reduce((s, r) => s + (r.total || 0), 0))}
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
            {cancelados.map((r) => (
              <Card key={r.bling_id} row={r} rastreio={rastreioDe(r.rastreio)}
                    cor="#ef4444" onClick={() => setAberto(r)} />
            ))}
          </div>
        </details>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        As etapas vêm do Bling (pedido, nota, etiqueta) e das plataformas (envio, entrega).
        A tela atualiza sozinha a cada 2 minutos; nenhum card é arrastável de propósito.
      </p>

      {aberto && (
        <Detalhe row={aberto} rastreio={rastreioDe(aberto.rastreio)}
                 onClose={() => setAberto(null)} />
      )}
    </div>
  );
}
