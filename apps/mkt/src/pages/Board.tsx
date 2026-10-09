import { useCartaoDaUrl } from "@/lib/cartaoNaUrl";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCorners, DragOverlay,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, X, GripVertical, MoreHorizontal, Clock, CheckSquare, MessageSquare, AlignLeft, Paperclip, Settings2, Link2, ChevronLeft, ChevronRight, Filter, Bookmark, Trash2, LayoutTemplate, Archive, Pencil, Check, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useBoard, useBoardLive, useBoardMutations, POS_GAP,
  type CardSummary, type List, type Label, pessoasDoQuadro } from "@/hooks/useBoards";
import { positionForIndex } from "@/lib/mktPosition";
import { LABEL_COLORS, getAccent, tintedLabelStyle, ACCENT_SWATCHES, lerCapa, tomDaCapa, fundoDaLista } from "@/lib/mktTheme";
import { diceBearUrl } from "@/components/ui/profile-avatar";
import { CardModal } from "@/components/board/CardModal";
import { useCustomFields, useBoardFieldValues, type CustomField } from "@/hooks/useCustomFields";
import { BoardFieldsDialog } from "@/components/board/BoardFieldsDialog";
import { TrazerDoTrello } from "@/components/board/TrazerDoTrello";
import { ItensArquivados } from "@/components/board/ItensArquivados";
import { EdicaoRapida } from "@/components/board/EdicaoRapida";
import { ListaDialogo, ORDENS, ordenarLista, arquivarTodosOsCartoes, useListasSeguidas, type OrdemLista } from "@/components/board/AcoesDaLista";
import { FilterControls } from "@/components/board/FilterControls";
import { ViewSwitcher } from "@/components/board/ViewSwitcher";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useSavedSearches, useSavedSearchMutations } from "@/hooks/useSavedSearches";
import { emptyCriteria, criteriaActive, contarFiltros, matchCard, type SearchCriteria } from "@/lib/mktFilter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmar, pedirTexto } from "@carbo/shell";
import { useModelos, useModeloMutations, type Modelo } from "@/hooks/useModelos";

const fmtDue = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

// Campos personalizados na FRENTE do cartão. Chega por contexto para não
// atravessar Lista → Cartão → Face (e o DragOverlay) como prop. Existe porque o
// Trello mostra esses campos na frente ("Canal de Publicação: Instagram") e o
// quadro importado parecia ter perdido o dado — ele estava só no detalhe.
const CamposCtx = createContext<{
  campos: CustomField[]; valores: Map<string, Record<string, unknown>>;
  pessoas: Map<string, { full_name: string | null; avatar_url: string | null }>;
  etiquetasAbertas: boolean; alternarEtiquetas: () => void;
}>({ campos: [], valores: new Map(), pessoas: new Map(), etiquetasAbertas: false, alternarEtiquetas: () => {} });

// Etiqueta na frente do cartão é BARRINHA, como no Trello; clicar numa abre o
// texto de TODAS (e fecha de novo). A escolha é de quem olha, então fica no
// navegador — e tem de sobreviver a localStorage bloqueado.
const CHAVE_ETIQUETAS = "mkt-etiquetas-abertas";
function lerEtiquetasAbertas(): boolean {
  try { return localStorage.getItem(CHAVE_ETIQUETAS) === "1"; } catch { return false; }
}

function FotosDosMembros({ ids }: { ids: string[] }) {
  const { pessoas } = useContext(CamposCtx);
  if (ids.length === 0) return null;
  const vis = ids.slice(0, 3);
  return (
    <span className="ml-auto flex -space-x-1.5">
      {vis.map((id) => {
        const p = pessoas.get(id);
        return <img key={id} src={p?.avatar_url || diceBearUrl(id)} title={p?.full_name ?? ""} alt={p?.full_name ?? ""}
          className="h-6 w-6 rounded-full ring-2 ring-card object-cover" />;
      })}
      {ids.length > 3 && <span className="h-6 w-6 rounded-full ring-2 ring-card bg-muted text-[10px] grid place-items-center">+{ids.length - 3}</span>}
    </span>
  );
}

function textoDoCampo(f: CustomField, v: unknown): { texto: string; cor?: string } | null {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return null;
  if (f.type === "select") { const o = f.options.find((x) => x.id === v); return o ? { texto: o.label, cor: o.color } : null; }
  if (f.type === "multiselect") {
    const ls = (v as string[]).map((id) => f.options.find((x) => x.id === id)?.label).filter(Boolean);
    return ls.length ? { texto: ls.join(", ") } : null;
  }
  if (f.type === "checkbox") return v === true ? { texto: "sim" } : null;
  if (f.type === "date") return { texto: new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) };
  const t = String(v);
  return { texto: t.length > 28 ? `${t.slice(0, 28)}…` : t };
}

