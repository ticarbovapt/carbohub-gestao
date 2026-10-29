import { Link } from "react-router-dom";

// Alternador de views do quadro (Quadro/Kanban, Calendário, e futuras).
const VIEWS: { key: string; label: string; path: (id: string) => string }[] = [
  { key: "kanban", label: "Quadro", path: (id) => `/quadros/${id}` },
  { key: "calendario", label: "Calendário", path: (id) => `/quadros/${id}/calendario` },
  { key: "timeline", label: "Timeline", path: (id) => `/quadros/${id}/linha-do-tempo` },
  { key: "tabela", label: "Tabela", path: (id) => `/quadros/${id}/tabela` },
  { key: "dashboard", label: "Dashboard", path: (id) => `/quadros/${id}/painel` },
  { key: "mapa", label: "Mapa", path: (id) => `/quadros/${id}/mapa` },
];

export function ViewSwitcher({ boardId, current }: { boardId: string; current: string }) {
  return (
    // No celular as seis vistas não cabem: o seletor rola de lado em vez de
    // empurrar a página (ou ficar cortado na borda).
    <div className="max-w-full overflow-x-auto md:shrink-0 max-md:min-w-0">
      <div className="mkt-segmented w-max">
        {VIEWS.map((v) => (
          <Link key={v.key} to={v.path(boardId)}
            data-active={current === v.key}
            aria-current={current === v.key ? "page" : undefined}
            className={`mkt-segmented-item whitespace-nowrap ${current === v.key ? "is-active" : ""}`}>
            {v.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
