import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Check, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { chamarContasPagar, useCadastrosBling, type ContaBling, type Fornecedor } from "@/lib/contaPagarBling";
import { usePortadores } from "@/lib/baixaDialogo";
import { dataBR, hojeISO } from "@/lib/datas";

// ─────────────────────────────────────────────────────────────────────────────
// "Nova conta a pagar" / "Nova conta a receber" — o formulário do Bling,
// campo a campo, e a conta NASCE no Bling da empresa escolhida (função
// `fin-contas-pagar`); só depois aparece aqui.
//
// ⚠️ O contato é do CADASTRO DO BLING daquela empresa: as duas contas numeram
// do zero, e o Bling exige o contato. Quem não está lá é cadastrado lá.
// ⚠️ Juros mensal (%) e multa (%) são DA FORMA DE PAGAMENTO no Bling (a API da
// conta não tem esses campos): aqui eles aparecem da forma escolhida, só leitura,
// como no Bling ao escolher a forma.
// ⚠️ Parcelada = uma conta por parcela no Bling (a regra do `dividirEmParcelas`
// da função); quem confere é o servidor (`erroDaContaNova`), e ele recusa em vez
// de corrigir.
// ⚠️ "Salvar e dar baixa" cria e devolve a linha criada a quem abriu o diálogo,
// que abre a MESMA baixa de sempre (`DialogoBaixa`) — uma regra de baixa só.
// ─────────────────────────────────────────────────────────────────────────────

interface Parcela { vencimento: string; valor: string }

export interface ContaCriada {
  /** As linhas que nasceram aqui (purchase_payables / receivables / bling2_contas_*), como o banco as devolveu. */
  locais: any[];
  /** A pessoa clicou "Salvar e dar baixa". */
  baixar: boolean;
}

const MAX_HISTORICO = 2000;
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const pct = (v: number | null | undefined) => (v == null ? "0,00" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
// "1.500,50" (com vírgula) é o jeito brasileiro; "1500.50" (só ponto) também vale.
const numero = (s: string) => {
  const t = String(s).trim();
  if (!t) return 0;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
};
const NENHUM = "__nenhum";

function dividir(total: number, n: number, primeiro: string): Parcela[] {
  if (!(n >= 1) || !(total > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(primeiro)) return [];
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  const [a, m, d] = primeiro.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const ultimoDia = new Date(Date.UTC(a, m - 1 + i + 1, 0)).getUTCDate();
    const dt = new Date(Date.UTC(a, m - 1 + i, Math.min(d, ultimoDia)));
    const v = i === n - 1 ? centavos - base * (n - 1) : base;
    return { vencimento: dt.toISOString().slice(0, 10), valor: (v / 100).toFixed(2).replace(".", ",") };
  });
}

const CAMPO_DATA = "h-9 w-full hover:bg-muted/60 hover:text-foreground data-[state=open]:bg-muted/60";

