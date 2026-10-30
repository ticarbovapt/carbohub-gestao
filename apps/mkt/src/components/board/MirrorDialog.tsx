import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Link2 } from "lucide-react";
import { useBoards, useBoardLists } from "@/hooks/useBoards";

// Escolhe quadro + lista de destino para espelhar o cartão.
export function MirrorDialog({ onConfirm, onClose }: {
  onConfirm: (targetListId: string, targetBoardId: string) => void;
  onClose: () => void;
}) {
  const { data: boards = [] } = useBoards();
  const [boardId, setBoardId] = useState("");
  const [listId, setListId] = useState("");
  const { data: lists = [] } = useBoardLists(boardId || null);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle className="mkt-view-title flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--input-radius)] bg-accent/10 text-accent">
              <Link2 className="h-4 w-4" />
            </span>
            Espelhar cartão
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="mkt-meta-label">Quadro</label>
            <Select value={boardId} onValueChange={(v) => { setBoardId(v); setListId(""); }}>
              <SelectTrigger className="h-9 rounded-[var(--input-radius)] border-border bg-card"><SelectValue placeholder="Escolher quadro" /></SelectTrigger>
              <SelectContent>{boards.map((b) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="mkt-meta-label">Lista</label>
            <Select value={listId} onValueChange={setListId} disabled={!boardId}>
              <SelectTrigger className="h-9 rounded-[var(--input-radius)] border-border bg-card"><SelectValue placeholder={boardId ? "Escolher lista" : "Escolha o quadro primeiro"} /></SelectTrigger>
              <SelectContent>{lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:bg-muted" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!listId} className="shadow-[var(--shadow-carbo)]" onClick={() => { onConfirm(listId, boardId); onClose(); }}>Espelhar aqui</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
