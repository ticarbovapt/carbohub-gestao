import { useEffect, useRef, useState } from "react";
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
import { LABEL_COLORS, LABEL_COLOR_KEYS, tintedLabelStyle, lerCapa, tomDaCapa } from "@/lib/mktTheme";
import { CapaPainel } from "@/components/board/CapaPainel";
import { useImagensDeCapa } from "@/lib/mktCapaImagem";
import { DatasPainel, resumoRepetirLembrete } from "@/components/board/DatasPainel";
import { ListChecks, Play, Music, Image as ImageIcon, ChevronUp, ChevronDown, LayoutTemplate, RotateCcw, ArrowRight, Copy, Eye, Share2, UserPlus, UserMinus, CreditCard, Repeat, Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MoverCopiar } from "@/components/board/MoverCopiar";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import type { Label } from "@/hooks/useBoards";
import { diceBearUrl } from "@/components/ui/profile-avatar";
import { confirmar, pedirTexto } from "@carbo/shell";
import { useModeloMutations } from "@/hooks/useModelos";
import { TextoRico } from "@/lib/textoRico";
import { EditorDescricao } from "@/components/board/EditorDescricao";
import { Anexos } from "@/components/board/Anexos";
import { useCartaoNoEndereco, pegarComentarioPendente } from "@/lib/cartaoNaUrl";
import { useReacoes, ReacoesDoComentario, type Reacao } from "@/components/board/Reacoes";
import { BarraFormatacao } from "@/components/board/BarraFormatacao";
import { lerAvisosDoCartao } from "@/hooks/useMeusSinais";
import { supabase } from "@/integrations/supabase/client";
import type { Attachment, Comment } from "@/hooks/useCardDetail";

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

