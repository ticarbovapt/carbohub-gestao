import { X, Check, Clock } from "lucide-react";
import { useAnnouncementStatus } from "../hooks";
import { Avatar } from "./Avatar";

// Painel do publicador: quem confirmou / quem falta um comunicado (por mensagem).
export function AnnouncementStatus({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const { data = [], isLoading } = useAnnouncementStatus(messageId);
  const confirmados = data.filter((r) => r.acked);
  const faltam = data.filter((r) => !r.acked);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-label="Confirmações do comunicado" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border bg-popover shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Confirmações de leitura</span>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="overflow-y-auto p-2">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
              Confirmaram ({confirmados.length} de {data.length})
            </p>
            {confirmados.map((r) => (
              <div key={r.user_id} className="flex items-center gap-2.5 px-2 py-1.5">
                <Avatar name={r.full_name} url={r.avatar_url} size={30} />
                <span className="flex-1 truncate text-sm">{r.full_name ?? "—"}</span>
                <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                  <Check className="h-3.5 w-3.5" />
                  {r.acked_at ? new Date(r.acked_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
              </div>
            ))}
            {faltam.length > 0 && (
              <>
                <p className="mt-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Faltam ({faltam.length})
                </p>
                {faltam.map((r) => (
                  <div key={r.user_id} className="flex items-center gap-2.5 px-2 py-1.5">
                    <Avatar name={r.full_name} url={r.avatar_url} size={30} />
                    <span className="flex-1 truncate text-sm text-muted-foreground">{r.full_name ?? "—"}</span>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
