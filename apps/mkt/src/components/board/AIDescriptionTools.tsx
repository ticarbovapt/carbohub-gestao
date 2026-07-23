import { useState } from "react";
import { Sparkles, Loader2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useMktAI } from "@/hooks/useMktAI";

// Botões de IA da Descrição (D7): gerar rascunho a partir de um resumo curto,
// ou melhorar/corrigir o texto atual. O resultado preenche o textarea ao vivo;
// o usuário revê e só grava ao clicar em Salvar (nada é salvo automaticamente).

const SYS_DRAFT = `Você é um redator de marketing. A partir de um resumo curto, escreva a descrição de um cartão de tarefa em português brasileiro: clara, objetiva e organizada (quando fizer sentido, use tópicos de ação). Seja conciso. Retorne APENAS a descrição, sem títulos como "Descrição:".`;
const SYS_IMPROVE = `Você é um editor de marketing. Corrija gramática e ortografia e deixe o texto mais claro e profissional, mantendo o significado e o idioma (português brasileiro). Retorne APENAS o texto melhorado, sem comentários ou aspas.`;

export function AIDescriptionTools({ text, onApply }: { text: string; onApply: (t: string) => void }) {
  const { generate, loading } = useMktAI();
  const [briefOpen, setBriefOpen] = useState(false);
  const [brief, setBrief] = useState("");

  const handleErr = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro na IA.");

  const improve = async () => {
    if (!text.trim()) { toast.warning("Escreva algo antes de melhorar."); return; }
    try { await generate({ system: SYS_IMPROVE, user: text, onChunk: onApply }); toast.success("Descrição aprimorada."); }
    catch (e) { handleErr(e); }
  };

  const draft = async () => {
    if (!brief.trim()) return;
    try {
      await generate({ system: SYS_DRAFT, user: brief.trim(), onChunk: onApply });
      setBriefOpen(false); setBrief(""); toast.success("Rascunho gerado.");
    } catch (e) { handleErr(e); }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={loading} onClick={() => setBriefOpen((v) => !v)}>
          <Sparkles className="h-3.5 w-3.5" /> Gerar rascunho
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={loading || !text.trim()} onClick={improve}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Melhorar
        </Button>
        <span className="text-[10px] text-muted-foreground">a IA preenche o campo — revise e clique em Salvar</span>
      </div>
      {briefOpen && (
        <div className="flex gap-1.5">
          <Input autoFocus value={brief} onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); draft(); } if (e.key === "Escape") setBriefOpen(false); }}
            placeholder="Resumo curto do que o cartão precisa…" className="h-8 text-sm" />
          <Button type="button" size="sm" className="h-8 text-xs" disabled={loading || !brief.trim()} onClick={draft}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Gerar"}
          </Button>
          <button type="button" onClick={() => setBriefOpen(false)} className="p-1.5 text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
