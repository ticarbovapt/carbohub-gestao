import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, ArrowRight, Copy, CreditCard, Clock, Share2, Tag, User, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCardMutations } from "@/hooks/useCardDetail";
import type { BoardPerson, CardSummary, Label } from "@/hooks/useBoards";
import { LABEL_COLORS, tintedLabelStyle } from "@/lib/mktTheme";
import { CapaPainel } from "@/components/board/CapaPainel";
import { DatasPainel } from "@/components/board/DatasPainel";
import { diceBearUrl } from "@/components/ui/profile-avatar";
import { MoverCopiar } from "@/components/board/MoverCopiar";

// ─────────────────────────────────────────────────────────────────────────────
// Edição rápida — o lápis que aparece ao passar o mouse no cartão (ou a tecla
// E), como no Trello: o título vira campo ALI MESMO e ao lado aparecem as
// ações mais usadas, sem abrir o cartão inteiro.
//
// ⚠️ Em cartão ESPELHO, o conteúdo (título, etiquetas, membros, datas, capa) é
// do ORIGINAL — editar aqui edita o original, que é o que o espelho mostra. Só
// "Arquivar" age sobre o próprio espelho: arquivar o original o tiraria do
// quadro de ORIGEM, que não é o que quem está olhando o espelho pediu.
// ─────────────────────────────────────────────────────────────────────────────

type Painel = null | "etiquetas" | "membros" | "capa" | "datas";


