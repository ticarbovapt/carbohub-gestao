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
import { copiarCartao } from "@/lib/cartaoCopiar";

// ─────────────────────────────────────────────────────────────────────────────
// Ações da lista — as do Trello: copiar lista, mover lista (inclusive para
// outro quadro), mover todos os cartões, ordenar, arquivar todos e seguir.
//
// ⚠️ Mover passa pelas RPCs `mkt_lista_mover` / `mkt_lista_mover_cartoes`
// (20261067), que chamam a `mkt_cartao_mover` cartão a cartão: a regra de
// remapear etiqueta e campo entre quadros mora num lugar só.
// ⚠️ COPIAR LISTA nasce ARQUIVADA e só aparece quando o último cartão chegou.
// Falhou no meio ⇒ a cópia parcial fica em "Arquivados", e a mensagem diz
// isso: lista pela metade à vista parece cópia completa, e apagar no
// navegador levaria arquivos já copiados para o limbo do bucket.
// ⚠️ Espelho copiado vira ESPELHO do mesmo original — copiar o conteúdo
// transformaria um atalho num segundo cartão que diverge do primeiro.
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: unknown) => any; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };
const ok = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };

export type OrdemLista = "criado_novo" | "criado_antigo" | "nome" | "entrega";
export const ORDENS: { k: OrdemLista; rot: string }[] = [
  { k: "criado_novo", rot: "Data de criação (mais recente primeiro)" },
  { k: "criado_antigo", rot: "Data de criação (mais antiga primeiro)" },
  { k: "nome", rot: "Nome do cartão (A–Z)" },
  { k: "entrega", rot: "Data de entrega (mais próxima primeiro)" },
];

