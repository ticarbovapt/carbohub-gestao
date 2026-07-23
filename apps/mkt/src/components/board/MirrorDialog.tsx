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
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Espelhar cartão</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          O espelho reflete título, descrição, etiquetas, checklists e membros do original. A edição continua só no cartão original.
        </p>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Quadro</label>
            <Select value={boardId} onValueChange={(v) => { setBoardId(v); setListId(""); }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Escolher quadro" /></SelectTrigger>
              <SelectContent>{boards.map((b) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Lista</label>
            <Select value={listId} onValueChange={setListId} disabled={!boardId}>
              <SelectTrigger className="h-9"><SelectValue placeholder={boardId ? "Escolher lista" : "Escolha o quadro primeiro"} /></SelectTrigger>
              <SelectContent>{lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!listId} onClick={() => { onConfirm(listId, boardId); onClose(); }}>Espelhar aqui</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