export function CardModal({ cardId, boardId, labels, onClose, pessoas = [], anexoInicial }: {
  cardId: string; boardId: string; labels: Label[]; onClose: () => void;
  /** Abre o cartão já no arquivo (link copiado de um anexo). */
  anexoInicial?: string | null;
  // Pessoas do QUADRO (vêm do Board): sem elas, quem é de outro departamento
  // que o de quem olha aparecia sem foto e não podia ser escolhido.
  pessoas?: { id: string; full_name: string | null; avatar_url: string | null }[];
}) {
  const { data, isLoading } = useCardDetail(cardId);
  useCartaoNoEndereco(cardId);
  const mut = useCardMutations(cardId, boardId);
  const modelos = useModeloMutations(boardId);
  const { data: timeDept = [] } = useTeamMembers();
  const team = [...pessoas, ...timeDept.filter((t) => !pessoas.some((p) => p.id === t.id))];
  const { data: fields = [] } = useCustomFields(boardId);
  // Quem dá para MENCIONAR: o time interno inteiro, não só o do quadro — chamar
  // alguém de fora para olhar é justamente o uso da menção.
  const { data: internos = [] } = useQuery({
    queryKey: ["mkt", "pessoas-internas"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Pessoa[]> => {
      const r = await (supabase as any).from("profiles").select("id, full_name, avatar_url").not("department", "is", null).order("full_name");
      return ((r.data ?? []) as Pessoa[]).filter((p) => p.full_name);
    },
  });
  const mencionaveis = [...team.filter((t) => t.full_name), ...internos.filter((p) => !team.some((t) => t.id === p.id))] as Pessoa[];
  const [mencionados, setMencionados] = useState<Pessoa[]>([]);

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
  const [moverCopiar, setMoverCopiar] = useState<"mover" | "copiar" | null>(null);
  const [addr, setAddr] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<string>(LABEL_COLOR_KEYS[0]);
  const labelsRef = useRef<HTMLDivElement>(null);
  const membersRef = useRef<HTMLDivElement>(null);
  const datasRef = useRef<HTMLDivElement>(null);
  const anexosRef = useRef<HTMLDivElement>(null);
  const capaRef = useRef<HTMLDivElement>(null);
  const capaDoCartao = lerCapa(data?.card.cover);
  const { data: imagensCapa } = useImagensDeCapa([capaDoCartao?.anexoId]);
  const imagemDaCapa = capaDoCartao?.anexoId ? imagensCapa?.get(capaDoCartao.anexoId) : undefined;
  const { reacoes, alternar: alternarReacao } = useReacoes(cardId, (data?.comments ?? []).map((c) => c.id));
  const nomeDaPessoa = (id: string) => {
    const doTime = team.find((t) => t.id === id)?.full_name;
    const doComentario = data?.comments.find((c) => c.user_id === id)?.authorName;
    return doTime ?? doComentario ?? "Alguém";
  };
  // Link de comentário (`?comentario=`): rola até ele e o destaca por alguns
  // segundos — no Trello o link permanente faz o mesmo.
  const [comentarioAlvo, setComentarioAlvo] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const alvo = pegarComentarioPendente();
    if (!alvo) return;
    setComentarioAlvo(alvo);
    requestAnimationFrame(() => document.getElementById(`comentario-${alvo}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    const t = window.setTimeout(() => setComentarioAlvo(null), 4000);
    return () => window.clearTimeout(t);
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showCapa, setShowCapa] = useState(false);
  const anexoInputRef = useRef<HTMLInputElement>(null);
  const comentarioRef = useRef<HTMLTextAreaElement>(null);
  const [showDatas, setShowDatas] = useState(false);
  const [descAberta, setDescAberta] = useState(false);
  const [detalhes, setDetalhes] = useState(false);
  const { user } = useAuth();
  const qcLocal = useQueryClient();
  // Seguir: opt-in, avisa no sininho quando alguém comenta, move ou arquiva.
  // A tabela só mostra o PRÓPRIO seguir (RLS), então a pergunta é "eu sigo?".
  const { data: sigo = false } = useQuery({
    queryKey: ["mkt", "sigo", cardId, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const r = await (supabase as any).from("mkt_card_seguidores").select("card_id").eq("card_id", cardId).eq("user_id", user!.id).maybeSingle();
      return !!r.data;
    },
  });
  const alternarSeguir = async () => {
    if (!user?.id) return;
    const t = (supabase as any).from("mkt_card_seguidores");
    const r = sigo ? await t.delete().eq("card_id", cardId).eq("user_id", user.id) : await t.insert({ card_id: cardId, user_id: user.id });
    if (r.error) { toast.error(`Não deu: ${r.error.message}`); return; }
    qcLocal.invalidateQueries({ queryKey: ["mkt", "sigo", cardId] });
    qcLocal.invalidateQueries({ queryKey: ["notifications", user.id, "cartoes-mkt"] }); // o olho na frente do cartão
    toast.success(sigo ? "Você deixou de seguir este cartão." : "Seguindo: você recebe no sininho comentários, mudanças de lista e arquivamento.");
  };
  // Abrir o cartão LÊ os avisos dele — o selo some do quadro e do sininho.
  useEffect(() => {
    if (!user?.id) return;
    lerAvisosDoCartao(user.id, cardId).then((n) => { if (n) qcLocal.invalidateQueries({ queryKey: ["notifications", user.id] }); });
  }, [cardId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const copiarLink = async () => {
    const url = `${window.location.origin}/cartao/${cardId}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link do cartão copiado."); }
    catch { toast.message(url); }
  };
  const descLonga = (data?.card.description ?? "").length > 700 || (data?.card.description ?? "").split("\n").length > 14;

  const { data: listaTitulo } = useQuery({
    queryKey: ["mkt", "lista-titulo", data?.card.list_id],
    enabled: !!data?.card.list_id,
    queryFn: async () => {
      const r = await (supabase as any).from("mkt_lists").select("title").eq("id", data!.card.list_id).maybeSingle();
      return (r.data?.title as string | undefined) ?? null;
    },
  });
  // "Mostrar detalhes": o log do cartão (criou, arquivou…). Comentário já
  // aparece pela própria tabela; a linha `comment.add` do log seria repetição.
  const { data: atividade = [] } = useQuery({
    queryKey: ["mkt", "card-atividade", cardId],
    enabled: detalhes,
    queryFn: async (): Promise<Atividade[]> => {
      const r = await (supabase as any).from("mkt_activity").select("id, user_id, type, created_at")
        .eq("card_id", cardId).neq("type", "comment.add").order("created_at", { ascending: false }).limit(200);
      const linhas = (r.data ?? []) as Omit<Atividade, "nome" | "avatar">[];
      const ids = [...new Set(linhas.map((l) => l.user_id).filter(Boolean))] as string[];
      const pr = ids.length ? await (supabase as any).from("profiles").select("id, full_name, avatar_url").in("id", ids) : { data: [] };
      const por = new Map(((pr.data ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]).map((p) => [p.id, p]));
      return linhas.map((l) => ({ ...l, nome: l.user_id ? por.get(l.user_id)?.full_name ?? null : null, avatar: l.user_id ? por.get(l.user_id)?.avatar_url ?? null : null }));
    },
  });

  useEffect(() => {
    if (data) { setTitle(data.card.title); setDesc(data.card.description ?? ""); setAddr(data.card.location_name ?? ""); }
  }, [data?.card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fecha os popovers (Etiquetas/Membros) ao clicar fora deles.
  useEffect(() => {
    if (!showLabels && !showMembers && !showDatas && !showCapa) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // O botão que abre a capa fica FORA do painel: sem esta exceção o clique
      // nele fecharia no mousedown e reabriria no click.
      if (showCapa && capaRef.current && !capaRef.current.contains(t) && !(t as Element).closest?.("[data-capa-botao]")) setShowCapa(false);
      if (showDatas && datasRef.current && !datasRef.current.contains(t)) setShowDatas(false);
      if (showLabels && labelsRef.current && !labelsRef.current.contains(t)) setShowLabels(false);
      if (showMembers && membersRef.current && !membersRef.current.contains(t)) setShowMembers(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showLabels, showMembers, showDatas, showCapa]);

  const saveTitle = () => {
    const t = title.trim();
    if (t && data && t !== data.card.title) mut.updateCard.mutate({ title: t });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl sm:max-w-6xl w-[calc(100%-1.5rem)] max-h-[90vh] overflow-y-auto md:overflow-hidden p-0 gap-0">
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
          <div className="flex flex-col md:h-[90vh]">
          {/* Capa: como no Trello, a cor do cartão no topo do cartão aberto. */}
          {capaDoCartao && (
            <div className="relative h-20 md:h-24 shrink-0"
              style={capaDoCartao.anexoId && imagemDaCapa
                // Imagem: inteira (contain) sobre fundo escuro, como no Trello — cortar
                // a peça do designer no topo do cartão esconderia justamente ela.
                ? { background: `#111 url("${imagemDaCapa}") center / contain no-repeat`, height: "10rem" }
                : { background: tomDaCapa(capaDoCartao.cor) }}>
              <button data-capa-botao onClick={() => setShowCapa((v) => !v)} title="Capa"
                className="absolute right-12 top-3 inline-flex items-center gap-1.5 rounded-md bg-background/70 hover:bg-background px-2.5 py-1.5 text-xs font-medium text-foreground backdrop-blur">
                <CreditCard className="h-3.5 w-3.5" /> Capa
              </button>
            </div>
          )}
          {showCapa && (
            <div ref={capaRef} className="absolute right-3 top-14 z-30 w-72 max-w-[calc(100%-1.5rem)] rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-3">
              <div className="flex items-center justify-between pb-2">
                <p className="text-sm font-semibold">Capa</p>
                <button onClick={() => setShowCapa(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <CapaPainel cardId={cardId} cover={data.card.cover} onChange={(cover) => mut.updateCard.mutate({ cover })} />
            </div>
          )}
          <div className="flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_420px] md:flex-1 md:min-h-0">
            {/* ══════════ ESQUERDA — o cartão ══════════
                Como no Trello: título, botões de ação numa linha, o resumo
                (membros · etiquetas · datas) e depois o conteúdo. Rola sozinha. */}
            <div className="min-w-0 p-5 md:p-6 space-y-6 md:overflow-y-auto">
              <div className="space-y-2">
                {listaTitulo && <span className="inline-flex items-center rounded-md bg-primary/15 text-primary text-xs font-semibold px-2 py-0.5">{listaTitulo}</span>}
                <textarea
                  value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} rows={1}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
                  className="w-full text-xl font-semibold bg-transparent border-0 rounded-md px-1.5 py-1 -ml-1.5 resize-none [field-sizing:content] hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  style={{ fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif" }}
                />
              </div>

              {/* Aberto pelos Itens arquivados: diz que está arquivado e deixa voltar. */}
              {data.card.is_archived && (
                <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                  <Archive className="h-4 w-4 text-warning shrink-0" />
                  <span className="flex-1 text-foreground">Este cartão está arquivado — não aparece no quadro.</span>
                  <Button size="sm" variant="outline" className="gap-1.5 h-7"
                    onClick={() => mut.updateCard.mutate({ is_archived: false, archived_at: null }, { onSuccess: () => toast.success("Cartão restaurado.") })}>
                    <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                  </Button>
                </div>
              )}

              {/* Ações — uma linha de botões, como no Trello */}
              <div className="flex flex-wrap gap-2">
                <div className="relative" ref={labelsRef}>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowLabels((v) => !v)}><Tag className="h-3.5 w-3.5" /> Etiquetas</Button>
                  {showLabels && (
                    <div className="absolute z-20 mt-1 w-72 left-0 rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-2.5 space-y-2">
                      <p className="mkt-meta-label">Etiquetas do quadro</p>
                      <div className="space-y-1 max-h-52 overflow-y-auto">
                        {labels.length === 0 && <p className="text-xs text-muted-foreground px-1 py-1">Nenhuma etiqueta ainda — crie abaixo.</p>}
                        {labels.map((l) => (
                          <div key={l.id} className="flex items-center gap-2">
                            <input type="checkbox" checked={data.labelIds.includes(l.id)} onChange={(e) => mut.toggleLabel.mutate({ labelId: l.id, on: e.target.checked })} className="h-4 w-4 shrink-0 rounded border-border accent-[hsl(var(--primary))]" title="Aplicar ao cartão" />
                            <span className="h-4 w-4 shrink-0 rounded" style={{ background: LABEL_COLORS[l.color] ?? l.color }} />
                            <input defaultValue={l.name ?? ""} placeholder="Nome da etiqueta…"
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (l.name ?? "")) mut.updateLabel.mutate({ id: l.id, name: v }); }}
                              className="flex-1 min-w-0 h-7 text-xs rounded-md border border-transparent hover:border-border focus:border-border focus:outline-none bg-transparent px-1.5 text-foreground" />
                            <button onClick={() => mut.deleteLabel.mutate({ id: l.id })} className="shrink-0 p-1 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted" title="Excluir etiqueta"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-border pt-2 space-y-1.5">
                        <p className="mkt-meta-label">Criar etiqueta</p>
                        <div className="flex items-center gap-1.5">
                          <input value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && newLabelName.trim()) mut.createLabel.mutate({ name: newLabelName.trim(), color: newLabelColor }, { onSuccess: () => setNewLabelName("") }); }}
                            placeholder="Nome…" className="flex-1 min-w-0 h-7 text-xs rounded-md border border-border bg-card px-1.5 focus:outline-none focus:ring-1 focus:ring-primary" />
                          <Button size="sm" className="h-7 px-2.5 text-xs shrink-0" disabled={!newLabelName.trim()} onClick={() => mut.createLabel.mutate({ name: newLabelName.trim(), color: newLabelColor }, { onSuccess: () => setNewLabelName("") })}>Criar</Button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {LABEL_COLOR_KEYS.map((k) => (
                            <button key={k} onClick={() => setNewLabelColor(k)} className={`h-6 w-6 rounded-md transition ${newLabelColor === k ? "ring-2 ring-offset-1 ring-offset-popover ring-primary" : "ring-1 ring-border"}`} style={{ background: LABEL_COLORS[k] }} title={k} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative" ref={datasRef}>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowDatas((v) => !v)}><Clock className="h-3.5 w-3.5" /> Datas</Button>
                  {showDatas && (
                    <div className="absolute z-20 mt-1 w-[300px] max-w-[85vw] left-0 rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-3 max-h-[70vh] overflow-y-auto">
                      <DatasPainel card={data.card}
                        onSalvar={(patch) => mut.updateCard.mutate(patch)}
                        onFechar={() => setShowDatas(false)} />
                    </div>
                  )}
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => mut.addChecklist.mutate({ title: "Checklist" })}><CheckSquare className="h-3.5 w-3.5" /> Checklist</Button>
                {user?.id && (data.memberIds.includes(user.id)
                  ? <Button size="sm" variant="outline" className="gap-1.5" onClick={() => mut.toggleMember.mutate({ userId: user.id, on: false })} title="Sair deste cartão"><UserMinus className="h-3.5 w-3.5" /> Sair</Button>
                  : <Button size="sm" variant="outline" className="gap-1.5" onClick={() => mut.toggleMember.mutate({ userId: user.id, on: true })} title="Entrar como membro deste cartão"><UserPlus className="h-3.5 w-3.5" /> Ingressar</Button>)}
                <div className="relative" ref={membersRef}>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowMembers((v) => !v)}><User className="h-3.5 w-3.5" /> Membros</Button>
                  {showMembers && (
                    <div className="absolute z-10 mt-1 w-64 left-0 max-h-64 overflow-y-auto rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-2 space-y-0.5">
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
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => { anexosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                  <Paperclip className="h-3.5 w-3.5" /> Anexo
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" data-capa-botao onClick={() => setShowCapa((v) => !v)}><CreditCard className="h-3.5 w-3.5" /> Capa</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMoverCopiar("mover")}><ArrowRight className="h-3.5 w-3.5" /> Mover</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMoverCopiar("copiar")}><Copy className="h-3.5 w-3.5" /> Copiar</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowMirror(true)}><Link2 className="h-3.5 w-3.5" /> Espelhar</Button>
                <Button size="sm" variant={sigo ? "secondary" : "outline"} className="gap-1.5" onClick={alternarSeguir} title="Receber no sininho o que acontecer neste cartão">
                  <Eye className="h-3.5 w-3.5" /> {sigo ? "Seguindo" : "Seguir"}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={copiarLink}><Share2 className="h-3.5 w-3.5" /> Copiar link</Button>
                <Button size="sm" variant="outline" className="gap-1.5" title="Guardar etiquetas, checklist, campos e descrição para criar cartões iguais"
                  onClick={async () => {
                    const nome = await pedirTexto({ titulo: "Salvar como modelo", rotulo: "Nome do modelo (ex.: Reels padrão)", valorInicial: data.card.title, obrigatorio: true, confirmar: "Salvar modelo" });
                    if (!nome?.trim()) return;
                    modelos.salvar.mutate({ nome: nome.trim(), detalhe: data }, {
                      onSuccess: () => toast.success(`Modelo "${nome.trim()}" salvo. Use pelo ícone ao lado de "Adicionar cartão" em qualquer lista deste quadro.`),
                      onError: (e) => toast.error(`Não salvou o modelo: ${(e as Error).message}`),
                    });
                  }}>
                  <LayoutTemplate className="h-3.5 w-3.5" /> Salvar como modelo
                </Button>
                {!data.card.is_archived && <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={async () => { if (await confirmar({ titulo: "Arquivar este cartão?", confirmar: "Arquivar" })) { mut.updateCard.mutate({ is_archived: true, archived_at: new Date().toISOString() }, { onSuccess: onClose }); toast.success("Cartão arquivado."); } }}>
                  <Archive className="h-3.5 w-3.5" /> Arquivar
                </Button>}
              </div>

              {/* Resumo — membros, etiquetas e datas lado a lado */}
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                <div className="space-y-1.5">
                  <p className="mkt-meta-label">Membros</p>
                  <div className="flex items-center gap-1">
                    {data.memberIds.map((uid) => {
                      const p = team.find((t) => t.id === uid);
                      return <img key={uid} src={p?.avatar_url || diceBearUrl(uid)} title={p?.full_name ?? ""} className="h-8 w-8 rounded-full ring-2 ring-background object-cover" />;
                    })}
                    <button onClick={() => setShowMembers(true)} className="h-8 w-8 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center text-muted-foreground" title="Adicionar membro"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>
                {data.labelIds.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="mkt-meta-label">Etiquetas</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {labels.filter((l) => data.labelIds.includes(l.id)).map((l) => (
                        <span key={l.id} title={l.name || "(sem nome)"}
                          className={`inline-flex items-center h-8 rounded-md text-xs font-medium ${l.name ? "px-2.5 border" : "w-12"}`}
                          style={l.name ? tintedLabelStyle(LABEL_COLORS[l.color] ?? l.color) : { background: LABEL_COLORS[l.color] ?? l.color }}>{l.name}</span>
                      ))}
                      <button onClick={() => setShowLabels(true)} className="h-8 w-8 rounded-md bg-muted hover:bg-muted/70 flex items-center justify-center text-muted-foreground" title="Etiquetas"><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
                {(data.card.start_date || data.card.due_date) && (
                  <div className="space-y-1.5">
                    <p className="mkt-meta-label">Datas</p>
                    <div className="flex items-center gap-2 h-8">
                      <input type="checkbox" checked={data.card.is_complete} onChange={(e) => mut.updateCard.mutate({ is_complete: e.target.checked })} className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]" title="Concluído" />
                      <button onClick={() => setShowDatas(true)} className="h-8 rounded-md bg-muted hover:bg-muted/70 px-2.5 text-sm text-foreground">
                        {resumoDatas(data.card.start_date, data.card.due_date)}
                      </button>
                      {resumoRepetirLembrete(data.card) && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Repetir e lembrete">
                          {data.card.recorrencia && <Repeat className="h-3.5 w-3.5" />}{data.card.lembrete_minutos != null && <Bell className="h-3.5 w-3.5" />}
                          {resumoRepetirLembrete(data.card)}
                        </span>
                      )}
                      {data.card.is_complete
                        ? <span className="text-xs font-medium rounded px-1.5 py-0.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">Concluído</span>
                        : data.card.due_date && new Date(data.card.due_date) < new Date()
                          ? <span className="text-xs font-medium rounded px-1.5 py-0.5 bg-destructive/20 text-destructive">Atrasado</span>
                          : null}
                    </div>
                  </div>
                )}
                {!data.card.start_date && !data.card.due_date && (
                  <label className="flex items-end gap-2 text-sm text-muted-foreground pb-1.5">
                    <input type="checkbox" checked={data.card.is_complete} onChange={(e) => mut.updateCard.mutate({ is_complete: e.target.checked })} className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]" />
                    Concluído
                  </label>
                )}
              </div>

              {/* Descrição */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif" }}>
                    <AlignLeft className="h-4 w-4 text-muted-foreground" /> Descrição
                  </p>
                  {!editDesc && data.card.description && <Button size="sm" variant="secondary" className="h-7" onClick={() => setEditDesc(true)}>Editar</Button>}
                </div>
                {editDesc ? (
                  <EditorDescricao inicial={data.card.description ?? ""}
                    onSalvar={(md) => { mut.updateCard.mutate({ description: md || null }); setDesc(md); setEditDesc(false); }}
                    onCancelar={() => setEditDesc(false)} />
                ) : data.card.description ? (
                  // Longa, ela fica recolhida com "Mostrar mais" — senão empurra
                  // checklist e anexos para longe, como no Trello.
                  <div>
                    <div className={`relative text-sm text-foreground ${descAberta || !descLonga ? "" : "max-h-72 overflow-hidden"}`}>
                      <TextoRico texto={data.card.description} />
                      {!descAberta && descLonga && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />}
                    </div>
                    {descLonga && <button onClick={() => setDescAberta((v) => !v)} className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-sm text-muted-foreground hover:bg-muted/60">
                      {descAberta ? <><ChevronUp className="h-4 w-4" /> Mostrar menos</> : <><ChevronDown className="h-4 w-4" /> Mostrar mais</>}
                    </button>}
                  </div>
                ) : (
                  <button onClick={() => setEditDesc(true)} className="w-full text-left text-sm rounded-[var(--radius)] bg-muted/40 hover:bg-muted/60 p-3 min-h-[56px] text-muted-foreground">
                    Adicionar uma descrição mais detalhada…
                  </button>
                )}
              </div>

              {/* Campos personalizados — em grade, como no Trello */}
              {fields.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif" }}>
                    <ListChecks className="h-4 w-4 text-muted-foreground" /> Campos personalizados
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                      {fields.map((f) => (
                        <div key={f.id} className="space-y-1 min-w-0">
                          {f.type !== "checkbox" && <p className="text-xs text-muted-foreground">{f.name || "—"}</p>}
                          <CustomFieldInput field={f} value={data.fieldValues[f.id]} onSave={(v) => mut.setFieldValue.mutate({ fieldId: f.id, value: v })} />
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div ref={anexosRef}><Anexos cardId={cardId} boardId={boardId} anexos={data.attachments} anexoInicial={anexoInicial}
                onAdicionarLink={(url, ok) => mut.addAttachment.mutate({ url }, { onSuccess: ok })}
                onRemoverLink={(id) => mut.removeAttachment.mutate({ id })} /></div>

              {/* Checklists */}
              {data.checklists.length > 0 && (
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
                                {/* Data e responsável só ficam à vista quando preenchidos;
                                    vazios, aparecem ao passar o mouse/focar (no celular,
                                    sempre). Num checklist de 44 itens, 88 campos vazios
                                    escondiam os itens. */}
                                <div className={`items-center gap-2 pl-6 mt-1 ${it.due_date || it.assignee_id ? "flex" : "hidden group-hover:flex group-focus-within:flex max-sm:flex"}`}>
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
                  </div>
                </Section>
              )}

              {/* Localização — fica por último: é usada pelo Mapa, não no dia a dia */}
              <details className="group/loc rounded-[var(--radius)] border border-border" open={data.card.location_lat != null}>
                <summary className="cursor-pointer list-none px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Localização {data.card.location_name ? `· ${data.card.location_name}` : ""}
                </summary>
                <div className="px-3 pb-3">
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
              </details>
            </div>

            {/* ══════════ DIREITA — Comentários e atividade ══════════
                Coluna própria, com rolagem própria: ler a conversa não exige
                descer o cartão inteiro. Mais recente primeiro. */}
            <div className="min-w-0 border-t md:border-t-0 md:border-l border-border bg-muted/30 flex flex-col md:min-h-0">
              <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 pr-12">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif" }}>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" /> Comentários e atividade
                </p>
                <Button size="sm" variant="secondary" className="h-7 shrink-0" onClick={() => setDetalhes((v) => !v)}>
                  {detalhes ? "Ocultar detalhes" : "Mostrar detalhes"}
                </Button>
              </div>
              <div className="px-4 pb-4 space-y-4 md:overflow-y-auto md:flex-1">
                <NovoComentario inputRef={comentarioRef} valor={comment} onChange={setComment} pessoas={mencionaveis}
                  onMencionar={(p) => setMencionados((m) => m.some((x) => x.id === p.id) ? m : [...m, p])}
                  onEnviar={(t) => mut.addComment.mutate({ body: t }, { onSuccess: () => {
                    // Só avisa quem CONTINUA no texto: apagar a menção antes de
                    // salvar desfaz o aviso.
                    const avisar = mencionados.filter((p) => t.includes(`@${rotuloMencao(p.full_name)}`)).map((p) => p.id);
                    if (avisar.length) {
                      (supabase as any).rpc("mkt_notificar_mencao", { p_card: cardId, p_usuarios: avisar, p_trecho: t.slice(0, 200) })
                        .then((r: { error: { message: string } | null; data: number | null }) => {
                          if (r.error) toast.error(`Comentário salvo, mas a menção não avisou: ${r.error.message}`);
                          else if (r.data) toast.success(r.data === 1 ? "A pessoa mencionada foi avisada no sininho." : `${r.data} pessoas mencionadas foram avisadas no sininho.`);
                        });
                    }
                    setComment(""); setMencionados([]);
                  } })} />
                {linhaDoTempo(data.comments, detalhes ? atividade : []).map((ev) => ev.tipo === "comentario" ? (
                  <ComentarioItem key={ev.c.id} c={ev.c} meu={ev.c.user_id === user?.id}
                    reacoes={reacoes.filter((r) => r.comment_id === ev.c.id)} meuId={user?.id ?? null}
                    nomeDe={nomeDaPessoa} onReagir={(e) => user?.id && alternarReacao(ev.c.id, e, user.id)}
                    destacado={comentarioAlvo === ev.c.id}
                    onCopiarLink={async () => {
                      const url = `${window.location.origin}/cartao/${cardId}?comentario=${ev.c.id}`;
                      try { await navigator.clipboard.writeText(url); toast.success("Link do comentário copiado."); } catch { toast.message(url); }
                    }}
                    onResponder={() => {
                      const autor = { id: ev.c.user_id, full_name: ev.c.authorName, avatar_url: ev.c.authorAvatar };
                      if (autor.full_name && ev.c.user_id !== user?.id) {
                        setMencionados((m) => m.some((x) => x.id === autor.id) ? m : [...m, autor]);
                        setComment((v) => `@${rotuloMencao(autor.full_name)} ${v}`);
                      }
                      comentarioRef.current?.focus();
                    }}
                    onSalvar={(body) => mut.updateComment.mutate({ id: ev.c.id, body })}
                    onExcluir={async () => { if (await confirmar({ titulo: "Excluir este comentário?", confirmar: "Excluir" })) mut.removeComment.mutate({ id: ev.c.id }); }} />
                ) : (
                  <div key={ev.a.id} className="flex gap-2.5 items-start text-xs text-muted-foreground">
                    <img src={ev.a.avatar || diceBearUrl(ev.a.user_id ?? ev.a.id)} className="h-7 w-7 rounded-full object-cover shrink-0 ring-1 ring-border" />
                    <p className="pt-1"><strong className="text-foreground">{ev.a.nome ?? "Alguém"}</strong> {ROTULO_ATIVIDADE[ev.a.type] ?? ev.a.type}
                      <span className="block">{dataHora(ev.a.created_at)}</span></p>
                  </div>
                ))}
                {data.comments.length === 0 && !detalhes && <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>}
                {detalhes && atividade.length === 0 && <p className="text-xs text-muted-foreground">Sem atividade registrada além dos comentários.</p>}
              </div>
            </div>

            {moverCopiar && (
              <MoverCopiar modo={moverCopiar}
                card={{ id: cardId, title: data.card.title, board_id: data.card.board_id, list_id: data.card.list_id }}
                onClose={() => setMoverCopiar(null)}
                onFeito={() => { if (moverCopiar === "mover" && data.card.board_id !== boardId) onClose(); }} />
            )}
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Comentários e atividade ────────────────────────────────────────────────
type Atividade = { id: string; user_id: string | null; type: string; created_at: string; nome: string | null; avatar: string | null };
const ROTULO_ATIVIDADE: Record<string, string> = {
  "card.create": "criou este cartão",
  "card.archive": "arquivou este cartão",
  "card.move": "moveu este cartão",
  "anexo.adicionar": "anexou um arquivo",
  "anexo.substituir": "substituiu um arquivo",
  "anexo.excluir": "excluiu um arquivo",
  "anexo.restaurar": "restaurou uma versão anterior de um arquivo",
};
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
function resumoDatas(inicio: string | null, entrega: string | null) {
  const d = (iso: string, hora: boolean) => new Date(iso).toLocaleString("pt-BR", hora ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" });
  if (inicio && entrega) return `${d(inicio, false)} – ${d(entrega, true)}`;
  if (entrega) return `Entrega: ${d(entrega, true)}`;
  return `Começou: ${d(inicio!, false)}`;
}
type Evento = { tipo: "comentario"; quando: string; c: Comment } | { tipo: "atividade"; quando: string; a: Atividade };
function linhaDoTempo(comentarios: Comment[], atividade: Atividade[]): Evento[] {
  return [
    ...comentarios.map((c) => ({ tipo: "comentario" as const, quando: c.created_at, c })),
    ...atividade.map((a) => ({ tipo: "atividade" as const, quando: a.created_at, a })),
  ].sort((x, y) => y.quando.localeCompare(x.quando));
}

type Pessoa = { id: string; full_name: string | null; avatar_url: string | null };
/** Como a pessoa aparece no texto: primeiro e segundo nome ("@Mirian Silva"). */
const rotuloMencao = (nome: string | null) => (nome ?? "").trim().split(/\s+/).slice(0, 2).join(" ");
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Campo de comentário: fechado é uma linha; ao focar abre, e só envia no botão
// (ou Ctrl+Enter) — Enter quebra linha, como no Trello. Digitar "@" abre a
// lista de pessoas; quem for escolhido recebe aviso no sininho ao salvar.
function NovoComentario({ valor, onChange, onEnviar, inputRef, pessoas, onMencionar }: {
  valor: string; onChange: (v: string) => void; onEnviar: (t: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  pessoas: Pessoa[]; onMencionar: (p: Pessoa) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState<{ termo: string; inicio: number } | null>(null);
  const [sel, setSel] = useState(0);
  const enviar = () => { const t = valor.trim(); if (t) onEnviar(t); };

  const opcoes = busca
    ? pessoas.filter((p) => semAcento(p.full_name ?? "").split(/\s+/).some((w) => w.startsWith(semAcento(busca.termo)))
        || semAcento(p.full_name ?? "").startsWith(semAcento(busca.termo))).slice(0, 6)
    : [];

  const olhar = (el: HTMLTextAreaElement) => {
    const ate = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(ate);
    setBusca(m ? { termo: m[2], inicio: ate.length - m[2].length - 1 } : null);
    setSel(0);
  };
  const escolher = (p: Pessoa) => {
    if (!busca) return;
    const el = inputRef.current;
    const fim = busca.inicio + 1 + busca.termo.length;
    const texto = `@${rotuloMencao(p.full_name)} `;
    const novo = valor.slice(0, busca.inicio) + texto + valor.slice(fim);
    onChange(novo); onMencionar(p); setBusca(null);
    requestAnimationFrame(() => { if (el) { el.focus(); const pos = busca.inicio + texto.length; el.setSelectionRange(pos, pos); } });
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea ref={inputRef} value={valor}
          onChange={(e) => { onChange(e.target.value); olhar(e.target); }}
          onClick={(e) => olhar(e.currentTarget)}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setBusca(null), 150)}
          onKeyDown={(e) => {
            if (busca && opcoes.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((x) => (x + 1) % opcoes.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((x) => (x - 1 + opcoes.length) % opcoes.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); escolher(opcoes[sel]); return; }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setBusca(null); return; }
            }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); }
          }}
          rows={aberto ? 3 : 1} placeholder="Escrever um comentário… (@ para mencionar)"
          className="w-full text-sm rounded-[var(--input-radius)] border border-border bg-card px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-primary/40" />
        {busca && opcoes.length > 0 && (
          <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-1">
            <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">Mencionar — a pessoa é avisada no sininho</p>
            {opcoes.map((p, k) => (
              <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); escolher(p); }} onMouseEnter={() => setSel(k)}
                className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${k === sel ? "bg-muted" : ""}`}>
                <img src={p.avatar_url || diceBearUrl(p.id)} className="h-6 w-6 rounded-full object-cover" />
                <span className="truncate">{p.full_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {(aberto || valor) && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" disabled={!valor.trim()} onClick={enviar}>Salvar</Button>
          <button onClick={() => { onChange(""); setAberto(false); }} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
          <div className="ml-auto"><BarraFormatacao inputRef={inputRef} valor={valor} onChange={onChange} /></div>
        </div>
      )}
    </div>
  );
}

function ComentarioItem({ c, meu, onResponder, onSalvar, onExcluir, reacoes, meuId, nomeDe, onReagir, onCopiarLink, destacado }: {
  c: Comment; meu: boolean; onResponder: () => void; onSalvar: (body: string) => void; onExcluir: () => void;
  reacoes: Reacao[]; meuId: string | null; nomeDe: (id: string) => string; onReagir: (emoji: string) => void;
  onCopiarLink: () => void; destacado: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(c.body);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const editado = !!c.updated_at && new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 60_000;
  return (
    // `id` é o alvo do link do comentário (`?comentario=`); o anel some sozinho.
    <div id={`comentario-${c.id}`} className={`flex gap-2.5 rounded-[var(--radius)] transition-shadow duration-700 ${destacado ? "ring-2 ring-primary ring-offset-4 ring-offset-background" : ""}`}>
      <img src={c.authorAvatar || diceBearUrl(c.user_id)} className="h-8 w-8 rounded-full object-cover shrink-0 ring-1 ring-border" />
      <div className="min-w-0 flex-1">
        <p className="text-xs">
          <strong className="text-foreground">{c.authorName ?? "Usuário"}</strong>{" "}
          <span className="text-muted-foreground">{dataHora(c.created_at)}{editado ? " (editado)" : ""}</span>
        </p>
        {editando ? (
          <div className="mt-1 space-y-2">
            <textarea ref={editRef} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
              className="w-full text-sm rounded-[var(--input-radius)] border border-border bg-card px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={!texto.trim()} onClick={() => { onSalvar(texto.trim()); setEditando(false); }}>Salvar</Button>
              <button onClick={() => { setTexto(c.body); setEditando(false); }} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
              <div className="ml-auto"><BarraFormatacao inputRef={editRef} valor={texto} onChange={setTexto} /></div>
            </div>
          </div>
        ) : (
          <TextoRico texto={c.body} className="text-sm text-foreground bg-card border border-border shadow-[var(--shadow-card)] rounded-[var(--radius)] px-3 py-2 mt-1 break-words" />
        )}
        {!editando && (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <ReacoesDoComentario reacoes={reacoes} meuId={meuId} nomeDe={nomeDe} onAlternar={onReagir} />
            <button onClick={onResponder} className="hover:text-foreground hover:underline">Responder</button>
            <span>•</span><button onClick={onCopiarLink} className="hover:text-foreground hover:underline" title="Link direto para este comentário">Link</button>
            {meu && <><span>•</span><button onClick={() => setEditando(true)} className="hover:text-foreground hover:underline">Editar</button>
              <span>•</span><button onClick={onExcluir} className="hover:text-destructive hover:underline">Excluir</button></>}
          </div>
        )}
      </div>
    </div>
  );
}
