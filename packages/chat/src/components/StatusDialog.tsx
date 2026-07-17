import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Moon, BellOff } from "lucide-react";
import { useMyStatus, useSetStatus, type Availability } from "../hooks";
import { AVAIL_META } from "./StatusBadge";

const PRESETS: { emoji: string; texto: string; availability: Availability }[] = [
  { emoji: "🚗", texto: "Em campo", availability: "em_campo" },
  { emoji: "📅", texto: "Em reunião", availability: "em_reuniao" },
  { emoji: "🌴", texto: "De férias", availability: "ferias" },
  { emoji: "🌙", texto: "Ausente", availability: "ausente" },
];

const EXPIRY: { key: string; label: string; ms: number | null }[] = [
  { key: "never", label: "Não limpar", ms: null },
  { key: "30m", label: "30 min", ms: 30 * 60_000 },
  { key: "1h", label: "1 hora", ms: 60 * 60_000 },
  { key: "today", label: "Hoje", ms: -1 }, // fim do dia local
];

export function StatusDialog({ onClose }: { onClose: () => void }) {
  const { data: my } = useMyStatus();
  const set = useSetStatus();

  const [emoji, setEmoji] = useState("");
  const [texto, setTexto] = useState("");
  const [availability, setAvailability] = useState<Availability>("disponivel");
  const [expiry, setExpiry] = useState("never");
  const [dnd, setDnd] = useState(false);
  const [quietOn, setQuietOn] = useState(false);
  const [quietInicio, setQuietInicio] = useState("22:00");
  const [quietFim, setQuietFim] = useState("07:00");
  const [urgentBypass, setUrgentBypass] = useState(true);

  useEffect(() => {
    if (!my) return;
    setEmoji(my.emoji ?? ""); setTexto(my.texto ?? ""); setAvailability(my.availability);
    setDnd(my.dnd); setUrgentBypass(my.urgentBypass);
    if (my.quietInicio && my.quietFim) { setQuietOn(true); setQuietInicio(my.quietInicio.slice(0, 5)); setQuietFim(my.quietFim.slice(0, 5)); }
  }, [my]);

  function expiraEmIso(): string | null {
    const opt = EXPIRY.find((e) => e.key === expiry);
    if (!opt || opt.ms === null) return null;
    if (opt.ms === -1) { const d = new Date(); d.setHours(23, 59, 0, 0); return d.toISOString(); }
    return new Date(Date.now() + opt.ms).toISOString();
  }

  async function save() {
    try {
      await set.mutateAsync({
        emoji: emoji.trim() || null, texto: texto.trim() || null, availability,
        expira_em: (emoji.trim() || texto.trim()) ? expiraEmIso() : null,
        dnd, urgent_bypass: urgentBypass,
        quiet_inicio: quietOn ? quietInicio : null, quiet_fim: quietOn ? quietFim : null,
        timezone: "America/Sao_Paulo",
      });
      toast.success("Status atualizado");
      onClose();
    } catch (e) { toast.error("Não foi possível salvar. " + ((e as { message?: string })?.message ?? "")); }
  }
  async function clearStatus() {
    setEmoji(""); setTexto(""); setAvailability("disponivel"); setExpiry("never");
    try { await set.mutateAsync({ emoji: null, texto: null, availability: "disponivel", expira_em: null }); toast.success("Status limpo"); }
    catch { /* silencioso */ }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Meu status</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {/* emoji + texto */}
          <div className="flex gap-2">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} placeholder="🙂" maxLength={4}
              className="h-9 w-12 shrink-0 rounded-md border border-input bg-background text-center text-lg focus:outline-none focus:ring-2 focus:ring-ring" />
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O que você está fazendo?" maxLength={80}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          {/* presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.texto} onClick={() => { setEmoji(p.emoji); setTexto(p.texto); setAvailability(p.availability); }}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted">{p.emoji} {p.texto}</button>
            ))}
          </div>

          {/* disponibilidade */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Disponibilidade</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(AVAIL_META) as Availability[]).map((a) => (
                <button key={a} onClick={() => setAvailability(a)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${availability === a ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: AVAIL_META[a].color }} /> {AVAIL_META[a].label}
                </button>
              ))}
            </div>
          </div>

          {/* expira */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Limpar o status</p>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRY.map((e) => (
                <button key={e.key} onClick={() => setExpiry(e.key)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${expiry === e.key ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>{e.label}</button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Não perturbe */}
          <label className="flex items-start gap-2.5">
            <input type="checkbox" checked={dnd} onChange={(e) => setDnd(e.target.checked)} className="mt-0.5" />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-medium"><BellOff className="h-3.5 w-3.5" /> Não perturbe</span>
              <span className="text-xs text-muted-foreground">Segura o push (a mensagem chega, mas não toca).</span>
            </span>
          </label>

          {/* Horário de silêncio */}
          <div>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={quietOn} onChange={(e) => setQuietOn(e.target.checked)} className="mt-0.5" />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-medium"><Moon className="h-3.5 w-3.5" /> Horário de silêncio</span>
                <span className="text-xs text-muted-foreground">Não toca o push nesse intervalo (fuso de Brasília).</span>
              </span>
            </label>
            {quietOn && (
              <div className="mt-2 flex items-center gap-2 pl-7 text-sm">
                <input type="time" value={quietInicio} onChange={(e) => setQuietInicio(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring" />
                <span className="text-muted-foreground">até</span>
                <input type="time" value={quietFim} onChange={(e) => setQuietFim(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            )}
          </div>

          {(dnd || quietOn) && (
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={urgentBypass} onChange={(e) => setUrgentBypass(e.target.checked)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">Deixar urgente furar</span>
                <span className="text-xs text-muted-foreground">Menção direta e @todos ainda tocam mesmo no silêncio.</span>
              </span>
            </label>
          )}
        </div>

        <div className="flex justify-between gap-2 border-t px-4 py-3">
          <button onClick={clearStatus} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Limpar status</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
            <button onClick={save} disabled={set.isPending}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {set.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
