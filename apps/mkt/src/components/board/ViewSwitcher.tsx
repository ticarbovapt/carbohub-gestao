import { useNavigate } from "react-router-dom";

// Alternador de views do quadro (Quadro/Kanban, Calendário, e futuras).
const VIEWS: { key: string; label: string; path: (id: string) => string }[] = [
  { key: "kanban", label: "Quadro", path: (id) => `/quadros/${id}` },
  { key: "calendario", label: "Calendário", path: (id) => `/quadros/${id}/calendario` },
  { key: "timeline", label: "Timeline", path: (id) => `/quadros/${id}/timeline` },
  { key: "tabela", label: "Tabela", path: (id) => `/quadros/${id}/tabela` },
  { key: "dashboard", label: "Dashboard", path: (id) => `/quadros/${id}/dashboard` },
  { key: "mapa", label: "Mapa", path: (id) => `/quadros/${id}/mapa` },
];

export function ViewSwitcher({ boardId, current }: { boardId: string; current: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex gap-0.5 bg-white/15 rounded-md p-0.5">
      {VIEWS.map((v) => (
        <button key={v.key} onClick={() => navigate(v.path(boardId))}
          className={`px-2.5 py-1 text-xs font-semibold rounded ${current === v.key ? "bg-white text-slate-900" : "text-white/90 hover:text-white"}`}>
          {v.label}
        </button>
      ))}
    </div>
  );
}
