import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote, Check, ChevronRight, Copy, ExternalLink, GitBranch, Hourglass, Loader2, Paperclip, Undo2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { pedirTexto, useParamUrl } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CampoBusca, Paginacao, brl } from "@/components/financeiro/ContasUI";
import { dataBR, dataHoraBR, hojeISO } from "@/lib/datas";
import { FLUXOS_SLIDES } from "@/lib/fluxosPosVenda";
import {
  linkDoComprovante, mensagemDoErro, useDevolverReembolso, usePagarReembolso, useReembolso, useReembolsos,
  type ReembolsoFin, type StatusReembolso,
} from "@/hooks/useReembolsos";

// ─────────────────────────────────────────────────────────────────────────────
// /reembolsos — o reembolso de pós-venda que o Atendimento pediu (20261175).
// O Financeiro paga, anexa o comprovante e confirma; o caso volta sozinho ao
// atendente, que manda o comprovante ao cliente no chat.
//
// 18/11/2026: o MESMO desenho do caso no Atendimento (tela de chamado) — lista
// limpa, e o reembolso aberto com o pagamento e o histórico no centro e
// cliente / pedido / caso ao lado. `?reembolso=<id>` abre ESSE reembolso em
// qualquer aba (é o link do sininho e do "Ver no Finanças" do caso).
//
// Estado na URL: ?situacao= · ?pagina= · ?busca= · ?reembolso=
// ─────────────────────────────────────────────────────────────────────────────

const ABAS: { id: StatusReembolso; rotulo: string }[] = [
  { id: "solicitado", rotulo: "A pagar" },
  { id: "pago", rotulo: "Pagos" },
  { id: "devolvido", rotulo: "Devolvidos" },
  { id: "cancelado", rotulo: "Cancelados" },
];

const SITUACAO: Record<StatusReembolso, { rotulo: string; classe: string }> = {
  solicitado: { rotulo: "A pagar", classe: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  pago:       { rotulo: "Pago", classe: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  devolvido:  { rotulo: "Devolvido", classe: "bg-red-500/15 text-red-700 dark:text-red-400" },
  cancelado:  { rotulo: "Cancelado", classe: "bg-muted text-muted-foreground" },
};

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
const pedidoDe = (r: ReembolsoFin) => r.pedido_codigo ?? r.pedido_numero ?? r.pedido_loja ?? String(Math.abs(r.bling_id));
const valorDe = (r: ReembolsoFin) => Number(r.status === "pago" ? r.valor_pago ?? r.valor : r.valor);
/** "84991015838" → "(84) 99101-5838". */
function foneBonito(f: string | null) {
  const d = (f ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return f;
}
function haDias(iso: string) {
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`;
}
/** O caso no Atendimento, já aberto no pedido. */
const noAtendimento = (r: ReembolsoFin) => `https://atendimento.carbohub.com.br/pos-venda?pedido=${r.bling_id}`;

function ChipSituacao({ s }: { s: StatusReembolso }) {
  const c = SITUACAO[s];
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", c.classe)}>{c.rotulo}</span>;
}

function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" aria-label={rotulo || "Copiar"}
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); toast.success("Copiado"); }
        catch { toast.error("Não foi possível copiar"); }
      }}>
      <Copy className={cn("h-3.5 w-3.5", rotulo && "mr-1")} />{rotulo}
    </Button>
  );
}

function VerComprovante({ path, compacto }: { path: string; compacto?: boolean }) {
  const [abrindo, setAbrindo] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm" className={cn("bg-background", compacto && "h-7 px-2 text-xs")} disabled={abrindo}
      onClick={async () => {
        setAbrindo(true);
        try { window.open(await linkDoComprovante(path), "_blank", "noopener"); }
        catch (e) { toast.error("Não foi possível abrir o comprovante", { description: mensagemDoErro(e) }); }
        finally { setAbrindo(false); }
      }}>
      {abrindo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
      Ver comprovante
    </Button>
  );
}

// ── O reembolso aberto ───────────────────────────────────────────────────────

