import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MoreHorizontal, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CarboTableCell, CarboTableRow } from "@/components/ui/carbo-table";
import { dataBR, hojeISO, limitesDoMes, mesAtualISO, somarDias } from "@/lib/datas";

// ─────────────────────────────────────────────────────────────────────────────
// As peças VISUAIS de Contas a pagar e Contas a receber, matriz e filial.
// As quatro telas usam as mesmas — é o que faz elas terem a mesma cara.
// Nada aqui decide regra: cada tela entrega o número e o que fazer no clique.
// ─────────────────────────────────────────────────────────────────────────────

export const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

// ── Cartões do topo ─────────────────────────────────────────────────────────

export type TomKpi = "neutro" | "perigo" | "alerta";

export function KpiGrade({ children, colunas = 4 }: { children: ReactNode; colunas?: 3 | 4 }) {
  return <div className={cn("grid grid-cols-2 gap-3", colunas === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>{children}</div>;
}

export function Kpi({
  titulo, valor, qtd, tom = "neutro", ativo, onClick, nota,
}: {
  titulo: string; valor: number; qtd: number; tom?: TomKpi;
  ativo?: boolean; onClick?: () => void; nota?: string;
}) {
  const cor = tom === "perigo" ? "text-destructive" : tom === "alerta" ? "text-amber-600 dark:text-warning" : "text-foreground";
  const ponto = tom === "perigo" ? "bg-destructive" : tom === "alerta" ? "bg-warning" : "bg-muted-foreground/40";
  const corpo = (
    <>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", ponto)} />
        {titulo}
      </span>
      <span className={cn("mt-1.5 block text-xl font-semibold tabular-nums tracking-tight", cor)}>{brl(valor)}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">
        {qtd} {qtd === 1 ? "título" : "títulos"}{nota ? ` · ${nota}` : ""}
      </span>
    </>
  );
  const base = "rounded-xl border bg-card p-4 text-left";
  if (!onClick) return <div className={cn(base, "border-border")}>{corpo}</div>;
  return (
    <button
      type="button" onClick={onClick} aria-pressed={ativo}
      className={cn(base, "transition-colors hover:border-carbo-green/50",
        ativo ? "border-carbo-green/70 ring-1 ring-carbo-green/40" : "border-border")}
    >
      {corpo}
    </button>
  );
}

// ── Barra de filtros ────────────────────────────────────────────────────────

export function BarraFiltros({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">{children}</div>;
}

export function CampoBusca({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full lg:w-80">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 pl-9 pr-8" />
      {valor && (
        <button type="button" onClick={() => onChange("")} aria-label="Limpar busca"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Select compacto: o rótulo do filtro mora DENTRO do campo, não em cima dele. */
export function FiltroSelect({
  rotulo, valor, opcoes, onChange, largura = "lg:w-auto lg:min-w-[200px]",
}: {
  rotulo: string; valor: string; opcoes: { v: string; l: string }[];
  onChange: (v: string) => void; largura?: string;
}) {
  const atual = opcoes.find((o) => o.v === valor)?.l ?? "";
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger className={cn("h-9 w-full gap-2 whitespace-nowrap", largura)} aria-label={rotulo}>
        <SelectValue>
          <span className="text-muted-foreground">{rotulo}:</span> {atual}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ── Período: mês OU intervalo, num botão só ─────────────────────────────────

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const somarMeses = (ym: string, delta: number) => {
  const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const dataCurta = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a.slice(2)}`; };

export function FiltroPeriodo({
  rotulo = "Vencimento", mes, de, ate, onMes, onIntervalo, onLimpar,
}: {
  rotulo?: string;
  mes: string; de: string; ate: string;
  onMes: (ym: string | null) => void;
  /** Os dois de uma vez — vazio = sem aquela ponta. */
  onIntervalo: (de: string, ate: string) => void;
  onLimpar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"mes" | "intervalo">(de || ate ? "intervalo" : "mes");
  const [ano, setAno] = useState(Number((mes || mesAtualISO()).slice(0, 4)));
  const [deTxt, setDeTxt] = useState(de);
  const [ateTxt, setAteTxt] = useState(ate);
  useEffect(() => {
    if (!aberto) return;
    setModo(de || ate ? "intervalo" : "mes");
    setAno(Number((mes || mesAtualISO()).slice(0, 4)));
    setDeTxt(de); setAteTxt(ate);
  }, [aberto, mes, de, ate]);

  const ativo = !!(mes || de || ate);
  const texto = mes
    ? nomeMes(mes)
    : de || ate
      ? `${de ? dataCurta(de) : "…"} – ${ate ? dataCurta(ate) : "…"}`
      : "Qualquer data";
  const hoje = hojeISO();
  const mesHoje = mesAtualISO();

  const atalho = (d: string, a: string) => { onIntervalo(d, a); setAberto(false); };

  return (
    <div className="flex w-full items-center lg:w-auto">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button" variant="outline"
            className={cn("h-9 flex-1 justify-start gap-2 font-normal hover:bg-muted/60 hover:text-foreground data-[state=open]:bg-muted/60 lg:flex-none",
              mes && "rounded-r-none border-r-0")}
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{rotulo}:</span>
            <span className={cn(mes && "capitalize", ativo && "font-medium")}>{texto}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[300px] p-3">
          <div className="mb-3 grid grid-cols-2 rounded-lg bg-muted p-0.5 text-sm">
            {(["mes", "intervalo"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setModo(m)}
                className={cn("rounded-md py-1.5 font-medium transition-colors",
                  modo === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {m === "mes" ? "Mês" : "Intervalo"}
              </button>
            ))}
          </div>

          {modo === "mes" ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno((a) => a - 1)} aria-label="Ano anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold tabular-nums">{ano}</span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno((a) => a + 1)} aria-label="Próximo ano">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {MESES_CURTOS.map((m, i) => {
                  const ym = `${ano}-${String(i + 1).padStart(2, "0")}`;
                  const sel = ym === mes;
                  return (
                    <button key={m} type="button"
                      onClick={() => { onMes(ym); setAberto(false); }}
                      className={cn("rounded-md py-2 text-sm capitalize transition-colors",
                        sel ? "bg-carbo-green text-white" : "hover:bg-muted",
                        !sel && ym === mesHoje && "font-semibold text-carbo-green")}>
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  De
                  <Input type="date" className="h-9" value={deTxt} onChange={(e) => setDeTxt(e.target.value)} />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Até
                  <Input type="date" className="h-9" value={ateTxt} onChange={(e) => setAteTxt(e.target.value)} />
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => atalho(somarDias(hoje, -30), hoje)}>Últimos 30 dias</Button>
                <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => atalho(hoje, somarDias(hoje, 30))}>Próximos 30 dias</Button>
                <Button type="button" variant="secondary" size="sm" className="h-7 text-xs"
                  onClick={() => { const l = limitesDoMes(somarMeses(mesHoje, -1)); atalho(l.de, l.ate); }}>Mês passado</Button>
              </div>
              <Button type="button" className="h-8 w-full" disabled={!deTxt && !ateTxt}
                onClick={() => atalho(deTxt, ateTxt)}>
                Aplicar
              </Button>
            </div>
          )}

          {ativo && (
            <button type="button" onClick={() => { onLimpar(); setAberto(false); }}
              className="mt-3 w-full border-t border-border pt-2 text-center text-xs text-muted-foreground hover:text-foreground">
              Limpar período
            </button>
          )}
        </PopoverContent>
      </Popover>
      {mes && (
        <div className="flex h-9 items-center rounded-r-md border border-input">
          <button type="button" className="h-full px-2 text-muted-foreground hover:text-foreground" onClick={() => onMes(somarMeses(mes, -1))} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className="h-full px-2 text-muted-foreground hover:text-foreground" onClick={() => onMes(somarMeses(mes, 1))} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function LimparFiltros({ visivel, onClick }: { visivel: boolean; onClick: () => void }) {
  if (!visivel) return null;
  return (
    <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={onClick}>
      <X className="h-3.5 w-3.5" /> Limpar filtros
    </Button>
  );
}

// ── Células da tabela ───────────────────────────────────────────────────────

/** Vencimento com o prazo relativo embaixo, em vez de "(há 42 d)" na frente. */
export function CelulaVencimento({ data, dias }: { data: string | null | undefined; dias: number | null }) {
  const rel = dias == null ? null
    : dias === 0 ? "vence hoje"
    : dias < 0 ? `há ${-dias} ${-dias === 1 ? "dia" : "dias"}`
    : `em ${dias} ${dias === 1 ? "dia" : "dias"}`;
  return (
    <div className="whitespace-nowrap">
      <span className="tabular-nums">{dataBR(data)}</span>
      {rel && (
        <span className={cn("block text-xs",
          dias! < 0 ? "text-destructive" : dias === 0 ? "text-amber-600 dark:text-warning" : "text-muted-foreground")}>
          {rel}
        </span>
      )}
    </div>
  );
}

export type Situacao = "vencido" | "aberto" | "pago" | "recebido" | "parcial" | "cancelado" | "devolvido" | "excluido" | "desconhecido";

const SITUACAO: Record<Situacao, { l: string; cls: string }> = {
  vencido: { l: "Vencido", cls: "bg-destructive/10 text-destructive" },
  aberto: { l: "Em aberto", cls: "bg-carbo-blue/10 text-carbo-blue" },
  pago: { l: "Pago", cls: "bg-success/10 text-success" },
  recebido: { l: "Recebido", cls: "bg-success/10 text-success" },
  parcial: { l: "Parcial", cls: "bg-warning/10 text-amber-600 dark:text-warning" },
  cancelado: { l: "Cancelado", cls: "bg-muted text-muted-foreground" },
  devolvido: { l: "Devolvido", cls: "bg-muted text-muted-foreground" },
  excluido: { l: "Excluído no Bling", cls: "bg-muted text-muted-foreground" },
  desconhecido: { l: "—", cls: "bg-muted text-muted-foreground" },
};

export function SituacaoBadge({ s, texto, title }: { s: Situacao; texto?: string; title?: string }) {
  const c = SITUACAO[s];
  return (
    <span title={title} className={cn("inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", c.cls)}>
      {texto ?? c.l}
    </span>
  );
}

export const Valor = ({ v, fraco }: { v: number | null | undefined; fraco?: boolean }) => (
  <span className={cn("whitespace-nowrap tabular-nums", fraco && "text-muted-foreground")}>{v == null ? "—" : brl(v)}</span>
);

/** Menu "⋯" das ações que não são a principal (cancelar, estornar, excluir). */
export function MenuAcoes({ itens }: { itens: { l: string; onClick: () => void; perigo?: boolean; disabled?: boolean }[] }) {
  const visiveis = itens;
  if (!visiveis.length) return <span className="inline-block h-8 w-8" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Mais ações">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visiveis.map((i) => (
          // ⚠️ Adiado: a confirmação abre DEPOIS de o menu fechar, senão o foco
          // do menu que sai briga com o do diálogo que entra.
          <DropdownMenuItem key={i.l} disabled={i.disabled} onSelect={() => setTimeout(i.onClick, 0)}
            className={cn(i.perigo && "text-destructive focus:text-destructive")}>
            {i.l}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LinhaEstado({ colunas, tipo, texto }: { colunas: number; tipo: "carregando" | "erro" | "vazio"; texto: string }) {
  return (
    <CarboTableRow>
      <CarboTableCell colSpan={colunas}
        className={cn("py-12 text-center text-sm", tipo === "erro" ? "text-destructive" : "text-muted-foreground")}>
        {texto}
      </CarboTableCell>
    </CarboTableRow>
  );
}

// ── Paginação ───────────────────────────────────────────────────────────────

export function Paginacao({
  page, pageSize, total, onPage, onPageSize,
}: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void }) {
  const from1 = total === 0 ? 0 : page * pageSize + 1;
  const to1 = Math.min(total, (page + 1) * pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">{from1}–{to1} de {total}</span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} por página</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 0} onClick={() => onPage(Math.max(0, page - 1))} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[3rem] text-center tabular-nums">{Math.min(page, lastPage) + 1} / {lastPage + 1}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= lastPage} onClick={() => onPage(Math.min(lastPage, page + 1))} aria-label="Próxima página">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
