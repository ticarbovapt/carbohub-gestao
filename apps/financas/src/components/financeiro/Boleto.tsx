import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Barcode, Copy, Download, Loader2, Mail, RefreshCw, Search } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { confirmar } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { dataBR, hojeISO } from "@/lib/datas";
import { partesDoEndereco } from "@/hooks/useNfseEmissao";
import {
  ehVivo, enderecoDaNf, registrarEmail, useBoleto, useBoletoPreparo, useCobranca,
  type FinBoleto, type PagadorTela, type RefTitulo,
} from "@/hooks/useBoletos";
import { formatarDoc, formatarLinha, gerarBoletoPdf, nossoNumeroImpresso } from "@/lib/boletoPdf";

// ─────────────────────────────────────────────────────────────────────────────
// Boleto Bradesco (boleto + Pix) no contas a receber — matriz e filial.
//   ChipBoleto        o estado na linha (só quando há boleto)
//   itemBoleto        o item do menu ⋯ ("Emitir boleto" / "Ver boleto")
//   BoletoDialogo     emitir (pré-preenchido) ou ver (PDF, Pix, e-mail, consulta, cancelar)
// ⚠️ Nome, CPF/CNPJ e VALOR não se editam aqui: o servidor os lê do TÍTULO.
// ─────────────────────────────────────────────────────────────────────────────

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

const ROTULO: Record<string, { txt: string; cls: string }> = {
  registrado: { txt: "Boleto", cls: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  indeterminado: { txt: "Boleto sem resposta", cls: "border-warning/40 bg-warning/10 text-warning-foreground" },
  enviando: { txt: "Boleto enviando", cls: "border-border bg-muted text-muted-foreground" },
  pago: { txt: "Boleto pago", cls: "border-success/30 bg-success/10 text-success" },
};

export function ChipBoleto({ b, onClick }: { b: FinBoleto | undefined; onClick: () => void }) {
  if (!b || !ehVivo(b)) return null;
  const r = ROTULO[b.status];
  return (
    <button type="button" onClick={onClick}
      className={cn("inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-xs font-medium hover:opacity-80", r.cls)}>
      <Barcode className="h-3.5 w-3.5" /> {r.txt}{b.ambiente === "sandbox" ? " · teste" : ""}
    </button>
  );
}

export function itemBoleto(b: FinBoleto | undefined, abrir: () => void) {
  return { l: ehVivo(b) ? "Ver boleto" : "Emitir boleto", onClick: abrir };
}

export interface AlvoBoleto { ref: RefTitulo; boleto: FinBoleto | null }

export function BoletoDialogo({ alvo, onClose }: { alvo: AlvoBoleto | null; onClose: () => void }) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { setId(alvo?.boleto && ehVivo(alvo.boleto) ? alvo.boleto.id : null); }, [alvo]);
  return (
    <Dialog open={!!alvo} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        {alvo && (id
          ? <VerBoleto id={id} onEmitirOutro={() => setId(null)} />
          : <EmitirBoleto alvo={alvo} onEmitido={setId} onClose={onClose} />)}
      </DialogContent>
    </Dialog>
  );
}

// ── EMITIR ──────────────────────────────────────────────────────────────────
type Form = PagadorTela & { vencimento: string };

