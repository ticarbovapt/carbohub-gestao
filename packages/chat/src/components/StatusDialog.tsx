import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Moon, BellOff } from "lucide-react";
import { useMyStatus, useSetStatus, type Availability } from "../hooks";

// Um único seletor coerente: escolher define emoji + texto + disponibilidade
// juntos (nada de "Em campo" com bolinha de férias). Texto abaixo é opcional.
const STATUS_OPTIONS: { key: Availability; emoji: string; texto: string; label: string }[] = [
  { key: "disponivel", emoji: "",   texto: "",           label: "🟢 Disponível" },
  { key: "em_campo",   emoji: "📍", texto: "Em campo",   label: "📍 Em campo" },
  { key: "em_reuniao", emoji: "🗓️", texto: "Em reunião", label: "🗓️ Em reunião" },
  { key: "ferias",     emoji: "🌴", texto: "De férias",  label: "🌴 De férias" },
  { key: "ausente",    emoji: "🌙", texto: "Ausente",    label: "🌙 Ausente" },
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
  const [voltaEm, setVoltaEm] = useState(""); // De férias: data de volta; vazio = indefinido

  useEffect(() => {
    if (!my) return;
    setEmoji(my.emoji ?? ""); setTexto(my.texto ?? ""); setAvailability(my.availability);
    setDnd(my.dnd); setUrgentBypass(my.urgentBypass);
    if (my.quietInicio && my.quietFim) { setQuietOn(true); setQuietInicio(my.quietInicio.slice(0, 5)); setQuietFim(my.quietFim.slice(0, 5)); }
    if (my.availability === "ferias" && my.expiraEm) {
      const d = new Date(my.expiraEm);
      setVoltaEm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
  }, [my]);

  const isFerias = availability === "ferias";
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

  function computeExpira(): string | null {
    if (isFerias) {
      if (!voltaEm) return null; // indefinido: fica de férias até alterar
      const [y, m, d] = voltaEm.split("-").map(Number);
      return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 0, 0).toISOString();
    }
    const opt = EXPIRY.find((e) => e.key === expiry);
    if (!opt || opt.ms === null) return null;
    if (opt.ms === -1) { const d = new Date(); d.setHours(23, 59, 0, 0); return d.toISOString(); }
    return new Date(Date.now() + opt.ms).toISOString();
  }

  async function save() {
    try {
      await set.mutateAsync({
        emoji: emoji.trim() || null, texto: texto.trim() || null, availability,
        expira_em: isFerias ? computeExpira() : ((emoji.trim() || texto.trim()) ? computeExpira() : null),
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
          {/* status (define emoji + texto + disponibilidade juntos) */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((o) => (
                <button key={o.key} onClick={() => { setEmoji(o.emoji); setTexto(o.texto); setAvailability(o.key); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${availability === o.key ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* personalizar (opcional) */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Personalizar (opcional)</p>
            <div className="flex gap-2">
              <input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} placeholder="🙂" maxLength={4}
                className="h-9 w-12 shrink-0 rounded-md border border-input bg-background text-center text-lg focus:outline-none focus:ring-2 focus:ring-ring" />
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Em campo — Fortaleza" maxLength={80}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          {/* expira / período de férias */}
          {isFerias ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">🌴 De férias até</p>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={voltaEm} min={todayStr} onChange={(e) => setVoltaEm(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <button onClick={() => setVoltaEm("")}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${!voltaEm ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                  Indefinido
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {voltaEm
                  ? `Volta automaticamente em ${new Date(voltaEm + "T23:59").toLocaleDateString("pt-BR")}.`
                  : "Fica de férias até você alterar no sistema."}
              </p>
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Limpar o status</p>
              <div className="flex flex-wrap gap-1.5">
                {EXPIRY.map((e) => (
                  <button key={e.key} onClick={() => setExpiry(e.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${expiry === e.key ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>{e.label}</button>
                ))}
              </div>
            </div>
          )}

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
