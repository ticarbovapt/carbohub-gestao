import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trello, Plus, X, Filter, Bookmark, Trash2, Clock, CalendarClock, Table2 } from "lucide-react";
import { useBoards, useBoardMutations, useAllCards } from "@/hooks/useBoards";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useSavedSearches, useSavedSearchMutations } from "@/hooks/useSavedSearches";
import { emptyCriteria, criteriaActive, matchCard, type SearchCriteria } from "@/lib/mktFilter";
import { FilterControls } from "@/components/board/FilterControls";
import { BOARD_BG, BOARD_BG_KEYS } from "@/lib/mktTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Trello className="h-6 w-6 text-primary" /> Quadros
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Seus quadros de marketing — listas, cartões, checklists e datas.</p>
      </div>

      {/* Ver todos os quadros (visão da área de trabalho — cruza todos os quadros) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-foreground">Ver todos os quadros:</span>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => navigate("/todos/calendario")}>
          <CalendarClock className="h-3.5 w-3.5" /> Calendário geral
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => navigate("/todos/tabela")}>
          <Table2 className="h-3.5 w-3.5" /> Tabela geral
        </Button>
      </div>

      {/* Busca entre quadros */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /> Buscar entre quadros</p>
        <FilterControls value={criteria} onChange={setCriteria} team={team} />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCriteria(emptyCriteria())}>Limpar</Button>
          <Button size="sm" className="h-7 text-xs" disabled={!active}
            onClick={() => { const name = prompt("Nome da busca salva:"); if (name?.trim()) savedMut.create.mutate({ name: name.trim(), scope: "all", criteria }); }}>
            Salvar busca
          </Button>
          {saved.data && saved.data.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap ml-2">
              <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
              {saved.data.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs group">
                  <button onClick={() => setCriteria(s.criteria)} className="hover:text-foreground">{s.name}</button>
                  <button onClick={() => savedMut.remove.mutate({ id: s.id })} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {active && (
          <div className="border-t border-border pt-2">
            <p className="text-xs text-muted-foreground mb-1">{results.length} resultado(s)</p>
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {results.map((c) => (
                <button key={c.id} onClick={() => navigate(`/quadros/${c.board_id}?card=${c.id}`)}
                  className="w-full text-left py-2 flex items-center justify-between gap-2 hover:bg-muted/50 rounded px-1">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{c.title}</p>
                    <p className="text-[11px] text-muted-foreground">{c.boardTitle} · {c.listTitle}</p>
                  </div>
                  {c.due_date && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 shrink-0"><Clock className="h-3 w-3" /> {new Date(c.due_date).toLocaleDateString("pt-BR")}</span>}
                </button>
              ))}
              {results.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhum cartão bate com o filtro.</p>}
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {boards.map((b) => (
            <button key={b.id} onClick={() => navigate(`/quadros/${b.id}`)}
              className="h-24 rounded-xl p-3 text-left text-white font-semibold shadow-sm hover:brightness-110 transition-all flex items-end"
              style={{ background: BOARD_BG[b.background] ?? BOARD_BG.blue }}>
              <span className="drop-shadow line-clamp-2">{b.title}</span>
            </button>
          ))}

          {creating ? (
            <div className="h-24 rounded-xl border border-border bg-card p-2 flex flex-col gap-1.5">
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setCreating(false); }}
                placeholder="Título do quadro…" className="h-7 text-sm" />
              <div className="flex gap-1 flex-wrap">
                {BOARD_BG_KEYS.slice(0, 8).map((k) => (
                  <button key={k} onClick={() => setBg(k)}
                    className={`h-5 w-5 rounded ${bg === k ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                    style={{ background: BOARD_BG[k] }} />
                ))}
              </div>
              <div className="flex items-center gap-1 mt-auto">
                <Button size="sm" className="h-6 text-xs" onClick={create}>Criar</Button>
                <button onClick={() => setCreating(false)} className="p-1 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCreating(true)}
              className="h-24 rounded-xl border border-dashed border-border bg-muted/40 hover:bg-muted flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
              <Plus className="h-5 w-5" /> Criar quadro
            </button>
          )}
        </div>
      )}
    </div>
  );
}
