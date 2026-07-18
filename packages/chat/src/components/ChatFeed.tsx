import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Home, Cake, PartyPopper, Megaphone, Award, Send, X, SmilePlus,
  MessageCircle, Trash2, Users, Loader2, ArrowLeft, ChevronRight,
} from "lucide-react";
import {
  useFeed, useFeedHighlights, useRecentAnnouncements, useCreateKudos, useCreateAviso,
  useReactFeed, useDeleteFeedPost, useFeedComments, useAddFeedComment, useCanAnnounce, useDirectory,
  useEnsureBirthdays,
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

      {/* Compositor de kudos */}
      <KudosComposer />

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

function KudosComposer() {
  const [body, setBody] = useState("");
  const [targets, setTargets] = useState<FeedPerson[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [aviso, setAviso] = useState(false);
  const { data: canAnnounce } = useCanAnnounce();
  const { data: people = [] } = useDirectory(search);
  const createKudos = useCreateKudos();
  const createAviso = useCreateAviso();
  const busy = createKudos.isPending || createAviso.isPending;

  const chosenIds = useMemo(() => new Set(targets.map((t) => t.id)), [targets]);

  async function submit() {
    const text = body.trim();
    if (!text || busy) return;
    try {
      if (aviso) await createAviso.mutateAsync({ body: text });
      else await createKudos.mutateAsync({ body: text, targets: targets.map((t) => t.id) });
      setBody(""); setTargets([]); setAviso(false);
      toast.success(aviso ? "Aviso publicado" : "Reconhecimento publicado 👏");
    } catch (e) {
      toast.error((e as Error)?.message || "Não foi possível publicar");
    }
  }

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Award className="h-4 w-4 text-primary" /> {aviso ? "Novo aviso" : "Reconhecer um colega"}
      </div>

      {targets.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {targets.map((t) => (
            <span key={t.id} className="flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-1 pr-2 text-xs">
              <Avatar name={t.full_name} url={t.avatar_url} size={18} /> {firstName(t.full_name)}
              <button onClick={() => setTargets((p) => p.filter((x) => x.id !== t.id))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}

      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2}
        placeholder={aviso ? "Escreva um aviso para o time…" : "Parabéns ao time de expedição por…"}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />

      <div className="mt-2 flex items-center gap-2">
        {!aviso && (
          <div className="relative">
            <button onClick={() => setPickOpen((o) => !o)} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
              <Users className="h-3.5 w-3.5" /> marcar
            </button>
            {pickOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setPickOpen(false)} />
                <div className="absolute bottom-9 left-0 z-30 w-60 overflow-hidden rounded-lg border bg-popover shadow-lg">
                  <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar colega…"
                    className="w-full border-b bg-transparent px-3 py-2 text-sm focus:outline-none" />
                  <div className="max-h-52 overflow-y-auto">
                    {people.filter((p) => !chosenIds.has(p.id)).slice(0, 8).map((p) => (
                      <button key={p.id} onClick={() => { setTargets((t) => [...t, p]); setSearch(""); }}
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
        )}

        {canAnnounce && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={aviso} onChange={(e) => setAviso(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--primary)]" />
            aviso oficial
          </label>
        )}

        <button onClick={submit} disabled={!body.trim() || busy}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Send className="h-3.5 w-3.5" /> {busy ? "Publicando…" : "Publicar"}
        </button>
      </div>
    </div>
  );
}

function FeedPostCard({ post, startComments }: { post: FeedPost; startComments?: boolean }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showComments, setShowComments] = useState(!!startComments);
  const react = useReactFeed();
  const del = useDeleteFeedPost();
  const isAviso = post.tipo === "aviso";
  const isBday = post.tipo === "aniversario";
  const badge = isBday ? "🎂 Aniversário" : isAviso ? "Aviso" : "👏 Reconhecimento";
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

              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{renderRich(post.body)}</p>
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
