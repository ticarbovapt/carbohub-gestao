import { useMemo, useState } from "react";
import {
  Truck, Package, FileText, CheckCircle2, ShoppingCart, Copy, XCircle, Loader2, MapPin, Phone,
} from "lucide-react";
import { toast } from "sonner";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEsteiraOnline, ETAPAS, type EsteiraRow, type EtapaEsteira } from "@/hooks/useEsteiraOnline";

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

// ── Card ────────────────────────────────────────────────────────────────────
function Card({ row, onClick }: { row: EsteiraRow; onClick: () => void }) {
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
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{row.nf_numero ? `NF ${row.nf_numero}` : "sem NF"}</span>
        <span>{dia(row.data_pedido)}</span>
      </div>
    </button>
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

function Detalhe({ row, onClose }: { row: EsteiraRow; onClose: () => void }) {
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
                    <Card key={r.bling_id} row={r} onClick={() => setAberto(r)} />
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
            {cancelados.map((r) => <Card key={r.bling_id} row={r} onClick={() => setAberto(r)} />)}
          </div>
        </details>
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <MapPin className="h-3 w-3" />
        As etapas vêm do Bling (pedido, nota, etiqueta) e das plataformas (envio, entrega).
        A tela atualiza sozinha a cada 2 minutos.
      </p>

      {aberto && <Detalhe row={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}
