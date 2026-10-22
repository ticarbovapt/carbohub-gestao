import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { dataBR, hojeISO } from "@/lib/datas";
import type { ContaBling } from "@/lib/contaPagarBling";
import {
  calcularBaixa, lerReais, reaisTxt, useDoTituloNoBling, usePortadores, MAX_HISTORICO,
  type AjustesTela, type TabelaEspelho,
} from "@/lib/baixaDialogo";

// ─────────────────────────────────────────────────────────────────────────────
// O diálogo de baixa das QUATRO telas (pagar/receber × matriz/filial), no
// desenho da "Baixa de lançamentos" do Bling, que é o que o time já conhece:
// a CONTA (banco) por onde o dinheiro passou, a data, juros/multa/desconto/
// tarifa e o valor de fato. Valor menor que o saldo = baixa PARCIAL.
// ⚠️ A conta é o que faz o extrato do banco no Bling bater: sem ela a baixa
// cai na conta do título (ou na padrão), e o "pagos pelo Bradesco" mente.
// ─────────────────────────────────────────────────────────────────────────────

const DO_TITULO = "__titulo";

export interface TituloParaBaixa {
  nome: string;
  numero?: string | null;
  vencimento?: string | null;
  /** Valor original do título. */
  valor: number;
  /** O que ainda está em aberto (igual ao valor, salvo parcial anterior). */
  saldo: number;
  /** O histórico do título, quando a tela já o tem (a reserva do que vem do espelho). */
  historico?: string | null;
}

export interface ConfirmacaoBaixa { dia: string; ajustes: AjustesTela; parcial: boolean }

