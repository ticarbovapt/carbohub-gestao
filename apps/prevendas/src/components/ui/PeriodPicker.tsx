import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Seletor de período — espelhado do Portal de Vendas (produtos/src/shared/ui/
// PeriodPicker.tsx). Só UI + contas de data (sem lógica de negócio).
// Presets: 7 dias / 15 dias / Mês atual / Personalizado.
// ─────────────────────────────────────────────────────────────────────────────

/** Período como par de datas ISO (YYYY-MM-DD). */
export interface PeriodRange {
  from: string;
  to: string;
}

type Preset = "7d" | "15d" | "month" | "custom";

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Range pronto para cada atalho. */
export function presetRange(preset: Exclude<Preset, "custom">): PeriodRange {
  const to = new Date();
  const from = new Date();
  if (preset === "7d") from.setDate(to.getDate() - 7);
  else if (preset === "15d") from.setDate(to.getDate() - 15);
  else /* month */ from.setDate(1);
  return { from: fmt(from), to: fmt(to) };
}

/** Calcula o período imediatamente anterior, mesma duração (para Δ%). */
export function previousRange({ from, to }: PeriodRange): PeriodRange {
  const f = new Date(from);
  const t = new Date(to);
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const prevTo = new Date(f);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days + 1);
  return { from: fmt(prevFrom), to: fmt(prevTo) };
}

/** Rótulo amigável (ex.: "últimos 7 dias", "mês atual", "01/06 a 17/06"). */
export function rangeLabel(range: PeriodRange): string {
  const presets: { p: Exclude<Preset, "custom">; label: string }[] = [
    { p: "7d", label: "últimos 7 dias" },
    { p: "15d", label: "últimos 15 dias" },
    { p: "month", label: "mês atual" },
  ];
  for (const { p, label } of presets) {
    const r = presetRange(p);
    if (r.from === range.from && r.to === range.to) return label;
  }
  const f = new Date(range.from);
  const t = new Date(range.to);
  const human = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${human(f)} a ${human(t)}`;
}

export function PeriodPicker({
  value, onChange, className,
}: {
  value: PeriodRange;
  onChange: (v: PeriodRange) => void;
  className?: string;
}) {
  // Detecta qual preset corresponde ao valor atual.
  const activePreset = useMemo<Preset>(() => {
    for (const p of ["7d", "15d", "month"] as const) {
      const r = presetRange(p);
      if (r.from === value.from && r.to === value.to) return p;
    }
    return "custom";
  }, [value]);

  const [showCustom, setShowCustom] = useState(activePreset === "custom");
  useEffect(() => {
    if (activePreset === "custom") setShowCustom(true);
  }, [activePreset]);

  const pick = (p: Preset) => {
    if (p === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    onChange(presetRange(p));
  };

  const presets: { p: Preset; label: string }[] = [
    { p: "7d", label: "7 dias" },
    { p: "15d", label: "15 dias" },
    { p: "month", label: "Mês atual" },
    { p: "custom", label: "Personalizado" },
  ];

  const inputCls =
    "h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        {presets.map(({ p, label }) => (
          <button
            key={p}
            type="button"
            onClick={() => pick(p)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors",
              activePreset === p
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p === "custom" && <CalendarDays size={12} />}
            {label}
          </button>
        ))}
      </div>
      {showCustom && (
        <div className="flex flex-wrap items-end gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            De
            <input
              type="date"
              value={value.from}
              max={value.to}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Até
            <input
              type="date"
              value={value.to}
              min={value.from}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className={inputCls}
            />
          </label>
        </div>
      )}
    </div>
  );
}
