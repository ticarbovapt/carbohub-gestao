import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirmar, useParamUrl } from "@carbo/shell";
import { Building2, Check, ChevronLeft, ChevronRight, Info, Search, Undo2 } from "lucide-react";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePersistedState } from "@/hooks/usePersistedState";
import { baixaLiberada, pedirAoBling2, useBaixaBling2Config, type BaixaBling2Config } from "@/lib/bling2Baixa";
import { chamarContasPagar } from "@/lib/contaPagarBling";
import {
  useBling2Resumo, useBling2ContasPaged, valorEmAberto,
  type Bling2Tipo, type Bling2Conta, type FiltroBling2,
} from "@/hooks/useBling2Contas";
import { hojeISO, somarDias, dataBR, dataHoraBR, diasAte } from "@/lib/datas";

// ─────────────────────────────────────────────────────────────────────────────
// A FILIAL (Bling 2) nas telas de Contas a receber e Contas a pagar.
//
// ⚠️ SEGMENTADA, nunca somada à matriz (decisão do dono do processo, 21/10/2026:
// "pq qualquer coisa só apagamos"). O seletor troca a tela INTEIRA; não existe
// visão "as duas juntas".
// ⚠️ É ESPELHO do Bling da conta 2. A baixa pedida AQUI vai ao Bling 2 NA HORA
// (`bling2-contas`) e só então o espelho muda — nunca uma marca local que a
// próxima sincronização desfaria, calada. Sem o interruptor ligado
// (`fin_bling2_baixa_config`), a tela continua só de leitura.
// ⚠️ Erro de leitura (RLS ainda não liberada, tabela ausente) APARECE com a
// mensagem do banco. Nunca vira lista vazia: "não carregou" e "não há nada" não
// podem ter a mesma cara.
// ─────────────────────────────────────────────────────────────────────────────

export type Empresa = "matriz" | "filial";

/**
 * `?empresa=filial` na URL (padrão vazio = matriz). Trocar de empresa ZERA os
 * outros filtros: status, busca e página de uma não significam nada na outra.
 */
export function useEmpresaUrl(): [Empresa, (e: Empresa) => void] {
  const [params, setParams] = useSearchParams();
  const empresa: Empresa = params.get("empresa") === "filial" ? "filial" : "matriz";
  const trocar = useCallback((e: Empresa) => {
    const p = new URLSearchParams();
    if (e === "filial") p.set("empresa", "filial");
    setParams(p);
  }, [setParams]);
  return [empresa, trocar];
}

