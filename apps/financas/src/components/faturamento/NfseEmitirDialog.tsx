import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useNfsePreparo, useEmitirNfse, descricaoPadrao, partesDoEndereco, ibgeDoMunicipio,
  NFSE_AMBIENTE_TELA, type NfseEmissao,
} from "@/hooks/useNfseEmissao";

// ─────────────────────────────────────────────────────────────────────────────
// Confirmação da NFS-e do CarboVAPT. Tudo o que o sistema já sabe vem
// preenchido; a pessoa confere, corrige o que precisar e confirma. Nada sai
// para o portal antes do "Emitir".
//
// ⚠️ Nome, CPF/CNPJ e VALOR não são editáveis aqui: o servidor os lê do
// PEDIDO e ignora o que a tela mandaria. Trocar o tomador ou o valor é outra
// venda, não uma correção de nota.
// ⚠️ O indicador da operação NASCE VAZIO, de propósito: ele varia conforme o
// serviço (confirmado pelo Finanças) e padrão escolhido por omissão é como se
// emite com o código errado sem ninguém ter decidido.
// ─────────────────────────────────────────────────────────────────────────────

const C_IND_OP = ["050101", "050102", "050103", "050104"];

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const fmtDoc = (d: string | null) => {
  const s = digitos(d);
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d ?? "—";
};
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQuando = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const ROTULO_STATUS: Record<NfseEmissao["status"], { txt: string; v: "success" | "destructive" | "warning" | "secondary" }> = {
  autorizada: { txt: "Autorizada", v: "success" },
  rejeitada: { txt: "Rejeitada", v: "destructive" },
  falha: { txt: "Não enviada", v: "secondary" },
  indeterminado: { txt: "Sem resposta", v: "warning" },
  enviando: { txt: "Enviando…", v: "secondary" },
};

interface Form {
  cep: string; cMun: string; municipio: string; lgr: string; nro: string; cpl: string; bairro: string;
  fone: string; email: string; cIndOp: string; dCompet: string; descricao: string;
}