/** Um ponto da linha do tempo; `ultimo` não desenha o traço para baixo. */
function Marco({ ultimo, ponto, children }: { ultimo?: boolean; ponto: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-3">
      {!ultimo && <span className="absolute bottom-0 left-[11px] top-7 w-px bg-border" aria-hidden />}
      <span className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">{ponto}</span>
      <div className={cn("min-w-0 flex-1", !ultimo && "pb-5")}>{children}</div>
    </li>
  );
}
const Ponto = ({ tom = "feito" }: { tom?: "feito" | "agora" | "parado" | "espera" }) => (
  tom === "agora"
    ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary ring-4 ring-primary/15"><span className="h-2 w-2 rounded-full bg-primary-foreground" /></span>
    : tom === "espera"
      ? <span className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"><Hourglass className="h-3.5 w-3.5" /></span>
      : tom === "parado"
        ? <span className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground"><XCircle className="h-3.5 w-3.5" /></span>
        : <span className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground"><Check className="h-3.5 w-3.5" /></span>
);

function Evento({ titulo, quando, por, children }: { titulo: string; quando?: string | null; por?: string | null; children?: React.ReactNode }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm font-medium">{titulo}</p>
        {(quando || por) && (
          <span className="text-[11px] tabular-nums text-muted-foreground">{[quando, por].filter(Boolean).join(" · ")}</span>
        )}
      </div>
      {children && <div className="mt-1 space-y-1 text-sm text-muted-foreground">{children}</div>}
    </>
  );
}

const Nota = ({ texto }: { texto: string }) => (
  <p className="whitespace-pre-wrap break-words rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-foreground">{texto}</p>
);

/** O passo do Financeiro: pagar quem o atendimento pediu, ou devolver. */
function Pagar({ r }: { r: ReembolsoFin }) {
  const pagar = usePagarReembolso();
  const devolver = useDevolverReembolso();
  const [valorTxt, setValorTxt] = useState(reaisTxt(Number(r.valor)));
  const [dia, setDia] = useState(hojeISO());
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nota, setNota] = useState("");
  const valor = lerValor(valorTxt);
  const ocupado = pagar.isPending || devolver.isPending;

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
      onSuccess: () => toast.success("Pagamento confirmado: o caso voltou ao atendimento"),
      onError: (e) => toast.error("Não foi possível confirmar", { description: mensagemDoErro(e) }),
    });
  };

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

  return (
    <div className="overflow-hidden rounded-xl border border-primary/40 bg-card shadow-sm ring-1 ring-primary/15">
      <div className="border-b bg-primary/[0.04] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Passo atual</p>
        <p className="mt-0.5 font-semibold leading-snug">Pagar e confirmar com o comprovante</p>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div className="rounded-lg border bg-muted/40">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">Pagar para</span>
            {r.dados && <Copiar texto={r.dados} rotulo="Copiar dados" />}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 px-3 py-2.5 text-sm">
            <dt className="text-muted-foreground">Valor</dt>
            <dd className="flex items-center gap-1 font-semibold tabular-nums">{brl(Number(r.valor))}<Copiar texto={reaisTxt(Number(r.valor))} rotulo="" /></dd>
            <dt className="text-muted-foreground">Como</dt><dd>{FORMA[r.forma] ?? r.forma}</dd>
            {r.dados && (<><dt className="self-start text-muted-foreground">Dados</dt><dd className="whitespace-pre-wrap break-words">{r.dados}</dd></>)}
          </dl>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Valor pago (R$) <span className="text-red-600">*</span></span>
            <Input inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} />
          </label>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">Data do pagamento <span className="text-red-600">*</span></span>
            <DatePickerInput value={dia} onChange={setDia} disableFuture clearable={false} className="w-full" />
          </div>
        </div>
        {valor != null && Math.abs(valor - Number(r.valor)) > 0.005 && (
          <p className="-mt-2 text-xs text-amber-700 dark:text-amber-400">Diferente do pedido ({brl(Number(r.valor))}).</p>
        )}

        <div className="space-y-1.5">
          <span className="block text-sm font-medium">Comprovante <span className="text-red-600">*</span></span>
          <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-sm transition-colors hover:bg-muted/50",
            arquivo && "border-solid border-carbo-green/60 bg-carbo-green/[0.04]")}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted"><Paperclip className="h-4 w-4 text-muted-foreground" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{arquivo ? arquivo.name : "Escolher arquivo"}</span>
              <span className="block text-xs text-muted-foreground">{arquivo ? `${Math.max(1, Math.round(arquivo.size / 1024))} KB` : "PDF ou imagem, até 10 MB"}</span>
            </span>
            <input type="file" className="hidden" accept={TIPOS_ACEITOS.join(",")} onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Observação <span className="font-normal text-muted-foreground">(opcional)</span></span>
          <Textarea rows={2} maxLength={2000} value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-3">
        <Button disabled={ocupado} onClick={confirmar}>
          {pagar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Banknote className="mr-1.5 h-4 w-4" />}Confirmar pagamento
        </Button>
        <Button variant="outline" className="bg-background" disabled={ocupado} onClick={fazerDevolver}>
          {devolver.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Undo2 className="mr-1.5 h-4 w-4" />}Devolver ao atendimento
        </Button>
      </div>
    </div>
  );
}