export function SeletorEmpresa({ valor, onChange }: { valor: Empresa; onChange: (e: Empresa) => void }) {
  const opcoes: { v: Empresa; l: string }[] = [
    { v: "matriz", l: "Matriz · sistema" },
    { v: "filial", l: "Filial SP · Bling 2" },
  ];
  return (
    <div className="flex w-full rounded-lg border border-border bg-muted/40 p-1 lg:inline-flex lg:w-auto" role="group" aria-label="Empresa">
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={valor === o.v}
          onClick={() => valor !== o.v && onChange(o.v)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors lg:flex-none ${
            valor === o.v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

const ROTULO_SITUACAO = (tipo: Bling2Tipo): Record<string, { rotulo: string; variant: any }> => ({
  "1": { rotulo: "Em aberto", variant: "info" },
  "2": { rotulo: tipo === "receber" ? "Recebido" : "Pago", variant: "success" },
  "3": { rotulo: tipo === "receber" ? "Parcialmente recebido" : "Parcialmente pago", variant: "warning" },
  "4": { rotulo: "Devolvido", variant: "secondary" },
  "5": { rotulo: "Cancelado", variant: "cancelled" },
});

const FILTROS: { v: FiltroBling2; l: string }[] = [
  { v: "fila", l: "Fila: vencidos + 7 dias" },
  { v: "aberto", l: "Em aberto (todos)" },
  { v: "quitados", l: "Quitados" },
  { v: "todos", l: "Todos" },
];

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const aberta = (c: Bling2Conta) => c.situacao === "1" || c.situacao === "3";

export function FilialBling2({ tipo }: { tipo: Bling2Tipo }) {
  const [filtroUrl, setFiltroUrl] = useParamUrl("situacao", "fila");
  const [buscaUrl, setBuscaUrl] = useParamUrl("busca", "", { replace: true });
  const [paginaUrl, setPaginaUrl] = useParamUrl("pagina", "1");
  const [pageSize, setPageSize] = usePersistedState<number>(`fin.filial.${tipo}.pageSize`, 20);

  const filtro = (FILTROS.some((f) => f.v === filtroUrl) ? filtroUrl : "fila") as FiltroBling2;
  const page = Math.max(0, (Number(paginaUrl) || 1) - 1);
  const hoje = hojeISO();
  const quitado = tipo === "receber" ? "Recebido em" : "Pago em";
  const quem = tipo === "receber" ? "Cliente" : "Fornecedor";

  // Busca digitada aqui, gravada na URL depois de uma pausa (replace).
  const [busca, setBusca] = useState(buscaUrl);
  useEffect(() => { setBusca((b) => (b.trim() === buscaUrl ? b : buscaUrl)); }, [buscaUrl]);
  useEffect(() => {
    if (busca.trim() === buscaUrl) return;
    const t = setTimeout(() => { setBuscaUrl(busca.trim() || null); setPaginaUrl(null); }, 350);
    return () => clearTimeout(t);
  }, [busca, buscaUrl, setBuscaUrl, setPaginaUrl]);

  const resumo = useBling2Resumo(tipo);
  const { data: paged, isLoading, isError, error } = useBling2ContasPaged({ tipo, filtro, busca: buscaUrl, page, pageSize });
  const rows = paged?.rows ?? [];
  const total = paged?.count ?? 0;
  const situacoes = ROTULO_SITUACAO(tipo);
  const { data: cfgBaixa } = useBaixaBling2Config();
  const algumaLiberada = !!cfgBaixa && (cfgBaixa.ativo || cfgBaixa.teste_ids.length > 0);

  const from1 = total === 0 ? 0 : page * pageSize + 1;
  const to1 = Math.min(total, (page + 1) * pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const irPara = (n: number) => setPaginaUrl(n <= 0 ? null : String(n + 1));

  const cartoes = resumo.data
    ? [
        { t: "Em aberto", r: resumo.data.aberto, tom: "border-border", txt: "" },
        { t: "Vencido", r: resumo.data.vencido, tom: "border-destructive/30 bg-destructive/5", txt: "text-destructive" },
        { t: `Vence até ${dataBR(somarDias(hoje, 7))}`, r: resumo.data.semana, tom: "border-warning/30 bg-warning/5", txt: "" },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-carbo-blue/30 bg-carbo-blue/5 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-carbo-blue" />
        <div className="space-y-0.5">
          <p>
            <strong>Espelho do Bling da filial (conta 2).</strong>{" "}
            {cfgBaixa?.ativo
              ? "A baixa feita aqui vai na hora para o Bling 2; a feita no Bling chega aqui em até 10 min."
              : algumaLiberada
                ? "Baixa pelo sistema em TESTE: só o título liberado mostra o botão."
                : "Só leitura: a baixa é feita no Bling."}
          </p>
          <p className="text-xs text-muted-foreground">
            Estes títulos não entram nos totais da matriz.
            {resumo.data?.ultimaSincronizacao && <> Última sincronização: {dataHoraBR(resumo.data.ultimaSincronizacao)}.</>}
          </p>
        </div>
      </div>

      {resumo.isError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Não foi possível ler o resumo da filial: {(resumo.error as Error)?.message ?? "erro desconhecido"}
        </p>
      ) : resumo.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando o resumo…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {cartoes.map((c) => (
            <div key={c.t} className={`rounded-xl border p-3 ${c.tom}`}>
              <p className={`text-xs ${c.txt || "text-muted-foreground"}`}>{c.t}</p>
              <p className={`text-lg font-bold break-words ${c.txt}`}>{brl(c.r.valor)}</p>
              <p className="text-[11px] text-muted-foreground">{c.r.qtd} título(s)</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="space-y-1 lg:w-[260px]">
          <Label className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder={`${quem} ou nº do título`} value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Situação</Label>
          <Select value={filtro} onValueChange={(v) => { setFiltroUrl(v); setPaginaUrl(null); }}>
            <SelectTrigger className="w-full lg:w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FILTROS.map((f) => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {filtro === "fila" && !buscaUrl && (
        <p className="-mt-1 text-xs text-muted-foreground">
          Fila: em aberto já vencidos e os que vencem até {dataBR(somarDias(hoje, 7))}, do mais antigo para o mais novo.
        </p>
      )}

      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>{quem}</CarboTableHead>
            <CarboTableHead>Número</CarboTableHead>
            <CarboTableHead>Emissão</CarboTableHead>
            <CarboTableHead>Vencimento</CarboTableHead>
            <CarboTableHead>Valor</CarboTableHead>
            <CarboTableHead>Saldo</CarboTableHead>
            <CarboTableHead>Situação</CarboTableHead>
            <CarboTableHead>{quitado}</CarboTableHead>
            <CarboTableHead>Baixa</CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {isLoading ? (
            <CarboTableRow><CarboTableCell colSpan={9} className="py-8 text-center text-muted-foreground">Carregando...</CarboTableCell></CarboTableRow>
          ) : isError ? (
            <CarboTableRow><CarboTableCell colSpan={9} className="py-8 text-center text-destructive">
              Não foi possível ler os títulos da filial: {(error as Error)?.message ?? "erro desconhecido"}
            </CarboTableCell></CarboTableRow>
          ) : !rows.length ? (
            <CarboTableRow><CarboTableCell colSpan={9} className="py-8 text-center text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <Building2 className="h-8 w-8 text-muted-foreground/50" />
                <span>{filtro === "fila" && !buscaUrl ? "Nada vencido nem vencendo nos próximos 7 dias na filial." : "Nenhum título da filial com esses filtros."}</span>
              </div>
            </CarboTableCell></CarboTableRow>
          ) : (
            rows.map((c) => {
              const sit = c.situacao != null ? situacoes[c.situacao] : undefined;
              const d = aberta(c) ? diasAte(c.vencimento, hoje) : null;
              const vencido = d != null && d < 0;
              return (
                <CarboTableRow key={c.id}>
                  <CarboTableCell className="font-medium">
                    <p>{c.nome || "—"}</p>
                    {c.cb_criado_nome && <p className="text-[11px] font-normal text-muted-foreground">criada aqui por {c.cb_criado_nome.split(" ")[0]}</p>}
                    {c.historico && <p className="max-w-[280px] truncate text-[11px] font-normal text-muted-foreground" title={c.historico}>{c.historico}</p>}
                  </CarboTableCell>
                  <CarboTableCell className="font-mono text-xs text-muted-foreground">{c.numero || "—"}</CarboTableCell>
                  <CarboTableCell className="whitespace-nowrap text-sm text-muted-foreground">{dataBR(c.data_emissao)}</CarboTableCell>
                  <CarboTableCell className="whitespace-nowrap text-sm">
                    {dataBR(c.vencimento)}
                    {d != null && (
                      <span className={`ml-1 text-xs ${vencido ? "text-destructive" : "text-muted-foreground"}`}>
                        ({d === 0 ? "hoje" : d < 0 ? `há ${-d} d` : `em ${d} d`})
                      </span>
                    )}
                  </CarboTableCell>
                  <CarboTableCell className="whitespace-nowrap font-mono">{c.valor == null ? "—" : brl(c.valor)}</CarboTableCell>
                  <CarboTableCell className="whitespace-nowrap font-mono text-muted-foreground">
                    {aberta(c) ? brl(valorEmAberto(c)) : c.saldo == null ? "—" : brl(c.saldo)}
                  </CarboTableCell>
                  <CarboTableCell>
                    {sit ? (
                      <CarboBadge variant={vencido ? "destructive" : sit.variant} dot>{vencido ? `${sit.rotulo} · vencido` : sit.rotulo}</CarboBadge>
                    ) : (
                      // Situação que o código não conhece aparece CRUA — nunca adivinhada.
                      <CarboBadge variant="outline" title="Situação do Bling não reconhecida">{c.situacao ?? "sem situação"}</CarboBadge>
                    )}
                  </CarboTableCell>
                  <CarboTableCell className="whitespace-nowrap text-sm text-muted-foreground">{dataBR(c.data_pagamento)}</CarboTableCell>
                  <CarboTableCell><AcoesDaFilial conta={c} tipo={tipo} cfg={cfgBaixa} /></CarboTableCell>
                </CarboTableRow>
              );
            })
          )}
        </CarboTableBody>
      </CarboTable>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Por página</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPaginaUrl(null); }}>
            <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
          </Select>
          <span>{from1}–{to1} de {total}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" disabled={page <= 0} onClick={() => irPara(Math.max(0, page - 1))}><ChevronLeft className="h-4 w-4" /> Anterior</Button>
          <span className="text-sm text-muted-foreground">{Math.min(page, lastPage) + 1} / {lastPage + 1}</span>
          <Button variant="outline" size="sm" className="gap-1" disabled={page >= lastPage} onClick={() => irPara(Math.min(lastPage, page + 1))}>Próxima <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A baixa de UM título da filial, pela tela.
//   aberto + liberado        → "Dar baixa" (diálogo com a data)
//   baixado AQUI (borderô)   → "por <quem>" + "Desfazer" (só o borderô nosso)
//   última tentativa recusada → "Bling recusou" com o motivo
// ⚠️ Baixa feita NO Bling 2 não ganha "Desfazer" aqui: desfaz-se lá, e o
// espelho acompanha. Desfazer daqui apagaria um borderô que não é nosso.
// ─────────────────────────────────────────────────────────────────────────────
function AcoesDaFilial({ conta: c, tipo, cfg }: { conta: Bling2Conta; tipo: Bling2Tipo; cfg: BaixaBling2Config | undefined }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [dia, setDia] = useState(hojeISO());
  const [enviando, setEnviando] = useState(false);
  const liberada = baixaLiberada(cfg, c.id);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["bling2-contas-paged"] });
    qc.invalidateQueries({ queryKey: ["bling2-contas-resumo"] });
  };
  const verbo = tipo === "receber" ? "recebimento" : "pagamento";

  const baixar = async () => {
    setEnviando(true);
    try {
      const r = await pedirAoBling2("baixar", tipo, c.id, dia);
      if (r.ok) {
        toast.success(r.pulado === "ja_pago_no_bling" ? "Já estava baixado no Bling 2" : "Baixa feita no Bling da filial",
          { description: r.pulado ? r.mensagem : r.bordero ? `Borderô ${r.bordero}` : undefined });
        setAberto(false);
      } else {
        toast.error("O Bling 2 não aceitou a baixa — nada mudou", { description: r.mensagem });
      }
    } finally {
      setEnviando(false);
      recarregar();
    }
  };

  const desfazer = async () => {
    const ok = await confirmar({
      titulo: "Desfazer a baixa no Bling 2?",
      mensagem: `O borderô ${c.cb_baixa_bordero} é apagado no Bling da filial e o título volta a ficar em aberto.`,
      confirmar: "Desfazer", perigo: true,
    });
    if (!ok) return;
    setEnviando(true);
    try {
      const r = await pedirAoBling2("estornar", tipo, c.id);
      if (r.ok) toast.success("Baixa desfeita no Bling da filial");
      else toast.error("Não foi possível desfazer", { description: r.mensagem });
    } finally {
      setEnviando(false);
      recarregar();
    }
  };

  if (c.cb_baixa_bordero && !aberta(c)) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"
          title={`Baixa feita pelo sistema${c.cb_baixa_em ? ` em ${dataHoraBR(c.cb_baixa_em)}` : ""} · borderô ${c.cb_baixa_bordero}`}>
          <Check className="h-3 w-3" /> {c.cb_baixa_por_nome ? `por ${c.cb_baixa_por_nome.split(" ")[0]}` : "pelo sistema"}
        </span>
        {liberada && (
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" disabled={enviando} onClick={desfazer}>
            <Undo2 className="h-3 w-3" /> {enviando ? "Desfazendo…" : "Desfazer"}
          </Button>
        )}
      </div>
    );
  }
  if (!aberta(c)) return <span className="text-xs text-muted-foreground">—</span>;

  // ⚠️ Conta a pagar que NASCEU aqui: excluir vai ao Bling 2 (a função confere
  // que ela está em aberto lá e que foi criada pelo sistema).
  const excluir = async () => {
    const ok = await confirmar({
      titulo: "Excluir esta conta no Bling da filial?",
      mensagem: `${c.nome || "—"} · ${brl(valorEmAberto(c))} · venc. ${dataBR(c.vencimento)}\n\nEla foi criada pelo sistema e é excluída no Bling 2. Se o Bling recusar, nada muda.`,
      confirmar: "Excluir no Bling", perigo: true,
    });
    if (!ok) return;
    setEnviando(true);
    try {
      const r = await chamarContasPagar("excluir", 2, { bling_id: c.bling_id });
      if (r.ok) toast.success("Conta excluída no Bling da filial");
      else toast.error("O Bling não excluiu — nada mudou", { description: r.mensagem });
    } finally {
      setEnviando(false);
      recarregar();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tipo === "pagar" && c.cb_criado_nome && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" disabled={enviando} onClick={excluir}>
          Excluir
        </Button>
      )}
      {c.cb_baixa_erro && <CarboBadge variant="destructive" size="sm" title={c.cb_baixa_erro}>Bling recusou</CarboBadge>}
      {liberada ? (
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={enviando}
          onClick={() => { setDia(hojeISO()); setAberto(true); }}>
          {c.cb_baixa_erro ? "Tentar de novo" : "Dar baixa"}
        </Button>
      ) : !c.cb_baixa_erro && <span className="text-xs text-muted-foreground">no Bling</span>}

      <Dialog open={aberto} onOpenChange={(v) => !enviando && setAberto(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dar baixa no Bling da filial</DialogTitle>
            <DialogDescription>
              {c.nome || "—"} · nº {c.numero || "—"} · {brl(valorEmAberto(c))}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data do {verbo}</Label>
              <Input type="date" value={dia} max={hojeISO()} onChange={(e) => setDia(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              A baixa é feita NO Bling 2 agora, pelo valor em aberto, na conta (portador) do próprio título.
              Se o Bling recusar, nada muda e o motivo aparece aqui.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={enviando} onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={enviando || !dia || dia > hojeISO()} onClick={baixar}>
              {enviando ? "Enviando ao Bling…" : "Dar baixa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
