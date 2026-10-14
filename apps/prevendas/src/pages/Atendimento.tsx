import { useState } from "react";
import { Link } from "react-router-dom";
import {
  MessagesSquare, AlertTriangle, Search, MessageCircle, BellOff, ArrowLeft,
  SlidersHorizontal, ChevronDown, SearchX, Clock, CheckCheck, UserCheck,
  Tag as TagIcon, EyeOff, Send, User,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Atendimento do Pré-Vendas — a CASCA da tela de Conversas do Carbo
 * Atendimento, sempre vazia (pedido do dono do processo, 14/10/2026).
 *
 * O time de pré-venda atende hoje pelo WhatsApp Web, sem número da Cloud API.
 * A tela existe para eles verem onde o atendimento vai morar; quando houver um
 * número para o Pré-Vendas, ela passa a ler como a do Atendimento.
 *
 * O desenho é o MESMO da `Conversas.tsx` do `apps/atendimento` (cabeçalho,
 * abas, filtros, lista · conversa · painel do contato), copiado à mão: lá cada
 * pedaço depende de hooks de banco, aqui nada depende.
 *
 * ⚠️ NÃO lê banco nenhum, e isso é a regra, não preguiça: `carbo_wa_numeros`
 * e `carbo_wa_conversas` são as caixas da EMPRESA (serviço, Clube, loja). Ligar
 * esta tela a elas mostraria ao SDR as conversas dos clientes do e-commerce.
 * Número próprio do Pré-Vendas entra no cadastro com `funcao` própria, e a
 * leitura filtra por ele — nunca "todos os números".
 */
const ABAS = [
  { id: "pendentes", rotulo: "Não respondidas" },
  { id: "minhas", rotulo: "Minhas" },
  { id: "sem_dono", rotulo: "Sem responsável" },
  { id: "janela", rotulo: "Janela aberta" },
  { id: "todas", rotulo: "Todas" },
] as const;

const SELETORES = ["Responsável", "Etiqueta", "Etapa do aviso", "Status"];

export default function Atendimento() {
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("todas");
  const [painelFiltros, setPainelFiltros] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4 md:p-6">
      <CarboPageHeader
        icon={MessagesSquare}
        title="Atendimento"
        description="As conversas com os postos no WhatsApp oficial, num lugar só."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" disabled
                    className="h-8 gap-1.5 text-amber-500 disabled:opacity-100">
              <BellOff className="h-3.5 w-3.5" /> Ninguém recebe aviso
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
              <Link to="/"><ArrowLeft className="h-3.5 w-3.5" /> Voltar</Link>
            </Button>
          </div>
        }
      />

      <CarboCard>
        <CarboCardContent className="p-4">
          <p className="flex items-start gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            Nenhum número de WhatsApp ativo para o Pré-Vendas.
          </p>
        </CarboCardContent>
      </CarboCard>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[20rem_1fr] xl:grid-cols-[20rem_1fr_19rem]">
        {/* ── Lista ─────────────────────────────────────────────────────── */}
        <CarboCard className="min-h-0 min-w-0 overflow-hidden p-0">
          <CarboCardContent className="flex h-full min-h-0 flex-col gap-0 p-0">
            <div className="shrink-0 space-y-2 border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5
                                   -translate-y-1/2 text-muted-foreground" />
                <Input disabled placeholder="Buscar por nome ou número…"
                       className="h-10 border-border bg-muted/40 pl-8 pr-8 text-base sm:h-9 sm:text-xs
                                  placeholder:text-muted-foreground/70" />
              </div>

              <div className="grid grid-cols-2 gap-1">
                {ABAS.map((f) => {
                  const ativo = aba === f.id;
                  return (
                    <button key={f.id} type="button" aria-pressed={ativo}
                            onClick={() => setAba(f.id)}
                            className={`flex items-center justify-between gap-1.5 rounded-md border
                                        px-2 py-1.5 text-[11px] font-medium leading-none
                                        transition-colors ${f.id === "todas" ? "col-span-2" : ""} ${
                              ativo
                                ? "border-carbo-green/40 bg-carbo-green/10 text-foreground"
                                : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}>
                      <span className="truncate">{f.rotulo}</span>
                      <span className="min-w-[1.5rem] shrink-0 rounded px-1 py-0.5 text-center
                                       text-[10px] font-semibold tabular-nums text-muted-foreground/40">
                        0
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPainelFiltros((v) => !v)}
                        aria-expanded={painelFiltros}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-md border
                                   border-border/60 bg-muted/40 px-2 py-1.5 text-[11px] font-medium
                                   leading-none text-muted-foreground transition-colors hover:bg-muted/70">
                  <SlidersHorizontal className="h-3 w-3" />
                  Filtros
                  <ChevronDown className={`h-3 w-3 transition-transform ${painelFiltros ? "rotate-180" : ""}`} />
                </button>
              </div>

              {painelFiltros && (
                <div className="space-y-1">
                  {SELETORES.map((rot) => (
                    <select key={rot} aria-label={rot} defaultValue=""
                            className="w-full rounded-md border border-border/60 bg-muted/40 px-2 py-1.5
                                       text-[11px] outline-none focus:border-carbo-green/40">
                      <option value="">{rot}: qualquer</option>
                    </select>
                  ))}
                  <select aria-label="Ordenar" defaultValue="recentes"
                          className="w-full rounded-md border border-border/60 bg-muted/40 px-2 py-1.5
                                     text-[11px] outline-none focus:border-carbo-green/40">
                    <option value="recentes">Mais recentes primeiro</option>
                    <option value="antigas">Mais antigas primeiro</option>
                  </select>
                  <p className="px-0.5 text-[10px] leading-tight text-muted-foreground/70">
                    A ordem vale dentro de cada grupo.
                  </p>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-8 text-center">
              <SearchX className="mx-auto h-5 w-5 text-muted-foreground/60" />
              <p className="mt-2 text-xs text-muted-foreground">Nenhuma conversa ainda.</p>
              <p className="mx-auto mt-1 max-w-[15rem] text-[10px] text-muted-foreground/80">
                Ela aparece quando houver um número ativo e um posto escrever para ele.
              </p>
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* ── Conversa ──────────────────────────────────────────────────── */}
        <CarboCard className="hidden min-h-0 min-w-0 lg:flex lg:flex-col">
          <CarboCardContent className="flex min-h-[24rem] flex-1 flex-col p-0">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                               border border-border bg-muted/40 text-muted-foreground">
                <User className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-muted-foreground">Nenhuma conversa aberta</p>
                <p className="text-[11px] text-muted-foreground/70">Janela de 24 h fechada</p>
              </div>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
            </div>

            <div className="border-t border-border p-3">
              <div className="mb-1.5 flex items-center gap-1">
                <span className="rounded-t-md border-b-2 border-carbo-green px-2.5 py-1 text-[11px] font-medium">
                  Responder
                </span>
                <span className="flex items-center gap-1.5 rounded-t-md border-b-2 border-transparent
                                 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  <EyeOff className="h-3 w-3" /> Recado interno
                </span>
              </div>
              <div className="flex items-end gap-2 rounded-lg border bg-muted/40 p-2">
                <p className="min-h-[3.5rem] flex-1 px-1 py-0.5 text-xs text-muted-foreground/70">
                  Responder…
                </p>
                <Button size="sm" className="h-8 gap-1.5" disabled>
                  <Send className="h-3.5 w-3.5" /> Enviar
                </Button>
              </div>
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* ── Painel do contato ─────────────────────────────────────────── */}
        <CarboCard className="hidden min-h-0 xl:flex xl:flex-col">
          <CarboCardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto p-0">
            <div className="space-y-2 border-b border-border px-4 pb-3 pt-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full
                                 border border-carbo-green/30 bg-carbo-green/5 text-[15px]
                                 font-semibold text-carbo-green">
                  ?
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold leading-tight text-muted-foreground">
                    Sem contato
                  </p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground/70">
                    nenhuma conversa aberta
                  </p>
                </div>
              </div>
              <div className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono
                              text-[15px] tracking-tight text-muted-foreground/50">
                —
              </div>
            </div>

            <div className="space-y-3 px-4 pb-4">
              <div className="space-y-2.5 rounded-lg border border-border bg-muted/40 p-3">
                <span className="inline-flex items-center rounded-md border border-dashed
                                 border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                  Sem pendência
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button size="sm" variant="outline" disabled className="h-9 w-full gap-1.5 text-[11px]">
                    <Clock className="h-3.5 w-3.5" /> Aguardando
                  </Button>
                  <Button size="sm" variant="outline" disabled className="h-9 w-full gap-1.5 text-[11px]">
                    <CheckCheck className="h-3.5 w-3.5" /> Resolver
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" disabled
                          className="h-9 min-w-0 flex-1 gap-1.5 border-carbo-green/40 text-[11px] text-carbo-green">
                    <UserCheck className="h-3.5 w-3.5 shrink-0" /> Assumir
                  </Button>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md
                                   border border-border text-muted-foreground/60">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md border border-dashed
                                 border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <TagIcon className="h-2.5 w-2.5" /> + etiqueta
                </span>
              </div>
            </div>
          </CarboCardContent>
        </CarboCard>
      </div>
    </div>
  );
}