function LinhaDoTempo({ r }: { r: ReembolsoFin }) {
  const encerrado = r.caso_status === "encerrado";
  return (
    <ol>
      <Marco ponto={<Ponto />}>
        <Evento titulo={`Pedido pelo atendimento · reembolso ${r.tipo}`} quando={dataHoraBR(r.solicitado_em)} por={r.solicitado_por}>
          <p><span className="text-foreground">{brl(Number(r.valor))}</span> · {FORMA[r.forma] ?? r.forma}</p>
          {r.nota && <Nota texto={r.nota} />}
        </Evento>
      </Marco>

      {r.status === "solicitado" && (
        <Marco ultimo ponto={<Ponto tom="agora" />}><Pagar key={r.id} r={r} /></Marco>
      )}

      {r.status === "pago" && (
        <>
          <Marco ponto={<Ponto />}>
            <Evento titulo="Pago pelo Financeiro" quando={r.pago_em ? dataBR(r.pago_em) : null} por={r.pago_por}>
              <p><span className="text-foreground">{brl(Number(r.valor_pago ?? r.valor))}</span>
                {r.valor_pago != null && Math.abs(Number(r.valor_pago) - Number(r.valor)) > 0.005 ? ` (pedido ${brl(Number(r.valor))})` : ""}</p>
              {r.nota_financeiro && <Nota texto={r.nota_financeiro} />}
              {r.comprovante_path && <div className="pt-1"><VerComprovante path={r.comprovante_path} compacto /></div>}
            </Evento>
          </Marco>
          <Marco ultimo ponto={<Ponto tom={encerrado ? "feito" : "espera"} />}>
            {encerrado
              ? <Evento titulo="Comprovante enviado ao cliente · caso encerrado" quando={r.caso_encerrado_em ? dataHoraBR(r.caso_encerrado_em) : null} />
              : <Evento titulo="Aguardando o atendimento enviar o comprovante ao cliente" />}
          </Marco>
        </>
      )}

      {r.status === "devolvido" && (
        <Marco ultimo ponto={<Ponto tom="parado" />}>
          <Evento titulo="Devolvido ao atendimento" quando={r.devolvido_em ? dataHoraBR(r.devolvido_em) : null} por={r.devolvido_por}>
            {r.motivo_devolucao && <Nota texto={r.motivo_devolucao} />}
          </Evento>
        </Marco>
      )}

      {r.status === "cancelado" && (
        <Marco ultimo ponto={<Ponto tom="parado" />}>
          <Evento titulo="Cancelado pelo atendimento" quando={r.cancelado_em ? dataHoraBR(r.cancelado_em) : null} />
        </Marco>
      )}
    </ol>
  );
}

function Bloco({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}
function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words text-right">{children}</dd>
    </div>
  );
}

