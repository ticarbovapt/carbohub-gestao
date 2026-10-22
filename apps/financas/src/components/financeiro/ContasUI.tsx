import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, MoreHorizontal, Search, X } from "lucide-react";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useParamUrl } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CarboTableCell, CarboTableHead, CarboTableRow } from "@/components/ui/carbo-table";
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
// ⚠️ Dia ISO ↔ Date ao MEIO-DIA local: à meia-noite um fuso negativo jogaria
// a data para o dia anterior.
const paraDate = (iso: string) => (iso ? new Date(`${iso}T12:00:00`) : undefined);
const paraIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
  const [faixa, setFaixa] = useState<DateRange | undefined>(undefined);
  useEffect(() => {
    if (!aberto) return;
    setModo(de || ate ? "intervalo" : "mes");
    setAno(Number((mes || mesAtualISO()).slice(0, 4)));
    setFaixa(de || ate ? { from: paraDate(de || ate), to: paraDate(ate) } : undefined);
  }, [aberto, mes, de, ate]);
  const deSel = faixa?.from ? paraIso(faixa.from) : "";
  const ateSel = faixa?.to ? paraIso(faixa.to) : "";

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
              {/* Clique no primeiro dia e depois no último — sem digitar. */}
              <p className="text-center text-xs text-muted-foreground">
                {deSel ? <><strong className="font-medium text-foreground">{dataCurta(deSel)}</strong> até {ateSel ? <strong className="font-medium text-foreground">{dataCurta(ateSel)}</strong> : "…"}</> : "Escolha o primeiro e o último dia"}
              </p>
              <Calendar
                mode="range" locale={ptBR} numberOfMonths={1}
                selected={faixa} onSelect={setFaixa}
                defaultMonth={faixa?.from ?? paraDate(hoje)}
                className="flex justify-center p-0"
                // Faixa discreta: só as pontas em cor cheia; o meio é um tom leve.
                classNames={{
                  cell: "h-9 w-9 p-0 text-center text-sm relative focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-carbo-green/15 [&:has(.day-range-start)]:rounded-l-md [&:has(.day-range-end)]:rounded-r-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
                  day_range_start: "day-range-start",
                  day_range_end: "day-range-end",
                  day_selected: "bg-carbo-green text-white hover:bg-carbo-green hover:text-white focus:bg-carbo-green focus:text-white",
                  day_range_middle: "aria-selected:bg-transparent aria-selected:text-foreground",
                  day_today: "font-semibold text-carbo-green",
                }}
              />
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => atalho(somarDias(hoje, -30), hoje)}>Últimos 30 dias</Button>
                <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => atalho(hoje, somarDias(hoje, 30))}>Próximos 30 dias</Button>
                <Button type="button" variant="secondary" size="sm" className="h-7 text-xs"
                  onClick={() => { const l = limitesDoMes(somarMeses(mesHoje, -1)); atalho(l.de, l.ate); }}>Mês passado</Button>
              </div>
              {/* Um dia só (sem o último) vale como aquele dia. */}
              <Button type="button" className="h-8 w-full" disabled={!deSel}
                onClick={() => atalho(deSel, ateSel || deSel)}>
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

// ── Ordenação ───────────────────────────────────────────────────────────────
// Mora na URL (`?ordem=valor` / `?ordem=-valor`), como os filtros. Vazio = a
// ordem padrão de cada tela (a fila: vencimento mais antigo primeiro).
// ⚠️ A lista é paginada no BANCO, então quem ordena é a consulta — ordenar só
// a página na tela mostraria "o maior valor" dos 20 que vieram, não de todos.

export type ColunaOrdem = "nome" | "vencimento" | "valor" | "quitado";
export type Ordem = { col: ColunaOrdem; asc: boolean } | null;

const COLUNAS_ORDEM: ColunaOrdem[] = ["nome", "vencimento", "valor", "quitado"];
// Primeiro clique numa coluna: o sentido que se costuma querer nela.
const SENTIDO_INICIAL: Record<ColunaOrdem, boolean> = { nome: true, vencimento: true, valor: false, quitado: false };

const lerOrdem = (v: string): Ordem => {
  const desc = v.startsWith("-");
  const col = (desc ? v.slice(1) : v) as ColunaOrdem;
  return COLUNAS_ORDEM.includes(col) ? { col, asc: !desc } : null;
};
const gravarOrdem = (o: Ordem) => (o ? `${o.asc ? "" : "-"}${o.col}` : null);

/** `aoMudar` roda junto (volta à página 1 no MESMO clique). */
export function useOrdemUrl(aoMudar?: () => void) {
  const [v, set] = useParamUrl("ordem", "");
  const ordem = lerOrdem(v);
  const definir = (o: Ordem) => { set(gravarOrdem(o)); aoMudar?.(); };
  /** Clique no cabeçalho: a mesma coluna inverte; outra começa no sentido dela. */
  const alternar = (col: ColunaOrdem) =>
    definir(ordem?.col === col ? { col, asc: !ordem.asc } : { col, asc: SENTIDO_INICIAL[col] });
  return { ordem, definir, alternar };
}

/** O "Ordenar por" da barra — os mesmos estados que o clique no cabeçalho. */
export function FiltroOrdem({
  ordem, onChange, quitado,
}: { ordem: Ordem; onChange: (o: Ordem) => void; quitado: string }) {
  const opcoes = [
    { v: "__padrao", l: "Padrão" },
    { v: "vencimento", l: "Vencimento: mais antigo" },
    { v: "-vencimento", l: "Vencimento: mais distante" },
    { v: "-valor", l: "Maior valor" },
    { v: "valor", l: "Menor valor" },
    { v: "nome", l: "Nome: A → Z" },
    { v: "-nome", l: "Nome: Z → A" },
    { v: "-quitado", l: `${quitado}: mais recente` },
    { v: "quitado", l: `${quitado}: mais antigo` },
  ];
  // ⚠️ O Select do Radix não aceita valor vazio: "padrão" tem nome próprio.
  return (
    <FiltroSelect
      rotulo="Ordenar" valor={gravarOrdem(ordem) ?? "__padrao"} opcoes={opcoes}
      onChange={(v) => onChange(v === "__padrao" ? null : lerOrdem(v))}
    />
  );
}

/** Cabeçalho que ordena no clique, com a seta do sentido atual. */
export function CabecalhoOrdem({
  col, ordem, onOrdenar, children, direita,
}: { col: ColunaOrdem; ordem: Ordem; onOrdenar: (c: ColunaOrdem) => void; children: ReactNode; direita?: boolean }) {
  const ativo = ordem?.col === col;
  const Icone = !ativo ? ArrowUpDown : ordem!.asc ? ArrowUp : ArrowDown;
  return (
    <CarboTableHead className={cn(direita && "text-right [&>div]:justify-end")}
      aria-sort={ativo ? (ordem!.asc ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onOrdenar(col)}
        className={cn("group -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground",
          ativo && "text-foreground")}>
        {children}
        <Icone className={cn("h-3.5 w-3.5", ativo ? "opacity-100" : "opacity-30 group-hover:opacity-70")} />
      </button>
    </CarboTableHead>
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
