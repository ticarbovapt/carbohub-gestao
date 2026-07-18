import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Home, Cake, PartyPopper, Megaphone, Send, X, SmilePlus,
  MessageCircle, Trash2, Users, Loader2, ArrowLeft, ChevronRight, Image as ImageIcon,
} from "lucide-react";
import {
  useFeed, useFeedHighlights, useRecentAnnouncements, useCreatePost,
  useReactFeed, useDeleteFeedPost, useFeedComments, useAddFeedComment, useDirectory,
  useEnsureBirthdays, useDepartments, useSignedUrl,
} from "../hooks";
import { useChatCtx } from "../context";
import { Avatar } from "./Avatar";
import { renderRich } from "../lib/format";
import type { FeedPost, FeedPerson, RecentAnnouncement } from "../types";

const REACTS = ["👏", "❤️", "🎉", "🔥", "👍", "🙏"];

function whenLabel(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `há ${days} d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
const firstName = (n: string | null) => (n ?? "Alguém").split(/\s+/)[0];

// Mural/Home do Carbo Chat — aparece quando nenhuma conversa está aberta.
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function ChatFeed({ onBack }: { onBack?: () => void }) {
  const highlights = useFeedHighlights();
  const announcements = useRecentAnnouncements(8);
  const feed = useFeed();
  const ensureBirthdays = useEnsureBirthdays();

  // Materializa os aniversariantes do dia ao abrir o mural (idempotente).
  useEffect(() => { ensureBirthdays.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const news = highlights.data?.novos_membros ?? [];
  const posts = feed.data ?? [];
  const bdayPosts = posts.filter((p) => p.tipo === "aniversario" && isToday(p.created_at));
  const socialPosts = posts.filter((p) => p.tipo !== "aniversario");

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col overflow-y-auto p-4">
      <div className="mb-4 flex items-center gap-2">
        {onBack && (
          <button onClick={onBack} aria-label="Voltar" className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <Home className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">Início</h1>
      </div>

      {/* Compositor sempre no topo: reconhecer colega OU mensagem/aviso no mural */}
      <div className="mb-4"><MuralComposer /></div>

      {/* Aniversariantes do dia — fixado no topo, comentável o dia todo */}
      {bdayPosts.length > 0 && (
        <div className="mb-4 rounded-xl border-2 border-pink-400/40 bg-pink-500/5 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Cake className="h-4 w-4 text-pink-500" /> Aniversariantes de hoje</p>
          <div className="space-y-3">
            {bdayPosts.map((p) => <FeedPostCard key={p.id} post={p} startComments />)}
          </div>
        </div>
      )}

      {/* Comunicados oficiais recentes (respeita o público do comunicado) */}
      {(announcements.data?.length ?? 0) > 0 && (
        <div className="mb-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Megaphone className="h-4 w-4 text-primary" /> Comunicados oficiais</p>
          <div className="space-y-2">
            {announcements.data!.map((a) => <AnnouncementCard key={a.message_id} a={a} />)}
          </div>
        </div>
      )}

      {/* Novos no time */}
      {news.length > 0 && (
        <div className="mb-4">
          <HighlightCard icon={PartyPopper} tone="green" title="Novos no time" people={news}
            line={(p) => `${firstName(p.full_name)}${p.department ? ` · ${p.department}` : ""}`} />
        </div>
      )}

      {/* Feed de reconhecimentos */}
      <div className="mt-4 space-y-3 pb-6">
        {feed.isLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : socialPosts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há reconhecimentos. Seja o primeiro a elogiar um colega 👏</p>
        ) : (
          socialPosts.map((p) => <FeedPostCard key={p.id} post={p} />)
        )}
      </div>
    </div>
  );
}

function HighlightCard({ icon: Icon, title, people, line, tone }: {
  icon: React.ElementType; title: string; people: FeedPerson[]; line: (p: FeedPerson) => string;
  tone: "pink" | "green";
}) {
  const toneCls = tone === "pink" ? "text-pink-500" : "text-emerald-500";
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className={`mb-2 flex items-center gap-1.5 text-sm font-semibold`}><Icon className={`h-4 w-4 ${toneCls}`} /> {title}</p>
      <div className="space-y-2">
        {people.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <Avatar name={p.full_name} url={p.avatar_url} size={28} />
            <span className="truncate text-sm">{line(p)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnnouncementCard({ a }: { a: RecentAnnouncement }) {
  const { openConversation } = useChatCtx();
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-1.5">
        <Megaphone className="h-4 w-4 text-primary" />
        <span className="truncate text-sm font-semibold">{a.channel_name ?? "Comunicado oficial"}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{whenLabel(a.created_at)}</span>
      </div>
      {a.sender_name && <p className="mt-0.5 text-[11px] text-muted-foreground">por {a.sender_name}</p>}
      <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-sm">{a.body ?? ""}</p>
      <button onClick={() => openConversation(a.channel_id)}
        className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
        Abrir e confirmar leitura <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const AUDIENCES = [
  { key: "all", label: "Todos" },
  { key: "departments", label: "Por departamento" },
  { key: "users", label: "Escolher pessoas" },
] as const;
type Aud = typeof AUDIENCES[number]["key"];

// Seletor de pessoas reutilizado (marcar colega / escolher quem vê).
function PeoplePicker({ chosen, onAdd, label }: { chosen: Set<string>; onAdd: (p: FeedPerson) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: people = [] } = useDirectory(search);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
        <Users className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-9 left-0 z-30 w-60 overflow-hidden rounded-lg border bg-popover shadow-lg">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar colega…"
              className="w-full border-b bg-transparent px-3 py-2 text-sm focus:outline-none" />
            <div className="max-h-52 overflow-y-auto">
              {people.filter((p) => !chosen.has(p.id)).slice(0, 8).map((p) => (
                <button key={p.id} onClick={() => { onAdd(p); setSearch(""); }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted">
                  <Avatar name={p.full_name} url={p.avatar_url} size={24} /> <span className="truncate">{p.full_name}</span>
                </button>
              ))}
              {people.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Ninguém encontrado.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PersonChips({ people, onRemove }: { people: FeedPerson[]; onRemove: (id: string) => void }) {
  if (people.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {people.map((t) => (
        <span key={t.id} className="flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-1 pr-2 text-xs">
          <Avatar name={t.full_name} url={t.avatar_url} size={18} /> {firstName(t.full_name)}
          <button onClick={() => onRemove(t.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
        </span>
      ))}
    </div>
  );
}

// Compositor com abas: clicar em cima abre a caixa da vez (colapsa ao publicar).
function MuralComposer() {
  const [mode, setMode] = useState<null | "kudos" | "message">(null);
  const tab = (m: "kudos" | "message", icon: React.ReactNode, label: string) => (
    <button onClick={() => setMode((cur) => (cur === m ? null : m))}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}>
      {icon} {label}
    </button>
  );
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        {tab("kudos", <MessageCircle className="h-4 w-4" />, "Mensagem")}
        {tab("message", <Megaphone className="h-4 w-4" />, "Aviso")}
      </div>
      {mode === "kudos" && <PostEditor tipo="kudos" placeholder="Escreva uma mensagem para o mural…" onDone={() => setMode(null)} />}
      {mode === "message" && <PostEditor tipo="aviso" placeholder="Escreva um aviso…" onDone={() => setMode(null)} />}
    </div>
  );
}

// Editor único (kudos e aviso têm as MESMAS funcionalidades: texto + marcar +
// imagem + público). Só muda o 'tipo' e o texto de exemplo.
function PostEditor({ tipo, placeholder, onDone }: { tipo: "kudos" | "aviso"; placeholder: string; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [targets, setTargets] = useState<FeedPerson[]>([]);
  const [image, setImage] = useState<File | null>(null);
  const [aud, setAud] = useState<Aud>("all");
  const [depts, setDepts] = useState<string[]>([]);
  const [users, setUsers] = useState<FeedPerson[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: departments = [] } = useDepartments();
  const create = useCreatePost();
  const chosenTargets = useMemo(() => new Set(targets.map((t) => t.id)), [targets]);
  const chosenUsers = useMemo(() => new Set(users.map((u) => u.id)), [users]);
  const canSubmit = (body.trim().length > 0 || !!image) && !create.isPending;

  async function submit() {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({
        tipo, body: body.trim(), image, targets: targets.map((t) => t.id),
        audience: aud,
        departments: aud === "departments" ? depts : [],
        users: aud === "users" ? users.map((u) => u.id) : [],
      });
      toast.success(tipo === "kudos" ? "Mensagem publicada no mural" : "Aviso publicado"); onDone();
    } catch (e) { toast.error((e as Error)?.message || "Não foi possível publicar"); }
  }

  return (
    <div className="mt-3 space-y-3">
      <PersonChips people={targets} onRemove={(id) => setTargets((p) => p.filter((x) => x.id !== id))} />
      <textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} rows={3}
        placeholder={placeholder}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
      <div className="flex items-center gap-3">
        <PeoplePicker chosen={chosenTargets} onAdd={(p) => setTargets((t) => [...t, p])} label="marcar" />
        {image ? (
          <span className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="max-w-[140px] truncate">{image.name}</span>
            <button onClick={() => { setImage(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
          </span>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <ImageIcon className="h-4 w-4" /> Adicionar imagem
          </button>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Enviar para</p>
        <div className="flex flex-wrap gap-1.5">
          {AUDIENCES.map((a) => (
            <button key={a.key} onClick={() => setAud(a.key)}
              className={`rounded-full px-3 py-1 text-xs ${aud === a.key ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}>
              {a.label}
            </button>
          ))}
        </div>

        {aud === "departments" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {departments.map((d) => {
              const on = depts.includes(d);
              return (
                <button key={d} onClick={() => setDepts((p) => (on ? p.filter((x) => x !== d) : [...p, d]))}
                  className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                  {d}
                </button>
              );
            })}
            {departments.length === 0 && <span className="text-xs text-muted-foreground">Sem departamentos.</span>}
          </div>
        )}

        {aud === "users" && (
          <div className="mt-2">
            <PersonChips people={users} onRemove={(id) => setUsers((p) => p.filter((x) => x.id !== id))} />
            <PeoplePicker chosen={chosenUsers} onAdd={(p) => setUsers((u) => [...u, p])} label="escolher pessoas" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {aud === "all" ? "Todos os funcionários verão." : aud === "departments" ? "Só os departamentos escolhidos verão." : "Só as pessoas escolhidas verão."}
        </span>
        <button onClick={submit} disabled={!canSubmit}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Send className="h-3.5 w-3.5" /> {create.isPending ? "Publicando…" : "Publicar"}
        </button>
      </div>
    </div>
  );
}

