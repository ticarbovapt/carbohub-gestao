import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Reações nos comentários (👍 ❤️ 😂 …), como no Trello. Uma linha por
// (comentário, pessoa, emoji) em `mkt_comment_reacoes` (20261069): sem corrida
// entre duas pessoas reagindo juntas. Reação NÃO avisa no sininho.
// ⚠️ Uma consulta para o CARTÃO inteiro (todos os comentários), nunca uma por
// comentário: cartão importado tem dezenas de comentários.
// ⚠️ Tabela ausente (migração ainda não rodou) = ninguém reagiu; o clique é
// que diz o que falta, em vez de a lista de comentários quebrar.

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { from: (t: string) => any };

export const EMOJIS_REACAO = ["👍", "❤️", "😂", "🎉", "👀", "🙏", "✅", "🔥"];

export interface Reacao { comment_id: string; user_id: string; emoji: string }

export function useReacoes(cardId: string, commentIds: string[]) {
  const qc = useQueryClient();
  const chave = ["mkt", "reacoes", cardId, commentIds.join(",")];
  const q = useQuery({
    queryKey: chave, enabled: commentIds.length > 0,
    queryFn: async () => {
      const out: Reacao[] = [];
      // Lotes: `.in()` com centenas de ids estoura a URL do PostgREST.
      for (let i = 0; i < commentIds.length; i += 150) {
        const r = await db.from("mkt_comment_reacoes").select("comment_id, user_id, emoji").in("comment_id", commentIds.slice(i, i + 150));
        if (r.error) return [] as Reacao[];
        out.push(...(r.data as Reacao[]));
      }
      return out;
    },
  });
  // A reação muda NO CLIQUE; o banco recusou ⇒ volta ao que era e avisa.
  const alternar = async (commentId: string, emoji: string, meuId: string) => {
    const antes = q.data ?? [];
    const ja = antes.some((r) => r.comment_id === commentId && r.user_id === meuId && r.emoji === emoji);
    qc.setQueryData<Reacao[]>(chave, ja
      ? antes.filter((r) => !(r.comment_id === commentId && r.user_id === meuId && r.emoji === emoji))
      : [...antes, { comment_id: commentId, user_id: meuId, emoji }]);
    const r = ja
      ? await db.from("mkt_comment_reacoes").delete().eq("comment_id", commentId).eq("user_id", meuId).eq("emoji", emoji)
      : await db.from("mkt_comment_reacoes").insert({ comment_id: commentId, user_id: meuId, emoji });
    if (r.error) { qc.setQueryData<Reacao[]>(chave, antes); toast.error(`Não reagiu: ${r.error.message}`); }
    qc.invalidateQueries({ queryKey: ["mkt", "reacoes", cardId] });
  };
  return { reacoes: q.data ?? [], alternar };
}

export function ReacoesDoComentario({ reacoes, meuId, nomeDe, onAlternar }: {
  reacoes: Reacao[];
  meuId: string | null;
  nomeDe: (id: string) => string;
  onAlternar: (emoji: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  // Na ordem em que apareceram (a primeira reação fica à esquerda).
  const grupos = new Map<string, string[]>();
  for (const r of reacoes) (grupos.get(r.emoji) ?? grupos.set(r.emoji, []).get(r.emoji)!).push(r.user_id);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {[...grupos].map(([emoji, quem]) => {
        const minha = !!meuId && quem.includes(meuId);
        return (
          <button key={emoji} type="button" onClick={() => onAlternar(emoji)}
            title={quem.map(nomeDe).join(", ")}
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 h-6 text-xs ${minha ? "border-primary/60 bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
            <span className="text-sm leading-none">{emoji}</span>{quem.length}
          </button>
        );
      })}
      {meuId && (
        <div className="relative">
          <button type="button" onClick={() => setAberto((v) => !v)} title="Reagir"
            className="inline-flex items-center justify-center rounded-full h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted">
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
          {aberto && (
            <div className="absolute z-30 left-0 bottom-full mb-1 flex gap-0.5 rounded-full border border-border bg-popover shadow-[var(--shadow-elevated)] p-1"
              onMouseLeave={() => setAberto(false)}>
              {EMOJIS_REACAO.map((e) => (
                <button key={e} type="button" onClick={() => { onAlternar(e); setAberto(false); }}
                  className="h-7 w-7 rounded-full text-base hover:bg-muted hover:scale-110 transition-transform">{e}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