/** Reordena os cartões ATIVOS da lista. Sem data de entrega vai para o fim. */
export async function ordenarLista(listId: string, ordem: OrdemLista) {
  const cs = ok(await db.from("mkt_cards").select("id, title, created_at, due_date, position").eq("list_id", listId).eq("is_archived", false)) as
    { id: string; title: string; created_at: string; due_date: string | null; position: number }[];
  const cmp: Record<OrdemLista, (a: typeof cs[0], b: typeof cs[0]) => number> = {
    criado_novo: (a, b) => b.created_at.localeCompare(a.created_at),
    criado_antigo: (a, b) => a.created_at.localeCompare(b.created_at),
    nome: (a, b) => a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base", numeric: true }),
    entrega: (a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
  };
  const ordenados = [...cs].sort((a, b) => cmp[ordem](a, b) || a.position - b.position);
  for (let i = 0; i < ordenados.length; i++) {
    const pos = (i + 1) * 1024;
    if (ordenados[i].position !== pos) ok(await db.from("mkt_cards").update({ position: pos }).eq("id", ordenados[i].id));
  }
  return ordenados.length;
}

export async function arquivarTodosOsCartoes(listId: string) {
  const r = ok(await db.from("mkt_cards").update({ is_archived: true, archived_at: new Date().toISOString() })
    .eq("list_id", listId).eq("is_archived", false).select("id")) as { id: string }[];
  return r.length;
}

/** Seguir lista: o que EU sigo neste quadro. */
export function useListasSeguidas(listIds: string[], meuId: string | null) {
  const qc = useQueryClient();
  const chave = ["mkt", "listas-seguidas", meuId, listIds.join(",")];
  const q = useQuery({
    queryKey: chave, enabled: !!meuId && listIds.length > 0,
    queryFn: async () => {
      // Tabela ausente (migração ainda não rodou) = ninguém segue nada; o
      // botão continua lá e o clique é que diz o que falta.
      const r = await db.from("mkt_lista_seguidores").select("list_id").in("list_id", listIds).eq("user_id", meuId);
      if (r.error) return new Set<string>();
      return new Set((r.data as { list_id: string }[]).map((x) => x.list_id));
    },
  });
  const alternar = async (listId: string) => {
    const seguindo = q.data?.has(listId);
    const r = seguindo
      ? await db.from("mkt_lista_seguidores").delete().eq("list_id", listId).eq("user_id", meuId)
      : await db.from("mkt_lista_seguidores").insert({ list_id: listId, user_id: meuId });
    if (r.error) { toast.error(`Não ${seguindo ? "deixou de seguir" : "seguiu"}: ${r.error.message}`); return; }
    toast.success(seguindo ? "Você deixou de seguir esta lista." : "Seguindo: você será avisado quando um cartão entrar nesta lista.");
    qc.invalidateQueries({ queryKey: ["mkt", "listas-seguidas"] });
  };
  return { seguidas: q.data ?? new Set<string>(), alternar };
}

async function copiarLista(lista: { id: string; title: string }, boardId: string, posicao: number, titulo: string, passo: (s: string) => void) {
  const eu = (await db.auth.getUser()).data.user?.id ?? null;
  const nova = ok(await db.from("mkt_lists").insert({
    board_id: boardId, title: titulo.trim() || lista.title, position: posicao,
    is_archived: true, archived_at: new Date().toISOString(),
  }).select("id").single()) as { id: string };
  const cs = ok(await db.from("mkt_cards").select("id, title, position, mirror_of").eq("list_id", lista.id).eq("is_archived", false).order("position")) as
    { id: string; title: string; position: number; mirror_of: string | null }[];
  let feitos = 0;
  try {
    for (const c of cs) {
      passo(`Copiando ${feitos + 1} de ${cs.length}: ${c.title}`);
      if (c.mirror_of) {
        ok(await db.from("mkt_cards").insert({ board_id: boardId, list_id: nova.id, position: c.position, title: c.title, mirror_of: c.mirror_of, created_by: eu }));
      } else {
        await copiarCartao(c.id, nova.id, c.position, { titulo: c.title, checklists: true, etiquetas: true, membros: true, anexos: true, campos: true, comentarios: false });
      }
      feitos++;
    }
  } catch (e) {
    throw new Error(`parou em ${feitos} de ${cs.length} cartões (${(e as Error).message}). A cópia parcial ficou em "Arquivados", com o nome "${titulo.trim() || lista.title}".`);
  }
  ok(await db.from("mkt_lists").update({ is_archived: false, archived_at: null }).eq("id", nova.id));
  return cs.length;
}

export function ListaDialogo({ modo, lista, boardId, onClose }: {
  modo: "copiar" | "mover" | "mover_cartoes";
  lista: { id: string; title: string };
  boardId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: quadros = [] } = useBoards();
  const [destino, setDestino] = useState(boardId);
  const { data: listas = [] } = useBoardLists(destino);
  const outras = useMemo(() => listas.filter((l) => l.id !== lista.id), [listas, lista.id]);
  const atual = listas.findIndex((l) => l.id === lista.id);
  const [indice, setIndice] = useState<number | null>(null);
  const [listaDestino, setListaDestino] = useState("");
  const [titulo, setTitulo] = useState(lista.title);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    if (modo !== "mover_cartoes") return;
    if (!outras.some((l) => l.id === listaDestino)) setListaDestino(outras[0]?.id ?? "");
  }, [modo, outras, listaDestino]);

  // Copiar: padrão logo à DIREITA da original (como o Trello); mover: fica onde está.
  const indiceEfetivo = indice ?? (destino === boardId && atual >= 0 ? (modo === "copiar" ? atual + 1 : atual) : outras.length);
  const opcoes = (modo === "copiar" ? listas.length : outras.length) + 1;

  const confirmar = async () => {
    setOcupado("…");
    try {
      if (modo === "mover_cartoes") {
        const r = await db.rpc("mkt_lista_mover_cartoes", { p_de: lista.id, p_para: listaDestino });
        if (r.error) throw new Error(r.error.message);
        toast.success(`${r.data ?? 0} cartão(ões) movido(s).`);
      } else {
        const base = modo === "copiar" ? listas : outras;
        const pos = positionForIndex(base.map((l) => Number(l.position)), indiceEfetivo);
        if (modo === "mover") {
          const r = await db.rpc("mkt_lista_mover", { p_list: lista.id, p_board: destino, p_position: pos });
          if (r.error) throw new Error(r.error.message);
          toast.success(destino !== boardId ? "Lista movida para o outro quadro." : "Lista movida.");
        } else {
          const n = await copiarLista(lista, destino, pos, titulo, setOcupado);
          toast.success(`Lista copiada com ${n} cartão(ões).`);
        }
      }
      qc.invalidateQueries({ queryKey: ["mkt"] });
      onClose();
    } catch (e) {
      toast.error(`Não ${modo === "copiar" ? "copiou" : "moveu"}: ${(e as Error).message}`, { duration: 15000 });
      qc.invalidateQueries({ queryKey: ["mkt"] });
    } finally { setOcupado(null); }
  };

  const tituloDialogo = modo === "copiar" ? "Copiar lista" : modo === "mover" ? "Mover lista" : "Mover todos os cartões";
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !ocupado) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tituloDialogo}</DialogTitle>
          <DialogDescription className="truncate">{lista.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {modo === "copiar" && (
            <div className="space-y-1.5">
              <label className="mkt-meta-label block">Nome da nova lista</label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9 text-sm" />
              <p className="text-[11px] text-muted-foreground">Vão os cartões com etiquetas, membros, checklists, campos e anexos. Comentários não.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="mkt-meta-label block">Quadro</label>
            <select value={destino} onChange={(e) => { setDestino(e.target.value); setIndice(null); }} className="mkt-field text-sm w-full">
              {quadros.map((b) => <option key={b.id} value={b.id}>{b.title}{b.id === boardId ? " (atual)" : ""}</option>)}
            </select>
          </div>
          {modo === "mover_cartoes" ? (
            <div className="space-y-1.5">
              <label className="mkt-meta-label block">Para a lista</label>
              {outras.length === 0 ? (
                <p className="text-xs text-muted-foreground">Este quadro não tem outra lista.</p>
              ) : (
                <select value={listaDestino} onChange={(e) => setListaDestino(e.target.value)} className="mkt-field text-sm w-full">
                  {outras.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              )}
              <p className="text-[11px] text-muted-foreground">Os cartões vão para o fim da lista, na ordem em que estão. Arquivados ficam.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="mkt-meta-label block">Posição</label>
              <select value={indiceEfetivo} onChange={(e) => setIndice(Number(e.target.value))} className="mkt-field text-sm w-full">
                {Array.from({ length: opcoes }, (_, i) => <option key={i} value={i}>{i + 1}{modo === "mover" && destino === boardId && i === atual ? " (atual)" : ""}</option>)}
              </select>
            </div>
          )}
          {destino !== boardId && (
            <p className="text-xs text-muted-foreground">
              Para outro quadro: etiquetas vão pelo nome e cor (criadas lá se faltarem); campos só vão se existir um com o mesmo nome lá.
            </p>
          )}
          {ocupado && ocupado !== "…" && <p className="text-xs text-muted-foreground truncate">{ocupado}</p>}
          <Button className="w-full" onClick={confirmar} disabled={!!ocupado || (modo === "mover_cartoes" && !listaDestino)}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : modo === "copiar" ? "Criar cópia" : "Mover"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
