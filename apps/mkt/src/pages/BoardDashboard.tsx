import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, LabelList,
} from "recharts";
import { ArrowLeft, LayoutDashboard, CheckCircle2, AlertTriangle, CalendarOff, Layers } from "lucide-react";
import { useBoard, useBoardLive, type CardSummary } from "@/hooks/useBoards";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { LIST_DOT, LIST_PALETTE, getAccent } from "@/lib/mktTheme";
import { ymd, ymdOfIso, diffDays } from "@/lib/mktCalendar";
import { CardModal } from "@/components/board/CardModal";
import { ViewSwitcher } from "@/components/board/ViewSwitcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TOOLTIP_STYLE = { background: "hsl(var(--popover))", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 };

function Tile({ label, value, sub, accent, icon: Icon }: { label: string; value: string; sub?: string; accent: string; icon: React.ElementType }) {
  return (
    <div
      className="rounded-[var(--radius)] bg-card p-4 border border-border border-l-[3px] shadow-[var(--shadow-card)]"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
          <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
      </div>
    </div>
  );
}

export default function BoardDashboard() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useBoard(boardId ?? null);
  useBoardLive(boardId ?? null);
  const { data: team = [] } = useTeamMembers();
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const memberName = useMemo(() => new Map(team.map((t) => [t.id, t.full_name ?? "Usuário"])), [team]);

  const metrics = useMemo(() => {
    const cards = data?.cards ?? [];
    const lists = data?.lists ?? [];
    const todayYmd = ymd(new Date());
    const total = cards.length;
    const concluidos = cards.filter((c) => c.is_complete).length;
    const semData = cards.filter((c) => !c.due_date && !c.start_date).length;
    const atrasadosAll = cards
      .filter((c) => c.due_date && !c.is_complete && ymdOfIso(c.due_date) < todayYmd)
      .map((c) => ({ card: c, diasAtraso: diffDays(ymdOfIso(c.due_date!), todayYmd) }))
      .sort((a, b) => b.diasAtraso - a.diasAtraso);

    const listIdx = new Map(lists.map((l, i) => [l.id, i]));
    const listColor = (id: string) => { const l = lists.find((x) => x.id === id); return (l?.color && LIST_DOT[l.color]) || LIST_PALETTE[(listIdx.get(id) ?? 0) % LIST_PALETTE.length]; };
    const porLista = lists.map((l) => ({ name: l.title, value: cards.filter((c) => c.list_id === l.id).length, color: listColor(l.id) }));

    const cargaMap = new Map<string, number>();
    for (const c of cards) {
      if (c.memberIds.length === 0) cargaMap.set("__none__", (cargaMap.get("__none__") ?? 0) + 1);
      else for (const mid of c.memberIds) cargaMap.set(mid, (cargaMap.get(mid) ?? 0) + 1);
    }
    const porMembro = Array.from(cargaMap.entries())
      .map(([id, value]) => ({ name: id === "__none__" ? "Sem responsável" : (memberName.get(id) ?? "Usuário"), value }))
      .sort((a, b) => b.value - a.value);

    return { total, concluidos, semData, atrasadosAll, porLista, porMembro,
      taxa: total > 0 ? Math.round((concluidos / total) * 100) : 0 };
  }, [data, memberName]);

  if (!boardId) return null;
  if (isLoading || !data) return (
    <div className="fixed inset-0 top-14 flex flex-col bg-background">
      <div className="flex items-center gap-3 px-4 min-h-14 border-b border-border">
        <div className="mkt-skeleton h-7 w-7 rounded-md" />
        <div className="mkt-skeleton h-5 w-40 rounded-md" />
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4 max-w-[1200px] w-full mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="mkt-skeleton h-24 rounded-[var(--radius)]" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="mkt-skeleton h-64 rounded-[var(--radius)] lg:col-span-2" />
          <div className="mkt-skeleton h-64 rounded-[var(--radius)]" />
        </div>
      </div>
    </div>
  );
  const { board } = data;
  const boardAccent = getAccent(board.background);
  const conclData = [{ name: "Concluídos", value: metrics.concluidos }, { name: "Em aberto", value: metrics.total - metrics.concluidos }];

  return (
    <div className="fixed inset-0 top-14 flex flex-col bg-background">
      <div className="flex items-center gap-2 px-4 min-h-14 border-b border-border bg-card header-depth-glow flex-wrap">
        <button onClick={() => navigate("/quadros")} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="mkt-view-title flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: boardAccent }} />
          <LayoutDashboard className="h-5 w-5 text-primary" /> {board.title}
        </h1>
        <ViewSwitcher boardId={boardId} current="dashboard" />
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4 max-w-[1200px] w-full mx-auto">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Tile label="Cartões" value={String(metrics.total)} accent="hsl(var(--accent))" icon={Layers} />
          <Tile label="Concluídos" value={String(metrics.concluidos)} accent="hsl(var(--primary))" icon={CheckCircle2} />
          <Tile label="Taxa de conclusão" value={`${metrics.taxa}%`} accent="hsl(var(--primary))" icon={CheckCircle2} />
          <Tile label="Atrasados" value={String(metrics.atrasadosAll.length)} accent={metrics.atrasadosAll.length ? "hsl(var(--destructive))" : "hsl(var(--border))"} icon={AlertTriangle} />
          <Tile label="Sem data" value={String(metrics.semData)} accent="hsl(var(--warning))" icon={CalendarOff} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Cartões por lista */}
          <Card className="lg:col-span-2 rounded-[var(--radius)] border border-border shadow-[var(--shadow-card)]">
            <CardHeader className="pb-1 pt-5 px-5"><CardTitle className="text-base font-semibold">Cartões por lista</CardTitle></CardHeader>
            <CardContent className="px-2 pb-4">
              {metrics.porLista.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">Sem listas.</p> : (
                <ResponsiveContainer width="100%" height={Math.max(200, metrics.porLista.length * 40)}>
                  <BarChart data={metrics.porLista} layout="vertical" margin={{ top: 4, right: 32, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} domain={[0, "dataMax"]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, "Cartões"]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {metrics.porLista.map((d, i) => <Cell key={i} fill={d.color} />)}
                      <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Taxa de conclusão */}
          <Card className="rounded-[var(--radius)] border border-border shadow-[var(--shadow-card)]">
            <CardHeader className="pb-1 pt-5 px-5"><CardTitle className="text-base font-semibold">Conclusão</CardTitle></CardHeader>
            <CardContent className="px-2 pb-4">
              {metrics.total === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">Sem cartões.</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={conclData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      <Cell fill="hsl(var(--primary))" /><Cell fill="hsl(var(--muted))" />
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <p className="text-center text-sm text-muted-foreground -mt-2">{metrics.concluidos} de {metrics.total} concluídos ({metrics.taxa}%)</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Carga por membro */}
          <Card className="rounded-[var(--radius)] border border-border shadow-[var(--shadow-card)]">
            <CardHeader className="pb-1 pt-5 px-5"><CardTitle className="text-base font-semibold">Carga por membro</CardTitle></CardHeader>
            <CardContent className="px-2 pb-4">
              {metrics.porMembro.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">Sem cartões.</p> : (
                <ResponsiveContainer width="100%" height={Math.max(200, metrics.porMembro.length * 40)}>
                  <BarChart data={metrics.porMembro} layout="vertical" margin={{ top: 4, right: 32, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} domain={[0, "dataMax"]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, "Cartões"]} />
                    <Bar dataKey="value" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Atrasados */}
          <Card className={`rounded-[var(--radius)] shadow-[var(--shadow-card)] ${metrics.atrasadosAll.length ? "border border-destructive/30" : "border border-border"}`}>
            <CardHeader className="pb-1 pt-5 px-5">
              <CardTitle className="text-base font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Atrasados ({metrics.atrasadosAll.length})</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {metrics.atrasadosAll.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Nenhum cartão atrasado. 🎉</p> : (
                <div className="divide-y divide-border -mx-1 max-h-[280px] overflow-y-auto">
                  {metrics.atrasadosAll.map(({ card, diasAtraso }) => (
                    <button key={card.id} onClick={() => setOpenCardId(card.mirrorOf ?? card.id)} className="w-full flex items-center justify-between gap-2 py-2 px-1 text-left hover:bg-muted/40 rounded-md">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
                        <p className="text-xs text-muted-foreground">{data.lists.find((l) => l.id === card.list_id)?.title ?? "—"} · entrega {new Date(card.due_date!).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <span className="text-xs font-bold text-destructive shrink-0 rounded-md bg-destructive/10 px-1.5 py-0.5">{diasAtraso}d</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {openCardId && <CardModal cardId={openCardId} boardId={boardId} labels={data.labels} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