function Lateral({ r }: { r: ReembolsoFin }) {
  return (
    <div className="space-y-6">
      <Bloco titulo="Cliente">
        <div>
          <p className="font-medium leading-snug">{r.cliente ?? "—"}</p>
          {r.cliente_fone && <p className="text-sm text-muted-foreground">{foneBonito(r.cliente_fone)}</p>}
        </div>
      </Bloco>
      <Bloco titulo="Pedido">
        <dl className="space-y-1.5">
          <Linha rotulo="Pedido">{pedidoDe(r)}</Linha>
          {r.canal && <Linha rotulo="Canal">{r.canal}</Linha>}
          {r.data_pedido && <Linha rotulo="Data">{dataBR(r.data_pedido)}</Linha>}
          {r.total != null && <Linha rotulo="Valor do pedido"><span className="tabular-nums">{brl(Number(r.total))}</span></Linha>}
          {r.nf_numero && <Linha rotulo="Nota fiscal">{r.nf_numero}</Linha>}
        </dl>
      </Bloco>
      <Bloco titulo="Caso no Atendimento"
        acao={(
          <Button asChild variant="ghost" size="sm" className="-my-1 h-7 px-2 text-xs">
            <a href={noAtendimento(r)} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Abrir</a>
          </Button>
        )}>
        <dl className="space-y-1.5">
          <Linha rotulo="Tipo">{TIPO_CASO[r.caso_tipo] ?? r.caso_tipo}</Linha>
          <Linha rotulo="Situação">{r.caso_status === "encerrado" ? "Encerrado" : "Aberto"}</Linha>
        </dl>
      </Bloco>
    </div>
  );
}

