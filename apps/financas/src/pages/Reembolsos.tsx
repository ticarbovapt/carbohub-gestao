import { useEffect, useRef, useState } from "react";
import { Banknote, Copy, ExternalLink, Loader2, Paperclip, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { pedirTexto, useParamUrl } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Paginacao, brl } from "@/components/financeiro/ContasUI";
import { dataBR, dataHoraBR, hojeISO } from "@/lib/datas";
import {
  linkDoComprovante, mensagemDoErro, useDevolverReembolso, usePagarReembolso, useReembolsos,
  type ReembolsoFin, type StatusReembolso,
} from "@/hooks/useReembolsos";

// ─────────────────────────────────────────────────────────────────────────────
// /reembolsos — o reembolso de pós-venda que o Atendimento pediu (20261175).
// O Financeiro paga, anexa o comprovante e confirma; o caso volta sozinho ao
// atendente, que manda o comprovante ao cliente no chat.
// ─────────────────────────────────────────────────────────────────────────────

const ABAS: { id: StatusReembolso; rotulo: string }[] = [
  { id: "solicitado", rotulo: "A pagar" },
  { id: "pago", rotulo: "Pagos" },
  { id: "devolvido", rotulo: "Devolvidos" },
  { id: "cancelado", rotulo: "Cancelados" },
];

const FORMA: Record<string, string> = { pix: "Pix", estorno: "Estorno na plataforma (cartão)", transferencia: "Transferência bancária" };
const TIPO_CASO: Record<string, string> = {
  faltante: "Produto faltante", avaria: "Avaria / vazamento", defeito: "Defeito", errado: "Produto errado",
  arrependimento: "Arrependimento", nao_recebido: "Entregue e não recebido", atraso: "Atraso / extravio",
  devolvido: "Devolvido ao remetente", outro: "Outro assunto",
};
const TIPOS_ACEITOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const LIMITE = 10 * 1024 * 1024;

/** "13,50" / "1.234,56" / "13.50" → 13.5. Inválido → null. */
function lerValor(s: string): number | null {
  const t = s.trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
const reaisTxt = (v: number) => v.toFixed(2).replace(".", ",");

function Copiar({ texto }: { texto: string }) {
  return (
    <button type="button" aria-label="Copiar" className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); toast.success("Copiado"); }
        catch { toast.error("Não foi possível copiar"); }
      }}>
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

function VerComprovante({ path }: { path: string }) {
  const [abrindo, setAbrindo] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm" disabled={abrindo}
      onClick={async () => {
        setAbrindo(true);
        try { window.open(await linkDoComprovante(path), "_blank", "noopener"); }
        catch (e) { toast.error("Não foi possível abrir o comprovante", { description: mensagemDoErro(e) }); }
        finally { setAbrindo(false); }
      }}>
      {abrindo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
      Comprovante
    </Button>
  );
}