// Imagem de um post do mural (URL assinada do bucket privado).
function FeedImage({ path }: { path: string }) {
  const { data: url } = useSignedUrl(path);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 block w-fit overflow-hidden rounded-lg border">
      <img src={url} alt="" loading="lazy" decoding="async" className="max-h-80 w-auto object-contain" />
    </a>
  );
}

function FeedPostCard({ post, startComments }: { post: FeedPost; startComments?: boolean }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showComments, setShowComments] = useState(!!startComments);
  const react = useReactFeed();
  const del = useDeleteFeedPost();
  const isAviso = post.tipo === "aviso";
  const isBday = post.tipo === "aniversario";
  const badge = isBday ? "🎂 Aniversário" : isAviso ? "📢 Aviso" : "💬 Mensagem";
  const badgeCls = isBday ? "bg-pink-500/15 text-pink-600" : isAviso ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-600";

  return (
    <div className={`rounded-xl border p-3 ${isBday ? "border-pink-400/30 bg-card" : isAviso ? "border-primary/30 bg-primary/5" : "bg-card"}`}>
      <div className="flex items-start gap-2.5">
        <Avatar name={post.author.full_name} url={post.author.avatar_url} size={isBday ? 44 : 36} />
        <div className="min-w-0 flex-1">
          {isBday ? (
            <>
              {/* Card automático de aniversário: manchete deixando claro DE QUEM é. */}
              <div className="flex items-start gap-1.5">
                <p className="text-sm font-semibold leading-snug">
                  🎂 Hoje é aniversário de {post.author.full_name ?? "um colega"}!
                </p>
                {post.can_delete && (
                  <button onClick={() => del.mutate({ postId: post.id })} title="Apagar" className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Deixe seu parabéns 🎉</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">{post.author.full_name ?? "—"}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badgeCls}`}>
                  {badge}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">{whenLabel(post.created_at)}</span>
                {post.can_delete && (
                  <button onClick={() => del.mutate({ postId: post.id })} title="Apagar" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>

              {post.targets.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  para
                  {post.targets.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-foreground">
                      <Avatar name={t.full_name} url={t.avatar_url} size={16} /> {firstName(t.full_name)}
                    </span>
                  ))}
                </div>
              )}

              {post.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{renderRich(post.body)}</p>}
              {post.image_path && <FeedImage path={post.image_path} />}
              {isAviso && post.audience && post.audience !== "all" && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {post.audience === "departments"
                    ? `para ${(post.audience_departments ?? []).join(", ") || "departamentos"}`
                    : "para pessoas específicas"}
                </p>
              )}
            </>
          )}

          {/* reações */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {post.reactions.map((r) => (
              <button key={r.emoji} onClick={() => react.mutate({ postId: post.id, emoji: r.emoji, on: !r.mine })}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${r.mine ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                <span>{r.emoji}</span><span className="tabular-nums">{r.count}</span>
              </button>
            ))}
            <div className="relative">
              <button onClick={() => setPickerOpen((o) => !o)} className="rounded-full p-1 text-muted-foreground hover:bg-muted"><SmilePlus className="h-4 w-4" /></button>
              {pickerOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
                  <div className="absolute bottom-8 left-0 z-30 flex gap-0.5 rounded-full border bg-popover px-1.5 py-1 shadow-lg">
                    {REACTS.map((e) => {
                      const mine = post.reactions.find((x) => x.emoji === e)?.mine ?? false;
                      return <button key={e} onClick={() => { react.mutate({ postId: post.id, emoji: e, on: !mine }); setPickerOpen(false); }}
                        className="rounded-full px-1 text-lg leading-none hover:scale-125">{e}</button>;
                    })}
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setShowComments((o) => !o)} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">
              <MessageCircle className="h-3.5 w-3.5" /> {post.comment_count > 0 ? post.comment_count : "comentar"}
            </button>
          </div>

          {showComments && <Comments postId={post.id} />}
        </div>
      </div>
    </div>
  );
}

function Comments({ postId }: { postId: string }) {
  const { data: comments = [], isLoading } = useFeedComments(postId, true);
  const add = useAddFeedComment();
  const [text, setText] = useState("");

  function submit() {
    const b = text.trim();
    if (!b || add.isPending) return;
    add.mutate({ postId, body: b }, { onSuccess: () => setText("") });
  }

  return (
    <div className="mt-2 border-t pt-2">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar name={c.author.full_name} url={c.author.avatar_url} size={22} />
              <div className="min-w-0 flex-1 rounded-lg bg-muted px-2 py-1">
                <span className="text-xs font-medium">{firstName(c.author.full_name)}</span>
                <span className="ml-1.5 text-[10px] text-muted-foreground">{whenLabel(c.created_at)}</span>
                <p className="whitespace-pre-wrap break-words text-xs">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Escreva um comentário…"
          className="h-8 flex-1 rounded-full border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
        <button onClick={submit} disabled={!text.trim() || add.isPending} className="rounded-full bg-primary p-1.5 text-primary-foreground disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
