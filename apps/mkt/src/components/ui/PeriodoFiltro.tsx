import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  intervaloDoAtalho, detectarAtalho, mesesParaEscolher, type Periodo, type AtalhoPeriodo,
} from "@carbo/shell";

// ─────────────────────────────────────────────────────────────────────────────
// Seletor de período — o MESMO das Vendas Online, em TODA tela com período
// (pedido do dono do processo, 05/11/2026). Arquivo IDÊNTICO nos sete apps
// (todos menos o Finanças); a conta de data mora em `@carbo/shell` (periodo.ts).
// Mudou aqui, copie para os outros seis.
//
// ⚠️ A SAÍDA É UM PAR DE DATAS (`from`/`to`, YYYY-MM-DD, as duas pontas
// inclusivas), nunca o nome do atalho. Quem consome guarda o par na URL e na
// consulta; qual atalho está marcado é DEDUZIDO das datas.
//
//   comTodo   acrescenta "Todo o período" (o par vazio) — telas sem recorte
//   longos    acrescenta 90 dias, 6 meses e 12 meses — telas que já os tinham
//   desde     primeiro mês da lista de "Mês fechado…" (YYYY-MM)
// ─────────────────────────────────────────────────────────────────────────────

export type { Periodo } from "@carbo/shell";

const ROTULO: Record<AtalhoPeriodo, string> = {
  todo: "Todo o período",
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "180d": "Últimos 6 meses",
  "365d": "Últimos 12 meses",
  month: "Este mês (até hoje)",
  mes: "Mês fechado…",
  custom: "Por período…",
};

export function atalhosDoFiltro(comTodo = false, longos = false): AtalhoPeriodo[] {
  return [
    ...(comTodo ? (["todo"] as const) : []),
    "today", "yesterday", "7d", "30d",
    ...(longos ? (["90d", "180d", "365d"] as const) : []),
    "month", "mes", "custom",
  ];
}

export function PeriodoFiltro({
  value, onChange, comTodo = false, longos = false, desde, disableFuture = false, className = "",
}: {
  value: Periodo;
  onChange: (p: Periodo) => void;
  comTodo?: boolean;
  longos?: boolean;
  desde?: string;
  disableFuture?: boolean;
  className?: string;
}) {
  const opcoes = useMemo(() => atalhosDoFiltro(comTodo, longos), [comTodo, longos]);
  const { atalho, mes } = useMemo(() => detectarAtalho(value, opcoes), [value, opcoes]);
  const meses = useMemo(() => mesesParaEscolher(desde), [desde]);

  /** ⚠️ Intervalo pela metade não existe: trocar de atalho já grava as DUAS
   *  pontas. "Por período…" nasce com o intervalo que a tela já mostrava. */
  const escolher = (a: AtalhoPeriodo) => {
    if (a === "mes") return onChange(intervaloDoAtalho("mes", value.from || undefined));
    if (a === "custom") return onChange(value.from && value.to ? value : intervaloDoAtalho("30d"));
    onChange(intervaloDoAtalho(a));
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <Select value={atalho} onValueChange={(v) => escolher(v as AtalhoPeriodo)}>
        <SelectTrigger className="h-9 w-full text-sm sm:w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => <SelectItem key={o} value={o}>{ROTULO[o]}</SelectItem>)}
        </SelectContent>
      </Select>

      {atalho === "mes" && (
        <Select value={mes} onValueChange={(ym) => onChange(intervaloDoAtalho("mes", ym))}>
          <SelectTrigger className="h-9 w-full text-sm sm:w-32"><SelectValue placeholder="Mês" /></SelectTrigger>
          <SelectContent>
            {meses.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {atalho === "custom" && (
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <DatePickerInput
            value={value.from} onChange={(v) => v && onChange(v <= value.to ? { ...value, from: v } : { from: v, to: v })}
            clearable={false} disableFuture={disableFuture}
            className="h-9 min-w-0 flex-1 text-sm sm:w-36 sm:flex-none"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <DatePickerInput
            value={value.to} onChange={(v) => v && onChange(v >= value.from ? { ...value, to: v } : { from: v, to: v })}
            clearable={false} disableFuture={disableFuture}
            className="h-9 min-w-0 flex-1 text-sm sm:w-36 sm:flex-none"
          />
        </div>
      )}
    </div>
  );
}