function CamposNaFrente({ cardId }: { cardId: string }) {
  const { campos, valores } = useContext(CamposCtx);
  const v = valores.get(cardId);
  if (!v || campos.length === 0) return null;
  const itens = campos.map((f) => ({ f, x: textoDoCampo(f, v[f.id]) })).filter((i) => i.x);
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {itens.map(({ f, x }) => (
        <span key={f.id} title={f.name}
          className="inline-flex items-center gap-1 max-w-full h-5 px-1.5 rounded-sm text-[11px] leading-none truncate bg-muted text-foreground"
          style={x!.cor ? { background: tomDaCapa(LABEL_COLORS[x!.cor] ?? x!.cor) } : undefined}>
          <span className="opacity-80 truncate">{f.name}:</span><span className="font-medium truncate">{x!.texto}</span>
        </span>
      ))}
    </div>
  );
}

// Ações da FRENTE do cartão (lápis da edição rápida, círculo de concluir,
// cartão sob o mouse para a tecla E). Por contexto, como os campos: atravessar
// Lista → Cartão como prop seria mais três props em cada nível.
const AcoesCtx = createContext<{
  editar: (card: CardSummary, el: HTMLElement) => void;
  concluir: (card: CardSummary) => void;
  sobre: (id: string | null) => void;
} | null>(null);

