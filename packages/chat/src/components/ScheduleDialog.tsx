import { useMemo, useState } from "react";
import { X, Clock, CalendarClock } from "lucide-react";
import { MINUTE_STEPS, shortcutOptions, roundTo5, isFuture, formatWhen, toDateInput, fromParts } from "../lib/schedule";

// Seletor de horário para "enviar depois". Atalhos + "Escolher data e hora…"
// com minutos travados em passos de 5. Devolve um Date já arredondado.
export function ScheduleDialog({
  title = "Enviar depois", initial, onClose, onConfirm,
}: {
  title?: string;
  initial?: Date | null;
  onClose: () => void;
  onConfirm: (date: Date) => void;
}) {
  const shortcuts = useMemo(() => shortcutOptions(), []);
  const [custom, setCustom] = useState(!!initial);
  const base = initial ?? roundTo5(new Date(Date.now() + 60 * 60 * 1000)); // +1h por padrão
  const [dateStr, setDateStr] = useState(toDateInput(base));
  const [hour, setHour] = useState(base.getHours());
  const [minute, setMinute] = useState(MINUTE_STEPS.reduce((a, b) => (Math.abs(b - base.getMinutes()) < Math.abs(a - base.getMinutes()) ? b : a), 0));

  const chosen = fromParts(dateStr, hour, minute);
  const chosenValid = isFuture(chosen);

  function pick(date: Date) {
    const d = roundTo5(date);
    if (!isFuture(d)) return;
    onConfirm(d);
  }

  const minDate = toDateInput(new Date());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4" /> {title}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-1.5 p-4">
          {!custom && shortcuts.map((s) => (
            <button key={s.key} onClick={() => pick(s.date)}
              className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm hover:bg-muted">
              <span>{s.label}</span>
              <span className="text-xs text-muted-foreground">{formatWhen(s.date)}</span>
            </button>
          ))}

          {!custom ? (
            <button onClick={() => setCustom(true)}
              className="flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm hover:bg-muted">
              <CalendarClock className="h-4 w-4 text-muted-foreground" /> Escolher data e hora…
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Data</label>
                <input type="date" value={dateStr} min={minDate} onChange={(e) => setDateStr(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Hora</label>
                  <select value={hour} onChange={(e) => setHour(Number(e.target.value))}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Minuto</label>
                  <select value={minute} onChange={(e) => setMinute(Number(e.target.value))}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {MINUTE_STEPS.map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {chosenValid ? `Será enviada ${formatWhen(roundTo5(chosen))}.` : "Escolha um horário no futuro."}
              </p>
              <div className="flex justify-between gap-2">
                <button onClick={() => setCustom(false)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Voltar</button>
                <button onClick={() => pick(chosen)} disabled={!chosenValid}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40">Agendar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
