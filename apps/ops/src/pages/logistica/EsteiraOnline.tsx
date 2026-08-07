import { useMemo, useState } from "react";
import {
  Truck, Package, FileText, CheckCircle2, ShoppingCart, Copy, XCircle, Loader2, MapPin, Phone,
  CalendarClock, ExternalLink, MessageSquare,
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

/** Data curta com o dia da semana — "qui, 14/08". Numa previsão de entrega o
 *  dia da semana é metade da informação: "chega quinta" é o que o time fala com
 *  o cliente, e sexta-feira à tarde muda a conversa. */
const diaCurto = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

const dataHora = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/** Mensagem pronta para o cliente. O time copia e manda pelo canal dele —
 *  não existe envio automático (ainda), e essa foi a decisão: o disparo é
 *  manual até termos um canal oficial. */
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
  if (r?.previsao_entrega) linhas.push(`Previsão de entrega: ${diaCurto(r.previsao_entrega)}`);
  linhas.push(``, `Qualquer dúvida é só chamar por aqui.`);
  return linhas.join("\n");
}

// ── Card ────────────────────────────────────────────────────────────────────
function Card({ row, rastreio, onClick }: {
  row: EsteiraRow; rastreio?: RastreioCard; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border bg-card p-2.5 hover:border-carbo-green/50 hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold truncate">{row.cliente ?? "—"}</span>
        <span className="text-xs font-bold tabular-nums shrink-0">{brl(row.total)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <CarboBadge variant="secondary">{row.canal ?? "—"}</CarboBadge>
        {row.entrega_cidade && (
          <span className="text-[11px] text-muted-foreground truncate">
            {row.entrega_cidade}/{row.entrega_uf}
          </span>
        )}
      </div>
      {(row.transportadora || row.rastreio) && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Truck className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {row.transportadora ?? "—"}{row.servico ? ` · ${row.servico}` : ""}
          </span>
        </div>
      )}
      {row.rastreio && (
        <div className="mt-0.5 font-mono text-[11px] text-carbo-green truncate">{row.rastreio}</div>
      )}

      {/* Previsão e última movimentação: o que o time precisa para responder
          "onde está?" sem abrir o card nem o site da transportadora. */}
      {rastreio?.previsao_entrega && (
        <div className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${
          rastreio.atrasado ? "text-red-500" : "text-muted-foreground"
        }`}>
          <CalendarClock className="h-3 w-3 shrink-0" />
          {rastreio.entregue_em
            ? `entregue ${diaCurto(rastreio.entregue_em)}`
            : `${rastreio.atrasado ? "previa " : "previsão "}${diaCurto(rastreio.previsao_entrega)}`}
          {rastreio.atrasado && <span className="ml-0.5">· atrasado</span>}
        </div>
      )}
      {rastreio?.eventos?.[0] && (
        <div className="mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3 mt-px shrink-0" />
          <span className="truncate">{rastreio.eventos[0].descricao}</span>
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{row.nf_numero ? `NF ${row.nf_numero}` : "sem NF"}</span>
        <span>{dia(row.data_pedido)}</span>
      </div>
    </button>
  );
}

// ── Trajeto ─────────────────────────────────────────────────────────────────
//
// O caminho do volume, do mais recente para o mais antigo. Quem preenche são o
// `ecommerce-sync` (Mercado Envios) e o `rastreio-sync` (Melhor Envio — Jadlog
// e Correios). A tela só desenha: nenhuma etapa é deduzida aqui.
function Trajeto({ row, r }: { row: EsteiraRow; r?: RastreioCard }) {
  if (!r) {
    return (
      <section>
        <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Trajeto</h4>
        <p className="text-[11px] text-muted-foreground">
          Ainda não consultamos este código. A coleta roda de hora em hora e busca
          primeiro os envios que não chegaram.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-[11px] font-semibold uppercase text-muted-foreground">Trajeto</h4>
        <span className="text-[10px] text-muted-foreground">
          consultado {dataHora(r.consultado_em)}
        </span>
      </div>

      {r.previsao_entrega && (
        <Linha
          label={r.entregue_em ? "Entregue em" : "Previsão de entrega"}
          valor={
            <span className={r.atrasado ? "text-red-500 font-medium" : ""}>
              {diaCurto(r.entregue_em ?? r.previsao_entrega)}
              {r.atrasado && " · atrasado"}
            </span>
          }
        />
      )}

      {/* Consulta que falhou não pode virar lista vazia: quem lê precisa saber
          se o pacote não se moveu ou se nós não conseguimos perguntar. */}
      {r.erro && (
        <p className="mt-1 text-[11px] text-amber-500">
          Não consegui ler o histórico desta transportadora: {r.erro}
        </p>
      )}

      {r.eventos.length === 0 && !r.erro && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          A transportadora ainda não registrou movimentação neste código.
        </p>
      )}

      {r.eventos.length > 0 && (
        <ol className="mt-2 space-y-0">
          {r.eventos.map((e, i) => (
            <li key={`${e.ocorrido_em}-${i}`} className="flex gap-2">
              {/* Linha do tempo: bolinha cheia no evento mais recente. */}
              <div className="flex flex-col items-center pt-1">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  i === 0 ? "bg-carbo-green" : "bg-muted-foreground/40"
                }`} />
                {i < r.eventos.length - 1 && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className="pb-2 min-w-0">
                <div className={`text-xs ${i === 0 ? "font-medium" : "text-muted-foreground"}`}>
                  {e.descricao}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {dataHora(e.ocorrido_em)}
                  {(e.cidade || e.uf) && ` · ${[e.cidade, e.uf].filter(Boolean).join("/")}`}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {r.url_rastreio && (
          <a href={r.url_rastreio} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 text-xs text-carbo-green hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Abrir na transportadora
          </a>
        )}
        <button
          onClick={() => copiar(mensagemCliente(row, r), "Mensagem")}
          className="inline-flex items-center gap-1 text-xs text-carbo-green hover:underline"
        >
          <MessageSquare className="h-3.5 w-3.5" /> Copiar mensagem para o cliente
        </button>
      </div>
    </section>
  );
}

// ── Detalhe ─────────────────────────────────────────────────────────────────
function Linha({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-right break-words">{valor}</span>
    </div>
  );
}

function Detalhe({ row, rastreio, onClose }: {
  row: EsteiraRow; rastreio?: RastreioCard; onClose: () => void;
}) {
  const itens = Array.isArray(row.items) ? (row.items as any[]) : [];
  const endereco = [row.entrega_endereco, row.entrega_bairro].filter(Boolean).join(" — ");
  const cidade = [row.entrega_cidade, row.entrega_uf].filter(Boolean).join("/");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {row.cliente ?? "Cliente"}
            <CarboBadge variant="secondary">{row.canal ?? "—"}</CarboBadge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <section>
            <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Pedido</h4>
            <Linha label="Nº no Bling" valor={row.pedido_numero ?? "—"} />
            <Linha label="Nº na loja" valor={row.pedido_loja ?? "—"} />
            <Linha label="Data" valor={dia(row.data_pedido)} />
            <Linha label="Valor" valor={<strong>{brl(row.total)}</strong>} />
            {row.carboze_order_number && (
              <Linha label="No sistema" valor={row.carboze_order_number} />
            )}
          </section>

          <section>
            <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Cliente</h4>
            <Linha label="Documento" valor={fmtDoc(row.cliente_doc)} />
            <Linha
              label="Telefone"
              valor={row.cliente_fone ? (
                <button onClick={() => copiar(row.cliente_fone!, "Telefone")}
                        className="inline-flex items-center gap-1 hover:text-carbo-green">
                  <Phone className="h-3 w-3" /> {fmtFone(row.cliente_fone)}
                </button>
              ) : <span className="text-muted-foreground">não informado</span>}
            />
          </section>

          <section>
            <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Entrega</h4>
            <Linha label="Endereço" valor={endereco || <span className="text-muted-foreground">não informado</span>} />
            <Linha label="Cidade" valor={cidade || "—"} />
            <Linha label="CEP" valor={row.entrega_cep ?? "—"} />
          </section>

          <section>
            <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Nota fiscal</h4>
            <Linha label="Número" valor={row.nf_numero ?? <span className="text-muted-foreground">não emitida</span>} />
            <Linha label="Situação" valor={row.nf_situacao ?? "—"} />
            <Linha label="Emissão" valor={dia(row.nf_data)} />
            <Linha
              label="Chave"
              valor={row.nf_chave ? (
                <button onClick={() => copiar(row.nf_chave!, "Chave")}
                        className="font-mono text-[10px] inline-flex items-center gap-1 hover:text-carbo-green">
                  <Copy className="h-3 w-3" /> {row.nf_chave}
                </button>
              ) : "—"}
            />
            {row.nf_pdf && (
              <a href={row.nf_pdf} target="_blank" rel="noreferrer"
                 className="mt-1 inline-flex items-center gap-1 text-xs text-carbo-green hover:underline">
                <FileText className="h-3.5 w-3.5" /> Abrir DANFE
              </a>
            )}
          </section>

          <section>
            <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Envio</h4>
            <Linha label="Transportadora" valor={row.transportadora ?? <span className="text-muted-foreground">não informada</span>} />
            <Linha label="Serviço" valor={row.servico ?? "—"} />
            <Linha
              label="Rastreio"
              valor={row.rastreio ? (
                <button onClick={() => copiar(row.rastreio!, "Rastreio")}
                        className="font-mono inline-flex items-center gap-1 hover:text-carbo-green">
                  <Copy className="h-3 w-3" /> {row.rastreio}
                </button>
              ) : <span className="text-muted-foreground">ainda não gerado</span>}
            />
            <Linha label="Volumes" valor={row.volumes ?? "—"} />
            <Linha label="Peso" valor={row.peso_kg != null ? `${row.peso_kg} kg` : "—"} />
            {!row.tem_status_da_plataforma && (
              <p className="mt-2 text-[11px] text-amber-500">
                A plataforma ainda não foi vinculada a este pedido — por isso ele não avança
                sozinho para “em trânsito” e “entregue”.
              </p>
            )}
          </section>

          {row.rastreio && <Trajeto row={row} r={rastreio} />}

          {itens.length > 0 && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Itens</h4>
              {itens.map((it, i) => (
                <Linha key={i}
                  label={`${it?.quantidade ?? it?.quantity ?? 1}× ${it?.descricao ?? it?.name ?? "Produto"}`}
                  valor={brl(Number(it?.valor ?? it?.unit_price ?? 0))} />
              ))}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function EsteiraOnline() {
  const [dias, setDias] = useState("30");
  const [busca, setBusca] = useState("");
  const [canal, setCanal] = useState("all");
  const [aberto, setAberto] = useState<EsteiraRow | null>(null);
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

  const porEtapa = useMemo(() => {
    const m = new Map<EtapaEsteira, EsteiraRow[]>();
    for (const e of ETAPAS) m.set(e.key, []);
    for (const r of linhas) {
      if (r.etapa === "cancelado") continue;
      m.get(r.etapa)?.push(r);
    }
    return m;
  }, [linhas]);

  const cancelados = linhas.filter((r) => r.etapa === "cancelado");
  const emAndamento = linhas.filter((r) => r.etapa !== "cancelado");
  // Pedido parado na etiqueta sem a plataforma vinculada nunca vai andar
  // sozinho — é a fila que precisa de conserto, não de paciência.
  const semVinculo = emAndamento.filter((r) => !r.tem_status_da_plataforma).length;

  return (
    <div className="space-y-4">
      <CarboPageHeader
        icon={Truck}
        title="Esteira do On-line"
        description="Da venda à entrega, direto do Bling e das plataformas. Espelho: nada aqui se arrasta."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CarboCard><CarboCardContent className="p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-0.5">
            <ShoppingCart className="h-3.5 w-3.5 text-blue-500" /> Em andamento
          </div>
          <p className="text-lg font-bold tabular-nums">{emAndamento.length}</p>
        </CarboCardContent></CarboCard>
        <CarboCard><CarboCardContent className="p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-0.5">
            <Package className="h-3.5 w-3.5 text-carbo-green" /> Valor
          </div>
          <p className="text-lg font-bold tabular-nums">
            {brl(emAndamento.reduce((s, r) => s + (r.total || 0), 0))}
          </p>
        </CarboCardContent></CarboCard>
        <CarboCard><CarboCardContent className="p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-0.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Entregues
          </div>
          <p className="text-lg font-bold tabular-nums">{porEtapa.get("entregue")?.length ?? 0}</p>
        </CarboCardContent></CarboCard>
        <CarboCard><CarboCardContent className="p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-0.5">
            <XCircle className="h-3.5 w-3.5 text-red-500" /> Cancelados
          </div>
          <p className="text-lg font-bold tabular-nums">{cancelados.length}</p>
        </CarboCardContent></CarboCard>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)}
               placeholder="Cliente, rastreio, NF, cidade…" className="h-9 max-w-xs" />
        <Select value={canal} onValueChange={setCanal}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            {canais.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dias} onValueChange={setDias}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
        {semVinculo > 0 && (
          <span className="text-xs text-amber-500 ml-auto">
            {semVinculo} sem vínculo com a plataforma — não avançam sozinhos
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando a esteira…
        </div>
      ) : error ? (
        <p className="text-sm text-red-500">Não consegui carregar: {(error as Error).message}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {ETAPAS.map((etapa) => {
            const cards = porEtapa.get(etapa.key) ?? [];
            const valor = cards.reduce((s, r) => s + (r.total || 0), 0);
            return (
              <div key={etapa.key} className="rounded-xl border bg-muted/20 p-2">
                <div className="flex items-center justify-between px-1 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: etapa.color }} />
                    <span className="text-xs font-semibold">{etapa.label}</span>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">{cards.length}</span>
                </div>
                <p className="px-1 pb-2 text-[10px] text-muted-foreground leading-tight">
                  {etapa.descricao}
                </p>
                {cards.length > 0 && (
                  <p className="px-1 pb-2 text-[11px] font-medium tabular-nums">{brl(valor)}</p>
                )}
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {cards.map((r) => (
                    <Card key={r.bling_id} row={r} rastreio={rastreioDe(r.rastreio)}
                          onClick={() => setAberto(r)} />
                  ))}
                  {cards.length === 0 && (
                    <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">vazio</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cancelados.length > 0 && (
        <details className="rounded-xl border p-3">
          <summary className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 text-red-500" />
            {cancelados.length} cancelados — {brl(cancelados.reduce((s, r) => s + (r.total || 0), 0))}
          </summary>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-2">
            {cancelados.map((r) => <Card key={r.bling_id} row={r} rastreio={rastreioDe(r.rastreio)}
                          onClick={() => setAberto(r)} />)}
          </div>
        </details>
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <MapPin className="h-3 w-3" />
        As etapas vêm do Bling (pedido, nota, etiqueta) e das plataformas (envio, entrega).
        A tela atualiza sozinha a cada 2 minutos.
      </p>

      {aberto && (
        <Detalhe row={aberto} rastreio={rastreioDe(aberto.rastreio)}
                 onClose={() => setAberto(null)} />
      )}
    </div>
  );
}
