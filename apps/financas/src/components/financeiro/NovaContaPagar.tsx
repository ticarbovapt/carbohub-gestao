import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { chamarContasPagar, type ContaBling, type Fornecedor, type Portador } from "@/lib/contaPagarBling";
import { hojeISO } from "@/lib/datas";

// ─────────────────────────────────────────────────────────────────────────────
// "Nova conta a pagar" — nasce NO BLING da empresa escolhida e só depois
// aparece aqui (função `fin-contas-pagar`).
//
// ⚠️ O fornecedor é do CADASTRO DO BLING daquela empresa: as duas contas
// numeram do zero, e o Bling exige o contato. Quem não está lá é cadastrado lá.
// ⚠️ Parcelada = uma conta por parcela no Bling. A tela PROPÕE as parcelas
// (total ÷ N, mês a mês, sobra de centavo na última — a mesma regra do
// `dividirEmParcelas` da função) e deixa editar cada uma; quem confere é o
// servidor (`erroDaContaNova`), e ele recusa em vez de corrigir.
// ─────────────────────────────────────────────────────────────────────────────

interface Parcela { vencimento: string; valor: string }

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
// "1.500,50" (com vírgula) é o jeito brasileiro; "1500.50" (só ponto) também vale.
const numero = (s: string) => {
  const t = String(s).trim();
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
};

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

