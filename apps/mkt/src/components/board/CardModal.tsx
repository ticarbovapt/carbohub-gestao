import { useEffect, useState } from "react";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tag, Clock, CheckSquare, User, Archive, Plus, X, Trash2, AlignLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useCardDetail, useCardMutations } from "@/hooks/useCardDetail";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { LABEL_COLORS, LABEL_COLOR_KEYS } from "@/lib/mktTheme";
import type { Label } from "@/hooks/useBoards";
import { diceBearUrl } from "@/components/ui/profile-avatar";

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {title}</p>
      {children}
    </div>
  );
}

export function CardModal({ cardId, boardId, labels, onClose }: {
  cardId: string; boardId: string; labels: Label[]; onClose: () => void;
}) {
  const { data, isLoading } = useCardDetail(cardId);
  const mut = useCardMutations(cardId, boardId);
  const { data: team = [] } = useTeamMembers();

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [editDesc, setEditDesc] = useState(false);
  const [comment, setComment] = useState("");
  const [newItemFor, setNewItemFor] = useState<string | null>(null);
  const [itemText, setItemText] = useState("");
  const [showLabels, setShowLabels] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  useEffect(() => {
    if (data) { setTitle(data.card.title); setDesc(data.card.description ?? ""); }
  }, [data?.card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTitle = () => {
    const t = title.trim();
    if (t && data && t !== data.card.title) mut.updateCard.mutate({ title: t });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[calc(100%-1.5rem)] max-h-[90vh] overflow-y-auto p-0">
        {isLoading || !data ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Título */}
            <input
              value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="w-full text-lg font-bold bg-transparent border-0 focus:outline-none focus:ring-0 pr-8 text-foreground"
            />

            {/* Etiquetas + membros (chips) */}
            <div className="flex flex-wrap gap-4">
              {data.labelIds.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Etiquetas</p>
                  <div className="flex flex-wrap gap-1">
                    {labels.filter((l) => data.labelIds.includes(l.id)).map((l) => (
                      <span key={l.id} className="h-6 px-2 rounded flex items-center text-xs font-medium text-white" style={{ background: LABEL_COLORS[l.color] ?? l.color }}>{l.name || "—"}</span>
                    ))}
                  </div>
                </div>
              )}
              {data.memberIds.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Membros</p>
                  <div className="flex -space-x-1.5">
                    {data.memberIds.map((uid) => {
                      const p = team.find((t) => t.id === uid);
                      return <img key={uid} src={p?.avatar_url || diceBearUrl(uid)} title={p?.full_name ?? ""} className="h-7 w-7 rounded-full ring-2 ring-background object-cover" />;
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Datas */}
            <Section icon={Clock} title="Datas">
              <div className="flex items-center gap-2 flex-wrap">
                <input type="datetime-local" value={toLocalInput(data.card.due_date)}
                  onChange={(e) => mut.updateCard.mutate({ due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="h-8 text-sm rounded-md border border-border bg-card px-2" />
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <input type="checkbox" checked={data.card.is_complete} onChange={(e) => mut.updateCard.mutate({ is_complete: e.target.checked })} />
                  Concluído
                </label>
              </div>
            </Section>

            {/* Descrição */}
            <Section icon={AlignLeft} title="Descrição">
              {editDesc ? (
                <div className="space-y-1.5">
                  <textarea autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} rows={4}
                    className="w-full text-sm rounded-lg border border-border bg-card p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary" />
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => { mut.updateCard.mutate({ description: desc }); setEditDesc(false); }}>Salvar</Button>
                    <button onClick={() => { setDesc(data.card.description ?? ""); setEditDesc(false); }} className="p-1.5 text-muted-foreground"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setEditDesc(true)} className="w-full text-left text-sm rounded-lg bg-muted/50 hover:bg-muted p-2 min-h-[40px] text-foreground whitespace-pre-wrap">
                  {data.card.description || <span className="text-muted-foreground">Adicionar uma descrição…</span>}
                </button>
              )}
            </Section>

            {/* Checklists */}
            <Section icon={CheckSquare} title="Checklists">
              <div className="space-y-3">
                {data.checklists.map((cl) => {
                  const done = cl.items.filter((i) => i.is_done).length;
                  const pct = cl.items.length ? Math.round((done / cl.items.length) * 100) : 0;
                  return (
                    <div key={cl.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">{cl.title}</p>
                        <button onClick={() => mut.removeChecklist.mutate({ id: cl.id })} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
                      {cl.items.map((it) => (
                        <div key={it.id} className="flex items-center gap-2 group">
                          <input type="checkbox" checked={it.is_done} onChange={(e) => mut.toggleItem.mutate({ id: it.id, done: e.target.checked })} />
                          <span className={`text-sm flex-1 ${it.is_done ? "line-through text-muted-foreground" : "text-foreground"}`}>{it.text}</span>
                          <button onClick={() => mut.removeItem.mutate({ id: it.id })} className="p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                      {newItemFor === cl.id ? (
                        <div className="flex gap-1.5">
                          <Input autoFocus value={itemText} onChange={(e) => setItemText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && itemText.trim()) { mut.addItem.mutate({ checklistId: cl.id, text: itemText.trim(), position: cl.items.length * 1024 }); setItemText(""); } if (e.key === "Escape") setNewItemFor(null); }}
                            placeholder="Adicionar item…" className="h-7 text-sm" />
                        </div>
                      ) : (
                        <button onClick={() => { setNewItemFor(cl.id); setItemText(""); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus className="h-3 w-3" /> Adicionar item</button>
                      )}
                    </div>
                  );
                })}
                <button onClick={() => mut.addChecklist.mutate({ title: "Checklist" })} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus className="h-3 w-3" /> Adicionar checklist</button>
              </div>
            </Section>

            {/* Comentários */}
            <Section icon={AlignLeft} title="Comentários">
              <div className="flex gap-1.5">
                <Input value={comment} onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && comment.trim()) { mut.addComment.mutate({ body: comment.trim() }); setComment(""); } }}
                  placeholder="Escrever um comentário…" className="h-8 text-sm" />
                <Button size="sm" disabled={!comment.trim()} onClick={() => { mut.addComment.mutate({ body: comment.trim() }); setComment(""); }}>Enviar</Button>
              </div>
              <div className="space-y-2 mt-2">
                {data.comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <img src={c.authorAvatar || diceBearUrl(c.user_id)} className="h-7 w-7 rounded-full object-cover shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs"><strong className="text-foreground">{c.authorName ?? "Usuário"}</strong> <span className="text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</span></p>
                      <p className="text-sm text-foreground bg-muted/50 rounded-lg px-2.5 py-1.5 mt-0.5 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Ações */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <div className="relative">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowLabels((v) => !v)}><Tag className="h-3.5 w-3.5" /> Etiquetas</Button>
                {showLabels && (
                  <div className="absolute z-10 mt-1 w-56 rounded-lg border border-border bg-popover shadow-lg p-2 space-y-1">
                    {labels.map((l) => (
                      <label key={l.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer">
                        <input type="checkbox" checked={data.labelIds.includes(l.id)} onChange={(e) => mut.toggleLabel.mutate({ labelId: l.id, on: e.target.checked })} />
                        <span className="h-5 flex-1 rounded flex items-center px-2 text-xs text-white" style={{ background: LABEL_COLORS[l.color] ?? l.color }}>{l.name || "—"}</span>
                      </label>
                    ))}
                    <div className="border-t border-border pt-1">
                      <p className="text-[10px] text-muted-foreground px-1">Criar etiqueta</p>
                      <div className="flex flex-wrap gap-1 p-1">
                        {LABEL_COLOR_KEYS.map((k) => (
                          <button key={k} onClick={() => mut.createLabel.mutate({ name: "", color: k })} className="h-6 w-6 rounded" style={{ background: LABEL_COLORS[k] }} title={`Criar ${k}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowMembers((v) => !v)}><User className="h-3.5 w-3.5" /> Membros</Button>
                {showMembers && (
                  <div className="absolute z-10 mt-1 w-64 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg p-2 space-y-0.5">
                    {team.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer">
                        <input type="checkbox" checked={data.memberIds.includes(t.id)} onChange={(e) => mut.toggleMember.mutate({ userId: t.id, on: e.target.checked })} />
                        <img src={t.avatar_url || diceBearUrl(t.id)} className="h-6 w-6 rounded-full object-cover" />
                        <span className="text-sm truncate">{t.full_name ?? "Usuário"}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <Button size="sm" variant="outline" className="gap-1.5 text-destructive ml-auto"
                onClick={() => { if (confirm("Arquivar este cartão?")) { mut.updateCard.mutate({ is_archived: true, archived_at: new Date().toISOString() }, { onSuccess: onClose }); toast.success("Cartão arquivado."); } }}>
                <Archive className="h-3.5 w-3.5" /> Arquivar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
