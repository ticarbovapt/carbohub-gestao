import { useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Lock, Users } from "lucide-react";
import { usePoll, useVotePoll, useClosePoll } from "../hooks";
import { Avatar } from "./Avatar";
import type { ChatMessage } from "../types";

// Enquete dentro da conversa. Config + resultados vêm de chat_poll_get (usePoll);
// o ChatAlerts invalida ["chat","poll"] a cada voto/fechamento → barras ao vivo.
export function PollBubble({ m, mine, isGroup, showName, senderName, currentUserId, isChannelAdmin }: {
  m: ChatMessage; mine: boolean; isGroup: boolean; showName: boolean; senderName: string;
  currentUserId: string; isChannelAdmin: boolean;
}) {
  const { data: poll, isLoading } = usePoll(m.id);
  const vote = useVotePoll();
  const close = useClosePoll();

  // Seleção local (escolha múltipla usa um "Salvar voto"; única vota no clique).
  const [sel, setSel] = useState<Set<number>>(new Set());
  useEffect(() => { if (poll) setSel(new Set(poll.meus_votos)); }, [poll?.meus_votos?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const when = new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const expired = !!poll?.expira_em && new Date(poll.expira_em).getTime() < Date.now();
  const closed = !!poll?.fechada_em || expired;
  const canClose = !!poll && !poll.fechada_em && (poll.created_by === currentUserId || isChannelAdmin);
  const total = poll?.total_votantes ?? 0;

  const dirty = useMemo(() => {
    if (!poll) return false;
    const server = new Set(poll.meus_votos);
    if (server.size !== sel.size) return true;
    for (const i of sel) if (!server.has(i)) return true;
    return false;
  }, [poll?.meus_votos, sel]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(idx: number) {
    if (closed || !poll) return;
    if (poll.multipla) {
      setSel((prev) => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
    } else {
      // Única: clicar vota na hora; clicar de novo na mesma tira o voto.
      const next = poll.meus_votos.includes(idx) ? [] : [idx];
      vote.mutate({ pollId: m.id, opcoes: next });
    }
  }

  const bubbleCls = mine
    ? "rounded-br-sm bg-[#d9fdd3] text-neutral-900 dark:bg-[#005c4b] dark:text-neutral-50"
    : "rounded-bl-sm bg-muted text-foreground";

  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`w-full max-w-[85%] sm:max-w-[420px] rounded-2xl px-3 py-2.5 text-sm ${bubbleCls}`}>
        {showName && <p className="mb-0.5 text-xs font-semibold text-primary">{senderName}</p>}

        <div className="mb-1 flex items-center gap-1.5 text-xs opacity-70">
          <BarChart3 className="h-3.5 w-3.5" />
          <span>Enquete{poll?.multipla ? " · múltipla" : ""}{poll?.anonima ? " · anônima" : ""}</span>
        </div>

        {isLoading || !poll ? (
          <div className="py-2 text-xs opacity-60">Carregando enquete…</div>
        ) : (
          <>
            <p className="mb-2 font-medium whitespace-pre-wrap break-words">{poll.pergunta}</p>

            <div className="space-y-1.5">
              {poll.opcoes.map((op) => {
                const pct = total > 0 ? Math.round((op.votos / total) * 100) : 0;
                const chosen = sel.has(op.idx);
                const iVoted = poll.meus_votos.includes(op.idx);
                return (
                  <button
                    key={op.idx}
                    onClick={() => toggle(op.idx)}
                    disabled={closed || vote.isPending}
                    className={`relative w-full overflow-hidden rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                      chosen ? "border-primary/60" : "border-black/10 dark:border-white/15"
                    } ${closed ? "cursor-default" : "hover:border-primary/50"}`}
                  >
                    {/* barra de fundo com a % */}
                    <span className="absolute inset-y-0 left-0 bg-primary/15 transition-all" style={{ width: `${pct}%` }} aria-hidden />
                    <span className="relative flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${poll.multipla ? "rounded-sm" : "rounded-full"} ${
                          chosen || iVoted ? "border-primary bg-primary text-primary-foreground" : "border-black/30 dark:border-white/40"
                        }`}>
                          {(chosen || iVoted) && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{op.texto}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums opacity-70">{op.votos} · {pct}%</span>
                    </span>
                    {/* votantes (só enquete aberta/não-anônima) */}
                    {op.votantes && op.votantes.length > 0 && (
                      <span className="relative mt-1 flex flex-wrap items-center gap-1">
                        {op.votantes.slice(0, 8).map((v) => (
                          <span key={v.id} title={v.full_name ?? ""}><Avatar name={v.full_name} url={v.avatar_url} size={18} /></span>
                        ))}
                        {op.votantes.length > 8 && <span className="text-[10px] opacity-60">+{op.votantes.length - 8}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* múltipla: salvar seleção */}
            {poll.multipla && !closed && dirty && (
              <button onClick={() => vote.mutate({ pollId: m.id, opcoes: [...sel] })} disabled={vote.isPending}
                className="mt-2 w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                {vote.isPending ? "Salvando…" : "Salvar voto"}
              </button>
            )}

            <div className="mt-2 flex items-center justify-between text-[11px] opacity-70">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{total} {total === 1 ? "voto" : "votos"}</span>
              <span className="flex items-center gap-2">
                {closed && <span className="flex items-center gap-1"><Lock className="h-3 w-3" />{poll.fechada_em ? "Encerrada" : "Prazo esgotado"}</span>}
                {!closed && poll.expira_em && <span>encerra {new Date(poll.expira_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
                <span>{when}</span>
              </span>
            </div>

            {canClose && (
              <button onClick={() => close.mutate({ pollId: m.id })} disabled={close.isPending}
                className="mt-1.5 text-[11px] font-medium text-primary hover:underline disabled:opacity-50">
                Encerrar enquete
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