function EmitirBoleto({ alvo, onEmitido, onClose }: { alvo: AlvoBoleto; onEmitido: (id: string) => void; onClose: () => void }) {
  const { data, isLoading, error } = useBoletoPreparo(alvo.ref);
  const cobranca = useCobranca();
  const [f, setF] = useState<Form | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => (p ? { ...p, [k]: v } : p));
  const hoje = hojeISO();

  // De onde veio o endereço (mostrado em cinza sob o título da seção).
  const [origem, setOrigem] = useState<string | null>(null);
  const [buscandoNf, setBuscandoNf] = useState(false);

  // Endereço, em ordem: último boleto do cliente → NF do Bling (JSON) → XML da
  // NF (pela função) → pedido do sistema. A pessoa só confere.
  useEffect(() => {
    if (!data || f) return;
    let vivo = true;
    const venc = data.titulo.vencimento && data.titulo.vencimento >= hoje ? data.titulo.vencimento : hoje;
    const montar = (s: Record<string, string | null> | null | undefined, doPedido: boolean): Form => {
      const x = s ?? {};
      const end = doPedido ? partesDoEndereco(x.endereco ?? null) : null;
      return {
        cep: dig(x.cep),
        logradouro: (doPedido ? end?.lgr : x.logradouro) ?? "",
        numero: (doPedido ? end?.nro : x.numero) ?? "",
        complemento: (doPedido ? "" : x.complemento) ?? "",
        bairro: (doPedido ? end?.bairro || x.bairro : x.bairro) ?? "",
        cidade: x.cidade ?? "", uf: (x.uf ?? "").toUpperCase(),
        email: x.email ?? "", fone: dig(x.fone),
        documento: data.titulo.documento ? "" : dig(x.documento),
        vencimento: venc,
      };
    };
    const rotulo = (s: Record<string, string | null>) =>
      s.origem === "boleto" ? "Endereço do último boleto do cliente"
        : s.origem === "nf" ? `Endereço da NF ${s.nf ?? ""}`.trim()
        : s.origem === "pedido" ? `Endereço de entrega do pedido ${s.pedido ?? ""}`.trim() : null;

    if (data.sugestao) { setF(montar(data.sugestao, false)); setOrigem(rotulo(data.sugestao)); return; }
    if (data.nf_xml) {
      setBuscandoNf(true);
      enderecoDaNf(alvo.ref).then((r) => {
        if (!vivo) return;
        if (r) { setF(montar(r.endereco, false)); setOrigem(`Endereço da NF ${r.nf}`); }
        else if (data.pedido) { setF(montar(data.pedido, true)); setOrigem(rotulo(data.pedido)); }
        else setF(montar(null, false));
      }).finally(() => vivo && setBuscandoNf(false));
      return () => { vivo = false; };
    }
    if (data.pedido) { setF(montar(data.pedido, true)); setOrigem(rotulo(data.pedido)); return; }
    setF(montar(null, false));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function buscarCep() {
    if (!f || dig(f.cep).length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${dig(f.cep)}/json/`, { signal: AbortSignal.timeout(8000) });
      const j = r.ok ? await r.json() : null;
      if (j && !j.erro) {
        setF((p) => p ? { ...p, logradouro: j.logradouro || p.logradouro, bairro: j.bairro || p.bairro, cidade: j.localidade || p.cidade, uf: j.uf || p.uf } : p);
      } else toast.error("CEP não encontrado");
    } catch { toast.error("Não consegui consultar o CEP"); }
    finally { setBuscandoCep(false); }
  }

  const t = data?.titulo;
  const faltas = useMemo(() => {
    if (!f || !t) return [];
    const x: string[] = [];
    const doc = t.documento ?? dig(f.documento);
    if (doc.length !== 11 && doc.length !== 14) x.push("CPF/CNPJ");
    if (dig(f.cep).length !== 8) x.push("CEP");
    if (!f.logradouro.trim()) x.push("logradouro");
    if (!f.bairro.trim()) x.push("bairro");
    if (!f.cidade.trim()) x.push("cidade");
    if (!/^[A-Za-z]{2}$/.test(f.uf.trim())) x.push("UF");
    if (!f.vencimento || f.vencimento < hoje) x.push("vencimento (hoje ou depois)");
    return x;
  }, [f, t, hoje]);

  async function emitir() {
    if (!f) return;
    const { vencimento, ...pagador } = f;
    const r = await cobranca.mutateAsync({ acao: "emitir", ...alvo.ref, vencimento, pagador });
    if (r.ok && r.boleto_id) {
      toast.success(r.ambiente === "sandbox" ? "Boleto registrado no sandbox" : "Boleto registrado no Bradesco");
      onEmitido(r.boleto_id);
    } else if (r.status === "indeterminado" && r.boleto_id) {
      toast.warning("O banco não respondeu", { description: r.erro ?? undefined });
      onEmitido(r.boleto_id);
    } else {
      toast.error("O banco não registrou o boleto", { description: r.erro ?? undefined });
    }
  }

  const ultimaRecusa = alvo.boleto && !ehVivo(alvo.boleto) && ["rejeitado", "falha"].includes(alvo.boleto.status) ? alvo.boleto : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          Emitir boleto
          {data?.carteira?.ambiente === "sandbox" && <Teste />}
        </DialogTitle>
      </DialogHeader>

      {isLoading || (!f && !error) ? (
        <p className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{buscandoNf ? "Buscando o endereço na NF do Bling…" : "Carregando…"}</p>
      ) : error ? (
        <Aviso cor="destructive">{(error as Error).message}</Aviso>
      ) : !t || !f ? null : !t.aberto ? (
        <Aviso cor="secondary">Título não está em aberto.</Aviso>
      ) : !data!.carteira ? (
        <Aviso cor="destructive">Não há carteira de cobrança ativa para a {t.empresa}.</Aviso>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm sm:grid-cols-3">
            <Resumo r="Cliente" v={t.nome ?? "—"} largo />
            <Resumo r="CPF/CNPJ" v={t.documento ? formatarDoc(t.documento) : "—"} />
            <Resumo r="Valor" v={brl(Number(t.valor))} forte />
            <Resumo r="Título" v={t.numero ?? "—"} />
            <Resumo r="Multa / juros" v={`${num(data!.carteira.multa_pct)}% · ${num(data!.carteira.juros_mes_pct)}% a.m.`} />
            <Resumo r="Empresa" v={t.empresa === "filial" ? "Filial SP" : "Matriz"} />
          </div>

          {ultimaRecusa && (
            <Aviso cor="destructive">Última tentativa {ultimaRecusa.status === "rejeitado" ? "recusada pelo banco" : "não enviada"}: {ultimaRecusa.erro ?? "sem detalhe"}</Aviso>
          )}

          <Secao titulo="Vencimento">
            <Campo r="Vencimento">
              <DatePickerInput value={f.vencimento} onChange={(v) => set("vencimento", v)} clearable={false} className="h-9 w-full" />
            </Campo>
            {t.vencimento && t.vencimento < hoje && (
              <p className="self-end pb-2 text-xs text-warning-foreground">Título venceu em {dataBR(t.vencimento)}.</p>
            )}
          </Secao>

          <Secao titulo="Endereço do pagador" nota={origem}>
            {!t.documento && (
              <Campo r="CPF/CNPJ" largo>
                <Input value={f.documento} onChange={(e) => set("documento", dig(e.target.value).slice(0, 14))} inputMode="numeric" />
              </Campo>
            )}
            <Campo r="CEP">
              <div className="flex gap-2">
                <Input value={f.cep} onChange={(e) => set("cep", dig(e.target.value).slice(0, 8))} inputMode="numeric"
                  onBlur={() => { if (dig(f.cep).length === 8 && !f.logradouro) void buscarCep(); }} />
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={buscarCep} disabled={buscandoCep} aria-label="Buscar CEP">
                  {buscandoCep ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </Campo>
            <Campo r="Número"><Input value={f.numero} onChange={(e) => set("numero", e.target.value)} placeholder="S/N" /></Campo>
            <Campo r="Logradouro" largo><Input value={f.logradouro} onChange={(e) => set("logradouro", e.target.value)} /></Campo>
            <Campo r="Complemento"><Input value={f.complemento} onChange={(e) => set("complemento", e.target.value)} /></Campo>
            <Campo r="Bairro"><Input value={f.bairro} onChange={(e) => set("bairro", e.target.value)} /></Campo>
            <Campo r="Cidade"><Input value={f.cidade} onChange={(e) => set("cidade", e.target.value)} /></Campo>
            <Campo r="UF"><Input value={f.uf} onChange={(e) => set("uf", e.target.value.toUpperCase().slice(0, 2))} /></Campo>
            <Campo r="E-mail"><Input value={f.email} onChange={(e) => set("email", e.target.value)} type="email" /></Campo>
            <Campo r="Telefone"><Input value={f.fone} onChange={(e) => set("fone", dig(e.target.value).slice(0, 11))} inputMode="tel" /></Campo>
          </Secao>
        </div>
      )}

      <DialogFooter className="gap-2 sm:items-center">
        {f && faltas.length > 0 && <p className="text-xs text-muted-foreground sm:mr-auto">Falta: {faltas.join(", ")}.</p>}
        <Button variant="outline" onClick={onClose}>Fechar</Button>
        <Button onClick={emitir} disabled={!f || !t?.aberto || !data?.carteira || faltas.length > 0 || cobranca.isPending} className="gap-1.5">
          {cobranca.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Barcode className="h-4 w-4" />}
          {cobranca.isPending ? "Registrando…" : "Emitir boleto"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── VER ─────────────────────────────────────────────────────────────────────
function VerBoleto({ id, onEmitirOutro }: { id: string; onEmitirOutro: () => void }) {
  const { data: b, isLoading } = useBoleto(id);
  const cobranca = useCobranca();
  const [qr, setQr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const { data: cart } = useCarteiraTaxas(b?.empresa);

  useEffect(() => { setEmail(b?.email_para ?? b?.pagador?.email ?? ""); }, [b?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!b?.pix_copia_cola) { setQr(null); return; }
    QRCode.toDataURL(b.pix_copia_cola, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(null));
  }, [b?.pix_copia_cola]);

  if (isLoading || !b) {
    return <p className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando…</p>;
  }

  const copiar = (txt: string, o: string) => { void navigator.clipboard.writeText(txt).then(() => toast.success(`${o} copiado`)); };
  const pdf = async (download: boolean) => gerarBoletoPdf({ boleto: b, multaPct: cart?.multa_pct, jurosMesPct: cart?.juros_mes_pct }, { download });

  async function baixarPdf() {
    setGerando(true);
    try { await pdf(true); } catch (e) { toast.error("Não consegui gerar o PDF", { description: String(e) }); }
    finally { setGerando(false); }
  }

  async function enviarEmail() {
    const para = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(para)) { toast.error("E-mail inválido"); return; }
    setEnviando(true);
    try {
      const { base64, nome } = await pdf(false);
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          template: "boleto", to: para,
          data: {
            customer_name: b!.pagador?.nome, valor: brl(Number(b!.valor)), vencimento: dataBR(b!.vencimento),
            linha_digitavel: formatarLinha(b!.linha_digitavel), pix_copia_cola: b!.pix_copia_cola,
          },
          attachments: [{ filename: nome, content: base64 }],
        },
      });
      if (error || !(data as any)?.success) throw new Error((data as any)?.error ?? error?.message ?? "falha no envio");
      await registrarEmail(b!.id, para).catch(() => undefined);
      toast.success(`Boleto enviado para ${para}`);
    } catch (e) {
      toast.error("O e-mail não saiu", { description: e instanceof Error ? e.message : String(e) });
    } finally { setEnviando(false); }
  }

  async function consultar() {
    const r = await cobranca.mutateAsync({ acao: "consultar", boleto_id: b!.id });
    if (r.ok) {
      toast.success(r.status === "pago" ? `Pago${r.pago_em ? ` em ${dataBR(r.pago_em)}` : ""}` : r.status === "cancelado" ? "Baixado no banco" : r.status === "falha" ? "O banco não tem este boleto" : "Registrado no banco");
    } else toast.error("Consulta não concluída", { description: r.erro ?? undefined });
  }

  async function cancelar() {
    const ok = await confirmar({
      titulo: "Cancelar este boleto no Bradesco?",
      mensagem: `${b!.pagador?.nome ?? ""} · ${brl(Number(b!.valor))} · venc. ${dataBR(b!.vencimento)}\n\nO boleto e o Pix deixam de ser pagáveis. O título continua em aberto.`,
      confirmar: "Cancelar boleto", perigo: true,
    });
    if (!ok) return;
    const r = await cobranca.mutateAsync({ acao: "cancelar", boleto_id: b!.id });
    if (r.ok) toast.success("Boleto cancelado no banco");
    else toast.error("O banco não cancelou", { description: r.erro ?? undefined });
  }

  const registrado = b.status === "registrado";
  const linha = formatarLinha(b.linha_digitavel);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          Boleto <Estado b={b} /> {b.ambiente === "sandbox" && <Teste />}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm sm:grid-cols-3">
          <Resumo r="Pagador" v={b.pagador?.nome ?? "—"} largo />
          <Resumo r="CPF/CNPJ" v={formatarDoc(b.pagador?.documento)} />
          <Resumo r="Valor" v={brl(Number(b.valor))} forte />
          <Resumo r="Vencimento" v={dataBR(b.vencimento)} />
          <Resumo r="Nosso número" v={nossoNumeroImpresso(b)} />
          <Resumo r="Nº do documento" v={b.seu_numero} />
          {b.status === "pago" && <Resumo r="Pago" v={`${dataBR(b.pago_em)}${b.valor_pago ? ` · ${brl(Number(b.valor_pago))}` : ""}`} forte />}
        </div>

        {b.status === "indeterminado" || (b.status === "enviando" && Date.now() - new Date(b.enviado_em).getTime() > 5 * 60_000) ? (
          <Aviso cor="warning">{b.erro ?? "O banco não respondeu ao registro. Consulte antes de emitir outro boleto."}</Aviso>
        ) : b.erro ? (
          <Aviso cor="secondary">{b.erro}</Aviso>
        ) : null}

        {linha && (
          <div className="space-y-1">
            <Label className="text-xs">Linha digitável</Label>
            <div className="flex gap-2">
              <Input readOnly value={linha} className="font-mono text-xs" />
              <Button variant="outline" size="icon" className="shrink-0" onClick={() => copiar(dig(linha), "Linha digitável")} aria-label="Copiar linha digitável">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {b.pix_copia_cola && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {qr && <img src={qr} alt="QR Code do Pix" className="h-36 w-36 shrink-0 self-center rounded-md border bg-white p-1.5" />}
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">Pix copia e cola</Label>
              <p className="break-all rounded-md border bg-muted/30 p-2 font-mono text-[11px] leading-snug">{b.pix_copia_cola}</p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copiar(b.pix_copia_cola!, "Pix copia e cola")}>
                <Copy className="h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
          </div>
        )}

        {(registrado || b.status === "pago") && (
          <div className="space-y-1">
            <Label className="text-xs">Enviar ao cliente</Label>
            <div className="flex gap-2">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="e-mail do cliente" />
              <Button variant="outline" className="shrink-0 gap-1.5" onClick={enviarEmail} disabled={enviando}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Enviar
              </Button>
            </div>
            {b.email_enviado_em && (
              <p className="text-xs text-muted-foreground">Enviado para {b.email_para} em {new Date(b.email_enviado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.</p>
            )}
          </div>
        )}
      </div>

      <DialogFooter className="gap-2 sm:items-center">
        {registrado && (
          <Button variant="ghost" className="text-destructive hover:text-destructive sm:mr-auto" onClick={cancelar} disabled={cobranca.isPending}>
            Cancelar boleto
          </Button>
        )}
        {!ehVivo(b) && (
          <Button variant="outline" className="sm:mr-auto" onClick={onEmitirOutro}>Emitir outro</Button>
        )}
        {["registrado", "indeterminado", "enviando"].includes(b.status) && (
          <Button variant="outline" className="gap-1.5" onClick={consultar} disabled={cobranca.isPending}>
            {cobranca.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Consultar no banco
          </Button>
        )}
        {(registrado || b.status === "pago") && (
          <Button className="gap-1.5" onClick={baixarPdf} disabled={gerando}>
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar PDF
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

/** Multa e juros da carteira ativa da empresa — para as instruções do PDF. */
function useCarteiraTaxas(empresa: string | undefined) {
  const [v, setV] = useState<{ multa_pct: number; juros_mes_pct: number } | undefined>();
  useEffect(() => {
    if (!empresa) return;
    (supabase as any).from("fin_cobranca_carteiras").select("multa_pct, juros_mes_pct")
      .eq("empresa", empresa).eq("ativo", true).maybeSingle()
      .then(({ data }: any) => setV(data ?? undefined));
  }, [empresa]);
  return { data: v };
}

// ── peças ───────────────────────────────────────────────────────────────────
const num = (v: number) => String(Number(v)).replace(".", ",");

function Estado({ b }: { b: FinBoleto }) {
  const m: Record<string, [string, string]> = {
    registrado: ["Registrado", "bg-sky-500/10 text-sky-700 dark:text-sky-300"],
    pago: ["Pago", "bg-success/10 text-success"],
    indeterminado: ["Sem resposta", "bg-warning/15 text-warning-foreground"],
    enviando: ["Enviando", "bg-muted text-muted-foreground"],
    cancelado: ["Cancelado", "bg-muted text-muted-foreground"],
    rejeitado: ["Recusado", "bg-destructive/10 text-destructive"],
    falha: ["Não enviado", "bg-muted text-muted-foreground"],
  };
  const [t, c] = m[b.status] ?? [b.status, "bg-muted"];
  return <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", c)}>{t}</span>;
}

const Teste = () => <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground">Teste</span>;

function Resumo({ r, v, forte, largo }: { r: string; v: ReactNode; forte?: boolean; largo?: boolean }) {
  return (
    <div className={cn("min-w-0", largo && "col-span-2 sm:col-span-1")}>
      <p className="text-[11px] text-muted-foreground">{r}</p>
      <p className={cn("truncate", forte && "font-semibold tabular-nums")}>{v}</p>
    </div>
  );
}

function Secao({ titulo, nota, children }: { titulo: string; nota?: string | null; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}{nota && <span className="ml-2 font-normal normal-case tracking-normal">· {nota}</span>}
      </p>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Campo({ r, largo, children }: { r: string; largo?: boolean; children: ReactNode }) {
  return (
    <div className={cn("space-y-1", largo && "sm:col-span-2")}>
      <Label className="text-xs">{r}</Label>
      {children}
    </div>
  );
}

function Aviso({ cor, children }: { cor: "warning" | "destructive" | "secondary"; children: ReactNode }) {
  const cls = {
    warning: "border-warning/40 bg-warning/10",
    destructive: "border-destructive/30 bg-destructive/10",
    secondary: "border-border bg-muted/40",
  }[cor];
  return (
    <div className={`flex gap-2 rounded-md border px-3 py-2 text-xs ${cls}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
