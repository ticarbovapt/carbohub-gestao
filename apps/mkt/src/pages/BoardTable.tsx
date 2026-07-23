import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Table2, ArrowUp, ArrowDown, Maximize2 } from "lucide-react";
import { useBoard, useBoardLive, useBoardMutations, type CardSummary, type List, type Label } from "@/hooks/useBoards";
import { useCustomFields, useBoardFieldValues, useCustomFieldMutations, type CustomField } from "@/hooks/useCustomFields";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { LABEL_COLORS } from "@/lib/mktTheme";
import { matchCard, type SearchCriteria } from "@/lib/mktFilter";
import { ymdOfIso } from "@/lib/mktCalendar";
import { CardModal } from "@/components/board/CardModal";
import { CustomFieldInput } from "@/components/board/CustomFieldInput";
import { ViewSwitcher } from "@/components/board/ViewSwitcher";
import { Input } from "@/components/ui/input";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { diceBearUrl } from "@/components/ui/profile-avatar";

type SortDir = "asc" | "desc";

// Título editável inline.
function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input value={v} onChange={(e) => setV(e.target.value)}
      onBlur={() => { const t = v.trim(); if (t && t !== value) onSave(t); else setV(value); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-8 text-sm w-full min-w-[160px] rounded-md border border-transparent hover:border-border focus:border-border bg-transparent px-2 font-medium text-foreground" />
  );
}

