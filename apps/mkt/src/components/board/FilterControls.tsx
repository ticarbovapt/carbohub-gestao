import { Input } from "@/components/ui/input";
import { LABEL_COLORS, tintedLabelStyle } from "@/lib/mktTheme";
import type { SearchCriteria } from "@/lib/mktFilter";
import type { Label } from "@/hooks/useBoards";
import type { TeamMember } from "@/hooks/useTeamMembers";

// Controles de filtro reusados no quadro e na busca entre quadros.
// Etiquetas só aparecem quando o contexto tem etiquetas (per-quadro).
export function FilterControls({ value, onChange, labels, team }: {
  value: SearchCriteria;
  onChange: (v: SearchCriteria) => void;
  labels?: Label[];
  team: TeamMember[];
}) {
  const set = (patch: Partial<SearchCriteria>) => onChange({ ...value, ...patch });
  const labelIds = value.labelIds ?? [];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="mkt-meta-label">Texto</label>
        <Input value={value.text ?? ""} onChange={(e) => set({ text: e.target.value })} placeholder="Buscar no título…" className="mkt-field text-sm" />
      </div>

      {labels && labels.length > 0 && (
        <div className="space-y-1">
          <label className="mkt-meta-label">Etiquetas</label>
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => {
              const on = labelIds.includes(l.id);
              const tinted = tintedLabelStyle(LABEL_COLORS[l.color] ?? l.color);
              return (
                <button key={l.id} onClick={() => set({ labelIds: on ? labelIds.filter((x) => x !== l.id) : [...labelIds, l.id] })}
                  className={`inline-flex items-center h-6 px-2 rounded-md border text-xs font-medium transition ${on ? "ring-2 ring-primary/40 ring-offset-1 ring-offset-background" : "opacity-80 hover:opacity-100"}`}
                  style={tinted}>{l.name || "—"}</button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className="mkt-meta-label">Membro</label>
        <select value={value.memberId ?? ""} onChange={(e) => set({ memberId: e.target.value })}
          className="mkt-field text-sm w-full">
          <option value="">Qualquer</option>
          {team.map((t) => <option key={t.id} value={t.id}>{t.full_name ?? "Usuário"}</option>)}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="mkt-meta-label">Entrega de</label>
          <input type="date" value={value.dueFrom ?? ""} onChange={(e) => set({ dueFrom: e.target.value })} className="mkt-field text-sm w-full" />
        </div>
        <div className="flex-1 space-y-1">
          <label className="mkt-meta-label">até</label>
          <input type="date" value={value.dueTo ?? ""} onChange={(e) => set({ dueTo: e.target.value })} className="mkt-field text-sm w-full" />
        </div>
      </div>
    </div>
  );
}