// ── Face presentacional do cartão (reusada no kanban e no DragOverlay) ────────
function CardFace({ card, labels, onConcluir }: { card: CardSummary; labels: Label[]; onConcluir?: () => void }) {
  const cardLabels = labels.filter((l) => card.labelIds.includes(l.id));
  const overdue = card.due_date && !card.is_complete && new Date(card.due_date) < new Date();
  const capa = lerCapa(card.cover);
  const { etiquetasAbertas, alternarEtiquetas } = useContext(CamposCtx);

  // Capa CHEIA: o cartão é a cor, com o título por cima e nada mais — é como
  // o Trello mostra a LEGENDA, e ali a cor É a informação.
  if (capa?.cheia) {
    return (
      <div className="-m-3 rounded-[inherit] p-3 min-h-[3.5rem] flex items-end" style={{ background: tomDaCapa(capa.cor) }}>
        <p className="mkt-card-title font-semibold">{card.title}</p>
      </div>
    );
  }

  return (
    <>
      {/* A capa guarda a CHAVE da paleta ("sky", "lime"); pintar a chave crua
          dava verde-néon em "lime" e faixa invisível em "sky". */}
      {/* Capa de ponta a ponta no topo, como no Trello — e no tom ESCURO da
          cor: o amarelo cheio da paleta gritava mais que o próprio título. */}
      {capa && !capa.cheia && (
        <div className="h-8 -mx-3 -mt-3 mb-1"
          style={{ background: tomDaCapa(capa.cor), borderRadius: "inherit", borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} />
      )}
      {cardLabels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cardLabels.map((l) => {
            const cor = LABEL_COLORS[l.color] ?? l.color;
            const aberta = etiquetasAbertas && !!l.name;
            return (
              <button key={l.id} type="button"
                onClick={(e) => { e.stopPropagation(); alternarEtiquetas(); }}
                className={aberta
                  ? "inline-flex items-center h-5 px-2 rounded-md border text-xs font-medium"
                  : "h-2 w-10 rounded-full"}
                style={aberta ? tintedLabelStyle(cor) : { background: cor }}
                title={l.name || "(sem nome)"}>
                {aberta ? l.name : null}
              </button>
            );
          })}
        </div>
      )}
      {card.mirrorOf && (
        <div className="flex items-center gap-1 text-xs text-accent">
          <Link2 className="h-3.5 w-3.5" /> espelhado de {card.mirrorSourceBoard ?? "—"}{card.mirrorSourceList ? ` / ${card.mirrorSourceList}` : ""}
        </div>
      )}
      <p className="mkt-card-title flex items-start gap-1.5">
        {/* Círculo de concluído, como no Trello: aparece ao passar o mouse e
            fica VERDE quando concluído. É o mesmo `is_complete` da data. */}
        {onConcluir && (
          <button type="button" title={card.is_complete ? "Marcar como não concluído" : "Marcar como concluído"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onConcluir(); }}
            className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border grid place-items-center transition-all ${card.is_complete
              ? "bg-success border-success text-white"
              : "border-muted-foreground/60 hover:border-success hidden group-hover:grid"}`}>
            {card.is_complete && <Check className="h-3 w-3" strokeWidth={3} />}
          </button>
        )}
        <span className="min-w-0">{card.title}</span>
      </p>
      <CamposNaFrente cardId={card.mirrorOf ?? card.id} />
      <div className="mkt-meta-row flex-wrap">
        {card.due_date && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${overdue ? "bg-destructive/10 text-destructive" : card.is_complete ? "bg-success/10 text-success" : "bg-muted"}`}>
            <Clock className="h-3.5 w-3.5" /> {card.start_date ? `${fmtDue(card.start_date)} – ` : ""}{fmtDue(card.due_date)}
          </span>
        )}
        {/* Só início, sem entrega: o Trello mostra "Começou: 28 de set." e o
            quadro importado parecia ter perdido a data. */}
        {!card.due_date && card.start_date && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${card.is_complete ? "bg-success/10 text-success" : "bg-muted"}`}>
            <Clock className="h-3.5 w-3.5" /> Começou: {fmtDue(card.start_date)}
          </span>
        )}
        {card.checklistOverdue && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive" title="Item de checklist atrasado">
            <CheckSquare className="h-3.5 w-3.5" /> atrasado
          </span>
        )}
        {card.description && <AlignLeft className="h-3.5 w-3.5" />}
        {card.attachmentCount > 0 && (
          <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{card.attachmentCount}</span>
        )}
        {card.checklistTotal > 0 && (
          <span className="inline-flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" />{card.checklistDone}/{card.checklistTotal}</span>
        )}
        {card.commentCount > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{card.commentCount}</span>}
        <FotosDosMembros ids={card.memberIds} />
      </div>
    </>
  );
}

// ── Cartão (frente, no kanban) ───────────────────────────────────────────────
function BoardCard({ card, labels, onOpen }: { card: CardSummary; labels: Label[]; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id, data: { type: "card", listId: card.list_id },
  });
  const style = { transform: CSS.Translate.toString(transform), transition };

  // Origem do drag vira placeholder tracejado (não opacity), mantendo a altura.
  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}
        className="mkt-card-placeholder h-20" />
    );
  }

  const acoes = useContext(AcoesCtx);
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={onOpen} data-card-id={card.id}
      onMouseEnter={() => acoes?.sobre(card.id)} onMouseLeave={() => acoes?.sobre(null)}
      className="group mkt-card cursor-pointer relative">
      {acoes && (
        <button type="button" title="Edição rápida (E)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); acoes.editar(card, (e.currentTarget.parentElement as HTMLElement)); }}
          className="absolute top-1.5 right-1.5 z-10 h-7 w-7 grid place-items-center rounded-full bg-card/90 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition max-sm:hidden">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <CardFace card={card} labels={labels} onConcluir={acoes ? () => acoes.concluir(card) : undefined} />
    </div>
  );
}

// ── Lista (coluna) ───────────────────────────────────────────────────────────
type AcaoLista =
  | { tipo: "copiar" | "mover" | "mover_cartoes" | "seguir" | "arquivar_cartoes" }
  | { tipo: "ordenar"; ordem: OrdemLista };
const ITEM_MENU = "w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted";

function BoardColumn({
  list, index, cards, labels, collapsed, onOpenCard, onAddCard, onRename, onArchive, onSetColor, onToggleCollapse,
  modelos, onUsarModelo, onExcluirModelo, seguindo, onAcao,
}: {
  list: List; index: number; cards: CardSummary[]; labels: Label[]; collapsed: boolean;
  onOpenCard: (id: string) => void;
  onAddCard: (listId: string, title: string) => void;
  modelos: Modelo[];
  /** `titulo` = o que já estava digitado no campo; vazio, vale o do modelo. */
  onUsarModelo: (listId: string, modelo: Modelo, titulo: string) => void;
  onExcluirModelo: (modelo: Modelo) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onSetColor: (id: string, color: string | null) => void;
  onToggleCollapse: (id: string) => void;
  seguindo: boolean;
  onAcao: (acao: AcaoLista) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id, data: { type: "list" },
  });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState(list.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ordenarAberto, setOrdenarAberto] = useState(false);
  const [modelosAbertos, setModelosAbertos] = useState(false);
  const accent = getAccent(list.color, index);
  // No Trello a lista INTEIRA tem a cor; cinza/escuro ficam neutras (lá o
  // cinza é o fundo padrão de lista).
  const fundo = list.color && list.color !== "gray" && list.color !== "dark" ? fundoDaLista(accent) : undefined;

  const submit = () => {
    const t = text.trim();
    if (t) { onAddCard(list.id, t); setText(""); }
  };

  // Recolhida: barra fina vertical neutra com dot de acento + título + contagem.
  if (collapsed) {
    return (
      <div ref={setNodeRef} style={style} className="w-10 shrink-0">
        <button onClick={() => onToggleCollapse(list.id)} title="Expandir lista"
          className="mkt-column-collapsed w-10 h-full min-h-[120px] flex flex-col items-center gap-2 py-2.5">
          <span className="mkt-dot" style={{ ["--mkt-accent" as any]: accent }} />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{list.title}</span>
          <span className="mkt-column-count">{cards.length}</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="w-72 shrink-0 flex flex-col max-h-full">
      {/* min-h-0, não max-h-full: o pai só tem max-height, então 100% dele não
          resolve e a coluna crescia com os cartões em vez de rolar. */}
      <div className="mkt-column flex flex-col min-h-0" style={fundo ? { background: fundo, borderColor: "transparent" } : undefined}>
        <div className="mkt-column-header">
          <button className="p-1 -ml-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground" {...attributes} {...listeners}>
            <GripVertical className="h-4 w-4" />
          </button>
          <button onClick={() => onToggleCollapse(list.id)} className="p-1 text-muted-foreground hover:text-foreground" title="Recolher lista"><ChevronLeft className="h-4 w-4" /></button>
          {!fundo && <span className="mkt-dot" style={{ ["--mkt-accent" as any]: accent }} />}
          {editTitle ? (
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { setEditTitle(false); if (title.trim() && title !== list.title) onRename(list.id, title.trim()); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="h-8 text-sm font-semibold" />
          ) : (
            <button onClick={() => setEditTitle(true)} className="flex-1 flex items-center gap-2 text-left min-w-0 px-1">
              {/* Quebra em até duas linhas: "Demandas para Seman…" escondia
                  justamente a parte que distingue uma lista da outra. */}
              <span className="mkt-column-title break-words">{list.title}</span>
              <span className="mkt-column-count">{cards.length}</span>
            </button>
          )}
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-1 text-muted-foreground hover:text-foreground" title={seguindo ? "Ações da lista · você segue esta lista" : "Ações da lista"}>
              {seguindo ? <span className="flex items-center gap-0.5"><Eye className="h-3.5 w-3.5 text-primary" /><MoreHorizontal className="h-4 w-4" /></span> : <MoreHorizontal className="h-4 w-4" />}
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1 w-60 rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-3 space-y-2">
                <p className="mkt-meta-label">Cor da lista</p>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => { onSetColor(list.id, null); setMenuOpen(false); }} className={`h-6 w-6 rounded-md border border-border bg-muted ${!list.color ? "ring-2 ring-primary" : ""}`} title="Sem cor" />
                  {ACCENT_SWATCHES.map((s) => (
                    <button key={s.key} onClick={() => { onSetColor(list.id, s.key); setMenuOpen(false); }}
                      className={`h-6 w-6 rounded-md ${list.color === s.key ? "ring-2 ring-primary ring-offset-1 ring-offset-popover" : ""}`} style={{ background: s.color }} />
                  ))}
                </div>
                <div className="border-t border-border pt-1.5 -mx-1 space-y-0.5">
                  {([
                    ["adicionar", "Adicionar cartão"],
                    ["copiar", "Copiar lista…"],
                    ["mover", "Mover lista…"],
                    ["mover_cartoes", "Mover todos os cartões…"],
                  ] as const).map(([k, rot]) => (
                    <button key={k} onClick={() => { setMenuOpen(false); if (k === "adicionar") setAdding(true); else onAcao({ tipo: k }); }} className={ITEM_MENU}>{rot}</button>
                  ))}
                  <button onClick={() => setOrdenarAberto((v) => !v)} className={`${ITEM_MENU} flex items-center justify-between`}>
                    Ordenar por… <ChevronRight className={`h-3.5 w-3.5 transition-transform ${ordenarAberto ? "rotate-90" : ""}`} />
                  </button>
                  {ordenarAberto && ORDENS.map((o) => (
                    <button key={o.k} onClick={() => { setMenuOpen(false); setOrdenarAberto(false); onAcao({ tipo: "ordenar", ordem: o.k }); }}
                      className={`${ITEM_MENU} pl-5 text-xs text-muted-foreground hover:text-foreground`}>{o.rot}</button>
                  ))}
                  <button onClick={() => { setMenuOpen(false); onAcao({ tipo: "seguir" }); }} className={`${ITEM_MENU} flex items-center justify-between`}>
                    {seguindo ? "Deixar de seguir" : "Seguir"} {seguindo && <Eye className="h-3.5 w-3.5 text-primary" />}
                  </button>
                  <button onClick={() => { setMenuOpen(false); onToggleCollapse(list.id); }} className={ITEM_MENU}>Recolher lista</button>
                </div>
                <div className="border-t border-border pt-1.5 -mx-1 space-y-0.5">
                  <button onClick={() => { setMenuOpen(false); onAcao({ tipo: "arquivar_cartoes" }); }} className={ITEM_MENU}>Arquivar todos os cartões</button>
                  <button onClick={async () => { setMenuOpen(false); if (await confirmar({ titulo: "Arquivar esta lista?", confirmar: "Arquivar" })) onArchive(list.id); }} className={`${ITEM_MENU} text-destructive`}>Arquivar lista</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-2 py-2 overflow-y-auto space-y-2 flex-1 min-h-[8px]">
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {cards.map((c) => (
              <BoardCard key={c.id} card={c} labels={labels} onOpen={() => onOpenCard(c.mirrorOf ?? c.id)} />
            ))}
          </SortableContext>
        </div>

        <div className="px-2 pb-2 relative">
          {modelosAbertos && (
            <div className="absolute bottom-full left-2 right-2 z-20 mb-1 rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-1.5">
              <div className="flex items-center justify-between px-1.5 pb-1">
                <p className="mkt-meta-label">Criar a partir de um modelo</p>
                <button onClick={() => setModelosAbertos(false)} className="p-0.5 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
              {modelos.length === 0 ? (
                <p className="px-1.5 py-1.5 text-xs text-muted-foreground">Nenhum modelo neste quadro ainda. Abra um cartão pronto e use <b>Salvar como modelo</b>.</p>
              ) : modelos.map((md) => (
                <div key={md.id} className="group/md flex items-center gap-1">
                  <button onClick={() => { setModelosAbertos(false); onUsarModelo(list.id, md, text); setText(""); setAdding(false); }}
                    className="flex-1 min-w-0 text-left rounded-md px-2 py-1.5 hover:bg-muted">
                    <span className="block text-sm truncate">{md.nome}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {[md.checklists.length ? `${md.checklists.reduce((n, c) => n + c.items.length, 0)} itens de checklist` : "",
                        md.label_ids.length ? `${md.label_ids.length} etiqueta${md.label_ids.length > 1 ? "s" : ""}` : "",
                        md.campos.length ? `${md.campos.length} campo${md.campos.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ") || "só título e descrição"}
                    </span>
                  </button>
                  <button onClick={() => onExcluirModelo(md)} title="Excluir modelo" className="p-1 opacity-0 group-hover/md:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          {adding ? (
            <div className="space-y-2">
              <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === "Escape") setAdding(false); }}
                placeholder="Título do cartão…" rows={2}
                className="w-full text-sm rounded-[var(--input-radius)] border border-border bg-card p-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={submit}>Adicionar</Button>
                <button onClick={() => setAdding(false)} className="p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                <button onClick={() => setModelosAbertos((v) => !v)} title="Usar um modelo (o título digitado vale)" className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"><LayoutTemplate className="h-3.5 w-3.5" /> Modelo</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => setAdding(true)} className="flex-1 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary hover:bg-muted rounded-[var(--input-radius)] px-2 py-2 transition-colors">
                <Plus className="h-4 w-4" /> Adicionar cartão
              </button>
              <button onClick={() => setModelosAbertos((v) => !v)} title="Criar a partir de um modelo"
                className={`shrink-0 p-2 rounded-[var(--input-radius)] hover:bg-muted ${modelosAbertos ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <LayoutTemplate className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Board() {
  const { boardId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { data, isLoading } = useBoard(boardId ?? null);
  useBoardLive(boardId ?? null);
  const m = useBoardMutations(boardId);
  const { data: modelos = [] } = useModelos(boardId);
  const mm = useModeloMutations(boardId);
  const { data: team = [] } = useTeamMembers();
  const { data: camposDoQuadro = [] } = useCustomFields(boardId ?? null);
  const { data: valoresDosCampos } = useBoardFieldValues(boardId ?? null);
  const [etiquetasAbertas, setEtiquetasAbertas] = useState(lerEtiquetasAbertas);
  const camposCtx = useMemo(() => ({
    campos: camposDoQuadro, valores: valoresDosCampos ?? new Map(),
    pessoas: new Map((data?.people ?? []).map((p) => [p.id, p])),
    etiquetasAbertas,
    alternarEtiquetas: () => setEtiquetasAbertas((v) => {
      try { localStorage.setItem(CHAVE_ETIQUETAS, v ? "0" : "1"); } catch { /* só não lembra */ }
      return !v;
    }),
  }), [camposDoQuadro, valoresDosCampos, data?.people, etiquetasAbertas]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [arquivadosAberto, setArquivadosAberto] = useState(false);
  // Edição rápida: guarda o ID (o cartão é relido do quadro a cada render, para
  // as etiquetas e membros marcados ali aparecerem na hora) e o retângulo.
  const [rapida, setRapida] = useState<{ id: string; rect: DOMRect } | null>(null);
  const sobreRef = useRef<string | null>(null);
  const acoesCtx = useMemo(() => ({
    editar: (card: CardSummary, el: HTMLElement) => setRapida({ id: card.id, rect: el.getBoundingClientRect() }),
    concluir: async (card: CardSummary) => {
      const r = await (supabase as any).from("mkt_cards").update({ is_complete: !card.is_complete }).eq("id", card.mirrorOf ?? card.id);
      if (r.error) { toast.error(`Não marcou: ${r.error.message}`); return; }
      qc.invalidateQueries({ queryKey: ["mkt", "board", boardId] });
    },
    sobre: (id: string | null) => { sobreRef.current = id; },
  }), [qc, boardId]);
  // Tecla E sobre um cartão = edição rápida, como no Trello. Nunca enquanto se
  // digita em algum campo, nem com cartão ou diálogo aberto.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "e" && e.key !== "E") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.closest("input, textarea, select, [contenteditable=true], [role=dialog]"))) return;
      const id = sobreRef.current;
      if (!id || openCardId || rapida) return;
      const el = document.querySelector(`[data-card-id="${id}"]`) as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      setRapida({ id, rect: el.getBoundingClientRect() });
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [openCardId, rapida]);
  const [anexoInicial, setAnexoInicial] = useState<string | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newList, setNewList] = useState("");

  // Filtro do quadro + buscas salvas (escopo do quadro).
  const [criteria, setCriteria] = useState<SearchCriteria>(emptyCriteria());
  const [filterOpen, setFilterOpen] = useState(false);
  const filterActive = criteriaActive(criteria);
  const { user } = useAuth();
  const meuId = user?.id ?? null;
  const { seguidas, alternar: alternarSeguir } = useListasSeguidas((data?.lists ?? []).map((l) => l.id), meuId);
  const [dialogoLista, setDialogoLista] = useState<{ modo: "copiar" | "mover" | "mover_cartoes"; lista: { id: string; title: string } } | null>(null);
  const acaoDaLista = async (l: { id: string; title: string }, a: AcaoLista) => {
    try {
      if (a.tipo === "copiar" || a.tipo === "mover" || a.tipo === "mover_cartoes") setDialogoLista({ modo: a.tipo, lista: l });
      else if (a.tipo === "seguir") await alternarSeguir(l.id);
      else if (a.tipo === "ordenar") {
        const n = await ordenarLista(l.id, a.ordem);
        toast.success(`${n} cartão(ões) reordenado(s).`);
      } else if (a.tipo === "arquivar_cartoes") {
        const n = (cardsByList.get(l.id) ?? []).length;
        if (!n) { toast.info("A lista não tem cartões."); return; }
        if (!(await confirmar({ titulo: `Arquivar os ${n} cartões de "${l.title}"?`, mensagem: "Eles vão para Arquivados e podem ser restaurados de lá.", confirmar: "Arquivar todos" }))) return;
        const feitos = await arquivarTodosOsCartoes(l.id);
        toast.success(`${feitos} cartão(ões) arquivado(s).`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (a.tipo === "ordenar" || a.tipo === "arquivar_cartoes") qc.invalidateQueries({ queryKey: ["mkt"] });
    }
  };
  const passa = (c: CardSummary) => !filterActive || matchCard(c, criteria, { meuId });
  const saved = useSavedSearches("board", boardId);
  const savedMut = useSavedSearchMutations();

  // Listas recolhidas — preferência PESSOAL por quadro (localStorage).
  const collapseKey = `mkt:collapsed:${boardId}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(collapseKey) || "[]")); } catch { return new Set(); }
  });
  const toggleCollapse = (listId: string) => setCollapsed((prev) => {
    const n = new Set(prev);
    if (n.has(listId)) n.delete(listId); else n.add(listId);
    try { localStorage.setItem(collapseKey, JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });

  // `?card=` (F5, busca entre quadros, link) abre o cartão; `&anexo=` (link de
  // um arquivo) abre o cartão JÁ no arquivo.
  useCartaoDaUrl((cid, aid) => { setOpenCardId(cid); setAnexoInicial(aid); });

  const cardsByList = useMemo(() => {
    const map = new Map<string, CardSummary[]>();
    for (const l of data?.lists ?? []) map.set(l.id, []);
    for (const c of [...(data?.cards ?? [])].sort((a, b) => a.position - b.position)) {
      (map.get(c.list_id) ?? map.set(c.list_id, []).get(c.list_id)!).push(c);
    }
    return map;
  }, [data]);

  if (!boardId) return null;
  if (isLoading || !data) {
    return (
      <div className="fixed inset-0 top-14 mkt-canvas bg-dot-grid flex flex-col">
        <div className="mkt-toolbar" />
        <div className="flex-1 overflow-hidden p-4 md:p-6">
          <div className="flex gap-4 h-full items-start">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-80 shrink-0 space-y-2">
                <div className="mkt-skeleton h-10" />
                <div className="mkt-skeleton h-20" />
                <div className="mkt-skeleton h-24" />
                <div className="mkt-skeleton h-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { board, lists, labels } = data;
  const activeCard = activeId ? data.cards.find((c) => c.id === activeId) ?? null : null;
  const boardAccent = getAccent(board.background);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeType = active.data.current?.type;

    // ── Reordenar listas ──
    if (activeType === "list") {
      if (active.id === over.id) return;
      const ordered = [...lists];
      const from = ordered.findIndex((l) => l.id === active.id);
      const to = ordered.findIndex((l) => l.id === over.id);
      if (from < 0 || to < 0) return;
      const others = ordered.filter((l) => l.id !== active.id).map((l) => l.position);
      const pos = positionForIndex(others, to);
      m.moveList.mutate({ id: String(active.id), position: pos });
      return;
    }

    // ── Mover cartão (mesma lista ou entre listas) ──
    if (activeType === "card") {
      const overType = over.data.current?.type;
      const destListId = overType === "card" ? (over.data.current?.listId as string) : String(over.id);
      const srcCard = data.cards.find((c) => c.id === active.id);
      if (!srcCard || !destListId) return;

      const destCards = (cardsByList.get(destListId) ?? []).filter((c) => c.id !== active.id);
      let index = destCards.length;
      if (overType === "card") {
        const overIdx = destCards.findIndex((c) => c.id === over.id);
        index = overIdx < 0 ? destCards.length : overIdx;
      }
      const pos = positionForIndex(destCards.map((c) => c.position), index);

      // Otimista: reflete já no cache pra não "voltar".
      qc.setQueryData(["mkt", "board", boardId], (old: typeof data | undefined) => {
        if (!old) return old;
        return { ...old, cards: old.cards.map((c) => c.id === active.id ? { ...c, list_id: destListId, position: pos } : c) };
      });
      m.moveCard.mutate({ id: String(active.id), listId: destListId, position: pos });
    }
  };

  const addList = () => {
    const t = newList.trim();
    if (!t) return;
    const pos = (lists[lists.length - 1]?.position ?? 0) + POS_GAP;
    m.createList.mutate({ title: t, position: pos }, { onSuccess: () => { setNewList(""); setAddingList(false); } });
  };

  const addCard = (listId: string, title: string) => {
    const listCards = cardsByList.get(listId) ?? [];
    const pos = (listCards[listCards.length - 1]?.position ?? 0) + POS_GAP;
    m.createCard.mutate({ listId, title, position: pos }, { onError: () => toast.error("Não foi possível criar o cartão.") });
  };

  const usarModelo = (listId: string, modelo: Modelo, titulo: string) => {
    const listCards = cardsByList.get(listId) ?? [];
    const pos = (listCards[listCards.length - 1]?.position ?? 0) + POS_GAP;
    mm.criarCartao.mutate({ modelo, listId, position: pos, titulo }, {
      // Abre o cartão: quase sempre falta dar o título da peça e o prazo.
      onSuccess: (id) => { setOpenCardId(id); toast.success(`Cartão criado com o modelo "${modelo.nome}".`); },
      onError: (e) => toast.error(`Não criou o cartão: ${(e as Error).message}`),
    });
  };
  const excluirModelo = async (modelo: Modelo) => {
    if (!(await confirmar({ titulo: `Excluir o modelo "${modelo.nome}"?`, mensagem: "Os cartões já criados com ele não mudam.", confirmar: "Excluir", perigo: true }))) return;
    mm.excluir.mutate({ id: modelo.id }, { onError: (e) => toast.error((e as Error).message) });
  };

  return (
    <CamposCtx.Provider value={camposCtx}>
    <AcoesCtx.Provider value={acoesCtx}>
    <div className="fixed inset-0 top-14 mkt-canvas bg-dot-grid flex flex-col">
      {/* Cabeçalho do quadro */}
      <div className="mkt-toolbar header-depth-glow gap-2">
        <Link to="/quadros" aria-label="Voltar aos quadros" className="inline-flex p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
        <span className="mkt-dot" style={{ ["--mkt-accent" as any]: boardAccent }} />
        <h1 className="mkt-view-title truncate">{board.title}</h1>
        <ViewSwitcher boardId={boardId} current="kanban" />

        {/* Filtro + buscas salvas do quadro */}
        <div className="ml-auto relative">
          <button onClick={() => setFilterOpen((v) => !v)}
            className={`flex items-center gap-1.5 text-sm rounded-md px-2.5 py-1.5 transition-colors ${filterActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            <Filter className="h-4 w-4" /> Filtrar{filterActive ? ` · ${contarFiltros(criteria)}` : ""}
          </button>
          {filterOpen && (
            <div className="absolute right-0 z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-9rem)] overflow-y-auto rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-4 space-y-3 text-foreground">
              <FilterControls value={criteria} onChange={setCriteria} labels={labels} team={pessoasDoQuadro(data, team)} completo meuId={meuId} />
              {filterActive && (
                <p className="text-xs text-muted-foreground">{data.cards.filter(passa).length} de {data.cards.length} cartões no filtro.</p>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setCriteria(emptyCriteria())}>Limpar</Button>
                <Button size="sm" className="h-8 text-xs disabled:bg-transparent disabled:text-muted-foreground disabled:border disabled:border-border disabled:opacity-100 disabled:shadow-none" disabled={!filterActive}
                  onClick={async () => { const name = await pedirTexto({ titulo: "Salvar busca", rotulo: "Nome da busca", obrigatorio: true, confirmar: "Salvar" }); if (name?.trim()) savedMut.create.mutate({ name: name.trim(), scope: "board", boardId, criteria }); }}>
                  Salvar busca
                </Button>
              </div>
              {saved.data && saved.data.length > 0 && (
                <div className="border-t border-border pt-3 space-y-1">
                  <p className="mkt-meta-label flex items-center gap-1"><Bookmark className="h-3 w-3" /> Buscas salvas</p>
                  {saved.data.map((s) => (
                    <div key={s.id} className="flex items-center gap-1 group">
                      <button onClick={() => setCriteria(s.criteria)} className="flex-1 text-left text-sm px-2 py-1 rounded-md hover:bg-muted truncate">{s.name}</button>
                      <button onClick={() => savedMut.remove.mutate({ id: s.id })} className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <TrazerDoTrello boardId={boardId} />
        <button onClick={() => setArquivadosAberto(true)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-2.5 py-1.5 transition-colors" title="Itens arquivados">
          <Archive className="h-4 w-4" /> Arquivados
        </button>
        <button onClick={() => setFieldsOpen(true)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-2.5 py-1.5 transition-colors" title="Campos personalizados">
          <Settings2 className="h-4 w-4" /> Campos
        </button>
      </div>

      {/* Colunas */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 md:p-6">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-4 h-full items-start">
            <SortableContext items={lists.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
              {lists.map((l, i) => (
                <BoardColumn key={l.id} list={l} index={i}
                  cards={(cardsByList.get(l.id) ?? []).filter(passa)}
                  labels={labels}
                  collapsed={collapsed.has(l.id) || (filterActive && !!criteria.recolherVazias && !(cardsByList.get(l.id) ?? []).some(passa))}
                  onOpenCard={(id) => setOpenCardId(id)} onAddCard={addCard}
                  onRename={(id, title) => m.renameList.mutate({ id, title })}
                  onArchive={(id) => m.archiveList.mutate({ id })}
                  onSetColor={(id, color) => m.setListColor.mutate({ id, color })}
                  onToggleCollapse={toggleCollapse}
                  seguindo={seguidas.has(l.id)} onAcao={(a) => acaoDaLista(l, a)}
                  modelos={modelos} onUsarModelo={usarModelo} onExcluirModelo={excluirModelo} />
              ))}
            </SortableContext>

            {/* Adicionar lista */}
            <div className="w-80 shrink-0">
              {addingList ? (
                <form className="mkt-column p-2 space-y-2" onSubmit={(e) => { e.preventDefault(); addList(); }}>
                  <Input autoFocus value={newList} onChange={(e) => setNewList(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setAddingList(false); }}
                    placeholder="Título da lista…" className="h-9 text-sm" />
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm">Adicionar lista</Button>
                    <button type="button" onClick={() => setAddingList(false)} className="p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setAddingList(true)} className="w-full flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-card border border-border rounded-[var(--radius)] px-3 py-2.5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow">
                  <Plus className="h-4 w-4" /> Adicionar lista
                </button>
              )}
            </div>
          </div>

          <DragOverlay>
            {activeCard ? (
              <div className="mkt-card mkt-card-overlay w-72 cursor-grabbing">
                <CardFace card={activeCard} labels={labels} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {rapida && (() => {
        const c = data.cards.find((x) => x.id === rapida.id);
        if (!c) return null;
        return (
          <EdicaoRapida card={c} rect={rapida.rect} boardId={boardId} labels={labels} pessoas={pessoasDoQuadro(data, team)}
            onClose={() => setRapida(null)}
            onAbrir={() => setOpenCardId(c.mirrorOf ?? c.id)}
            onArquivar={() => m.archiveCard.mutate({ id: c.id }, { onSuccess: () => toast.success("Cartão arquivado.") })} />
        );
      })()}
      {dialogoLista && boardId && (
        <ListaDialogo modo={dialogoLista.modo} lista={dialogoLista.lista} boardId={boardId} onClose={() => setDialogoLista(null)} />
      )}
      <ItensArquivados boardId={boardId} open={arquivadosAberto} onOpenChange={setArquivadosAberto}
        onAbrirCartao={(id) => { setArquivadosAberto(false); setOpenCardId(id); }} />
      {openCardId && (
        <CardModal cardId={openCardId} boardId={boardId} labels={labels} pessoas={data.people} anexoInicial={anexoInicial} onClose={() => { setOpenCardId(null); setAnexoInicial(null); }} />
      )}
      {fieldsOpen && <BoardFieldsDialog boardId={boardId} onClose={() => setFieldsOpen(false)} />}
    </div>
    </AcoesCtx.Provider>
    </CamposCtx.Provider>
  );
}
