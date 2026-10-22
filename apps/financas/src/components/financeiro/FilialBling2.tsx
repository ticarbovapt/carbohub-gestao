import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirmar, useParamUrl } from "@carbo/shell";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePersistedState } from "@/hooks/usePersistedState";
import { baixaLiberada, pedirAoBling2, useBaixaBling2Config, type BaixaBling2Config } from "@/lib/bling2Baixa";
import { chamarContasPagar } from "@/lib/contaPagarBling";
import {
  useBling2Resumo, useBling2ContasPaged, valorEmAberto,
  type Bling2Tipo, type Bling2Conta, type FiltroBling2,
} from "@/hooks/useBling2Contas";
import { hojeISO, dataBR, dataHoraBR, diasAte } from "@/lib/datas";
import {
  BarraFiltros, CampoBusca, CelulaVencimento, FiltroSelect, Kpi, KpiGrade, LimparFiltros, LinhaEstado,
  MenuAcoes, Paginacao, SituacaoBadge, Valor, brl, type Situacao,
} from "@/components/financeiro/ContasUI";

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
    { v: "matriz", l: "Matriz" },
    { v: "filial", l: "Filial SP" },
  ];
  return (
    <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Empresa">
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={valor === o.v}
          onClick={() => valor !== o.v && onChange(o.v)}
          className={`min-w-[96px] rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            valor === o.v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

/** A linha logo abaixo do título: empresa à esquerda, de onde vêm os dados à direita. */
export function LinhaEmpresa({ seletor, meta }: { seletor: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      {seletor}
      {meta && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{meta}</div>}
    </div>
  );
}

/** Situação do Bling 2 → a mesma etiqueta das telas da matriz. */
function situacaoDe(c: Bling2Conta, tipo: Bling2Tipo, vencido: boolean): { s: Situacao; texto?: string } {
  if (aberta(c)) return vencido ? { s: "vencido" } : c.situacao === "3" ? { s: "parcial" } : { s: "aberto" };
  switch (c.situacao) {
    case "2": return { s: tipo === "receber" ? "recebido" : "pago" };
    case "4": return { s: "devolvido" };
    case "5": return { s: "cancelado" };
    case "excluido": return { s: "excluido" };
    // Situação que o código não conhece aparece CRUA — nunca adivinhada.
    default: return { s: "desconhecido", texto: c.situacao ?? "sem situação" };
  }
}

const FILTROS: { v: FiltroBling2; l: string }[] = [
  { v: "fila", l: "Fila de trabalho" },
  { v: "aberto", l: "Em aberto" },
  { v: "quitados", l: "Quitados" },
  { v: "todos", l: "Todos" },
];

const aberta = (c: Bling2Conta) => c.situacao === "1" || c.situacao === "3";

export function FilialBling2({ tipo, seletor }: { tipo: Bling2Tipo; seletor: ReactNode }) {
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
  const { data: cfgBaixa } = useBaixaBling2Config();
  const irPara = (n: number) => setPaginaUrl(n <= 0 ? null : String(n + 1));
  const aplicar = (f: FiltroBling2) => { setFiltroUrl(f === "fila" ? null : f); setPaginaUrl(null); };
  const filtrado = filtro !== "fila" || !!buscaUrl;

  const meta = (
    <>
      <RefreshCw className="h-3 w-3" />
      <span>
        Bling 2{resumo.data?.ultimaSincronizacao ? ` · sincronizado ${dataHoraBR(resumo.data.ultimaSincronizacao)}` : ""}
        {cfgBaixa && !cfgBaixa.ativo ? " · baixa só pelo Bling" : ""}
      </span>
    </>
  );

  return (
    <div className="space-y-5">
      <LinhaEmpresa seletor={seletor} meta={meta} />

      {resumo.isError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Não foi possível ler o resumo da filial: {(resumo.error as Error)?.message ?? "erro desconhecido"}
        </p>
      ) : (
        <KpiGrade colunas={3}>
          <Kpi titulo="Em aberto" valor={resumo.data?.aberto.valor ?? 0} qtd={resumo.data?.aberto.qtd ?? 0}
            ativo={filtro === "aberto" && !buscaUrl} onClick={() => aplicar("aberto")} />
          <Kpi titulo="Vencido" tom="perigo" valor={resumo.data?.vencido.valor ?? 0} qtd={resumo.data?.vencido.qtd ?? 0} />
          <Kpi titulo="Hoje e próximos 7 dias" tom="alerta" valor={resumo.data?.semana.valor ?? 0} qtd={resumo.data?.semana.qtd ?? 0} />
        </KpiGrade>
      )}

      <BarraFiltros>
        <CampoBusca valor={busca} onChange={setBusca} placeholder={`Buscar ${quem.toLowerCase()} ou nº`} />
        <FiltroSelect rotulo="Situação" valor={filtro} opcoes={FILTROS} onChange={(v) => aplicar(v as FiltroBling2)} />
        <LimparFiltros visivel={filtrado} onClick={() => { setBusca(""); setBuscaUrl(null); aplicar("fila"); }} />
      </BarraFiltros>

      <div className="space-y-3">
        <CarboTable>
          <CarboTableHeader>
            <CarboTableRow>
              <CarboTableHead>{quem}</CarboTableHead>
              <CarboTableHead>Vencimento</CarboTableHead>
              <CarboTableHead className="text-right [&>div]:justify-end">Valor</CarboTableHead>
              <CarboTableHead>Situação</CarboTableHead>
              <CarboTableHead>{quitado}</CarboTableHead>
              <CarboTableHead className="w-px" />
            </CarboTableRow>
          </CarboTableHeader>
          <CarboTableBody>
            {isLoading ? (
              <LinhaEstado colunas={6} tipo="carregando" texto="Carregando…" />
            ) : isError ? (
              <LinhaEstado colunas={6} tipo="erro" texto={`Não foi possível ler os títulos da filial: ${(error as Error)?.message ?? "erro desconhecido"}`} />
            ) : !rows.length ? (
              <LinhaEstado colunas={6} tipo="vazio"
                texto={filtro === "fila" && !buscaUrl ? "Nada vencido nem vencendo nos próximos 7 dias." : "Nenhum título com esses filtros."} />
            ) : (
              rows.map((c) => {
                const d = aberta(c) ? diasAte(c.vencimento, hoje) : null;
                const sit = situacaoDe(c, tipo, d != null && d < 0);
                const saldo = valorEmAberto(c);
                const parcial = aberta(c) && c.valor != null && Math.abs(saldo - c.valor) > 0.005;
                return (
                  <CarboTableRow key={c.id} className="hover:bg-muted/30">
                    <CarboTableCell className="min-w-[220px] py-3">
                      <p className="font-medium">{c.nome || "—"}</p>
                      <p className="max-w-[420px] truncate text-xs text-muted-foreground" title={c.historico ?? undefined}>
                        {[c.numero && `nº ${c.numero}`, c.historico, c.cb_criado_nome && `criada por ${c.cb_criado_nome.split(" ")[0]}`]
                          .filter(Boolean).join(" · ")}
                      </p>
                    </CarboTableCell>
                    <CarboTableCell className="py-3"><CelulaVencimento data={c.vencimento} dias={d} /></CarboTableCell>
                    <CarboTableCell className="py-3 text-right">
                      <Valor v={parcial ? saldo : c.valor} />
                      {parcial && <span className="block text-xs text-muted-foreground tabular-nums">de {brl(c.valor ?? 0)}</span>}
                    </CarboTableCell>
                    <CarboTableCell className="py-3"><SituacaoBadge s={sit.s} texto={sit.texto} /></CarboTableCell>
                    <CarboTableCell className="py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                      {c.data_pagamento ? dataBR(c.data_pagamento) : "—"}
                    </CarboTableCell>
                    <CarboTableCell className="py-3"><AcoesDaFilial conta={c} tipo={tipo} cfg={cfgBaixa} /></CarboTableCell>
                  </CarboTableRow>
                );
              })
            )}
          </CarboTableBody>
        </CarboTable>

        <Paginacao page={page} pageSize={pageSize} total={total} onPage={irPara}
          onPageSize={(n) => { setPageSize(n); setPaginaUrl(null); }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A baixa de UM título da filial, pela tela.
//   aberto + liberado        → "Pagar"/"Receber" (diálogo com a data)
//   baixado AQUI (borderô)   → quem baixou + "Desfazer baixa" no menu ⋯ (só o borderô nosso)
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

  const acao = tipo === "receber" ? "Receber" : "Pagar";
  const celula = (filhos: ReactNode) => <div className="flex items-center justify-end gap-1">{filhos}</div>;

  if (c.cb_baixa_bordero && !aberta(c)) {
    return celula(
      <>
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
          title={`Baixa feita pelo sistema${c.cb_baixa_em ? ` em ${dataHoraBR(c.cb_baixa_em)}` : ""} · borderô ${c.cb_baixa_bordero}`}>
          <Check className="h-3 w-3 text-success" /> {c.cb_baixa_por_nome ? c.cb_baixa_por_nome.split(" ")[0] : "sistema"}
        </span>
        <MenuAcoes itens={liberada ? [{ l: enviando ? "Desfazendo…" : "Desfazer baixa", onClick: desfazer, perigo: true, disabled: enviando }] : []} />
      </>,
    );
  }
  if (!aberta(c)) return celula(<MenuAcoes itens={[]} />);

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

  return celula(
    <>
      {c.cb_baixa_erro && (
        <span className="whitespace-nowrap text-xs font-medium text-destructive" title={c.cb_baixa_erro}>Bling recusou</span>
      )}
      {liberada ? (
        <Button variant="outline" size="sm" className="h-8 px-3" disabled={enviando}
          onClick={() => { setDia(hojeISO()); setAberto(true); }}>
          {c.cb_baixa_erro ? "Tentar de novo" : acao}
        </Button>
      ) : !c.cb_baixa_erro && <span className="whitespace-nowrap text-xs text-muted-foreground">baixa no Bling</span>}
      <MenuAcoes itens={tipo === "pagar" && c.cb_criado_nome
        ? [{ l: "Excluir no Bling", onClick: excluir, perigo: true, disabled: enviando }] : []} />

      <Dialog open={aberto} onOpenChange={(v) => !enviando && setAberto(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar {verbo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <dl className="space-y-1.5 rounded-lg border border-border p-3">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{tipo === "receber" ? "Cliente" : "Fornecedor"}</dt><dd className="text-right font-medium">{c.nome || "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Título</dt><dd className="tabular-nums">{c.numero || "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Valor em aberto</dt><dd className="font-medium tabular-nums">{brl(valorEmAberto(c))}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Vencimento</dt><dd className="tabular-nums">{dataBR(c.vencimento)}</dd></div>
            </dl>
            <div className="space-y-1.5">
              <Label>Data do {verbo}</Label>
              <Input type="date" value={dia} max={hojeISO()} onChange={(e) => setDia(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">A baixa é feita no Bling da filial. Se o Bling recusar, nada muda.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={enviando} onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={enviando || !dia || dia > hojeISO()} onClick={baixar}>
              {enviando ? "Enviando ao Bling…" : `Confirmar ${verbo}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>,
  );
}
