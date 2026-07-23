import { Input } from "@/components/ui/input";
import { LABEL_COLORS } from "@/lib/mktTheme";
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
    <div className="space-y-2.5">
      <div>
        <label className="text-[11px] text-muted-foreground">Texto</label>
        <Input value={value.text ?? ""} onChange={(e) => set({ text: e.target.value })} placeholder="Buscar no título…" className="h-8 text-sm" />
      </div>

      {labels && labels.length > 0 && (
        <div>
          <label className="text-[11px] text-muted-foreground">Etiquetas</label>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {labels.map((l) => {
              const on = labelIds.includes(l.id);
              return (
                <button key={l.id} onClick={() => set({ labelIds: on ? labelIds.filter((x) => x !== l.id) : [...labelIds, l.id] })}
                  className={`h-6 px-2 rounded text-xs font-medium ${on ? "text-white ring-1 ring-offset-1 ring-primary" : "text-white/80"}`}
                  style={{ background: LABEL_COLORS[l.color] ?? l.color }}>{l.name || "—"}</button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="text-[11px] text-muted-foreground">Membro</label>
        <select value={value.memberId ?? ""} onChange={(e) => set({ memberId: e.target.value })}
          className="h-8 text-sm w-full rounded-md border border-border bg-card px-2">
          <option value="">Qualquer</option>
          {team.map((t) => <option key={t.id} value={t.id}>{t.full_name ?? "Usuário"}</option>)}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[11px] text-muted-foreground">Entrega de</label>
          <input type="date" value={value.dueFrom ?? ""} onChange={(e) => set({ dueFrom: e.target.value })} className="h-8 text-sm w-full rounded-md border border-border bg-card px-2" />
        </div>
        <div className="flex-1">
          <label className="text-[11px] text-muted-foreground">até</label>
          <input type="date" value={value.dueTo ?? ""} onChange={(e) => set({ dueTo: e.target.value })} className="h-8 text-sm w-full rounded-md border border-border bg-card px-2" />
        </div>
      </div>
    </div>
  );
}
