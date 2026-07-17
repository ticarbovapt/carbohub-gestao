import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { EMOJI_CATEGORIES, searchEmojis, getRecentEmojis, pushRecentEmoji } from "../lib/emojis";

// Seletor de emoji (sem lib): busca por palavra-chave (PT), categorias com abas
// e "Recentes" (localStorage). Mantém a API onPick/onClose.
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const recents = useMemo(() => getRecentEmojis(), []);
  const results = query.trim() ? searchEmojis(query) : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function choose(e: string) { pushRecentEmoji(e); onPick(e); }
  function goTo(id: string) { sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute bottom-full left-2 z-40 mb-2 w-80 rounded-xl border bg-popover shadow-lg" role="dialog" aria-label="Selecionar emoji">
        {/* busca */}
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar emoji…"
              aria-label="Buscar emoji"
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            {query && <button onClick={() => setQuery("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
          </div>
        </div>

        {/* abas de categoria (escondidas durante a busca) */}
        {!query.trim() && (
          <div className="flex gap-0.5 border-b px-1.5 py-1">
            {recents.length > 0 && (
              <button onClick={() => goTo("recentes")} title="Recentes" aria-label="Recentes" className="rounded-md p-1 text-base leading-none hover:bg-muted">🕘</button>
            )}
            {EMOJI_CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => goTo(c.id)} title={c.label} aria-label={c.label}
                className="rounded-md p-1 text-base leading-none hover:bg-muted">{c.icon}</button>
            ))}
          </div>
        )}

        {/* grade */}
        <div className="max-h-60 overflow-y-auto p-2">
          {query.trim() ? (
            results.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nenhum emoji encontrado.</p>
            ) : (
              <div className="grid grid-cols-8 gap-0.5">
                {results.map((em) => (
                  <button key={em.e} onClick={() => choose(em.e)} type="button" title={em.kw}
                    className="rounded-md p-1 text-xl leading-none hover:bg-muted">{em.e}</button>
                ))}
              </div>
            )
          ) : (
            <>
              {recents.length > 0 && (
                <div ref={(el) => { sectionRefs.current["recentes"] = el; }} className="mb-1">
                  <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recentes</p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {recents.map((e, i) => (
                      <button key={e + i} onClick={() => choose(e)} type="button"
                        className="rounded-md p-1 text-xl leading-none hover:bg-muted">{e}</button>
                    ))}
                  </div>
                </div>
              )}
              {EMOJI_CATEGORIES.map((c) => (
                <div key={c.id} ref={(el) => { sectionRefs.current[c.id] = el; }} className="mb-1">
                  <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {c.emojis.map((em) => (
                      <button key={em.e} onClick={() => choose(em.e)} type="button" title={em.kw}
                        className="rounded-md p-1 text-xl leading-none hover:bg-muted">{em.e}</button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
