import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trello, Plus, X, Filter, Bookmark, Trash2, Clock, CalendarClock, Table2, Search, LayoutGrid } from "lucide-react";
import { useBoards, useBoardMutations, useAllCards } from "@/hooks/useBoards";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useSavedSearches, useSavedSearchMutations } from "@/hooks/useSavedSearches";
import { emptyCriteria, criteriaActive, matchCard, type SearchCriteria } from "@/lib/mktFilter";
import { FilterControls } from "@/components/board/FilterControls";
import { getAccent, ACCENT_SWATCHES } from "@/lib/mktTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const HEADING_FONT = "'IBM Plex Sans', 'Inter', system-ui, sans-serif";

// Lista de quadros do time de Marketing (Trello interno) + busca entre quadros.
export default function Quadros() {
  const navigate = useNavigate();
  const { data: boards = [], isLoading } = useBoards();
  const { createBoard } = useBoardMutations();
  const { data: team = [] } = useTeamMembers();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [bg, setBg] = useState("blue");

  // Busca entre quadros
  const [criteria, setCriteria] = useState<SearchCriteria>(emptyCriteria());
  const active = criteriaActive(criteria);
  const { data: allCards = [] } = useAllCards(active);
  const results = active ? allCards.filter((c) => matchCard(c, criteria)) : [];
  const saved = useSavedSearches("all");
  const savedMut = useSavedSearchMutations();

  const create = () => {
    const t = title.trim();
    if (!t) return;
    createBoard.mutate({ title: t, background: bg }, {
      onSuccess: (id) => { setCreating(false); setTitle(""); navigate(`/quadros/${id}`); },
    });
  };

  return (
    <div className="space-y-8 max-w-[1200px] mx-auto">
      <div>
        <h1
          className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2.5"
          style={{ fontFamily: HEADING_FONT }}
        >
          <Trello className="h-6 w-6 text-primary" /> Quadros
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">Seus quadros de marketing — listas, cartões, checklists e datas.</p>
      </div>

      {/* Ver todos os quadros (visão da área de trabalho — cruza todos os quadros) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground mr-1">Ver todos os quadros</span>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => navigate("/todos/calendario")}>
          <CalendarClock className="h-3.5 w-3.5 text-accent" /> Calendário geral
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => navigate("/todos/tabela")}>
          <Table2 className="h-3.5 w-3.5 text-accent" /> Tabela geral
        </Button>
      </div>

      {/* Grade de quadros */}
      <div className="space-y-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-foreground tracking-tight" style={{ fontFamily: HEADING_FONT }}>
            Seus quadros
          </h2>
          {!isLoading && <span className="text-xs text-muted-foreground">{boards.length}</span>}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="mkt-skeleton min-h-32" />
            ))}
          </div>
        ) : boards.length === 0 && !creating ? (
          <div className="mkt-empty">
            <div className="mkt-empty-icon"><LayoutGrid className="h-6 w-6" /></div>
            <p className="mkt-empty-title" style={{ fontFamily: HEADING_FONT }}>Crie seu primeiro quadro</p>
            <p className="mkt-empty-subcopy">Organize campanhas, tarefas e datas do time de marketing em listas e cartões.</p>
            <Button
              size="sm"
              className="mt-4 gap-1.5"
              style={{ boxShadow: "var(--shadow-carbo)" }}
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4" /> Criar quadro
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => navigate(`/quadros/${b.id}`)}
                className="mkt-board-card group relative overflow-hidden flex flex-col text-left p-4 min-h-32"
                style={{ ["--mkt-accent" as string]: getAccent(b.background) }}
              >
                <span className="mkt-accent-bar absolute inset-x-0 top-0" />
                <h3
                  className="text-sm font-semibold text-foreground leading-snug line-clamp-3 tracking-tight"
                  style={{ fontFamily: HEADING_FONT }}
                >
                  {b.title}
                </h3>
                <div className="mt-auto pt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="mkt-dot" />
                  <span>Abrir quadro</span>
                </div>
              </button>
            ))}

            {creating ? (
              <div className="rounded-[var(--card-radius)] border border-border bg-card p-3 flex flex-col gap-2.5 min-h-32" style={{ boxShadow: "var(--shadow-card)" }}>
                <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setCreating(false); }}
                  placeholder="Título do quadro…" className="h-8 text-sm" />
                <div className="flex gap-1.5 flex-wrap">
                  {ACCENT_SWATCHES.slice(0, 8).map(({ key, color }) => (
                    <button key={key} onClick={() => setBg(key)}
                      className={`h-6 w-6 rounded-md transition ${bg === key ? "ring-2 ring-offset-1 ring-offset-card ring-primary" : "ring-1 ring-border"}`}
                      style={{ background: color }} />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 mt-auto">
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={create}>Criar</Button>
                  <button onClick={() => setCreating(false)} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ) : (
              <button onClick={() => setCreating(true)}
                className="rounded-[var(--card-radius)] border border-dashed border-border bg-muted/40 hover:bg-muted hover:border-primary/40 hover:text-primary transition flex flex-col items-center justify-center gap-1.5 min-h-32 text-sm text-muted-foreground">
                <Plus className="h-5 w-5" /> Criar quadro
              </button>
            )}
          </div>
        )}
      </div>

      {/* Busca entre quadros — rebaixada abaixo da grade */}
      <div className="rounded-[var(--radius)] border border-border bg-card p-4 space-y-3" style={{ boxShadow: "var(--shadow-card)" }}>
        <p className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: HEADING_FONT }}>
          <Filter className="h-4 w-4 text-muted-foreground" /> Buscar entre quadros
        </p>
        <FilterControls value={criteria} onChange={setCriteria} team={team} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setCriteria(emptyCriteria())}>Limpar</Button>
          <Button size="sm" className="h-8 text-xs" disabled={!active}
            onClick={() => { const name = prompt("Nome da busca salva:"); if (name?.trim()) savedMut.create.mutate({ name: name.trim(), scope: "all", criteria }); }}>
            Salvar busca
          </Button>
          {saved.data && saved.data.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap ml-1">
              <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
              {saved.data.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs group">
                  <span className="mkt-dot" style={{ ["--mkt-accent" as string]: getAccent(null) }} />
                  <button onClick={() => setCriteria(s.criteria)} className="text-foreground hover:text-primary transition">{s.name}</button>
                  <button onClick={() => savedMut.remove.mutate({ id: s.id })} className="text-muted-foreground hover:text-destructive transition"><Trash2 className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {active && (
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground mb-2">{results.length} resultado(s)</p>
            {results.length === 0 ? (
              <div className="mkt-empty !py-8">
                <div className="mkt-empty-icon"><Search className="h-6 w-6" /></div>
                <p className="mkt-empty-title" style={{ fontFamily: HEADING_FONT }}>Nenhum resultado</p>
                <p className="mkt-empty-subcopy">Nenhum cartão bate com o filtro. Ajuste os critérios de busca.</p>
              </div>
            ) : (
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {results.map((c) => (
                  <button key={c.id} onClick={() => navigate(`/quadros/${c.board_id}?card=${c.id}`)}
                    className="w-full text-left py-2.5 px-2 flex items-center justify-between gap-2 hover:bg-muted/50 rounded-md transition">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{c.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.boardTitle} · {c.listTitle}</p>
                    </div>
                    {c.due_date && <span className="text-xs text-muted-foreground inline-flex items-center gap-1 shrink-0"><Clock className="h-3.5 w-3.5" /> {new Date(c.due_date).toLocaleDateString("pt-BR")}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