function DialogoPagar({ r, onClose }: { r: ReembolsoFin; onClose: () => void }) {
  const pagar = usePagarReembolso();
  const [valorTxt, setValorTxt] = useState(reaisTxt(Number(r.valor)));
  const [dia, setDia] = useState(hojeISO());
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nota, setNota] = useState("");
  const valor = lerValor(valorTxt);

  const escolher = (f: File | null) => {
    if (!f) { setArquivo(null); return; }
    if (!TIPOS_ACEITOS.includes(f.type)) { toast.error("Envie PDF, JPG, PNG ou WEBP"); return; }
    if (f.size > LIMITE) { toast.error("Arquivo maior que 10 MB"); return; }
    setArquivo(f);
  };

  const confirmar = () => {
    if (valor == null) { toast.error("Valor pago inválido"); return; }
    if (!dia) { toast.error("Informe a data do pagamento"); return; }
    if (!arquivo) { toast.error("Anexe o comprovante"); return; }
    pagar.mutate({ id: r.id, valor, pagoEm: dia, arquivo, nota: nota.trim() || null }, {
      onSuccess: () => { toast.success("Pagamento confirmado: o caso voltou ao atendimento"); onClose(); },
      onError: (e) => toast.error("Não foi possível confirmar", { description: mensagemDoErro(e) }),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !pagar.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Confirmar pagamento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/60 p-2.5 text-sm">
            <p className="font-medium">{r.cliente ?? "Cliente"} · {r.pedido_codigo ?? r.pedido_numero ?? r.bling_id}</p>
            <p className="text-muted-foreground">Pedido: {brl(Number(r.valor))} · {FORMA[r.forma] ?? r.forma}</p>
            {r.dados && <p className="whitespace-pre-wrap break-words">{r.dados}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Valor pago (R$)</Label>
              <Input inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data do pagamento</Label>
              <DatePickerInput value={dia} onChange={setDia} disableFuture clearable={false} className="h-9 w-full" />
            </div>
          </div>
          {valor != null && Math.abs(valor - Number(r.valor)) > 0.005 && (
            <p className="text-xs text-amber-600 dark:text-warning">Diferente do pedido ({brl(Number(r.valor))}).</p>
          )}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Comprovante *</Label>
            <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm hover:bg-muted/50",
              arquivo && "border-solid border-carbo-green/60")}>
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{arquivo ? arquivo.name : "PDF ou imagem, até 10 MB"}</span>
              <input type="file" className="hidden" accept={TIPOS_ACEITOS.join(",")}
                onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Observação</Label>
            <Textarea rows={2} maxLength={2000} value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pagar.isPending} onClick={onClose}>Cancelar</Button>
          <Button disabled={pagar.isPending} onClick={confirmar}>
            {pagar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Cartao({ r, destaque, onPagar }: { r: ReembolsoFin; destaque: boolean; onPagar: () => void }) {
  const devolver = useDevolverReembolso();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (destaque) ref.current?.scrollIntoView({ block: "center" }); }, [destaque]);

  const fazerDevolver = async () => {
    const motivo = await pedirTexto({
      titulo: "Devolver ao atendimento", rotulo: "O que precisa ser corrigido", multilinha: true,
      confirmar: "Devolver", perigo: true, obrigatorio: true,
    });
    if (!motivo?.trim()) return;
    devolver.mutate({ id: r.id, motivo: motivo.trim() }, {
      onSuccess: () => toast.success("Devolvido ao atendimento"),
      onError: (e) => toast.error("Não foi possível devolver", { description: mensagemDoErro(e) }),
    });
  };

  const pedido = r.pedido_codigo ?? r.pedido_numero ?? r.pedido_loja ?? String(r.bling_id);
  return (
    <div ref={ref} className={cn("space-y-3 rounded-xl border bg-card p-4", destaque && "ring-2 ring-carbo-green/60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{r.cliente ?? "Cliente"}</p>
          <p className="text-xs text-muted-foreground">
            {pedido}{r.canal ? ` · ${r.canal}` : ""}{r.data_pedido ? ` · ${dataBR(r.data_pedido)}` : ""}
            {r.total != null ? ` · pedido de ${brl(Number(r.total))}` : ""}{r.nf_numero ? ` · NF ${r.nf_numero}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-semibold tabular-nums">{brl(Number(r.status === "pago" ? r.valor_pago ?? r.valor : r.valor))}</p>
          <p className="text-xs text-muted-foreground">Reembolso {r.tipo} · {TIPO_CASO[r.caso_tipo] ?? r.caso_tipo}</p>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Como</dt><dd>{FORMA[r.forma] ?? r.forma}</dd>
        {r.dados && (
          <>
            <dt className="text-muted-foreground">Dados</dt>
            <dd className="whitespace-pre-wrap break-words">{r.dados}<Copiar texto={r.dados} /></dd>
          </>
        )}
        <dt className="text-muted-foreground">Pedido</dt>
        <dd>{dataHoraBR(r.solicitado_em)}{r.solicitado_por ? ` · ${r.solicitado_por}` : ""}</dd>
        {r.nota && (<><dt className="text-muted-foreground">Atendimento</dt><dd className="whitespace-pre-wrap break-words">{r.nota}</dd></>)}
        {r.status === "pago" && (
          <>
            <dt className="text-muted-foreground">Pago</dt>
            <dd>{r.pago_em ? dataBR(r.pago_em) : "—"}{r.pago_por ? ` · ${r.pago_por}` : ""}</dd>
            {r.nota_financeiro && (<><dt className="text-muted-foreground">Observação</dt><dd className="whitespace-pre-wrap break-words">{r.nota_financeiro}</dd></>)}
            <dt className="text-muted-foreground">Cliente</dt>
            <dd>{r.caso_status === "encerrado" && r.caso_encerrado_em
              ? `comprovante enviado em ${dataHoraBR(r.caso_encerrado_em)}`
              : <span className="text-amber-600 dark:text-warning">aguardando o atendimento enviar o comprovante</span>}</dd>
          </>
        )}
        {r.status === "devolvido" && (
          <>
            <dt className="text-muted-foreground">Devolvido</dt>
            <dd>{r.devolvido_em ? dataHoraBR(r.devolvido_em) : "—"}{r.devolvido_por ? ` · ${r.devolvido_por}` : ""}</dd>
            {r.motivo_devolucao && (<><dt className="text-muted-foreground">Motivo</dt><dd className="whitespace-pre-wrap break-words">{r.motivo_devolucao}</dd></>)}
          </>
        )}
        {r.status === "cancelado" && (
          <><dt className="text-muted-foreground">Cancelado</dt><dd>{r.cancelado_em ? `pelo atendimento em ${dataHoraBR(r.cancelado_em)}` : "pelo atendimento"}</dd></>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        {r.status === "solicitado" && (
          <>
            <Button size="sm" onClick={onPagar}><Banknote className="mr-1.5 h-4 w-4" />Confirmar pagamento</Button>
            <Button size="sm" variant="outline" disabled={devolver.isPending} onClick={fazerDevolver}>
              {devolver.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Undo2 className="mr-1.5 h-4 w-4" />}Devolver
            </Button>
          </>
        )}
        {r.comprovante_path && <VerComprovante path={r.comprovante_path} />}
        <Button asChild size="sm" variant="ghost">
          <a href={`https://atendimento.carbohub.com.br/pos-venda?pedido=${r.bling_id}`} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Ver no Atendimento
          </a>
        </Button>
      </div>
    </div>
  );
}

export default function Reembolsos() {
  const [aba, setAba] = useParamUrl("situacao", "solicitado");
  const [paginaTxt, setPagina] = useParamUrl("pagina", "1");
  const [destaque] = useParamUrl("reembolso", "");
  const [porPagina, setPorPagina] = useState(20);
  const [pagando, setPagando] = useState<ReembolsoFin | null>(null);
  const status = (ABAS.some((a) => a.id === aba) ? aba : "solicitado") as StatusReembolso;
  const pagina = Math.max(0, (Number(paginaTxt) || 1) - 1);
  const q = useReembolsos(status, pagina, porPagina);
  const itens = q.data?.itens ?? [];
  const contagem = q.data?.contagem ?? {};
  const aPagar = status === "solicitado" ? itens.reduce((s, r) => s + Number(r.valor), 0) : 0;

  return (
    <div className="space-y-4">
      <CarboPageHeader title="Reembolsos" icon={Banknote} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-1">
          {ABAS.map((a) => (
            <button key={a.id} type="button" onClick={() => { setAba(a.id); setPagina("1"); }}
              className={cn("rounded-md px-3 py-1.5 text-sm transition-colors",
                status === a.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {a.rotulo}
              {(contagem[a.id] ?? 0) > 0 && (
                <span className={cn("ml-1.5 rounded-full px-1.5 text-xs tabular-nums",
                  a.id === "solicitado" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>
                  {contagem[a.id]}
                </span>
              )}
            </button>
          ))}
        </div>
        {status === "solicitado" && itens.length > 0 && (
          <span className="text-sm text-muted-foreground">{brl(aPagar)} a pagar{(q.data?.total ?? 0) > itens.length ? " nesta página" : ""}</span>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-3"><Skeleton className="h-36 w-full" /><Skeleton className="h-36 w-full" /></div>
      ) : q.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{mensagemDoErro(q.error)}</p>
      ) : itens.length === 0 ? (
        <p className="rounded-xl border px-4 py-12 text-center text-sm text-muted-foreground">
          {status === "solicitado" ? "Nenhum reembolso a pagar." : "Nada aqui."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {itens.map((r) => <Cartao key={r.id} r={r} destaque={r.id === destaque} onPagar={() => setPagando(r)} />)}
        </div>
      )}

      {(q.data?.total ?? 0) > porPagina && (
        <Paginacao page={pagina} pageSize={porPagina} total={q.data?.total ?? 0}
          onPage={(p) => setPagina(String(p + 1))} onPageSize={(n) => { setPorPagina(n); setPagina("1"); }} />
      )}

      {pagando && <DialogoPagar r={pagando} onClose={() => setPagando(null)} />}
    </div>
  );
}
