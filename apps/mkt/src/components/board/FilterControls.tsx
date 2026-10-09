import { Input } from "@/components/ui/input";
import { LABEL_COLORS, tintedLabelStyle } from "@/lib/mktTheme";
import type { Atividade, Prazo, SearchCriteria } from "@/lib/mktFilter";
import type { Label } from "@/hooks/useBoards";
import { diceBearUrl } from "@/components/ui/profile-avatar";

// Controles de filtro reusados no quadro e na busca entre quadros.
// Etiquetas só aparecem quando o contexto tem etiquetas (por quadro).
// ⚠️ `completo` = filtro do QUADRO: só ali o cartão traz descrição, concluído
// e data de atualização. Na busca entre quadros essas opções ficam de fora em
// vez de filtrar por um campo que não veio (ver `lib/mktFilter.ts`).

const PRAZOS: { k: Prazo; rot: string }[] = [
  { k: "sem_data", rot: "Sem datas" },
  { k: "atrasado", rot: "Atrasados" },
  { k: "dia", rot: "Entrega no próximo dia" },
  { k: "semana", rot: "Entrega na próxima semana" },
  { k: "mes", rot: "Entrega no próximo mês" },
];
const ATIVIDADES: { k: Atividade; rot: string }[] = [
  { k: "", rot: "Qualquer" },
  { k: "1s", rot: "Na última semana" },
  { k: "2s", rot: "Nas últimas 2 semanas" },
  { k: "4s", rot: "Nas últimas 4 semanas" },
  { k: "sem4s", rot: "Sem atividade há 4 semanas" },
];

function Opcao({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted cursor-pointer">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
      <span className="min-w-0 flex-1 flex items-center gap-2">{children}</span>
    </label>
  );
}

export function FilterControls({ value, onChange, labels, team, completo, meuId }: {
  value: SearchCriteria;
  onChange: (v: SearchCriteria) => void;
  labels?: Label[];
  team: { id: string; full_name: string | null; avatar_url?: string | null }[];
  completo?: boolean;
  meuId?: string | null;
}) {
  const set = (patch: Partial<SearchCriteria>) => onChange({ ...value, ...patch });
  const labelIds = value.labelIds ?? [];
  // Busca salva antiga guarda um membro em `memberId`: aparece marcado igual.
  const memberIds = [...new Set([...(value.memberIds ?? []), ...(value.memberId ? [value.memberId] : [])])];
  const alternaMembro = (id: string, on: boolean) =>
    set({ memberIds: on ? [...memberIds, id] : memberIds.filter((x) => x !== id), memberId: "" });
  const prazos = value.prazos ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="mkt-meta-label">Palavra-chave</label>
        <Input value={value.text ?? ""} onChange={(e) => set({ text: e.target.value })}
          placeholder={completo ? "Título ou descrição…" : "Buscar no título…"} className="mkt-field text-sm w-full" />
      </div>

      <div className="space-y-0.5">
        <label className="mkt-meta-label">Membros</label>
        <Opcao on={!!value.semMembros} onChange={(v) => set({ semMembros: v })}>Sem membros</Opcao>
        {meuId && <Opcao on={!!value.atribuidosAMim} onChange={(v) => set({ atribuidosAMim: v })}>Atribuídos a mim</Opcao>}
        <div className="max-h-40 overflow-y-auto">
          {team.map((t) => (
            <Opcao key={t.id} on={memberIds.includes(t.id)} onChange={(v) => alternaMembro(t.id, v)}>
              <img src={t.avatar_url || diceBearUrl(t.id)} className="h-5 w-5 rounded-full object-cover" />
              <span className="truncate">{t.full_name ?? "Usuário"}</span>
            </Opcao>
          ))}
        </div>
      </div>

      {completo && (
        <div className="space-y-0.5">
          <label className="mkt-meta-label">Status do cartão</label>
          <Opcao on={value.status === "concluido"} onChange={(v) => set({ status: v ? "concluido" : "" })}>Marcados como concluídos</Opcao>
          <Opcao on={value.status === "nao_concluido"} onChange={(v) => set({ status: v ? "nao_concluido" : "" })}>Não concluídos</Opcao>
        </div>
      )}

      <div className="space-y-0.5">
        <label className="mkt-meta-label">Data de entrega</label>
        {PRAZOS.filter((p) => completo || p.k === "sem_data").map((p) => (
          <Opcao key={p.k} on={prazos.includes(p.k)} onChange={(v) => set({ prazos: v ? [...prazos, p.k] : prazos.filter((x) => x !== p.k) })}>{p.rot}</Opcao>
        ))}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">De</span>
            <input type="date" value={value.dueFrom ?? ""} onChange={(e) => set({ dueFrom: e.target.value })} className="mkt-field text-sm w-full min-w-0 box-border" />
          </div>
          <div className="min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">Até</span>
            <input type="date" value={value.dueTo ?? ""} onChange={(e) => set({ dueTo: e.target.value })} className="mkt-field text-sm w-full min-w-0 box-border" />
          </div>
        </div>
      </div>

      {labels && (
        <div className="space-y-0.5">
          <label className="mkt-meta-label">Etiquetas</label>
          <Opcao on={!!value.semEtiquetas} onChange={(v) => set({ semEtiquetas: v })}>Sem etiquetas</Opcao>
          <div className="max-h-48 overflow-y-auto">
            {labels.map((l) => {
              const cor = LABEL_COLORS[l.color] ?? l.color;
              const on = labelIds.includes(l.id);
              return (
                <Opcao key={l.id} on={on} onChange={(v) => set({ labelIds: v ? [...labelIds, l.id] : labelIds.filter((x) => x !== l.id) })}>
                  <span className="flex-1 h-6 rounded-md px-2 text-xs font-medium flex items-center truncate"
                    style={l.name ? tintedLabelStyle(cor) : { background: cor }}>{l.name}</span>
                </Opcao>
              );
            })}
          </div>
        </div>
      )}

      {completo && (
        <div className="space-y-1.5">
          <label className="mkt-meta-label">Atividade</label>
          <select value={value.atividade ?? ""} onChange={(e) => set({ atividade: e.target.value as Atividade })} className="mkt-field text-sm w-full">
            {ATIVIDADES.map((a) => <option key={a.k} value={a.k}>{a.rot}</option>)}
          </select>
        </div>
      )}

      <div className="space-y-1.5 border-t border-border pt-3">
        <label className="mkt-meta-label">Combinar as opções</label>
        <div className="flex gap-1 rounded-md bg-muted p-1 text-sm">
          {([["qualquer", "Qualquer uma"], ["todas", "Todas"]] as const).map(([k, rot]) => (
            <button key={k} type="button" onClick={() => set({ modo: k })}
              className={`flex-1 rounded px-2 py-1 transition-colors ${(value.modo ?? "todas") === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{rot}</button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {(value.modo ?? "todas") === "todas" ? "O cartão precisa bater em TODAS as opções marcadas." : "Basta o cartão bater em UMA das opções marcadas."} A palavra-chave e as datas De/Até valem sempre.
        </p>
        {completo && (
          <Opcao on={!!value.recolherVazias} onChange={(v) => set({ recolherVazias: v })}>Recolher listas sem cartões no filtro</Opcao>
        )}
      </div>
    </div>
  );
}
