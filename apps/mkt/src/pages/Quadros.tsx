import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trello, Plus, X } from "lucide-react";
import { useBoards, useBoardMutations } from "@/hooks/useBoards";
import { BOARD_BG, BOARD_BG_KEYS } from "@/lib/mktTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Lista de quadros do time de Marketing (Trello interno).
export default function Quadros() {
  const navigate = useNavigate();
  const { data: boards = [], isLoading } = useBoards();
  const { createBoard } = useBoardMutations();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [bg, setBg] = useState("blue");

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

          {/* Criar quadro */}
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