export function NfseEmitirDialog({ orderId, onOpenChange }: { orderId: string | null; onOpenChange: (o: boolean) => void }) {
  const { data, isLoading, error } = useNfsePreparo(orderId);
  const emitir = useEmitirNfse();
  const [f, setF] = useState<Form | null>(null);
  const [buscandoIbge, setBuscandoIbge] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => (p ? { ...p, [k]: v } : p));

  // Pré-preenchimento: uma vez por pedido aberto.
  useEffect(() => { setF(null); }, [orderId]);
  useEffect(() => {
    if (!data || f) return;
    const p = data.pedido;
    const end = partesDoEndereco(p.delivery_address);
    const qtd = (p.itens ?? []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    // ⚠️ Já houve tentativa? Reabre com o que FOI ENVIADO, não com o padrão: o
    // reenvio de uma sem resposta tem de sair igual à primeira, e a correção
    // de uma recusada parte do que a pessoa já tinha conferido.
    const ant = data.emissoes.find((e) => e.ambiente === NFSE_AMBIENTE_TELA);
    const t = (ant?.tomador ?? {}) as Record<string, string>;
    setF({
      cep: t.cep ?? digitos(p.delivery_zip), cMun: t.cMun ?? "",
      municipio: [p.delivery_city, p.delivery_state].filter(Boolean).join("/"),
      lgr: t.lgr ?? end.lgr, nro: t.nro ?? end.nro, cpl: t.cpl ?? "", bairro: t.bairro ?? end.bairro,
      fone: t.fone ?? digitos(p.customer_phone), email: t.email ?? p.customer_email ?? "",
      cIndOp: ant?.c_ind_op ?? "", dCompet: ant?.d_compet ?? hojeLocal(),
      descricao: ant?.descricao ?? descricaoPadrao(data.veiculos, qtd),
    });
    if (!t.cMun) void acharIbge(digitos(p.delivery_zip), p.delivery_city ?? "", p.delivery_state ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function acharIbge(cep: string, cidade: string, uf: string) {
    setBuscandoIbge(true);
    const r = await ibgeDoMunicipio(cep, cidade, uf);
    setBuscandoIbge(false);
    if (r) setF((p) => (p ? { ...p, cMun: r.ibge, municipio: `${r.cidade}/${r.uf}` } : p));
  }

  const emissoes = data?.emissoes ?? [];
  const autorizadaProd = emissoes.find((e) => e.ambiente === 1 && e.status === "autorizada");
  // ⚠️ Pendência do MESMO ambiente em que a tela emite: é ela que trava o botão.
  const semResposta = emissoes.find((e) => e.ambiente === NFSE_AMBIENTE_TELA && e.status === "indeterminado");
  const emVoo = emissoes.find((e) => e.ambiente === NFSE_AMBIENTE_TELA && e.status === "enviando");
  const ultimaDoAmbiente = emissoes.find((e) => e.ambiente === NFSE_AMBIENTE_TELA);

  const rodape = useMemo(() => {
    if (!data) return "";
    const p = data.pedido;
    return [
      `PEDIDO: ${p.order_number}.`,
      p.vendedor ? `Vendedor: ${p.vendedor}.` : "",
      p.po_number ? `Pedido de compra do cliente: ${p.po_number}.` : "",
    ].filter(Boolean).join(" ");
  }, [data]);

  const faltas = useMemo(() => {
    if (!f || !data) return [];
    const x: string[] = [];
    const doc = digitos(data.pedido.documento);
    if (doc.length !== 11 && doc.length !== 14) x.push("CPF/CNPJ do cliente no pedido");
    if (!f.cIndOp) x.push("indicador da operação");
    if (!/^\d{7}$/.test(f.cMun)) x.push("código IBGE do município");
    if (digitos(f.cep).length !== 8) x.push("CEP");
    if (!f.lgr.trim()) x.push("logradouro");
    if (!f.bairro.trim()) x.push("bairro");
    if (f.descricao.trim().length < 5) x.push("descrição");
    if (!f.dCompet || f.dCompet > hojeLocal()) x.push("competência (não pode ser futura)");
    return x;
  }, [f, data]);

  async function confirmar(reusar?: NfseEmissao) {
    if (!f || !data) return;
    try {
      const r = await emitir.mutateAsync({
        order_id: data.pedido.id, c_ind_op: f.cIndOp, d_compet: f.dCompet, descricao: f.descricao.trim(),
        tomador: { cep: digitos(f.cep), cMun: f.cMun, lgr: f.lgr, nro: f.nro, cpl: f.cpl, bairro: f.bairro, fone: digitos(f.fone), email: f.email.trim() },
        reusar_id: reusar?.id ?? null,
      });
      const teste = r.ambiente !== "producao" ? " (TESTE — produção restrita, não vale como nota)" : "";
      if (r.status === "autorizada") toast.success(`NFS-e autorizada${r.n_nfse ? ` nº ${r.n_nfse}` : ""}${teste}.`, { duration: 10000 });
      else if (r.status === "indeterminado") toast.warning(r.erro ?? "Sem resposta do portal.", { duration: 15000 });
      else toast.error(`${r.status === "rejeitada" ? "O portal recusou" : "Não enviada"}: ${r.erro ?? ""}`, { duration: 15000 });
    } catch (e) {
      toast.error((e as Error).message, { duration: 12000 });
    }
  }

  const bloqueado = !!autorizadaProd || !!semResposta || !!emVoo || emitir.isPending;

  return (
    <Dialog open={!!orderId} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FileText className="h-4 w-4" /> Emitir NFS-e {data ? `· ${data.pedido.order_number}` : ""}
            {NFSE_AMBIENTE_TELA === 2 && <CarboBadge variant="warning">TESTE · produção restrita</CarboBadge>}
          </DialogTitle>
          <DialogDescription>
            Portal Nacional (gov.br). Confira os dados; nada é enviado antes de <strong>Emitir</strong>.
            {NFSE_AMBIENTE_TELA === 2 && " Por enquanto as notas saem no ambiente de TESTE e não valem como documento fiscal."}
          </DialogDescription>
        </DialogHeader>

        {isLoading || (!f && !error) ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando o pedido…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : data && f ? (
          <div className="space-y-5 text-sm">
            {!data.pedido.so_servico && (
              <Aviso cor="destructive">Este pedido tem produto: a nota dele é NF-e pelo Bling, não NFS-e.</Aviso>
            )}
            {autorizadaProd && (
              <Aviso cor="success">
                Já tem NFS-e autorizada{autorizadaProd.n_nfse ? ` nº ${autorizadaProd.n_nfse}` : ""} · chave {autorizadaProd.chave_acesso}.
              </Aviso>
            )}
            {semResposta && (
              <Aviso cor="warning">
                <p className="font-medium">Não sabemos se a nota da tentativa de {fmtQuando(semResposta.criado_em)} saiu.</p>
                <p className="mt-1">{semResposta.erro}</p>
                <p className="mt-1">
                  Por isso não dá para emitir outra. Reenviar usa o <strong>mesmo número</strong> (DPS {semResposta.serie}/{semResposta.n_dps}):
                  se a primeira já emitiu, o portal recusa a segunda em vez de duplicar.
                </p>
                <CarboButton size="sm" variant="outline" className="mt-2 gap-1" disabled={emitir.isPending || faltas.length > 0}
                  onClick={() => confirmar(semResposta)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reenviar com o mesmo número
                </CarboButton>
              </Aviso>
            )}
            {emVoo && <Aviso cor="secondary">Há uma emissão em andamento (iniciada {fmtQuando(emVoo.criado_em)}). Aguarde.</Aviso>}
            {!semResposta && ultimaDoAmbiente && (ultimaDoAmbiente.status === "rejeitada" || ultimaDoAmbiente.status === "falha") && (
              <Aviso cor="destructive">
                <p className="font-medium">A última tentativa ({fmtQuando(ultimaDoAmbiente.criado_em)}) {ultimaDoAmbiente.status === "rejeitada" ? "foi recusada pelo portal" : "não foi enviada"}:</p>
                <p className="mt-1 break-words">{ultimaDoAmbiente.erro}</p>
              </Aviso>
            )}

            <Secao titulo="Tomador">
              <Campo rotulo="Nome / Razão social"><p className="font-medium">{data.pedido.customer_name ?? "—"}</p></Campo>
              <Campo rotulo="CPF / CNPJ"><p className="font-medium">{fmtDoc(data.pedido.documento)}</p></Campo>
              <Campo rotulo="CEP">
                <div className="flex gap-1.5">
                  <Input value={f.cep} onChange={(e) => set("cep", digitos(e.target.value).slice(0, 8))} inputMode="numeric" />
                  <CarboButton size="sm" variant="outline" title="Buscar o município pelo CEP"
                    onClick={() => acharIbge(f.cep, data.pedido.delivery_city ?? "", data.pedido.delivery_state ?? "")}>
                    {buscandoIbge ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  </CarboButton>
                </div>
              </Campo>
              <Campo rotulo="Código IBGE do município" dica={f.municipio || undefined}>
                <Input value={f.cMun} onChange={(e) => set("cMun", digitos(e.target.value).slice(0, 7))} inputMode="numeric"
                  placeholder={buscandoIbge ? "buscando…" : "7 dígitos"} />
              </Campo>
              <Campo rotulo="Logradouro" largo><Input value={f.lgr} onChange={(e) => set("lgr", e.target.value)} /></Campo>
              <Campo rotulo="Número"><Input value={f.nro} onChange={(e) => set("nro", e.target.value)} placeholder="S/N" /></Campo>
              <Campo rotulo="Complemento"><Input value={f.cpl} onChange={(e) => set("cpl", e.target.value)} /></Campo>
              <Campo rotulo="Bairro"><Input value={f.bairro} onChange={(e) => set("bairro", e.target.value)} /></Campo>
              <Campo rotulo="Telefone"><Input value={f.fone} onChange={(e) => set("fone", digitos(e.target.value).slice(0, 20))} inputMode="tel" /></Campo>
              <Campo rotulo="E-mail" largo><Input value={f.email} onChange={(e) => set("email", e.target.value)} type="email" /></Campo>
            </Secao>

            <Secao titulo="Serviço">
              <Campo rotulo="Indicador da operação *" dica="O mesmo campo do emissor web (IBS/CBS). Varia conforme o serviço.">
                <Select value={f.cIndOp} onValueChange={(v) => set("cIndOp", v)}>
                  <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                  <SelectContent>
                    {C_IND_OP.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo rotulo="Competência">
                <Input type="date" value={f.dCompet} max={hojeLocal()} onChange={(e) => set("dCompet", e.target.value)} />
              </Campo>
              <Campo rotulo="Descrição do serviço" largo
                dica={data.veiculos.some((v) => v.placa) ? undefined : "A OS ainda não tem placa registrada — os veículos entram quando o Carbox executar. Pode escrever à mão."}>
                <Textarea rows={3} value={f.descricao} maxLength={2000} onChange={(e) => set("descricao", e.target.value)} />
              </Campo>
              <Campo rotulo="Informações complementares (automático)" largo dica="É por este rodapé que a nota volta ao pedido.">
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs">{rodape}</p>
              </Campo>
            </Secao>

            <Secao titulo="Valores">
              <Campo rotulo="Valor do serviço"><p className="font-semibold">{fmtBRL(Number(data.pedido.total || 0))}</p></Campo>
              <Campo rotulo="Local da prestação"><p>Natal/RN · trib. nacional 14.01.01 · NBS 1.2001.31.10</p></Campo>
              <p className="sm:col-span-2 text-xs text-muted-foreground">IBS e CBS são calculados pelo portal. ISSQN não retido.</p>
            </Secao>

            {emissoes.length > 0 && (
              <Secao titulo="Tentativas">
                <ul className="sm:col-span-2 space-y-1.5 text-xs">
                  {emissoes.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2">
                      <CarboBadge size="sm" variant={ROTULO_STATUS[e.status].v}>{ROTULO_STATUS[e.status].txt}</CarboBadge>
                      <span className="text-muted-foreground">{fmtQuando(e.criado_em)}</span>
                      <span>DPS {e.serie}/{e.n_dps}</span>
                      {e.ambiente === 2 && <CarboBadge size="sm" variant="outline">teste</CarboBadge>}
                      {e.n_nfse && <span className="font-medium">NFS-e {e.n_nfse}</span>}
                    </li>
                  ))}
                </ul>
              </Secao>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          {faltas.length > 0 && !bloqueado && (
            <p className="text-xs text-muted-foreground sm:mr-auto">Falta: {faltas.join(", ")}.</p>
          )}
          <CarboButton variant="outline" onClick={() => onOpenChange(false)}>Fechar</CarboButton>
          <CarboButton disabled={!data?.pedido.so_servico || bloqueado || faltas.length > 0} onClick={() => confirmar()} className="gap-1">
            {emitir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {emitir.isPending ? "Emitindo…" : NFSE_AMBIENTE_TELA === 2 ? "Emitir (teste)" : "Emitir NFS-e"}
          </CarboButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{titulo}</p>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}

function Campo({ rotulo, dica, largo, children }: { rotulo: string; dica?: string; largo?: boolean; children: ReactNode }) {
  return (
    <div className={largo ? "sm:col-span-2 space-y-1" : "space-y-1"}>
      <Label className="text-xs">{rotulo}</Label>
      {children}
      {dica && <p className="text-[11px] text-muted-foreground">{dica}</p>}
    </div>
  );
}

function Aviso({ cor, children }: { cor: "success" | "warning" | "destructive" | "secondary"; children: ReactNode }) {
  const cls = {
    success: "border-success/30 bg-success/10",
    warning: "border-warning/40 bg-warning/10",
    destructive: "border-destructive/30 bg-destructive/10",
    secondary: "border-border bg-muted/40",
  }[cor];
  return (
    <div className={`rounded-md border px-3 py-2 text-xs flex gap-2 ${cls}`}>
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
