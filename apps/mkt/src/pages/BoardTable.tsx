import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Table2, ArrowUp, ArrowDown, Maximize2, SearchX } from "lucide-react";
import { useBoard, useBoardLive, useBoardMutations, type CardSummary, type List, type Label } from "@/hooks/useBoards";
import { useCustomFields, useBoardFieldValues, useCustomFieldMutations, type CustomField } from "@/hooks/useCustomFields";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { LABEL_COLORS, getAccent, tintedLabelStyle } from "@/lib/mktTheme";
import { matchCard, type SearchCriteria } from "@/lib/mktFilter";
import { ymdOfIso } from "@/lib/mktCalendar";
import { CardModal } from "@/components/board/CardModal";
import { CustomFieldInput } from "@/components/board/CustomFieldInput";
import { EditableTitle } from "@/components/board/EditableTitle";
import { ViewSwitcher } from "@/components/board/ViewSwitcher";
import { Input } from "@/components/ui/input";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { diceBearUrl } from "@/components/ui/profile-avatar";

type SortDir = "asc" | "desc";

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
  if (isLoading || !data) {
    return (
      <div className="fixed inset-0 top-14 flex flex-col bg-background">
        <div className="flex items-center gap-3 min-h-14 px-4 border-b border-border">
          <div className="mkt-skeleton h-8 w-8 rounded-md" />
          <div className="mkt-skeleton h-5 w-40 rounded-md" />
        </div>
        <div className="flex-1 overflow-hidden p-4 md:p-6 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="mkt-skeleton h-11 w-full rounded-[var(--radius)]" />
          ))}
        </div>
      </div>
    );
  }
  const { board } = data;
  const accent = getAccent((board as { background?: string }).background);

  const toggleSort = (key: string) => setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  const Th = ({ label, k, className }: { label: string; k: string; className?: string }) => (
    <th className={`px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors ${className ?? ""}`} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">{label}{sort.key === k && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />)}</span>
    </th>
  );

  return (
    <div className="fixed inset-0 top-14 flex flex-col bg-background">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 min-h-14 px-4 py-2 bg-card border-b border-border header-depth-glow flex-wrap">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="mkt-view-title flex items-center gap-2 text-foreground">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: accent }} />
          <Table2 className="h-5 w-5 text-primary" />
          {board.title}
        </h1>
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
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="min-w-max overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-card)]">
        <table className="text-sm border-collapse min-w-max">
          <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
            <tr className="border-b border-border">
              <th className="px-3 py-2.5 w-8" />
              <Th label="Título" k="title" />
              <Th label="Lista" k="list" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Etiquetas</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Membros</th>
              <Th label="Início" k="start" />
              <Th label="Entrega" k="due" />
              <Th label="Checklist" k="checklist" />
              {fields.map((f) => <Th key={f.id} label={f.name || "—"} k={`field:${f.id}`} />)}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border/60 transition-colors hover:bg-muted/40">
                <td className="px-3 py-1.5">
                  <button onClick={() => setOpenCardId(c.mirrorOf ?? c.id)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Abrir cartão"><Maximize2 className="h-3.5 w-3.5" /></button>
                </td>
                <td className="px-2 py-1.5"><EditableTitle value={c.title} onSave={(t) => m.renameCard.mutate({ id: c.id, title: t })} /></td>
                <td className="px-3 py-1.5 whitespace-nowrap"><CarboBadge variant="secondary" size="sm">{listById.get(c.list_id)?.title ?? "—"}</CarboBadge></td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {c.labelIds.map((id) => {
                      const l = labelById.get(id);
                      if (!l) return null;
                      const hex = LABEL_COLORS[l.color] ?? l.color;
                      return (
                        <span key={id} className="inline-flex items-center gap-1 h-5 px-2 rounded-md border text-xs font-medium whitespace-nowrap" style={tintedLabelStyle(hex)} title={l.name || "(sem nome)"}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: hex }} />
                          {l.name && <span>{l.name}</span>}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex -space-x-1.5">
                    {c.memberIds.map((id) => { const p = memberById.get(id); return <img key={id} src={p?.avatar_url || diceBearUrl(id)} title={p?.full_name ?? ""} className="h-6 w-6 rounded-full ring-2 ring-card object-cover" />; })}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <input type="date" value={c.start_date ? ymdOfIso(c.start_date) : ""} onChange={(e) => m.setCardDates.mutate({ id: c.id, start_date: e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null })}
                    className={`h-8 text-xs rounded-[var(--input-radius)] border border-transparent bg-transparent px-1.5 transition-colors hover:border-border hover:text-foreground focus:border-border focus:text-foreground ${c.start_date ? "text-foreground" : "text-muted-foreground/50"}`} />
                </td>
                <td className="px-3 py-1.5">
                  <input type="date" value={c.due_date ? ymdOfIso(c.due_date) : ""} onChange={(e) => m.setCardDates.mutate({ id: c.id, due_date: e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null })}
                    className={`h-8 text-xs rounded-[var(--input-radius)] border border-transparent bg-transparent px-1.5 transition-colors hover:border-border hover:text-foreground focus:border-border focus:text-foreground ${c.due_date ? "text-foreground" : "text-muted-foreground/50"}`} />
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-xs text-muted-foreground">{c.checklistTotal > 0 ? `${c.checklistDone}/${c.checklistTotal}` : "—"}</td>
                {fields.map((f: CustomField) => (
                  <td key={f.id} className="px-3 py-1.5 min-w-[140px]">
                    <CustomFieldInput field={f} value={fvOf(c.id, f.id)} onSave={(v) => fm.setFieldValueFor.mutate({ cardId: c.id, fieldId: f.id, value: v })} />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8 + fields.length} className="px-2 py-16">
                  <div className="mx-auto max-w-sm py-6 text-center flex flex-col items-center gap-3">
                    <span className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <SearchX className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-foreground">Nenhum resultado</p>
                      <p className="text-sm text-muted-foreground">Ajuste a busca ou os filtros de etiqueta e membro.</p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {openCardId && <CardModal cardId={openCardId} boardId={boardId} labels={data.labels} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
