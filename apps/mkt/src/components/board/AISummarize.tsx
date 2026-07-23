import { useState } from "react";
import { Sparkles, Loader2, Copy, MessageSquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMktAI } from "@/hooks/useMktAI";

// Resumo por IA (D7) da thread de comentários + estado do checklist. Mostra o
// resultado num quadro dismissível; não posta sozinho — o usuário decide copiar
// ou postar como comentário.

const SYS_SUMMARY = `Você resume threads de trabalho de um cartão de tarefa. Em português brasileiro, produza um resumo objetivo em tópicos curtos: pontos principais discutidos, decisões tomadas e pendências / próximos passos (inclua itens de checklist não concluídos). Não invente informação que não esteja no conteúdo.`;

export function AISummarize({ buildContext, onPost }: { buildContext: () => string; onPost: (text: string) => void }) {
  const { generate, loading } = useMktAI();
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    const ctx = buildContext();
    if (!ctx.trim()) { toast.warning("Nada para resumir ainda."); return; }
    setResult("");
    try {
      const out = await generate({ system: SYS_SUMMARY, user: ctx, onChunk: setResult });
      if (!out.trim()) setResult(null);
    } catch (e) { setResult(null); toast.error(e instanceof Error ? e.message : "Erro na IA."); }
  };

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={loading} onClick={run}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Resumir com IA
      </Button>

      {result !== null && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-2">
          <p className="text-sm text-foreground whitespace-pre-wrap">{result || <span className="text-muted-foreground">Resumindo…</span>}</p>
          {!loading && result && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={() => { navigator.clipboard?.writeText(result); toast.success("Resumo copiado."); }}>
                <Copy className="h-3.5 w-3.5" /> Copiar
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={() => { onPost(result); setResult(null); }}>
                <MessageSquarePlus className="h-3.5 w-3.5" /> Postar como comentário
              </Button>
              <button type="button" onClick={() => setResult(null)} className="p-1 text-muted-foreground hover:text-foreground ml-auto"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
