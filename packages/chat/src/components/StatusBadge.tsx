import type { Availability, UserStatus } from "../hooks";

export const AVAIL_META: Record<Availability, { label: string; color: string; emoji: string }> = {
  disponivel: { label: "Disponível", color: "#22c55e", emoji: "🟢" },
  em_reuniao: { label: "Em reunião", color: "#ef4444", emoji: "📅" },
  em_campo:   { label: "Em campo",   color: "#3b82f6", emoji: "📍" },
  ausente:    { label: "Ausente",    color: "#f59e0b", emoji: "🌙" },
  ferias:     { label: "De férias",  color: "#a855f7", emoji: "🌴" },
};

// Bolinha da disponibilidade — canto do avatar.
export function AvailabilityDot({ availability, size = 10, className = "" }: {
  availability?: Availability | null; size?: number; className?: string;
}) {
  const meta = AVAIL_META[availability ?? "disponivel"];
  return (
    <span
      className={`inline-block rounded-full border-2 border-background ${className}`}
      style={{ width: size, height: size, backgroundColor: meta.color }}
      title={meta.label}
    />
  );
}

// Texto do status (emoji personalizado + texto, ou o rótulo da disponibilidade).
export function statusText(s?: UserStatus | null): string {
  if (!s) return "";
  if (s.texto) return `${s.emoji ? s.emoji + " " : ""}${s.texto}`;
  if (s.availability && s.availability !== "disponivel") return AVAIL_META[s.availability].label;
  return "";
}
