import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
// ⚠️ A conta de intervalo NÃO é refeita aqui: vem do `getRange`, o mesmo que os
// hooks de e-commerce usam. Um segundo "últimos 30 dias" escrito neste arquivo
// divergiria do primeiro no dia em que alguém mexesse num só.
import { getRange, type EcommercePeriod } from "@/hooks/useDashEcommerce";

// ─────────────────────────────────────────────────────────────────────────────
// Seletor de período — o MESMO da tela de Vendas Online (atalho num dropdown,
// "Mês fechado…" escolhendo o mês, "Por período…" abrindo as duas datas).
//
// ⚠️ A SAÍDA É UM PAR DE DATAS, não um nome de período. Quem consome guarda
// `de`/`ate` na URL exatamente como antes — o atalho é açúcar na entrada, e o
// recorte continua legível no endereço, viajando nos "Ver pedidos →" e no
// seletor Gráficos ↔ Dados sem que nenhuma outra tela precise saber que
// "últimos 7 dias" existe.
//
// O inverso (qual atalho está ativo) é DEDUZIDO das datas, não guardado: duas
// fontes para a mesma informação acabam discordando, e aqui a verdade é a data.
// ─────────────────────────────────────────────────────────────────────────────

/** Período vazio = sem recorte. Vale "todo o histórico" para quem consome. */
export interface Periodo { from: string; to: string }

/** `""` é o estado SEM filtro — não é um `EcommercePeriod`, por isso o tipo soma. */
type Atalho = EcommercePeriod | "todo";

const OPCOES: { value: Atalho; label: string }[] = [
  { value: "todo",      label: "Todo o período" },
  { value: "today",     label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d",        label: "Últimos 7 dias" },
  { value: "30d",       label: "Últimos 30 dias" },
  { value: "month",     label: "Este mês (até hoje)" },
  { value: "mes",       label: "Mês fechado…" },
  { value: "custom",    label: "Por período…" },
];

const MN_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Meses de jan/2024 até o corrente, do mais recente para o mais antigo. */
export function mesesDisponiveis(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const cur = new Date(2024, 0, 1);
  const now = new Date();
  while (cur <= now) {
    opts.push({
      value: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
      label: `${MN_SHORT[cur.getMonth()]}/${cur.getFullYear()}`,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return opts.reverse();
}

/**
 * Qual atalho produz ESTE par de datas.
 *
 * ⚠️ A ordem importa. No dia 1º do mês, "Hoje" e "Este mês" devolvem o mesmo
 * intervalo; o primeiro da lista ganha, e o rótulo mais específico vem antes.
 */
function detectar(p: Periodo): { atalho: Atalho; mes: string } {
  if (!p.from && !p.to) return { atalho: "todo", mes: "" };
  for (const a of ["today", "yesterday", "7d", "30d", "month"] as const) {
    const r = getRange(a);
    if (r.from === p.from && r.to === p.to) return { atalho: a, mes: "" };
  }
  if (p.from && p.to) {
    const mes = p.from.slice(0, 7);
    const r = getRange("mes", { from: p.from });
    if (r.from === p.from && r.to === p.to) return { atalho: "mes", mes };
  }
  return { atalho: "custom", mes: "" };
}

export function PeriodoFiltro({ value, onChange, className = "" }: {
  value: Periodo;
  onChange: (p: Periodo) => void;
  className?: string;
}) {
  const { atalho, mes } = useMemo(() => detectar(value), [value]);

  /** ⚠️ Intervalo pela metade não existe: trocar de atalho já grava as DUAS
   *  pontas. Era o buraco da tela de e-commerce — o seletor dizia "Por
   *  período…" e a consulta rodava os últimos 30 dias, calada. */
  const escolher = (a: Atalho) => {
    if (a === "todo")   return onChange({ from: "", to: "" });
    if (a === "mes")    return onChange(getRange("mes", { from: value.from || `${getRange("today").from.slice(0, 7)}-01` }));
    if (a === "custom") return onChange(value.from && value.to ? value : getRange("30d"));
    onChange(getRange(a));
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <Select value={atalho} onValueChange={(v) => escolher(v as Atalho)}>
        <SelectTrigger className="h-9 sm:h-8 w-full sm:w-44 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {OPCOES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {atalho === "mes" && (
        <Select value={mes} onValueChange={(ym) => onChange(getRange("mes", { from: `${ym}-01` }))}>
          <SelectTrigger className="h-9 sm:h-8 w-full sm:w-32 text-xs"><SelectValue placeholder="Escolha o mês" /></SelectTrigger>
          <SelectContent>
            {mesesDisponiveis().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {/* ⚠️ `DatePickerInput` (popover em pt-BR), não `<input type="date">`: o
          nativo entrega um seletor diferente em cada navegador e vem com altura
          própria, destoando da barra. Era exatamente o que havia aqui. */}
      {atalho === "custom" && (
        <div className="flex w-full sm:w-auto items-center gap-1.5">
          <DatePickerInput
            value={value.from} onChange={(v) => onChange({ ...value, from: v })}
            clearable={false} className="h-9 sm:h-8 min-w-0 flex-1 sm:flex-none sm:w-36 text-xs"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <DatePickerInput
            value={value.to} onChange={(v) => onChange({ ...value, to: v })}
            clearable={false} className="h-9 sm:h-8 min-w-0 flex-1 sm:flex-none sm:w-36 text-xs"
          />
        </div>
      )}
    </div>
  );
}