function Campo({ rotulo, obrigatorio, children, className }: { rotulo: string; obrigatorio?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label className="text-xs text-muted-foreground">{rotulo}{obrigatorio && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}

export function NovaConta({ tipo, conta, open, onOpenChange, onCriada }: {
  tipo: "pagar" | "receber"; conta: ContaBling; open: boolean;
  onOpenChange: (v: boolean) => void; onCriada: (c: ContaCriada) => void;
}) {
  const receber = tipo === "receber";
  const empresa = conta === 1 ? "matriz" : "filial SP";
  const papel = receber ? "Cliente" : "Fornecedor";

  const { data: portadores, isLoading: lendoContas } = usePortadores(conta, open);
  const { data: cad, isLoading: lendoCadastros } = useCadastrosBling(conta, tipo, open);

  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Fornecedor[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [contato, setContato] = useState<Fornecedor | null>(null);
  const [valor, setValor] = useState("");
  const [emissao, setEmissao] = useState(hojeISO());
  const [competencia, setCompetencia] = useState(hojeISO());
  const [vencimento, setVencimento] = useState("");
  const [historico, setHistorico] = useState("");
  const [forma, setForma] = useState(NENHUM);
  const [portador, setPortador] = useState(NENHUM);
  const [portadorTocado, setPortadorTocado] = useState(false);
  const [categoria, setCategoria] = useState(NENHUM);
  const [vendedor, setVendedor] = useState(NENHUM);
  const [documento, setDocumento] = useState("");
  const [qtd, setQtd] = useState("1");
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [enviando, setEnviando] = useState<null | "salvar" | "baixar">(null);

  // Abriu: tudo volta ao padrão do Bling (emissão e competência hoje, vencimento vazio).
  useEffect(() => {
    if (!open) return;
    setBusca(""); setAchados([]); setContato(null); setValor(""); setEmissao(hojeISO()); setCompetencia(hojeISO());
    setVencimento(""); setHistorico(""); setForma(NENHUM); setPortador(NENHUM); setPortadorTocado(false);
    setCategoria(NENHUM); setVendedor(NENHUM); setDocumento(""); setQtd("1"); setParcelas([]);
  }, [open, conta, tipo]);

  // A conta financeira mais usada vem sugerida — só quando há histórico: sem uso
  // nenhum (a filial), o "primeiro" da lista alfabética seria escolha de ninguém.
  const listaContas = portadores?.lista ?? [];
  useEffect(() => {
    if (!open || portadorTocado) return;
    if (listaContas[0] && listaContas[0].usos > 0) setPortador(String(listaContas[0].id));
  }, [open, listaContas, portadorTocado]);

  // Busca do contato, depois de uma pausa.
  useEffect(() => {
    if (!open || contato) return;
    const t = busca.trim();
    if (t.length < 2) { setAchados([]); return; }
    let vivo = true;
    const id = setTimeout(async () => {
      setBuscando(true);
      const r = await chamarContasPagar<{ fornecedores: Fornecedor[] }>("fornecedores", conta, { q: t, tipo });
      if (!vivo) return;
      setBuscando(false);
      setAchados(r.ok ? r.fornecedores ?? [] : []);
      if (!r.ok) toast.error(`Não foi possível buscar o ${papel.toLowerCase()}`, { description: r.mensagem });
    }, 350);
    return () => { vivo = false; clearTimeout(id); };
  }, [busca, open, conta, contato, tipo, papel]);

  const n = Math.min(36, Math.max(1, Number(qtd) || 1));
  // Parcelada: as parcelas propostas acompanham valor, quantidade e vencimento.
  useEffect(() => {
    setParcelas(n > 1 ? dividir(numero(valor), n, vencimento) : []);
  }, [valor, n, vencimento]);

  const formaEscolhida = cad?.formas.find((f) => String(f.id) === forma) ?? null;
  const vlr = numero(valor);
  const soma = useMemo(() => parcelas.reduce((s, p) => s + (numero(p.valor) || 0), 0), [parcelas]);
  const atrasada = !!vencimento && vencimento < hojeISO();
  const parcelasOk = n === 1 || (parcelas.length === n && parcelas.every((p) => p.vencimento && numero(p.valor) > 0));
  const podeEnviar = !!contato && vlr > 0 && Number.isFinite(vlr) && !!vencimento && !!emissao && !!competencia
    && historico.length <= MAX_HISTORICO && parcelasOk && !enviando;

  const enviar = async (baixar: boolean) => {
    if (!contato || !podeEnviar) return;
    setEnviando(baixar ? "baixar" : "salvar");
    const id = (v: string) => (v === NENHUM ? null : Number(v));
    const r = await chamarContasPagar<{ ids: number[]; locais: any[] }>("criar", conta, {
      tipo,
      contato_id: contato.bling_id,
      historico: historico.trim(),
      emissao, competencia,
      forma_pagamento_id: id(forma),
      portador_id: id(portador),
      categoria_id: id(categoria),
      vendedor_id: receber ? id(vendedor) : null,
      numero_documento: documento.trim() || null,
      parcelas: n > 1
        ? parcelas.map((p) => ({ vencimento: p.vencimento, valor: numero(p.valor) }))
        : [{ vencimento, valor: vlr }],
    });
    setEnviando(null);
    if (!r.ok) {
      toast.error("O Bling não aceitou — nada foi lançado", { description: r.mensagem });
      return;
    }
    if (r.aviso) toast.warning(r.mensagem ?? "Conta lançada no Bling", { description: r.aviso, duration: 12_000 });
    else toast.success(r.mensagem ?? "Conta lançada no Bling");
    onCriada({ locais: r.locais ?? [], baixar });
    onOpenChange(false);
  };

  const select = (valor: string, onChange: (v: string) => void, opcoes: { id: number; nome: string; usos?: number }[],
    vazio: string, carregando?: boolean, erro?: string) => (
    <>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue placeholder={vazio} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NENHUM}>{vazio}</SelectItem>
          {opcoes.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      {carregando && <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> lendo o Bling…</p>}
      {erro && !opcoes.length && <p className="text-[11px] text-amber-600 dark:text-warning">Não deu para ler do Bling: {erro}</p>}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !enviando && onOpenChange(v)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Conta a {tipo} · {empresa}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm">
          {/* Contato · Valor */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Campo rotulo={papel} obrigatorio>
              {contato ? (
                <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-border px-3">
                  <span className="min-w-0 truncate font-medium" title={contato.cpf_cnpj ?? undefined}>{contato.nome || contato.fantasia}</span>
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => { setContato(null); setBusca(""); }}>Trocar</Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="h-9 pl-8" autoFocus placeholder={`Nome do ${papel.toLowerCase()}, fantasia ou CNPJ`} value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
              )}
              {!contato && busca.trim().length >= 2 && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                  {buscando ? (
                    <p className="p-3 text-xs text-muted-foreground">Buscando…</p>
                  ) : !achados.length ? (
                    <p className="p-3 text-xs text-muted-foreground">Nenhum contato encontrado no Bling da {empresa}.</p>
                  ) : achados.map((f) => (
                    <button key={f.bling_id} type="button" onClick={() => setContato(f)}
                      className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted/50">
                      <span className="min-w-0">
                        <span className="block truncate">{f.nome || f.fantasia}</span>
                        {f.fantasia && f.nome && f.fantasia !== f.nome && <span className="block truncate text-xs text-muted-foreground">{f.fantasia}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{f.cpf_cnpj || ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </Campo>
            <Campo rotulo="Valor (R$)" obrigatorio>
              <Input inputMode="decimal" className="h-9 tabular-nums" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00"
                aria-invalid={!!valor && !(vlr > 0)} />
            </Campo>
          </div>

          {/* Emissão · Competência · Vencimento */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo rotulo="Emissão" obrigatorio>
              <DatePickerInput value={emissao} onChange={setEmissao} clearable={false} className={CAMPO_DATA} />
            </Campo>
            <Campo rotulo="Competência" obrigatorio>
              <DatePickerInput value={competencia} onChange={setCompetencia} clearable={false} className={CAMPO_DATA} />
            </Campo>
            <Campo rotulo={n > 1 ? "1º vencimento" : "Vencimento"} obrigatorio>
              <DatePickerInput value={vencimento} onChange={setVencimento} className={CAMPO_DATA} />
            </Campo>
          </div>

          <Campo rotulo="Histórico">
            <Textarea rows={3} maxLength={MAX_HISTORICO} value={historico} className="resize-none text-sm"
              onChange={(e) => setHistorico(e.target.value)} />
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {historico.length.toLocaleString("pt-BR")} de {MAX_HISTORICO.toLocaleString("pt-BR")} caracteres
            </p>
          </Campo>

          {/* Pagamento */}
          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagamento</p>
            <div className={cn("grid grid-cols-1 gap-3", receber ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              <Campo rotulo="Forma de pagamento">
                {select(forma, setForma, cad?.formas ?? [], "Selecione", lendoCadastros, cad?.erros.formas ?? cad?.erro ?? undefined)}
              </Campo>
              <Campo rotulo="Conta financeira">
                {select(portador, (v) => { setPortadorTocado(true); setPortador(v); }, listaContas, "Selecione", lendoContas, portadores?.erro ?? undefined)}
              </Campo>
              {receber && (
                <Campo rotulo="Vendedor">
                  {select(vendedor, setVendedor, cad?.vendedores ?? [], "Sem vendedor", lendoCadastros, cad?.erros.vendedores)}
                </Campo>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Campo rotulo="Categoria">
                {select(categoria, setCategoria, cad?.categorias ?? [], "Sem categoria", lendoCadastros, cad?.erros.categorias)}
              </Campo>
              <Campo rotulo="Nº documento">
                <Input className="h-9" value={documento} onChange={(e) => setDocumento(e.target.value)} />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <Campo rotulo="Juros mensal (%)">
                <Input className="h-9 cursor-default bg-muted/40 tabular-nums text-muted-foreground" readOnly tabIndex={-1} value={pct(formaEscolhida?.juros)} title="Da forma de pagamento" />
              </Campo>
              <Campo rotulo="Multa (%)">
                <Input className="h-9 cursor-default bg-muted/40 tabular-nums text-muted-foreground" readOnly tabIndex={-1} value={pct(formaEscolhida?.multa)} title="Da forma de pagamento" />
              </Campo>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:grid-cols-5">
              {[
                ["Vencimento original", vencimento ? dataBR(vencimento) : "—"],
                ["Valor original", brl(vlr)],
                ["Juros", atrasada ? "no Bling" : brl(0)],
                ["Multa", atrasada ? "no Bling" : brl(0)],
                ["Valor total", atrasada ? "no Bling" : brl(vlr)],
              ].map(([k, v]) => (
                <div key={k}><dt className="font-medium text-muted-foreground">{k}</dt><dd className="tabular-nums">{v}</dd></div>
              ))}
            </dl>
          </div>

          {/* Ocorrência */}
          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ocorrência</p>
            <div className="flex flex-wrap items-end gap-3">
              <Campo rotulo="Parcelas" className="w-28">
                <Input type="number" min={1} max={36} className="h-9" value={qtd} onChange={(e) => setQtd(e.target.value)} />
              </Campo>
              <p className="pb-2 text-xs text-muted-foreground">
                {n > 1 ? `${n} parcelas mensais` : "Única."}
              </p>
            </div>
            {parcelas.length > 0 && (
              <div className="space-y-2 rounded-md border border-border p-3">
                {parcelas.map((p, i) => (
                  <div key={i} className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                    <span className="text-xs text-muted-foreground">{i + 1}/{parcelas.length}</span>
                    <DatePickerInput value={p.vencimento} clearable={false} className={CAMPO_DATA}
                      onChange={(v) => setParcelas((ps) => ps.map((x, j) => (j === i ? { ...x, vencimento: v } : x)))} />
                    <Input inputMode="decimal" className="h-9 tabular-nums" value={p.valor}
                      onChange={(e) => setParcelas((ps) => ps.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
                  </div>
                ))}
                <p className={cn("text-right text-xs", Math.abs(soma - vlr) > 0.005 ? "text-amber-600 dark:text-warning" : "text-muted-foreground")}>
                  Soma das parcelas: {brl(soma)}{Math.abs(soma - vlr) > 0.005 && " — diferente do valor"}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" disabled={!!enviando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="outline" className="gap-1.5" disabled={!podeEnviar || n > 1} onClick={() => enviar(true)}
            title={n > 1 ? "Dar baixa na hora só em conta única" : undefined}>
            {enviando === "baixar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {enviando === "baixar" ? "Lançando…" : "Salvar e dar baixa"}
          </Button>
          <Button className="gap-1.5" disabled={!podeEnviar} onClick={() => enviar(false)}>
            {enviando === "salvar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {enviando === "salvar" ? "Lançando no Bling…" : n > 1 ? `Salvar ${n} parcelas` : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
