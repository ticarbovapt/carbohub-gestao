import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Archive, ArrowLeft, ChevronsLeft, ChevronsRight, Download, FileText, Info, Palette, Printer, Settings2, Tag, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmar } from "@carbo/shell";
import { diceBearUrl } from "@/components/ui/profile-avatar";
import { LABEL_COLORS, LABEL_COLOR_KEYS, LIST_DOT } from "@/lib/mktTheme";
import { TextoRico } from "@/lib/textoRico";
import type { Board, Label } from "@/hooks/useBoards";

// ─────────────────────────────────────────────────────────────────────────────
// O MENU DO QUADRO — o painel "⋯" do Trello: Sobre, Atividade, Etiquetas, Cor,
// recolher/expandir listas, Campos, Arquivados, Exportar e Imprimir.
//
// ⚠️ Exportar e imprimir leem do BANCO na hora, paginando de 1.000 em 1.000:
// o quadro importado tem mais de 1.000 comentários, e o teto calado do
// PostgREST entregaria um arquivo "completo" faltando metade.
// ⚠️ Excluir etiqueta tira ela de TODOS os cartões (a cascata faz) — a
// confirmação diz quantos.
// ⚠️ "Cor do quadro" é o acento (bolinha, ícone), não um fundo: o fundo cheio
// foi aposentado (`BOARD_BG`) porque competia com os cartões.
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { from: (t: string) => any };

type Pagina = "menu" | "sobre" | "atividade" | "etiquetas" | "cor";

async function todas<T>(montar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const r = await montar().range(de, de + 999);
    if (r.error) throw new Error(r.error.message);
    out.push(...((r.data ?? []) as T[]));
    if (!r.data || r.data.length < 1000) return out;
    if (de > 200_000) throw new Error("quadro grande demais para exportar de uma vez");
  }
}

/** Tudo do quadro, ativo e arquivado — o que o export e a impressão precisam. */
async function lerQuadro(boardId: string) {
  const [lists, cards, labels] = await Promise.all([
    todas<any>(() => db.from("mkt_lists").select("*").eq("board_id", boardId).order("position").order("id")),
    todas<any>(() => db.from("mkt_cards").select("*").eq("board_id", boardId).order("position").order("id")),
    todas<any>(() => db.from("mkt_labels").select("*").eq("board_id", boardId).order("id")),
  ]);
  const ids = cards.map((c) => c.id);
  const porLote = async <T,>(tabela: string, col: string, sel = "*") => {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      out.push(...await todas<T>(() => db.from(tabela).select(sel).in(col, ids.slice(i, i + 150)).order(col)));
    }
    return out;
  };
  const [cardLabels, cardMembers, checklists, comments, attachments] = await Promise.all([
    porLote<any>("mkt_card_labels", "card_id"), porLote<any>("mkt_card_members", "card_id"),
    porLote<any>("mkt_checklists", "card_id"), porLote<any>("mkt_comments", "card_id"),
    porLote<any>("mkt_card_attachments", "card_id", "id, card_id, kind, name, external_url, mime_type, created_at"),
  ]);
  const ckIds = checklists.map((c) => c.id);
  const items: any[] = [];
  for (let i = 0; i < ckIds.length; i += 150) {
    items.push(...await todas<any>(() => db.from("mkt_checklist_items").select("*").in("checklist_id", ckIds.slice(i, i + 150)).order("checklist_id")));
  }
  const pessoasIds = [...new Set([...cardMembers.map((m) => m.user_id), ...comments.map((c) => c.user_id)])];
  const pessoas: any[] = [];
  for (let i = 0; i < pessoasIds.length; i += 150) {
    const r = await db.from("profiles").select("id, full_name").in("id", pessoasIds.slice(i, i + 150));
    pessoas.push(...(r.data ?? []));
  }
  return { lists, cards, labels, cardLabels, cardMembers, checklists, items, comments, attachments, pessoas };
}