export default function BoardTable() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useBoard(boardId ?? null);
  useBoardLive(boardId ?? null);
  const { data: fields = [] } = useCustomFields(boardId ?? null);
  const { data: fieldValues } = useBoardFieldValues(boardId ?? null);
  const { data: team = [] } = useTeamMembers();
  const m = useBoardMutations(boardId);
  const fm = useCustomFieldMutations(boardId ?? null);

  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: "title", dir: "asc" });
  const [text, setText] = useState("");
  const [labelId, setLabelId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const listById = useMemo(() => new Map((data?.lists ?? []).map((l: List) => [l.id, l])), [data?.lists]);
  const labelById = useMemo(() => new Map((data?.labels ?? []).map((l: Label) => [l.id, l])), [data?.labels]);
  const memberById = useMemo(() => new Map(team.map((t) => [t.id, t])), [team]);
  const fvOf = (cardId: string, fieldId: string) => fieldValues?.get(cardId)?.[fieldId];

  const sortValue = (c: CardSummary, key: string): string | number => {
    if (key === "title") return c.title.toLowerCase();
    if (key === "list") return listById.get(c.list_id)?.position ?? 0;
    if (key === "labels") return c.labelIds.length;
    if (key === "members") return c.memberIds.length;
    if (key === "start") return c.start_date ?? "";
    if (key === "due") return c.due_date ?? "";
    if (key === "checklist") return c.checklistTotal ? c.checklistDone / c.checklistTotal : -1;
    if (key.startsWith("field:")) {
      const fid = key.slice(6);
      const f = fields.find((x) => x.id === fid);
      const v = fvOf(c.id, fid);
      if (v == null) return "";
      if (f?.type === "select") return f.options.find((o) => o.id === v)?.label?.toLowerCase() ?? "";
      if (f?.type === "multiselect") return Array.isArray(v) ? v.length : 0;
      if (f?.type === "checkbox") return v === true ? 1 : 0;
      if (f?.type === "number") return Number(v) || 0;
      return String(v).toLowerCase();
    }
    return "";
  };

  const rows = useMemo(() => {
    const crit: SearchCriteria = { text, labelIds: labelId ? [labelId] : [], memberId };
    const filtered = (data?.cards ?? []).filter((c) => matchCard(c, crit));
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key), bv = sortValue(b, sort.key);
      const r = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? r : -r;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.cards, text, labelId, memberId, sort, fieldValues, fields]);

  if (!boardId) return null;
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Carregando tabela…</div>;
  const { board } = data;

  const toggleSort = (key: string) => setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  const Th = ({ label, k, className }: { label: string; k: string; className?: string }) => (
    <th className={`px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground ${className ?? ""}`} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">{label}{sort.key === k && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
    </th>
  );

  return (
    <div className="fixed inset-0 top-14 flex flex-col bg-background">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-wrap">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2"><Table2 className="h-5 w-5 text-primary" /> {board.title}</h1>
        <ViewSwitcher boardId={boardId} current="tabela" />
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar título…" className="h-8 text-sm w-44" />
          <select value={labelId} onChange={(e) => setLabelId(e.target.value)} className="h-8 text-sm rounded-md border border-border bg-card px-2">
            <option value="">Etiqueta: todas</option>
            {data.labels.map((l) => <option key={l.id} value={l.id}>{l.name || "(sem nome)"}</option>)}
          </select>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="h-8 text-sm rounded-md border border-border bg-card px-2">
            <option value="">Membro: todos</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.full_name ?? "Usuário"}</option>)}
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto">
        <table className="text-sm border-collapse min-w-max">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="border-b border-border">
              <th className="px-2 py-2 w-8" />
              <Th label="Título" k="title" />
              <Th label="Lista" k="list" />
              <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Etiquetas</th>
              <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Membros</th>
              <Th label="Início" k="start" />
              <Th label="Entrega" k="due" />
              <Th label="Checklist" k="checklist" />
              {fields.map((f) => <Th key={f.id} label={f.name || "—"} k={`field:${f.id}`} />)}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border/60 hover:bg-muted/30">
                <td className="px-2 py-1">
                  <button onClick={() => setOpenCardId(c.mirrorOf ?? c.id)} className="p-1 text-muted-foreground hover:text-foreground" title="Abrir cartão"><Maximize2 className="h-3.5 w-3.5" /></button>
                </td>
                <td className="px-1 py-1"><EditableTitle value={c.title} onSave={(t) => m.renameCard.mutate({ id: c.id, title: t })} /></td>
                <td className="px-2 py-1 whitespace-nowrap"><CarboBadge variant="secondary" size="sm">{listById.get(c.list_id)?.title ?? "—"}</CarboBadge></td>
                <td className="px-2 py-1">
                  <div className="flex flex-wrap gap-1">
                    {c.labelIds.map((id) => { const l = labelById.get(id); return l ? <span key={id} className="h-2.5 w-6 rounded-full" style={{ background: LABEL_COLORS[l.color] ?? l.color }} title={l.name} /> : null; })}
                  </div>
                </td>
                <td className="px-2 py-1">
                  <div className="flex -space-x-1.5">
                    {c.memberIds.map((id) => { const p = memberById.get(id); return <img key={id} src={p?.avatar_url || diceBearUrl(id)} title={p?.full_name ?? ""} className="h-6 w-6 rounded-full ring-2 ring-background object-cover" />; })}
                  </div>
                </td>
                <td className="px-2 py-1">
                  <input type="date" value={c.start_date ? ymdOfIso(c.start_date) : ""} onChange={(e) => m.setCardDates.mutate({ id: c.id, start_date: e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null })}
                    className="h-8 text-xs rounded-md border border-transparent hover:border-border bg-transparent px-1" />
                </td>
                <td className="px-2 py-1">
                  <input type="date" value={c.due_date ? ymdOfIso(c.due_date) : ""} onChange={(e) => m.setCardDates.mutate({ id: c.id, due_date: e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null })}
                    className="h-8 text-xs rounded-md border border-transparent hover:border-border bg-transparent px-1" />
                </td>
                <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">{c.checklistTotal > 0 ? `${c.checklistDone}/${c.checklistTotal}` : "—"}</td>
                {fields.map((f: CustomField) => (
                  <td key={f.id} className="px-2 py-1 min-w-[140px]">
                    <CustomFieldInput field={f} value={fvOf(c.id, f.id)} onSave={(v) => fm.setFieldValueFor.mutate({ cardId: c.id, fieldId: f.id, value: v })} />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8 + fields.length} className="px-2 py-10 text-center text-sm text-muted-foreground">Nenhum cartão.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openCardId && <CardModal cardId={openCardId} boardId={boardId} labels={data.labels} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
