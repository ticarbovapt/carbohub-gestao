import { useEffect, useState } from "react";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tag, Clock, CheckSquare, User, Archive, Plus, X, Trash2, AlignLeft,
  Paperclip, ExternalLink, FileText, Link2, MapPin, Loader2, MessageSquare,
} from "lucide-react";
import { MirrorDialog } from "@/components/board/MirrorDialog";
import { geocodeText } from "@/hooks/useGeocode";
import { toast } from "sonner";
import { useCardDetail, useCardMutations } from "@/hooks/useCardDetail";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useCustomFields } from "@/hooks/useCustomFields";
import { CustomFieldInput } from "@/components/board/CustomFieldInput";
import { LABEL_COLORS, LABEL_COLOR_KEYS, tintedLabelStyle } from "@/lib/mktTheme";
import { ListChecks } from "lucide-react";
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
    <div className="space-y-2.5">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif" }}>
        <Icon className="h-4 w-4 text-muted-foreground" /> {title}
      </p>
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
  const { data: fields = [] } = useCustomFields(boardId);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [editDesc, setEditDesc] = useState(false);
  const [comment, setComment] = useState("");
  const [newItemFor, setNewItemFor] = useState<string | null>(null);
  const [itemText, setItemText] = useState("");
  const [showLabels, setShowLabels] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [attachUrl, setAttachUrl] = useState("");
  const [showMirror, setShowMirror] = useState(false);
  const [addr, setAddr] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);

  useEffect(() => {
    if (data) { setTitle(data.card.title); setDesc(data.card.description ?? ""); setAddr(data.card.location_name ?? ""); }
  }, [data?.card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTitle = () => {
    const t = title.trim();
    if (t && data && t !== data.card.title) mut.updateCard.mutate({ title: t });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl sm:max-w-4xl w-[calc(100%-1.5rem)] max-h-[90vh] overflow-y-auto p-0">
        {isLoading || !data ? (
          <div className="p-5 grid md:grid-cols-[1fr_260px] gap-5">
            <div className="space-y-4">
              <div className="mkt-skeleton h-8 w-2/3" />
              <div className="mkt-skeleton h-24 w-full" />
              <div className="mkt-skeleton h-20 w-full" />
            </div>
            <div className="space-y-3">
              <div className="mkt-skeleton h-9 w-full" />
              <div className="mkt-skeleton h-9 w-full" />
              <div className="mkt-skeleton h-24 w-full" />
            </div>
          </div>
        ) : (
          <div className="p-5 grid md:grid-cols-[1fr_260px] gap-5">
            {/* ══════════ COLUNA ESQUERDA — conteúdo ══════════ */}
            <div className="space-y-6 min-w-0">
              {/* Título */}
              <div
                className="mkt-accent-left pl-3"
                style={{ ["--mkt-accent" as any]: "hsl(var(--primary))" }}
              >
                <input
                  value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-full text-xl font-semibold bg-transparent border-0 rounded-md px-1.5 py-1 -ml-1.5 hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  style={{ fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif" }}
                />
              </div>

              {/* Descrição */}
              <Section icon={AlignLeft} title="Descrição">
                {editDesc ? (
                  <div className="space-y-2">
                    <textarea autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} rows={4}
                      className="w-full text-sm rounded-[var(--input-radius)] border border-border bg-card p-2.5 resize-y break-words focus:outline-none focus:ring-2 focus:ring-primary/40" />
                    <div className="flex gap-2 items-center">
                      <Button size="sm" onClick={() => { mut.updateCard.mutate({ description: desc }); setEditDesc(false); }}>Salvar</Button>
                      <button onClick={() => { setDesc(data.card.description ?? ""); setEditDesc(false); }} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setEditDesc(true)} className="w-full min-w-0 text-left text-sm rounded-[var(--radius)] bg-muted/40 hover:bg-muted/60 transition-colors p-3 min-h-[48px] text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {data.card.description || <span className="text-muted-foreground">Adicionar uma descrição…</span>}
                  </button>
                )}
              </Section>

              {/* Checklists */}
              <div className="border-t border-border pt-5">
                <Section icon={CheckSquare} title="Checklists">
                  <div className="space-y-3">
                    {data.checklists.map((cl) => {
                      const done = cl.items.filter((i) => i.is_done).length;
                      const pct = cl.items.length ? Math.round((done / cl.items.length) * 100) : 0;
                      return (
                        <div key={cl.id} className="rounded-[var(--radius)] border border-border bg-muted/40 p-3 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-foreground truncate">{cl.title}</p>
                            <button onClick={() => mut.removeChecklist.mutate({ id: cl.id })} className="shrink-0 p-1 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted/60"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="mkt-meta-label shrink-0 tabular-nums">{done}/{cl.items.length}</span>
                            <div className="mkt-progress flex-1"><div className="mkt-progress-fill" style={{ width: `${pct}%` }} /></div>
                          </div>
                          {cl.items.length === 0 && newItemFor !== cl.id && (
                            <p className="text-xs text-muted-foreground italic">Nenhum item ainda</p>
                          )}
                          {cl.items.map((it) => {
                            const itemOverdue = it.due_date && !it.is_done && new Date(it.due_date) < new Date();
                            return (
                              <div key={it.id} className="group">
                                <div className="flex items-center gap-2">
                                  <input type="checkbox" checked={it.is_done} onChange={(e) => mut.toggleItem.mutate({ id: it.id, done: e.target.checked })} className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]" />
                                  <span className={`text-sm flex-1 ${it.is_done ? "line-through text-muted-foreground" : "text-foreground"}`}>{it.text}</span>
                                  <button onClick={() => mut.removeItem.mutate({ id: it.id })} className="p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                                </div>
                                <div className="flex items-center gap-2 pl-6 mt-1">
                                  <input type="date" value={it.due_date ? it.due_date.slice(0, 10) : ""}
                                    onChange={(e) => mut.updateItem.mutate({ id: it.id, patch: { due_date: e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null } })}
                                    className={`h-7 text-xs rounded-md border bg-card px-2 ${itemOverdue ? "text-destructive border-destructive/40" : "text-muted-foreground border-border"}`} />
                                  <select value={it.assignee_id ?? ""} onChange={(e) => mut.updateItem.mutate({ id: it.id, patch: { assignee_id: e.target.value || null } })}
                                    className="h-7 text-xs rounded-md border border-border bg-card px-2 text-muted-foreground max-w-[140px]">
                                    <option value="">Responsável…</option>
                                    {team.map((t) => <option key={t.id} value={t.id}>{t.full_name ?? "Usuário"}</option>)}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                          {newItemFor === cl.id ? (
                            <div className="flex gap-2">
                              <Input autoFocus value={itemText} onChange={(e) => setItemText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && itemText.trim()) { mut.addItem.mutate({ checklistId: cl.id, text: itemText.trim(), position: cl.items.length * 1024 }); setItemText(""); } if (e.key === "Escape") setNewItemFor(null); }}
                                placeholder="Adicionar item…" className="h-8 text-sm" />
                            </div>
                          ) : (
                            <button onClick={() => { setNewItemFor(cl.id); setItemText(""); }} className="w-full flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors rounded-md border border-dashed border-border bg-card/60 px-2.5 py-1.5"><Plus className="h-3 w-3" /> Adicionar item</button>
                          )}
                        </div>
                      );
                    })}
                    <button onClick={() => mut.addChecklist.mutate({ title: "Checklist" })} className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors rounded-[var(--radius)] border border-dashed border-border px-3 py-2"><Plus className="h-3.5 w-3.5" /> Adicionar checklist</button>
                  </div>
                </Section>
              </div>

              {/* Anexos (Google Drive / links) */}
              <div className="border-t border-border pt-5 space-y-2.5">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif" }}>
                  <Paperclip className="h-4 w-4 text-muted-foreground" title="Link do Drive: ao subir uma nova versão do arquivo no Drive, o cartão passa a mostrar a versão nova automaticamente." /> Anexos
                </p>
                <div className="flex gap-2">
                  <Input value={attachUrl} onChange={(e) => setAttachUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && attachUrl.trim()) { mut.addAttachment.mutate({ url: attachUrl }, { onSuccess: () => setAttachUrl("") }); } }}
                    placeholder="Colar link do Google Drive ou URL…" className="h-9 text-sm" />
                  <Button size="sm" disabled={!attachUrl.trim()} onClick={() => mut.addAttachment.mutate({ url: attachUrl }, { onSuccess: () => setAttachUrl("") })}>Anexar</Button>
                </div>
                <div className="space-y-2 mt-1">
                  {data.attachments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2.5 rounded-[var(--radius)] border border-border bg-card p-2 shadow-[var(--shadow-card)] group">
                      {a.thumbnail_url ? (
                        <img src={a.thumbnail_url} alt="" className="h-10 w-14 rounded-md object-cover bg-muted" referrerPolicy="no-referrer"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="h-10 w-14 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">{a.name}</p>
                        <span className="text-xs text-muted-foreground">{a.kind === "drive" ? "Google Drive" : "Link"}</span>
                      </div>
                      <a href={a.external_url} target="_blank" rel="noreferrer" className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60" title="Abrir"><ExternalLink className="h-4 w-4" /></a>
                      <button onClick={() => mut.removeAttachment.mutate({ id: a.id })} className="p-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100" title="Remover"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comentários */}
              <div className="border-t border-border pt-5">
                <Section icon={MessageSquare} title="Comentários">
                  <div className="flex gap-2">
                    <Input value={comment} onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && comment.trim()) { mut.addComment.mutate({ body: comment.trim() }); setComment(""); } }}
                      placeholder="Escrever um comentário…" className="h-9 text-sm" />
                    <Button size="sm" disabled={!comment.trim()} onClick={() => { mut.addComment.mutate({ body: comment.trim() }); setComment(""); }}>Enviar</Button>
                  </div>
                  <div className="space-y-3 mt-3">
                    {data.comments.map((c) => (
                      <div key={c.id} className="flex gap-2.5">
                        <img src={c.authorAvatar || diceBearUrl(c.user_id)} className="h-7 w-7 rounded-full object-cover shrink-0 ring-1 ring-border" />
                        <div className="min-w-0">
                          <p className="text-xs"><strong className="text-foreground">{c.authorName ?? "Usuário"}</strong> <span className="text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</span></p>
                          <p className="text-sm text-foreground bg-card border border-border shadow-[var(--shadow-card)] rounded-[var(--radius)] px-3 py-2 mt-1 whitespace-pre-wrap">{c.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
            </div>

            {/* ══════════ SIDEBAR DIREITA — metadados + ações ══════════ */}
            <div className="space-y-4">
              <div className="bg-muted/40 rounded-[var(--radius)] p-4 space-y-4">
                {/* Datas */}
                <div className="space-y-2">
                  <p className="mkt-meta-label flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Datas</p>
                  <input type="datetime-local" value={toLocalInput(data.card.due_date)}
                    onChange={(e) => mut.updateCard.mutate({ due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    className="mkt-field w-full text-sm" />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked={data.card.is_complete} onChange={(e) => mut.updateCard.mutate({ is_complete: e.target.checked })} className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]" />
                    Concluído
                  </label>
                </div>

                {/* Membros */}
                {data.memberIds.length > 0 && (
                  <div className="space-y-2">
                    <p className="mkt-meta-label flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Membros</p>
                    <div className="flex -space-x-1.5">
                      {data.memberIds.map((uid) => {
                        const p = team.find((t) => t.id === uid);
                        return <img key={uid} src={p?.avatar_url || diceBearUrl(uid)} title={p?.full_name ?? ""} className="h-7 w-7 rounded-full ring-2 ring-background object-cover" />;
                      })}
                    </div>
                  </div>
                )}

                {/* Etiquetas */}
                {data.labelIds.length > 0 && (
                  <div className="space-y-2">
                    <p className="mkt-meta-label flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Etiquetas</p>
                    <div className="flex flex-wrap gap-1.5">
                      {labels.filter((l) => data.labelIds.includes(l.id)).map((l) => (
                        <span key={l.id} title={l.name || "(sem nome)"}
                          className={`inline-flex items-center h-5 rounded-md text-xs font-medium ${l.name ? "px-2 border" : "w-8"}`}
                          style={l.name ? tintedLabelStyle(LABEL_COLORS[l.color] ?? l.color) : { background: LABEL_COLORS[l.color] ?? l.color }}>{l.name}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Campos Personalizados */}
                {fields.length > 0 && (
                  <div className="space-y-2">
                    <p className="mkt-meta-label flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" /> Campos</p>
                    <div className="space-y-2.5">
                      {fields.map((f) => (
                        <div key={f.id} className="space-y-1">
                          {f.type !== "checkbox" && <p className="text-xs text-muted-foreground">{f.name || "—"}</p>}
                          <CustomFieldInput field={f} value={data.fieldValues[f.id]} onSave={(v) => mut.setFieldValue.mutate({ fieldId: f.id, value: v })} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Localização */}
                <div className="space-y-2">
                  <p className="mkt-meta-label flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Localização</p>
                  <div className="flex gap-2">
                    <Input value={addr} onChange={(e) => setAddr(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (async () => { if (!addr.trim()) return; setGeoLoading(true); const r = await geocodeText(addr); setGeoLoading(false); if (r) mut.updateCard.mutate({ location_name: addr.trim(), location_lat: r.lat, location_lng: r.lng }); else toast.error("Endereço não encontrado."); })(); } }}
                      placeholder="Endereço ou local…" className="h-9 text-sm" />
                    <Button size="sm" disabled={!addr.trim() || geoLoading}
                      onClick={async () => { setGeoLoading(true); const r = await geocodeText(addr); setGeoLoading(false); if (r) mut.updateCard.mutate({ location_name: addr.trim(), location_lat: r.lat, location_lng: r.lng }); else toast.error("Endereço não encontrado."); }}>
                      {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Localizar"}
                    </Button>
                  </div>
                  {data.card.location_lat != null && data.card.location_lng != null ? (
                    <div className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 text-accent" />
                      <span>{data.card.location_lat.toFixed(5)}, {data.card.location_lng.toFixed(5)}</span>
                      <a href={`https://www.openstreetmap.org/?mlat=${data.card.location_lat}&mlon=${data.card.location_lng}#map=16/${data.card.location_lat}/${data.card.location_lng}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">ver no mapa</a>
                      <button onClick={() => { mut.updateCard.mutate({ location_name: null, location_lat: null, location_lng: null }); setAddr(""); }} className="text-destructive hover:underline">remover</button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sem localização — busque um endereço para plotar no Mapa.</p>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="space-y-2">
                <p className="mkt-meta-label">Ações</p>
                <div className="relative">
                  <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={() => setShowLabels((v) => !v)}><Tag className="h-3.5 w-3.5" /> Etiquetas</Button>
                  {showLabels && (
                    <div className="absolute z-10 mt-1 w-56 right-0 rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-2 space-y-1">
                      {labels.map((l) => (
                        <label key={l.id} className="flex items-center gap-2 px-1 py-1 rounded-md hover:bg-muted cursor-pointer">
                          <input type="checkbox" checked={data.labelIds.includes(l.id)} onChange={(e) => mut.toggleLabel.mutate({ labelId: l.id, on: e.target.checked })} className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]" />
                          <span className="inline-flex items-center h-5 flex-1 rounded-md border px-2 text-xs font-medium" style={tintedLabelStyle(LABEL_COLORS[l.color] ?? l.color)}>{l.name || <span className="opacity-50">Sem nome</span>}</span>
                        </label>
                      ))}
                      <div className="border-t border-border pt-1">
                        <p className="text-xs text-muted-foreground px-1">Criar etiqueta</p>
                        <div className="flex flex-wrap gap-1 p-1">
                          {LABEL_COLOR_KEYS.map((k) => (
                            <button key={k} onClick={() => mut.createLabel.mutate({ name: "", color: k })} className="h-6 w-6 rounded-md" style={{ background: LABEL_COLORS[k] }} title={`Criar ${k}`} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={() => setShowMembers((v) => !v)}><User className="h-3.5 w-3.5" /> Membros</Button>
                  {showMembers && (
                    <div className="absolute z-10 mt-1 w-64 right-0 max-h-64 overflow-y-auto rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-2 space-y-0.5">
                      {team.map((t) => (
                        <label key={t.id} className="flex items-center gap-2 px-1 py-1 rounded-md hover:bg-muted cursor-pointer">
                          <input type="checkbox" checked={data.memberIds.includes(t.id)} onChange={(e) => mut.toggleMember.mutate({ userId: t.id, on: e.target.checked })} className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]" />
                          <img src={t.avatar_url || diceBearUrl(t.id)} className="h-6 w-6 rounded-full object-cover" />
                          <span className="text-sm truncate">{t.full_name ?? "Usuário"}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={() => setShowMirror(true)}>
                  <Link2 className="h-3.5 w-3.5" /> Espelhar
                </Button>

                <div className="border-t border-border pt-2 mt-2">
                  <Button size="sm" variant="ghost" className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => { if (confirm("Arquivar este cartão?")) { mut.updateCard.mutate({ is_archived: true, archived_at: new Date().toISOString() }, { onSuccess: onClose }); toast.success("Cartão arquivado."); } }}>
                    <Archive className="h-3.5 w-3.5" /> Arquivar
                  </Button>
                </div>
              </div>
            </div>

            {showMirror && (
              <MirrorDialog
                onConfirm={(targetListId, targetBoardId) => {
                  mut.mirrorCard.mutate(
                    { targetListId, targetBoardId, title: data.card.title, position: Date.now() },
                    { onSuccess: () => toast.success("Cartão espelhado.") },
                  );
                }}
                onClose={() => setShowMirror(false)}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