const baixarArquivo = (nome: string, conteudo: string, tipo: string) => {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
const nomeArquivo = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_").slice(0, 60) || "quadro";
const csv = (v: unknown) => { const s = v == null ? "" : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function MenuDoQuadro({ board, labels, aberto, onOpenChange, onRecolherTodas, onExpandirTodas, onCampos, onArquivados }: {
  board: Board & { descricao?: string | null };
  labels: Label[];
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  onRecolherTodas: () => void;
  onExpandirTodas: () => void;
  onCampos: () => void;
  onArquivados: () => void;
}) {
  const qc = useQueryClient();
  const [pagina, setPagina] = useState<Pagina>("menu");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const fechar = () => { onOpenChange(false); setPagina("menu"); };
  const inval = () => qc.invalidateQueries({ queryKey: ["mkt"] });

  const exportar = async (formato: "json" | "csv") => {
    setOcupado(formato);
    try {
      const q = await lerQuadro(board.id);
      const nomeLista = new Map(q.lists.map((l) => [l.id, l.title]));
      const nomeEtiq = new Map(q.labels.map((l) => [l.id, l.name || l.color]));
      const nomePessoa = new Map(q.pessoas.map((p) => [p.id, p.full_name]));
      const base = nomeArquivo(board.title);
      if (formato === "json") {
        baixarArquivo(`${base}.json`, JSON.stringify({ exportado_em: new Date().toISOString(), quadro: board, ...q }, null, 2), "application/json");
      } else {
        const linhas = [["Lista", "Título", "Descrição", "Etiquetas", "Membros", "Início", "Entrega", "Concluído", "Arquivado", "Comentários", "Anexos", "Checklist", "Criado em"]];
        for (const c of q.cards) {
          const cks = q.checklists.filter((k) => k.card_id === c.id).map((k) => k.id);
          const its = q.items.filter((i) => cks.includes(i.checklist_id));
          linhas.push([
            nomeLista.get(c.list_id) ?? "", c.title, c.description ?? "",
            q.cardLabels.filter((x) => x.card_id === c.id).map((x) => nomeEtiq.get(x.label_id) ?? "").join(", "),
            q.cardMembers.filter((x) => x.card_id === c.id).map((x) => nomePessoa.get(x.user_id) ?? "").join(", "),
            dataBr(c.start_date), dataBr(c.due_date), c.is_complete ? "sim" : "não", c.is_archived ? "sim" : "não",
            String(q.comments.filter((x) => x.card_id === c.id).length), String(q.attachments.filter((x) => x.card_id === c.id).length),
            its.length ? `${its.filter((i) => i.is_done).length}/${its.length}` : "", dataBr(c.created_at),
          ]);
        }
        // `;` e BOM: é o que o Excel em português abre direto, com acento certo.
        baixarArquivo(`${base}.csv`, "﻿" + linhas.map((l) => l.map(csv).join(";")).join("\n"), "text/csv;charset=utf-8");
      }
      toast.success(`Exportado: ${q.cards.length} cartões, ${q.comments.length} comentários.`);
    } catch (e) {
      toast.error(`Não exportou: ${(e as Error).message}`);
    } finally { setOcupado(null); }
  };

  const imprimir = async () => {
    // Abre a janela JÁ no clique: navegador bloqueia popup aberto depois de um await.
    const w = window.open("", "_blank");
    if (!w) { toast.error("O navegador bloqueou a janela de impressão — libere popups para este site."); return; }
    w.document.write("<p style='font-family:sans-serif'>Montando o quadro para imprimir…</p>");
    setOcupado("imprimir");
    try {
      const q = await lerQuadro(board.id);
      const nomeEtiq = new Map(q.labels.map((l) => [l.id, l.name || ""]));
      const nomePessoa = new Map(q.pessoas.map((p) => [p.id, p.full_name]));
      const listas = q.lists.filter((l) => !l.is_archived);
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(board.title)}</title>
<style>body{font:13px/1.4 system-ui,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0 0 4px}small{color:#666}
h2{font-size:15px;margin:22px 0 6px;padding-bottom:4px;border-bottom:2px solid #111;break-after:avoid}
.c{border:1px solid #ccc;border-radius:6px;padding:8px 10px;margin:6px 0;break-inside:avoid}.t{font-weight:600}
.m{color:#555;font-size:12px;margin-top:3px}.d{margin-top:4px;white-space:pre-wrap;color:#333;font-size:12px}
@media print{body{margin:0}}</style></head><body>
<h1>${esc(board.title)}</h1><small>Impresso em ${esc(new Date().toLocaleString("pt-BR"))} · ${listas.length} listas</small>
${listas.map((l) => {
  const cs = q.cards.filter((c) => c.list_id === l.id && !c.is_archived);
  return `<h2>${esc(l.title)} <small>(${cs.length})</small></h2>` + cs.map((c) => {
    const etq = q.cardLabels.filter((x) => x.card_id === c.id).map((x) => nomeEtiq.get(x.label_id)).filter(Boolean).join(", ");
    const mem = q.cardMembers.filter((x) => x.card_id === c.id).map((x) => nomePessoa.get(x.user_id)).filter(Boolean).join(", ");
    const meta = [c.due_date ? `Entrega ${dataBr(c.due_date)}${c.is_complete ? " ✓" : ""}` : "", etq && `Etiquetas: ${etq}`, mem && `Membros: ${mem}`].filter(Boolean).join(" · ");
    const desc = (c.description ?? "").slice(0, 600);
    return `<div class="c"><div class="t">${esc(c.title)}</div>${meta ? `<div class="m">${esc(meta)}</div>` : ""}${desc ? `<div class="d">${esc(desc)}${(c.description ?? "").length > 600 ? "…" : ""}</div>` : ""}</div>`;
  }).join("");
}).join("")}
<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script></body></html>`;
      w.document.open(); w.document.write(html); w.document.close();
    } catch (e) {
      w.close();
      toast.error(`Não montou a impressão: ${(e as Error).message}`);
    } finally { setOcupado(null); }
  };

  const Item = ({ icone: I, rot, onClick, desc }: { icone: typeof Info; rot: string; onClick: () => void; desc?: string }) => (
    <button type="button" onClick={onClick} disabled={!!ocupado}
      className="w-full flex items-start gap-3 rounded-md px-2.5 py-2 text-left hover:bg-muted disabled:opacity-60">
      <I className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0"><span className="block text-sm text-foreground">{ocupado && rot.toLowerCase().includes(ocupado) ? `${rot}…` : rot}</span>
        {desc && <span className="block text-xs text-muted-foreground">{desc}</span>}</span>
    </button>
  );

  const titulo: Record<Pagina, string> = { menu: "Menu", sobre: "Sobre este quadro", atividade: "Atividade", etiquetas: "Etiquetas", cor: "Cor do quadro" };

  return (
    <Sheet open={aberto} onOpenChange={(v) => { if (!v) fechar(); else onOpenChange(true); }}>
      <SheetContent side="right" className="w-[360px] sm:max-w-[360px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {pagina !== "menu" && <button type="button" onClick={() => setPagina("menu")} className="p-1 -ml-1 rounded-md hover:bg-muted text-muted-foreground"><ArrowLeft className="h-4 w-4" /></button>}
            <SheetTitle className="text-base">{titulo[pagina]}</SheetTitle>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-3">
          {pagina === "menu" && (
            <div className="space-y-0.5">
              <Item icone={Info} rot="Sobre este quadro" desc="Descrição e quem criou" onClick={() => setPagina("sobre")} />
              <Item icone={Activity} rot="Atividade" desc="Comentários e mudanças recentes" onClick={() => setPagina("atividade")} />
              <Item icone={Tag} rot="Etiquetas" desc="Criar, renomear, trocar a cor, excluir" onClick={() => setPagina("etiquetas")} />
              <Item icone={Palette} rot="Cor do quadro" onClick={() => setPagina("cor")} />
              <Item icone={Settings2} rot="Campos personalizados" onClick={() => { fechar(); onCampos(); }} />
              <Item icone={Archive} rot="Itens arquivados" onClick={() => { fechar(); onArquivados(); }} />
              <div className="my-2 border-t border-border" />
              <Item icone={ChevronsLeft} rot="Recolher todas as listas" onClick={() => { onRecolherTodas(); fechar(); }} />
              <Item icone={ChevronsRight} rot="Expandir todas as listas" onClick={() => { onExpandirTodas(); fechar(); }} />
              <div className="my-2 border-t border-border" />
              <Item icone={FileText} rot="Exportar planilha (CSV)" desc="Um cartão por linha, abre no Excel" onClick={() => exportar("csv")} />
              <Item icone={Download} rot="Exportar tudo (JSON)" desc="Cartões, comentários, checklists e anexos (links)" onClick={() => exportar("json")} />
              <Item icone={Printer} rot="Imprimir" desc="As listas e cartões ativos, em folha" onClick={imprimir} />
            </div>
          )}
          {pagina === "sobre" && <Sobre board={board} onSalvo={inval} />}
          {pagina === "atividade" && <AtividadeDoQuadro boardId={board.id} />}
          {pagina === "etiquetas" && <EtiquetasDoQuadro boardId={board.id} labels={labels} onMudou={inval} />}
          {pagina === "cor" && (
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(LIST_DOT).map(([k, cor]) => (
                <button key={k} type="button" title={k}
                  onClick={async () => {
                    const r = await db.from("mkt_boards").update({ background: k }).eq("id", board.id);
                    if (r.error) toast.error(`Não mudou: ${r.error.message}`); else inval();
                  }}
                  className={`h-10 rounded-md ${board.background === k ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`} style={{ background: cor }} />
              ))}
              <p className="col-span-5 text-xs text-muted-foreground pt-1">A cor marca o quadro na lista de quadros e no cabeçalho.</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Sobre({ board, onSalvo }: { board: Board & { descricao?: string | null }; onSalvo: () => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(board.descricao ?? "");
  const { data: criador } = useQuery({
    queryKey: ["mkt", "perfil", board.created_by],
    enabled: !!board.created_by,
    queryFn: async () => (await db.from("profiles").select("id, full_name, avatar_url").eq("id", board.created_by).maybeSingle()).data as { id: string; full_name: string | null; avatar_url: string | null } | null,
  });
  const salvar = async () => {
    const r = await db.from("mkt_boards").update({ descricao: texto.trim() || null }).eq("id", board.id);
    if (r.error) { toast.error(`Não salvou: ${r.error.message}`); return; }
    setEditando(false); onSalvo();
  };
  return (
    <div className="space-y-4">
      {criador && (
        <div>
          <p className="mkt-meta-label pb-1.5">Criado por</p>
          <div className="flex items-center gap-2.5">
            <img src={criador.avatar_url || diceBearUrl(criador.id)} className="h-9 w-9 rounded-full object-cover" />
            <div><p className="text-sm">{criador.full_name}</p><p className="text-xs text-muted-foreground">{new Date(board.created_at).toLocaleDateString("pt-BR", { dateStyle: "long" })}</p></div>
          </div>
        </div>
      )}
      <div>
        <p className="mkt-meta-label pb-1.5">Descrição</p>
        {editando ? (
          <div className="space-y-2">
            <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={8}
              placeholder="Para que serve este quadro, como o time usa as listas…"
              className="w-full text-sm rounded-[var(--input-radius)] border border-border bg-card px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <div className="flex gap-2"><Button size="sm" onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setTexto(board.descricao ?? ""); setEditando(false); }}>Cancelar</Button></div>
          </div>
        ) : board.descricao ? (
          <button type="button" onClick={() => setEditando(true)} className="w-full text-left rounded-md hover:bg-muted/50 p-1 -m-1">
            <TextoRico texto={board.descricao} className="text-sm" />
          </button>
        ) : (
          <button type="button" onClick={() => setEditando(true)} className="w-full text-left text-sm text-muted-foreground rounded-md bg-muted/50 hover:bg-muted px-3 py-3">
            Adicionar uma descrição — para que serve este quadro, como o time usa as listas…
          </button>
        )}
      </div>
    </div>
  );
}

const ROTULO: Record<string, string> = {
  "card.create": "criou", "card.archive": "arquivou", "card.move": "moveu",
  "anexo.adicionar": "anexou um arquivo em", "anexo.substituir": "substituiu um arquivo em",
  "anexo.excluir": "excluiu um arquivo de", "anexo.restaurar": "restaurou uma versão em",
};

// Atividade do quadro: o log (`mkt_activity`) + os COMENTÁRIOS, que são a maior
// parte do que acontece — o log sozinho mostraria quase só anexos.
function AtividadeDoQuadro({ boardId }: { boardId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["mkt", "atividade-quadro", boardId],
    queryFn: async () => {
      const [a, cards] = await Promise.all([
        db.from("mkt_activity").select("id, card_id, user_id, type, created_at").eq("board_id", boardId).neq("type", "comment.add").order("created_at", { ascending: false }).limit(60),
        todas<{ id: string; title: string }>(() => db.from("mkt_cards").select("id, title").eq("board_id", boardId).order("id")),
      ]);
      const titulo = new Map(cards.map((c) => [c.id, c.title]));
      const ids = cards.map((c) => c.id);
      const comentarios: any[] = [];
      // Os 60 mais recentes de cada lote bastam: a tela mostra os 60 mais recentes no total.
      for (let i = 0; i < ids.length; i += 150) {
        const r = await db.from("mkt_comments").select("id, card_id, user_id, body, created_at").in("card_id", ids.slice(i, i + 150)).order("created_at", { ascending: false }).limit(60);
        comentarios.push(...(r.data ?? []));
      }
      const eventos = [
        ...((a.data ?? []) as any[]).map((x) => ({ id: x.id, quando: x.created_at, user_id: x.user_id, card_id: x.card_id, texto: ROTULO[x.type] ?? x.type, corpo: null as string | null })),
        ...comentarios.map((c) => ({ id: c.id, quando: c.created_at, user_id: c.user_id, card_id: c.card_id, texto: "comentou em", corpo: c.body as string })),
      ].sort((x, y) => y.quando.localeCompare(x.quando)).slice(0, 60);
      const pids = [...new Set(eventos.map((e) => e.user_id).filter(Boolean))];
      const p = pids.length ? await db.from("profiles").select("id, full_name, avatar_url").in("id", pids) : { data: [] };
      const pessoa = new Map(((p.data ?? []) as any[]).map((x) => [x.id, x]));
      return eventos.map((e) => ({ ...e, pessoa: pessoa.get(e.user_id), cartao: e.card_id ? titulo.get(e.card_id) ?? null : null }));
    },
  });
  if (isLoading) return <p className="text-sm text-muted-foreground p-2">Carregando…</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground p-2">Nada registrado ainda.</p>;
  return (
    <div className="space-y-3">
      {data.map((e) => (
        <div key={e.id} className="flex gap-2.5">
          <img src={e.pessoa?.avatar_url || diceBearUrl(e.user_id ?? e.id)} className="h-7 w-7 rounded-full object-cover shrink-0" />
          <div className="min-w-0 text-sm">
            <p><strong>{e.pessoa?.full_name?.split(" ")[0] ?? "Alguém"}</strong> {e.texto}{" "}
              {e.cartao && e.card_id ? <a href={`/cartao/${e.card_id}`} className="text-accent hover:underline">{e.cartao}</a> : null}</p>
            {e.corpo && <p className="text-xs text-muted-foreground line-clamp-2 break-words">{e.corpo}</p>}
            <p className="text-[11px] text-muted-foreground">{new Date(e.quando).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function EtiquetasDoQuadro({ boardId, labels, onMudou }: { boardId: string; labels: Label[]; onMudou: () => void }) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(LABEL_COLOR_KEYS[0]);
  const criar = async () => {
    const r = await db.from("mkt_labels").insert({ board_id: boardId, name: nome.trim(), color: cor });
    if (r.error) toast.error(`Não criou: ${r.error.message}`); else { setNome(""); onMudou(); }
  };
  const atualizar = async (id: string, patch: Record<string, unknown>) => {
    const r = await db.from("mkt_labels").update(patch).eq("id", id);
    if (r.error) toast.error(`Não salvou: ${r.error.message}`); else onMudou();
  };
  const excluir = async (l: Label) => {
    const n = await db.from("mkt_card_labels").select("card_id", { count: "exact", head: true }).eq("label_id", l.id);
    const qtd = n.count ?? 0;
    if (!(await confirmar({
      titulo: `Excluir a etiqueta "${l.name || l.color}"?`,
      mensagem: qtd ? `Ela sai de ${qtd} ${qtd === 1 ? "cartão" : "cartões"}. Não dá para desfazer.` : "Nenhum cartão usa esta etiqueta.",
      confirmar: "Excluir", perigo: true,
    }))) return;
    const r = await db.from("mkt_labels").delete().eq("id", l.id);
    if (r.error) toast.error(`Não excluiu: ${r.error.message}`); else onMudou();
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {labels.length === 0 && <p className="text-xs text-muted-foreground">Este quadro ainda não tem etiquetas.</p>}
        {labels.map((l) => (
          <div key={l.id} className="flex items-center gap-1.5">
            <select value={l.color} onChange={(e) => atualizar(l.id, { color: e.target.value })} title="Cor"
              className="h-8 w-10 shrink-0 rounded-md border border-border text-transparent cursor-pointer" style={{ background: LABEL_COLORS[l.color] ?? l.color }}>
              {LABEL_COLOR_KEYS.map((k) => <option key={k} value={k} style={{ color: "initial" }}>{k}</option>)}
            </select>
            <Input defaultValue={l.name ?? ""} placeholder="(sem nome)" className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (l.name ?? "")) atualizar(l.id, { name: v }); }} />
            <button type="button" onClick={() => excluir(l)} title="Excluir etiqueta" className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t border-border pt-3">
        <p className="mkt-meta-label">Criar etiqueta</p>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome…" className="h-8 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") criar(); }} />
        <div className="flex flex-wrap gap-1.5">
          {LABEL_COLOR_KEYS.map((k) => (
            <button key={k} type="button" onClick={() => setCor(k)} title={k}
              className={`h-7 w-7 rounded-md ${cor === k ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`} style={{ background: LABEL_COLORS[k] }} />
          ))}
        </div>
        <Button size="sm" onClick={criar}>Criar</Button>
      </div>
    </div>
  );
}

