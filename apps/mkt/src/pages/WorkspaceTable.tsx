import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Table2, CalendarClock, ArrowUp, ArrowDown, Maximize2 } from "lucide-react";
import { useBoardMutations } from "@/hooks/useBoards";
import { useDefaultWorkspace, useWorkspaceData, useWorkspaceLive, type WorkspaceCard } from "@/hooks/useWorkspace";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { LABEL_COLORS } from "@/lib/mktTheme";
import { matchCard, type SearchCriteria } from "@/lib/mktFilter";
import { ymdOfIso } from "@/lib/mktCalendar";
import { CardModal } from "@/components/board/CardModal";
import { EditableTitle } from "@/components/board/EditableTitle";
import { Input } from "@/components/ui/input";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { diceBearUrl } from "@/components/ui/profile-avatar";

type SortDir = "asc" | "desc";

// Tabela geral — planilha cruzando todos os quadros da área de trabalho (D6).
export default function WorkspaceTable() {
  const navigate = useNavigate();
  const { data: ws } = useDefaultWorkspace();
  const wsId = ws?.id ?? null;
  const { data, isLoading } = useWorkspaceData(wsId);
  useWorkspaceLive(wsId);
  const { data: team = [] } = useTeamMembers();
  const m = useBoardMutations();

  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: "title", dir: "asc" });
  const [text, setText] = useState("");
  const [labelId, setLabelId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const labelById = useMemo(() => new Map((data?.labels ?? []).map((l) => [l.id, l])), [data?.labels]);
  const memberById = useMemo(() => new Map(team.map((t) => [t.id, t])), [team]);
  const boardOrder = useMemo(() => new Map((data?.boards ?? []).map((b, i) => [b.id, i])), [data?.boards]);

  const sortValue = (c: WorkspaceCard, key: string): string | number => {
    if (key === "title") return c.title.toLowerCase();
    if (key === "board") return boardOrder.get(c.board_id) ?? 0;
    if (key === "list") return c.listTitle.toLowerCase();
    if (key === "labels") return c.labelIds.length;
    if (key === "members") return c.memberIds.length;
    if (key === "start") return c.start_date ?? "";
    if (key === "due") return c.due_date ?? "";
    if (key === "checklist") return c.checklistTotal ? c.checklistDone / c.checklistTotal : -1;
    return "";
  };

  const rows = useMemo(() => {
    const crit: SearchCriteria = { text, labelIds: labelId ? [labelId] : [], memberId };
    const filtered = (data?.cards ?? [])
      .filter((c) => (boardId ? c.board_id === boardId : true))
      .filter((c) => matchCard(c, crit));
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key), bv = sortValue(b, sort.key);
      const r = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? r : -r;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.cards, text, labelId, memberId, boardId, sort]);

  const openCard = openCardId ? (data?.cards ?? []).find((c) => c.id === openCardId) : undefined;
  const modalLabels = useMemo(
    () => (openCard ? (data?.labels ?? []).filter((l) => l.board_id === openCard.board_id) : []),
    [openCard, data?.labels],
  );

  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Carregando tabela…</div>;

  const toggleSort = (key: string) => setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  const Th = ({ label, k }: { label: string; k: string }) => (
    <th className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">{label}{sort.key === k && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
    </th>
  );

  return (
    <div className="fixed inset-0 top-14 flex flex-col bg-background">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-wrap">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2"><Table2 className="h-5 w-5 text-primary" /> Todos os quadros · Tabela</h1>
        <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
          <button onClick={() => navigate("/todos/calendario")} className="px-2.5 py-1 text-xs font-semibold rounded text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Calendário</button>
          <button className="px-2.5 py-1 text-xs font-semibold rounded bg-card shadow-sm text-foreground inline-flex items-center gap-1"><Table2 className="h-3.5 w-3.5" /> Tabela</button>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar título…" className="h-8 text-sm w-40" />
          <select value={boardId} onChange={(e) => setBoardId(e.target.value)} className="h-8 text-sm rounded-md border border-border bg-card px-2">
            <option value="">Quadro: todos</option>
            {data.boards.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
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
              <Th label="Quadro" k="board" />
              <Th label="Lista" k="list" />
              <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Etiquetas</th>
              <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Membros</th>
              <Th label="Início" k="start" />
              <Th label="Entrega" k="due" />
              <Th label="Checklist" k="checklist" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border/60 hover:bg-muted/30">
                <td className="px-2 py-1">
                  <button onClick={() => setOpenCardId(c.id)} className="p-1 text-muted-foreground hover:text-foreground" title="Abrir cartão"><Maximize2 className="h-3.5 w-3.5" /></button>
                </td>
                <td className="px-1 py-1"><EditableTitle value={c.title} onSave={(t) => m.renameCard.mutate({ id: c.id, title: t })} /></td>
                <td className="px-2 py-1 whitespace-nowrap">
                  <button onClick={() => navigate(`/quadros/${c.board_id}`)} className="hover:underline"><CarboBadge variant="outline" size="sm">{c.boardTitle}</CarboBadge></button>
                </td>
                <td className="px-2 py-1 whitespace-nowrap"><CarboBadge variant="secondary" size="sm">{c.listTitle}</CarboBadge></td>
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
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-10 text-center text-sm text-muted-foreground">Nenhum cartão.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openCard && <CardModal cardId={openCard.id} boardId={openCard.board_id} labels={modalLabels} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