export function EdicaoRapida({ card, rect, boardId, labels, pessoas, onClose, onAbrir, onArquivar }: {
  card: CardSummary; rect: DOMRect; boardId: string; labels: Label[]; pessoas: BoardPerson[];
  onClose: () => void; onAbrir: () => void; onArquivar: () => void;
}) {
  const conteudo = card.mirrorOf ?? card.id;
  const mut = useCardMutations(conteudo, boardId);
  const [titulo, setTitulo] = useState(card.title);
  const [painel, setPainel] = useState<Painel>(null);
  const [mc, setMc] = useState<"mover" | "copiar" | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { campo.current?.focus(); campo.current?.select(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !mc) onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, mc]);

  const salvar = () => {
    const t = titulo.trim();
    if (t && t !== card.title) mut.updateCard.mutate({ title: t });
    onClose();
  };

  // Ações à direita do cartão; sem espaço, à esquerda (cartão da última lista).
  const larguraMenu = 220;
  const aDireita = rect.right + 8 + larguraMenu < window.innerWidth;
  const topo = Math.min(rect.top, window.innerHeight - 420);

  const Acao = ({ icone: I, rot, onClick, ativo }: { icone: typeof Tag; rot: string; onClick: () => void; ativo?: boolean }) => (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-left transition-colors ${ativo ? "bg-primary text-primary-foreground" : "bg-popover/95 text-foreground hover:bg-muted"}`}>
      <I className="h-4 w-4 shrink-0" /> {rot}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) salvar(); }}>
      <div className="absolute" style={{ top: Math.max(8, topo), left: rect.left, width: rect.width }}>
        <div className="mkt-card !cursor-default space-y-2">
          <textarea ref={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} rows={3}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); salvar(); } }}
            className="w-full resize-none bg-transparent text-sm text-foreground focus:outline-none" />
        </div>
        <Button size="sm" className="mt-2" onClick={salvar}>Salvar</Button>
      </div>

      <div className="absolute space-y-1" style={{ top: Math.max(8, topo), width: larguraMenu, ...(aDireita ? { left: rect.right + 8 } : { left: rect.left - 8 - larguraMenu }) }}>
        <Acao icone={CreditCard} rot="Abrir cartão" onClick={() => { onClose(); onAbrir(); }} />
        <Acao icone={Tag} rot="Editar etiquetas" ativo={painel === "etiquetas"} onClick={() => setPainel(painel === "etiquetas" ? null : "etiquetas")} />
        <Acao icone={User} rot="Alterar membros" ativo={painel === "membros"} onClick={() => setPainel(painel === "membros" ? null : "membros")} />
        <Acao icone={CreditCard} rot="Mudar capa" ativo={painel === "capa"} onClick={() => setPainel(painel === "capa" ? null : "capa")} />
        <Acao icone={Clock} rot="Editar datas" ativo={painel === "datas"} onClick={() => setPainel(painel === "datas" ? null : "datas")} />
        <Acao icone={ArrowRight} rot="Mover" onClick={() => setMc("mover")} />
        <Acao icone={Copy} rot="Copiar" onClick={() => setMc("copiar")} />
        <Acao icone={Share2} rot="Copiar link" onClick={async () => {
          const url = `${window.location.origin}/cartao/${conteudo}`;
          try { await navigator.clipboard.writeText(url); toast.success("Link do cartão copiado."); } catch { toast.message(url); }
        }} />
        <Acao icone={Archive} rot="Arquivar" onClick={() => { onArquivar(); onClose(); }} />

        {painel && (
          <div className="mt-2 rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-2 max-h-[70vh] overflow-y-auto">
            {painel === "etiquetas" && (labels.length === 0
              ? <p className="text-xs text-muted-foreground p-1">Este quadro não tem etiquetas ainda.</p>
              : labels.map((l) => {
                  const on = card.labelIds.includes(l.id);
                  const cor = LABEL_COLORS[l.color] ?? l.color;
                  return (
                    <button key={l.id} onClick={() => mut.toggleLabel.mutate({ labelId: l.id, on: !on })}
                      className="w-full flex items-center gap-2 rounded-md p-1 hover:bg-muted">
                      <span className="h-4 w-4 grid place-items-center rounded border border-border">{on && <Check className="h-3 w-3" />}</span>
                      <span className="flex-1 h-6 rounded-md px-2 text-xs font-medium flex items-center" style={l.name ? tintedLabelStyle(cor) : { background: cor }}>{l.name}</span>
                    </button>
                  );
                }))}
            {painel === "membros" && (pessoas.length === 0
              ? <p className="text-xs text-muted-foreground p-1">Ninguém neste quadro ainda — atribua pelo cartão aberto.</p>
              : pessoas.map((p) => {
                  const on = card.memberIds.includes(p.id);
                  return (
                    <button key={p.id} onClick={() => mut.toggleMember.mutate({ userId: p.id, on: !on })}
                      className="w-full flex items-center gap-2 rounded-md p-1 hover:bg-muted text-sm">
                      <span className="h-4 w-4 grid place-items-center rounded border border-border">{on && <Check className="h-3 w-3" />}</span>
                      <img src={p.avatar_url || diceBearUrl(p.id)} className="h-6 w-6 rounded-full object-cover" />
                      <span className="truncate">{p.full_name ?? "Usuário"}</span>
                    </button>
                  );
                }))}
            {painel === "capa" && (
              <div className="p-1"><CapaPainel cardId={conteudo} cover={card.cover} onChange={(cover) => mut.updateCard.mutate({ cover })} /></div>
            )}
            {painel === "datas" && (
              <div className="p-1">
                <DatasPainel card={card} onFechar={() => setPainel(null)}
                  onSalvar={(patch) => mut.updateCard.mutate(patch)} />
              </div>
            )}
          </div>
        )}
      </div>

      {mc && (
        // Mover leva o PRÓPRIO cartão (o espelho muda de lugar, o original fica);
        // copiar copia o CONTEÚDO, que é o do original.
        <MoverCopiar modo={mc} card={{ id: mc === "mover" ? card.id : conteudo, title: card.title, board_id: card.board_id, list_id: card.list_id }}
          onClose={() => setMc(null)} onFeito={() => { setMc(null); onClose(); }} />
      )}
    </div>,
    document.body,
  );
}