export function NovaContaPagar({ conta, open, onOpenChange, onCriada }: {
  conta: ContaBling; open: boolean; onOpenChange: (v: boolean) => void; onCriada: () => void;
}) {
  const empresa = conta === 1 ? "matriz" : "filial SP";
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Fornecedor[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);
  const [portadores, setPortadores] = useState<Portador[]>([]);
  const [portador, setPortador] = useState<string>("");
  const [avisoPortador, setAvisoPortador] = useState<string | null>(null);
  const [historico, setHistorico] = useState("");
  const [documento, setDocumento] = useState("");
  const [total, setTotal] = useState("");
  const [qtd, setQtd] = useState("1");
  const [primeiro, setPrimeiro] = useState(hojeISO());
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [enviando, setEnviando] = useState(false);

  // Abriu: zera e lê os portadores daquela empresa (os mais usados primeiro).
  useEffect(() => {
    if (!open) return;
    setBusca(""); setAchados([]); setFornecedor(null); setHistorico(""); setDocumento("");
    setTotal(""); setQtd("1"); setPrimeiro(hojeISO()); setParcelas([]); setAvisoPortador(null);
    let vivo = true;
    chamarContasPagar<{ portadores: Portador[]; erro_portadores: string | null }>("opcoes", conta).then((r) => {
      if (!vivo) return;
      if (!r.ok) { setAvisoPortador(r.mensagem ?? "Não foi possível ler as contas do Bling."); return; }
      const lista = r.portadores ?? [];
      setPortadores(lista);
      // Só sugere quando há histórico: sem uso nenhum (a filial), a lista sai em
      // ordem alfabética e o "primeiro" seria AMAZON — escolha que ninguém fez.
      setPortador(lista[0] && lista[0].usos > 0 ? String(lista[0].id) : "");
      if (r.erro_portadores) setAvisoPortador("O Bling não devolveu os nomes das contas — aparecem pelo número.");
    });
    return () => { vivo = false; };
  }, [open, conta]);

  // Busca do fornecedor, depois de uma pausa.
  useEffect(() => {
    if (!open || fornecedor) return;
    const t = busca.trim();
    if (t.length < 2) { setAchados([]); return; }
    let vivo = true;
    const id = setTimeout(async () => {
      setBuscando(true);
      const r = await chamarContasPagar<{ fornecedores: Fornecedor[] }>("fornecedores", conta, { q: t });
      if (!vivo) return;
      setBuscando(false);
      setAchados(r.ok ? r.fornecedores ?? [] : []);
      if (!r.ok) toast.error("Não foi possível buscar o fornecedor", { description: r.mensagem });
    }, 350);
    return () => { vivo = false; clearTimeout(id); };
  }, [busca, open, conta, fornecedor]);

  // As parcelas propostas acompanham total, quantidade e 1º vencimento.
  useEffect(() => {
    setParcelas(dividir(numero(total), Math.min(36, Math.max(1, Number(qtd) || 1)), primeiro));
  }, [total, qtd, primeiro]);

  const soma = useMemo(() => parcelas.reduce((s, p) => s + (numero(p.valor) || 0), 0), [parcelas]);
  const podeEnviar = !!fornecedor && historico.trim().length > 0 && parcelas.length > 0
    && parcelas.every((p) => p.vencimento && numero(p.valor) > 0) && !enviando;

  const enviar = async () => {
    if (!fornecedor) return;
    setEnviando(true);
    const r = await chamarContasPagar<{ ids: number[] }>("criar", conta, {
      contato_id: fornecedor.bling_id,
      portador_id: portador ? Number(portador) : null,
      historico: historico.trim(),
      numero_documento: documento.trim() || null,
      parcelas: parcelas.map((p) => ({ vencimento: p.vencimento, valor: numero(p.valor) })),
    });
    setEnviando(false);
    if (!r.ok) {
      toast.error("O Bling não aceitou — nada foi criado", { description: r.mensagem });
      return;
    }
    toast.success(r.mensagem ?? "Conta criada no Bling", { description: r.aviso });
    onCriada();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !enviando && onOpenChange(v)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova conta a pagar · {empresa}</DialogTitle>
          <DialogDescription>Criada no Bling da {empresa} agora; aparece aqui assim que o Bling aceitar.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1 text-sm">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Fornecedor (cadastro do Bling)</Label>
            {fornecedor ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{fornecedor.nome || fornecedor.fantasia}</p>
                  {fornecedor.cpf_cnpj && <p className="text-xs text-muted-foreground">{fornecedor.cpf_cnpj}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setFornecedor(null); setBusca(""); }}>Trocar</Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-8" autoFocus placeholder="Nome, fantasia ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                {busca.trim().length >= 2 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                    {buscando ? (
                      <p className="p-3 text-xs text-muted-foreground">Buscando…</p>
                    ) : !achados.length ? (
                      <p className="p-3 text-xs text-muted-foreground">Nenhum contato com esse nome ou documento no Bling da {empresa}. Cadastre lá primeiro.</p>
                    ) : achados.map((f) => (
                      <button key={f.bling_id} type="button" onClick={() => setFornecedor(f)}
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
              </>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Histórico (do que é a conta)</Label>
            <Input value={historico} maxLength={250} onChange={(e) => setHistorico(e.target.value)} placeholder="Ex.: Aluguel do galpão — outubro" />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Conta de saída (portador)</Label>
              <Select value={portador || "nenhum"} onValueChange={(v) => setPortador(v === "nenhum" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
                <SelectContent>
                  {portadores.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.nome}{p.usos ? ` · ${p.usos} contas` : ""}</SelectItem>
                  ))}
                  <SelectItem value="nenhum">Sem conta definida</SelectItem>
                </SelectContent>
              </Select>
              {avisoPortador && <p className="text-[11px] text-warning">{avisoPortador}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nº do documento (opcional)</Label>
              <Input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Boleto, NF…" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Valor total</Label>
              <Input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Parcelas</Label>
              <Input type="number" min={1} max={36} value={qtd} onChange={(e) => setQtd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">1º vencimento</Label>
              <Input type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} />
            </div>
          </div>

          {parcelas.length > 0 && (
            <div className="space-y-2 rounded-md border border-border p-3">
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2">
                  <span className="text-xs text-muted-foreground">{i + 1}/{parcelas.length}</span>
                  <Input type="date" value={p.vencimento}
                    onChange={(e) => setParcelas((ps) => ps.map((x, j) => (j === i ? { ...x, vencimento: e.target.value } : x)))} />
                  <Input inputMode="decimal" value={p.valor}
                    onChange={(e) => setParcelas((ps) => ps.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
                </div>
              ))}
              <p className={`text-right text-xs ${Math.abs(soma - numero(total)) > 0.005 ? "text-warning" : "text-muted-foreground"}`}>
                Soma das parcelas: {brl(soma)}
                {Math.abs(soma - numero(total)) > 0.005 && " — diferente do total digitado"}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={enviando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!podeEnviar} onClick={enviar} className="gap-1.5">
            <Check className="h-4 w-4" /> {enviando ? "Criando no Bling…" : parcelas.length > 1 ? `Criar ${parcelas.length} parcelas no Bling` : "Criar no Bling"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
