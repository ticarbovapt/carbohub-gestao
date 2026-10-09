import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBoards, useBoardLists } from "@/hooks/useBoards";
import { positionForIndex } from "@/lib/mktPosition";
import { copiarCartao, type OpcoesCopia } from "@/lib/cartaoCopiar";

// "Mover" e "Copiar" do menu do cartão — o mesmo diálogo do Trello: quadro,
// lista e POSIÇÃO. Mover passa pela RPC `mkt_cartao_mover` (atômica, remapeia
// etiquetas e campos entre quadros); copiar, por `lib/cartaoCopiar.ts`.
//
// ⚠️ Cartão ESPELHO não se copia: a cópia seria de quê, do espelho ou do
// original? Abre o original e copia de lá.

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: unknown) => any };

export function MoverCopiar({ modo, card, onClose, onFeito }: {
  modo: "mover" | "copiar";
  card: { id: string; title: string; board_id: string; list_id: string };
  onClose: () => void;
  onFeito?: (novoId?: string) => void;
}) {
  const qc = useQueryClient();
  const { data: quadros = [] } = useBoards();
  const [boardId, setBoardId] = useState(card.board_id);
  const { data: listas = [] } = useBoardLists(boardId);
  const [listId, setListId] = useState(card.list_id);
  const [indice, setIndice] = useState<number | null>(null);
  const [titulo, setTitulo] = useState(card.title);
  const [manter, setManter] = useState({ checklists: true, etiquetas: true, membros: true, anexos: true, comentarios: false, campos: true });
  const [ocupado, setOcupado] = useState(false);

  // Trocou de quadro: a lista anterior não existe lá — vai para a primeira.
  useEffect(() => {
    if (!listas.length) return;
    if (!listas.some((l) => l.id === listId)) setListId(listas[0].id);
  }, [listas, listId]);

  // Posições da lista de destino, SEM o próprio cartão (mover dentro da mesma
  // lista não pode contar a si mesmo).
  const { data: posicoes = [] } = useQuery({
    queryKey: ["mkt", "posicoes-lista", listId],
    enabled: !!listId,
    queryFn: async () => {
      const r = await db.from("mkt_cards").select("id, position").eq("list_id", listId).eq("is_archived", false).order("position");
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as { id: string; position: number }[];
    },
  });
  const outros = useMemo(() => posicoes.filter((p) => p.id !== card.id), [posicoes, card.id]);
  const atual = posicoes.findIndex((p) => p.id === card.id);
  const opcoes = outros.length + 1;
  // Padrão: mover mantém a posição atual na mesma lista; senão, vai para o fim.
  const indiceEfetivo = indice ?? (listId === card.list_id && atual >= 0 ? atual : outros.length);

  const confirmarAcao = async () => {
    setOcupado(true);
    const pos = positionForIndex(outros.map((p) => Number(p.position)), indiceEfetivo);
    try {
      if (modo === "mover") {
        const r = await db.rpc("mkt_cartao_mover", { p_card: card.id, p_list: listId, p_position: pos });
        if (r.error) throw new Error(r.error.message);
        toast.success(boardId !== card.board_id ? "Cartão movido para o outro quadro." : "Cartão movido.");
        onFeito?.();
      } else {
        const novo = await copiarCartao(card.id, listId, pos, { titulo, ...manter } as OpcoesCopia);
        toast.success("Cartão copiado.");
        onFeito?.(novo);
      }
      qc.invalidateQueries({ queryKey: ["mkt"] });
      onClose();
    } catch (e) {
      toast.error(`${modo === "mover" ? "Não moveu" : "Não copiou"}: ${(e as Error).message}`);
    } finally { setOcupado(false); }
  };

  const Caixa = ({ k, rot }: { k: keyof typeof manter; rot: string }) => (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={manter[k]} onChange={(e) => setManter((m) => ({ ...m, [k]: e.target.checked }))} className="h-4 w-4 accent-[hsl(var(--primary))]" /> {rot}
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !ocupado) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{modo === "mover" ? "Mover cartão" : "Copiar cartão"}</DialogTitle>
          <DialogDescription className="truncate">{card.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {modo === "copiar" && (
            <div className="space-y-1.5">
              <label className="mkt-meta-label block">Título</label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9 text-sm" />
            </div>
          )}
          {modo === "copiar" && (
            <div className="space-y-1.5">
              <p className="mkt-meta-label">Manter</p>
              <div className="grid grid-cols-2 gap-1.5">
                <Caixa k="checklists" rot="Checklists" /><Caixa k="etiquetas" rot="Etiquetas" />
                <Caixa k="membros" rot="Membros" /><Caixa k="anexos" rot="Anexos" />
                <Caixa k="campos" rot="Campos" /><Caixa k="comentarios" rot="Comentários" />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="mkt-meta-label block">Quadro</label>
            <select value={boardId} onChange={(e) => { setBoardId(e.target.value); setIndice(null); }} className="mkt-field text-sm w-full">
              {quadros.map((b) => <option key={b.id} value={b.id}>{b.title}{b.id === card.board_id ? " (atual)" : ""}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1.5 min-w-0">
              <label className="mkt-meta-label block">Lista</label>
              <select value={listId} onChange={(e) => { setListId(e.target.value); setIndice(null); }} className="mkt-field text-sm w-full">
                {listas.map((l) => <option key={l.id} value={l.id}>{l.title}{l.id === card.list_id ? " (atual)" : ""}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="mkt-meta-label block">Posição</label>
              <select value={indiceEfetivo} onChange={(e) => setIndice(Number(e.target.value))} className="mkt-field text-sm w-28">
                {Array.from({ length: opcoes }, (_, i) => <option key={i} value={i}>{i + 1}{modo === "mover" && listId === card.list_id && i === atual ? " (atual)" : ""}</option>)}
              </select>
            </div>
          </div>
          {boardId !== card.board_id && (
            <p className="text-xs text-muted-foreground">
              Para outro quadro: etiquetas vão pelo nome e cor (criadas lá se faltarem); campos só vão se existir um com o mesmo nome lá.
            </p>
          )}
          <Button className="w-full" onClick={confirmarAcao} disabled={ocupado || !listId}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : modo === "mover" ? "Mover" : "Criar cópia"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
