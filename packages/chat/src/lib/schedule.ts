// Utilitários de agendamento ("enviar depois"). Tudo em passos de 5 minutos e no
// fuso do usuário (o Date do navegador já é local; o backend recebe ISO/UTC).

export const MINUTE_STEPS = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,…,55

// Arredonda para o slot de 5 min mais próximo; se cair no passado, sobe pro próximo.
export function roundTo5(date: Date): Date {
  const ms = 5 * 60 * 1000;
  let t = Math.round(date.getTime() / ms) * ms;
  if (t <= Date.now()) t = Math.ceil(Date.now() / ms) * ms;
  return new Date(t);
}

export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

function at(base: Date, h: number, m: number): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

// Atalhos pedidos: hoje 18:00, amanhã 08:00, próxima segunda 08:00.
export interface ShortcutOption { key: string; label: string; date: Date }

export function shortcutOptions(now = new Date()): ShortcutOption[] {
  const opts: ShortcutOption[] = [];

  const today18 = at(now, 18, 0);
  if (isFuture(today18)) opts.push({ key: "today18", label: "Hoje às 18:00", date: today18 });

  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  opts.push({ key: "tomorrow8", label: "Amanhã às 08:00", date: at(tomorrow, 8, 0) });

  // Próxima segunda (sempre a próxima que ainda vai chegar, nunca hoje).
  const nextMon = new Date(now);
  const delta = ((1 - now.getDay() + 7) % 7) || 7; // 1 = segunda; se hoje é segunda, +7
  nextMon.setDate(now.getDate() + delta);
  opts.push({ key: "nextMon8", label: "Próxima segunda às 08:00", date: at(nextMon, 8, 0) });

  return opts.map((o) => ({ ...o, date: roundTo5(o.date) }));
}

// "hoje/amanhã/… às HH:MM" para o toast e a lista de agendadas.
export function formatWhen(date: Date, now = new Date()): string {
  const hhmm = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - d0.getTime()) / 86400000);
  if (days === 0) return `hoje às ${hhmm}`;
  if (days === 1) return `amanhã às ${hhmm}`;
  if (days > 1 && days < 7) return `${date.toLocaleDateString("pt-BR", { weekday: "long" })} às ${hhmm}`;
  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hhmm}`;
}

// Valor para o <input type="date"> (YYYY-MM-DD) no fuso local.
export function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Monta um Date a partir de data (YYYY-MM-DD) + hora + minuto locais.
export function fromParts(dateStr: string, hour: number, minute: number): Date {
  const [y, mo, da] = dateStr.split("-").map(Number);
  return new Date(y, (mo ?? 1) - 1, da ?? 1, hour, minute, 0, 0);
}