export function DialogoBaixa({
  open, onOpenChange, tipo, conta, espelho, blingId, titulo, podeParcial, motivoSemParcial, aviso, enviando, onConfirmar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: "pagar" | "receber";
  conta: ContaBling;
  espelho: TabelaEspelho;
  blingId?: number | null;
  titulo: TituloParaBaixa | null;
  /** Parcial só existe quando a baixa vai ao Bling (é ele que guarda o saldo). */
  podeParcial: boolean;
  motivoSemParcial?: string;
  aviso?: ReactNode;
  enviando: boolean;
  onConfirmar: (c: ConfirmacaoBaixa) => void;
}) {
  const verbo = tipo === "receber" ? "recebimento" : "pagamento";
  const { data: portadores, isLoading: carregandoContas } = usePortadores(conta, open);
  const { data: noBling } = useDoTituloNoBling(espelho, blingId, open);
  const doTitulo = noBling?.portador ?? null;

  const [dia, setDia] = useState(hojeISO());
  const [contaSel, setContaSel] = useState<string>(DO_TITULO);
  const [txt, setTxt] = useState({ juros: "", multa: "", desconto: "", tarifa: "" });
  const [valorTxt, setValorTxt] = useState("");
  const [valorEditado, setValorEditado] = useState(false);
  const [historico, setHistorico] = useState("");
  const [historicoEditado, setHistoricoEditado] = useState(false);

  // Abriu com outro título: tudo volta ao padrão.
  useEffect(() => {
    if (!open || !titulo) return;
    setDia(hojeISO());
    setContaSel(DO_TITULO);
    setTxt({ juros: "", multa: "", desconto: "", tarifa: "" });
    setValorTxt(reaisTxt(titulo.saldo));
    setValorEditado(false);
    setHistorico((titulo.historico ?? "").slice(0, MAX_HISTORICO));
    setHistoricoEditado(false);
  }, [open, titulo?.nome, titulo?.saldo]);   // eslint-disable-line react-hooks/exhaustive-deps

  // A conta do título, quando o Bling a tem, já vem escolhida.
  useEffect(() => {
    if (open && doTitulo && contaSel === DO_TITULO) setContaSel(String(doTitulo));
  }, [open, doTitulo]);   // eslint-disable-line react-hooks/exhaustive-deps

  // O histórico do título no Bling, como lá: vem escrito, e a pessoa completa.
  useEffect(() => {
    if (open && noBling?.historico && !historicoEditado) setHistorico(noBling.historico.slice(0, MAX_HISTORICO));
  }, [open, noBling?.historico]);   // eslint-disable-line react-hooks/exhaustive-deps

  const n = {
    juros: lerReais(txt.juros), multa: lerReais(txt.multa),
    desconto: lerReais(txt.desconto), tarifa: lerReais(txt.tarifa),
  };
  const automatico = titulo ? Math.round((titulo.saldo + (n.juros || 0) + (n.multa || 0) - (n.desconto || 0)) * 100) / 100 : 0;
  // Enquanto ninguém mexeu no valor, ele acompanha juros/multa/desconto, como no Bling.
  useEffect(() => {
    if (!valorEditado && titulo) setValorTxt(reaisTxt(Math.max(automatico, 0)));
  }, [automatico, valorEditado]);   // eslint-disable-line react-hooks/exhaustive-deps

  const valor = lerReais(valorTxt);
  const calc = titulo ? calcularBaixa(titulo.saldo, { ...n, valor }) : { erro: "" };
  const erroParcial = "parcial" in calc && calc.parcial && !podeParcial
    ? (motivoSemParcial ?? "Baixa parcial só com o envio ao Bling ligado.") : null;

  const lista = portadores?.lista ?? [];
  const opcoes = useMemo(() => {
    const o = lista.map((p) => ({ v: String(p.id), l: p.nome }));
    // A conta do título, mesmo fora da lista lida (ex.: lista falhou), não some.
    if (doTitulo && !o.some((x) => x.v === String(doTitulo))) o.unshift({ v: String(doTitulo), l: `Conta do título (${doTitulo})` });
    return o;
  }, [lista, doTitulo]);
  const nomeConta = (v: string) => opcoes.find((o) => o.v === v)?.l ?? null;

  const podeConfirmar = !!titulo && !enviando && !!dia && dia <= hojeISO() && !("erro" in calc) && !erroParcial;

  const confirmar = () => {
    if (!titulo || "erro" in calc) return;
    const portador = contaSel === DO_TITULO ? null : Number(contaSel);
    onConfirmar({
      dia,
      parcial: calc.parcial,
      ajustes: {
        portador_id: portador, portador_nome: portador ? nomeConta(contaSel) : null,
        juros: n.juros, multa: n.multa, desconto: n.desconto, tarifa: n.tarifa, valor,
        historico: historico.trim() || null,
      },
    });
  };

  const campo = (k: keyof typeof txt, rotulo: string) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{rotulo}</Label>
      <Input inputMode="decimal" placeholder="0,00" value={txt[k]} className="h-9 tabular-nums"
        aria-invalid={Number.isNaN(n[k])}
        onChange={(e) => setTxt((t) => ({ ...t, [k]: e.target.value }))} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !enviando && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar {verbo}</DialogTitle>
        </DialogHeader>
        {titulo && (
          <form noValidate className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); if (podeConfirmar) confirmar(); }}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-border p-3">
              <dt className="text-muted-foreground">{tipo === "receber" ? "Cliente" : "Fornecedor"}</dt>
              <dd className="truncate text-right font-medium" title={titulo.nome}>{titulo.nome}</dd>
              {titulo.numero && <><dt className="text-muted-foreground">Documento</dt><dd className="text-right tabular-nums">{titulo.numero}</dd></>}
              {titulo.vencimento && <><dt className="text-muted-foreground">Vencimento</dt><dd className="text-right tabular-nums">{dataBR(titulo.vencimento)}</dd></>}
              <dt className="text-muted-foreground">Valor original</dt>
              <dd className="text-right tabular-nums">R$ {reaisTxt(titulo.valor)}</dd>
              {Math.abs(titulo.saldo - titulo.valor) > 0.005 && (
                <><dt className="text-muted-foreground">Em aberto</dt><dd className="text-right font-medium tabular-nums">R$ {reaisTxt(titulo.saldo)}</dd></>
              )}
            </dl>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Conta (banco)</Label>
                <Select value={contaSel} onValueChange={setContaSel}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
                  <SelectContent>
                    {!doTitulo && <SelectItem value={DO_TITULO}>A do título no Bling</SelectItem>}
                    {opcoes.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                  </SelectContent>
                </Select>
                {carregandoContas && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> lendo as contas do Bling…</p>}
                {portadores?.erro && !lista.length && <p className="text-xs text-amber-600 dark:text-warning">Não deu para ler as contas do Bling — vale a do título.</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data do {verbo}</Label>
                <DatePickerInput value={dia} onChange={setDia} disableFuture clearable={false}
                  className="h-9 w-full hover:bg-muted/60 hover:text-foreground data-[state=open]:bg-muted/60" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {campo("juros", "Juros")}
              {campo("multa", "Multa")}
              {campo("desconto", "Desconto")}
              {campo("tarifa", "Tarifa")}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Valor {tipo === "receber" ? "recebido" : "pago"}</Label>
                {valorEditado && Math.abs(valor - automatico) > 0.005 && (
                  <button type="button" className="text-xs text-carbo-green hover:underline"
                    onClick={() => { setValorEditado(false); setValorTxt(reaisTxt(automatico)); }}>
                    usar R$ {reaisTxt(automatico)}
                  </button>
                )}
              </div>
              <Input inputMode="decimal" value={valorTxt} className="h-10 text-base font-medium tabular-nums"
                onChange={(e) => { setValorEditado(true); setValorTxt(e.target.value); }} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Histórico</Label>
              <Textarea rows={3} maxLength={MAX_HISTORICO} value={historico} className="resize-none text-sm"
                placeholder="Ex.: Ref. ao pedido 219 | pix"
                onChange={(e) => { setHistoricoEditado(true); setHistorico(e.target.value); }} />
              <p className="text-right text-[11px] tabular-nums text-muted-foreground">
                {historico.length.toLocaleString("pt-BR")} de {MAX_HISTORICO.toLocaleString("pt-BR")} caracteres
              </p>
            </div>

            <div className={cn("rounded-md px-3 py-2 text-xs",
              "erro" in calc || erroParcial ? "bg-destructive/10 text-destructive"
                : calc.parcial ? "bg-warning/10 text-amber-700 dark:text-warning" : "bg-success/10 text-success")}>
              {"erro" in calc ? calc.erro
                : erroParcial ?? (calc.parcial
                  ? `Baixa parcial — ficam R$ ${reaisTxt(calc.restante)} em aberto.`
                  : "Quita o título.")}
            </div>

            {aviso && <div className="text-xs text-muted-foreground">{aviso}</div>}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={enviando} onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={!podeConfirmar} className="gap-1.5">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {enviando ? "Enviando…" : `Confirmar ${verbo}`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