function DialogoReembolso({ id, inicial, onFechar }: { id: string; inicial: ReembolsoFin | null; onFechar: () => void }) {
  const q = useReembolso(id, inicial);
  const r = q.data ?? null;
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 outline-none sm:max-w-5xl lg:h-[min(860px,calc(100dvh-2rem))]">
        <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
            {r ? <>Reembolso {brl(valorDe(r))} <ChipSituacao s={r.status} /></> : "Reembolso"}
          </DialogTitle>
          {r && (
            <p className="text-sm text-muted-foreground">
              {[r.cliente, pedidoDe(r), TIPO_CASO[r.caso_tipo] ?? r.caso_tipo, `reembolso ${r.tipo}`].filter(Boolean).join(" · ")}
            </p>
          )}
        </DialogHeader>
        {q.isLoading && !r ? (
          <div className="space-y-3 p-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></div>
        ) : !r ? (
          <p className="p-6 text-sm text-destructive">{q.error ? mensagemDoErro(q.error) : "Reembolso não encontrado."}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden">
            <div className="min-w-0 p-5 sm:p-6 lg:overflow-y-auto"><LinhaDoTempo r={r} /></div>
            <aside className="border-t bg-muted/30 p-5 sm:p-6 lg:overflow-y-auto lg:border-l lg:border-t-0"><Lateral r={r} /></aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── A lista ──────────────────────────────────────────────────────────────────
const GRADE = "lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_8rem_8rem]";

function LinhaReembolso({ r, onAbrir }: { r: ReembolsoFin; onAbrir: () => void }) {
  return (
    <button type="button" onClick={onAbrir}
      className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted/40", GRADE)}>
      <span className="min-w-0">
        <span className="block truncate font-medium">{r.cliente ?? "Cliente"}</span>
        <span className="block truncate text-xs text-muted-foreground">{pedidoDe(r)}{r.canal ? ` · ${r.canal}` : ""}</span>
      </span>
      <span className="text-right lg:order-5">
        <span className="block font-semibold tabular-nums">{brl(valorDe(r))}</span>
        <span className="block text-xs text-muted-foreground lg:hidden">{FORMA[r.forma] ?? r.forma}</span>
      </span>
      <span className="hidden min-w-0 lg:order-2 lg:block">
        <span className="block truncate text-sm">{TIPO_CASO[r.caso_tipo] ?? r.caso_tipo}</span>
        <span className="block text-xs text-muted-foreground">Reembolso {r.tipo}</span>
      </span>
      <span className="hidden truncate text-sm lg:order-3 lg:block">{FORMA[r.forma] ?? r.forma}</span>
      <span className="hidden lg:order-4 lg:block">
        <span className="block text-sm tabular-nums">{dataBR(r.solicitado_em)}</span>
        <span className="block text-xs text-muted-foreground">{haDias(r.solicitado_em)}</span>
      </span>
      <span className="col-span-2 flex items-center justify-between gap-2 lg:order-6 lg:col-span-1 lg:justify-end">
        <span className="truncate text-xs text-muted-foreground lg:hidden">{TIPO_CASO[r.caso_tipo] ?? r.caso_tipo} · {haDias(r.solicitado_em)}</span>
        <span className="flex shrink-0 items-center gap-2"><ChipSituacao s={r.status} /><ChevronRight className="h-4 w-4 text-muted-foreground" /></span>
      </span>
    </button>
  );
}

export default function Reembolsos() {
  const [aba, setAba] = useParamUrl("situacao", "solicitado");
  const [paginaTxt, setPagina] = useParamUrl("pagina", "1");
  // Busca digitada grava com `replace`: não enche o histórico do Voltar.
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [aberto, setAberto] = useParamUrl("reembolso", "");
  const [buscaLocal, setBuscaLocal] = useState(busca);
  const [porPagina, setPorPagina] = useState(20);
  const status = (ABAS.some((a) => a.id === aba) ? aba : "solicitado") as StatusReembolso;
  const pagina = Math.max(0, (Number(paginaTxt) || 1) - 1);
  const q = useReembolsos(status, pagina, porPagina, busca);
  const itens = q.data?.itens ?? [];
  const contagem = q.data?.contagem ?? {};
  const aPagar = status === "solicitado" ? itens.reduce((s, r) => s + Number(r.valor), 0) : 0;
  const inicial = useMemo(() => itens.find((r) => r.id === aberto) ?? null, [itens, aberto]);

  useEffect(() => { setBuscaLocal(busca); }, [busca]);
  useEffect(() => {
    if (buscaLocal === busca) return;
    const t = setTimeout(() => { setBusca(buscaLocal); setPagina("1"); }, 300);
    return () => clearTimeout(t);
  }, [buscaLocal]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <CarboPageHeader title="Reembolsos" icon={Banknote}
        actions={(
          <Button asChild variant="outline">
            <Link to={`/reembolsos/fluxos?pagina=${FLUXOS_SLIDES.reembolso}&passo=pagar`}><GitBranch className="mr-2 h-4 w-4" />Fluxo do reembolso</Link>
          </Button>
        )} />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="inline-flex flex-wrap self-start rounded-lg border bg-muted/40 p-1">
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
        <CampoBusca valor={buscaLocal} onChange={setBuscaLocal} placeholder="Cliente, pedido, NF ou telefone" />
        {status === "solicitado" && itens.length > 0 && (
          <span className="text-sm text-muted-foreground lg:ml-auto">
            <span className="font-semibold tabular-nums text-foreground">{brl(aPagar)}</span> a pagar{(q.data?.total ?? 0) > itens.length ? " nesta página" : ""}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className={cn("hidden gap-x-4 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid", GRADE)}>
          <span>Cliente</span><span>Caso</span><span>Como</span><span>Pedido em</span><span className="text-right">Valor</span><span className="text-right">Situação</span>
        </div>
        {q.isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : q.error ? (
          <p className="px-4 py-10 text-center text-sm text-destructive">{mensagemDoErro(q.error)}</p>
        ) : itens.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted-foreground">
            {busca ? "Nada encontrado." : status === "solicitado" ? "Nenhum reembolso a pagar." : "Nada aqui."}
          </p>
        ) : (
          <div className="divide-y">
            {itens.map((r) => <LinhaReembolso key={r.id} r={r} onAbrir={() => setAberto(r.id)} />)}
          </div>
        )}
      </div>

      {(q.data?.total ?? 0) > porPagina && (
        <Paginacao page={pagina} pageSize={porPagina} total={q.data?.total ?? 0}
          onPage={(p) => setPagina(String(p + 1))} onPageSize={(n) => { setPorPagina(n); setPagina("1"); }} />
      )}

      {aberto && <DialogoReembolso key={aberto} id={aberto} inicial={inicial} onFechar={() => setAberto("")} />}
    </div>
  );
}
