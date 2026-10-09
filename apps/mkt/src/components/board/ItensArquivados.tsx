import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Loader2, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmar } from "@carbo/shell";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { BUCKET } from "@/lib/mktArquivos";

// ─────────────────────────────────────────────────────────────────────────────
// "Itens arquivados" — o painel do Trello, no menu do quadro. Lista os cartões
// e as listas arquivados, com busca, RESTAURAR e EXCLUIR.
//
// ⚠️ Cartão arquivado e cartão de LISTA arquivada são coisas diferentes: o
//    segundo não está arquivado, a lista dele é que está. Os dois somem do
//    quadro; aqui o primeiro aparece em "Cartões" e o segundo dentro da lista,
//    em "Listas" — restaurar a lista traz os cartões dela junto.
// ⚠️ Restaurar um cartão cuja LISTA está arquivada o devolveria a um lugar que
//    ninguém vê. O botão diz isso e restaura a lista junto.
// ⚠️ EXCLUIR é definitivo e segue a regra do "Excluir quadro": os arquivos
//    (atual, capa, cópia web e TODAS as versões) saem do bucket ANTES da linha
//    — a cascata do banco nunca apaga objeto do Storage. E recusa quando outro
//    quadro ESPELHA o cartão: a FK do espelho é ON DELETE CASCADE.
// ⚠️ Cartão que ainda existe no Trello volta na próxima sincronização (como
//    arquivado, se estiver arquivado lá). Excluir aqui não apaga lá.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

interface CartaoArq { id: string; title: string; list_id: string; archived_at: string | null }
interface ListaArq { id: string; title: string; archived_at: string | null; is_archived: boolean }

const quando = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "");
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function lerTudo<T>(montar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export function ItensArquivados({ boardId, open, onOpenChange, onAbrirCartao }: {
  boardId: string; open: boolean; onOpenChange: (o: boolean) => void; onAbrirCartao: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [aba, setAba] = useState<"cartoes" | "listas">("cartoes");
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["mkt", "arquivados", boardId],
    enabled: open,
    queryFn: async () => {
      const [listas, cartoes] = await Promise.all([
        lerTudo<ListaArq>(() => db.from("mkt_lists").select("id, title, archived_at, is_archived").eq("board_id", boardId).order("id")),
        lerTudo<CartaoArq & { is_archived: boolean }>(() => db.from("mkt_cards")
          .select("id, title, list_id, archived_at, is_archived").eq("board_id", boardId).is("mirror_of", null).order("id")),
      ]);
      return { listas, cartoes };
    },
  });

  const listaPorId = useMemo(() => new Map((q.data?.listas ?? []).map((l) => [l.id, l])), [q.data]);
  const termo = norm(busca.trim());
  const cartoesArq = useMemo(() => (q.data?.cartoes ?? [])
    .filter((c) => c.is_archived && (!termo || norm(c.title).includes(termo)))
    .sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? "")), [q.data, termo]);
  const listasArq = useMemo(() => (q.data?.listas ?? [])
    .filter((l) => l.is_archived && (!termo || norm(l.title).includes(termo)))
    .sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? "")), [q.data, termo]);
  const cartoesDaLista = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of q.data?.cartoes ?? []) if (!c.is_archived) m.set(c.list_id, (m.get(c.list_id) ?? 0) + 1);
    return m;
  }, [q.data]);

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["mkt", "arquivados", boardId] });
    qc.invalidateQueries({ queryKey: ["mkt", "board", boardId] });
    qc.invalidateQueries({ queryKey: ["mkt", "all-cards"] });
  };

  const restaurarCartao = async (c: CartaoArq) => {
    const lista = listaPorId.get(c.list_id);
    setOcupado(c.id);
    try {
      if (lista?.is_archived) {
        const r = await db.from("mkt_lists").update({ is_archived: false, archived_at: null }).eq("id", lista.id);
        if (r.error) throw new Error(r.error.message);
      }
      const r = await db.from("mkt_cards").update({ is_archived: false, archived_at: null }).eq("id", c.id);
      if (r.error) throw new Error(r.error.message);
      toast.success(lista?.is_archived ? `Cartão e lista "${lista.title}" restaurados.` : "Cartão restaurado.");
      atualizar();
    } catch (e) { toast.error(`Não restaurou: ${(e as Error).message}`); }
    finally { setOcupado(null); }
  };

  const restaurarLista = async (l: ListaArq) => {
    setOcupado(l.id);
    const r = await db.from("mkt_lists").update({ is_archived: false, archived_at: null }).eq("id", l.id);
    setOcupado(null);
    if (r.error) { toast.error(`Não restaurou: ${r.error.message}`); return; }
    toast.success(`Lista "${l.title}" restaurada.`);
    atualizar();
  };

  const excluirCartao = async (c: CartaoArq) => {
    setOcupado(c.id);
    try {
      const esp = await db.from("mkt_cards").select("id", { count: "exact", head: true }).eq("mirror_of", c.id);
      if (esp.error) throw new Error(esp.error.message);
      if ((esp.count ?? 0) > 0) {
        toast.error(`Não dá para excluir: ${esp.count} espelho(s) deste cartão em outros quadros sumiriam junto. Remova os espelhos primeiro.`, { duration: 9000 });
        return;
      }
      const an = await db.from("mkt_card_attachments").select("id, storage_path, poster_path, web_path").eq("card_id", c.id);
      if (an.error) throw new Error(an.error.message);
      const anexos = (an.data ?? []) as { id: string; storage_path: string | null; poster_path: string | null; web_path: string | null }[];
      let versoes: typeof anexos = [];
      if (anexos.length) {
        const v = await db.from("mkt_anexo_versoes").select("id, storage_path, poster_path, web_path").in("anexo_id", anexos.map((a) => a.id));
        if (v.error) throw new Error(v.error.message);
        versoes = v.data ?? [];
      }
      const arquivos = [...new Set([...anexos, ...versoes].flatMap((a) => [a.storage_path, a.poster_path, a.web_path]).filter(Boolean) as string[])];
      const ok = await confirmar({
        titulo: `Excluir "${c.title}" para sempre?`,
        mensagem: `Comentários, checklists e ${arquivos.length ? `${arquivos.length} arquivo(s)` : "anexos"} saem junto. Isto não tem volta — se só quer tirar da frente, deixe arquivado.`,
        confirmar: "Excluir", perigo: true,
      });
      if (!ok) return;
      for (let i = 0; i < arquivos.length; i += 100) {
        const rm = await supabase.storage.from(BUCKET).remove(arquivos.slice(i, i + 100));
        if (rm.error) throw new Error(`arquivos: ${rm.error.message}`);
      }
      const del = await db.from("mkt_cards").delete().eq("id", c.id);
      if (del.error) throw new Error(del.error.message);
      toast.success("Cartão excluído.");
      atualizar();
    } catch (e) { toast.error(`Não excluiu: ${(e as Error).message}`); }
    finally { setOcupado(null); }
  };

  const Botao = ({ onClick, children, perigo, id }: { onClick: () => void; children: React.ReactNode; perigo?: boolean; id: string }) => (
    <button onClick={onClick} disabled={ocupado !== null}
      className={`inline-flex items-center gap-1 text-xs rounded-md px-2 py-1 transition-colors disabled:opacity-50 ${perigo ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
      {ocupado === id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}{children}
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-3">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Archive className="h-4 w-4" /> Itens arquivados</SheetTitle>
          <SheetDescription>Saem do quadro e de todas as visões, mas continuam aqui com comentários e anexos.</SheetDescription>
        </SheetHeader>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar arquivados" className="pl-8 h-9 text-sm" />
        </div>
        <div className="flex gap-1 rounded-md bg-muted p-1 text-sm">
          {([["cartoes", `Cartões${q.data ? ` (${(q.data.cartoes ?? []).filter((c) => c.is_archived).length})` : ""}`], ["listas", `Listas${q.data ? ` (${q.data.listas.filter((l) => l.is_archived).length})` : ""}`]] as const).map(([k, rot]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex-1 rounded px-2 py-1 transition-colors ${aba === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{rot}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {q.isLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
          {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
          {q.data && aba === "cartoes" && (cartoesArq.length === 0
            ? <p className="text-sm text-muted-foreground py-6 text-center">{termo ? "Nenhum cartão arquivado com esse nome." : "Nenhum cartão arquivado."}</p>
            : <ul className="space-y-1.5">
                {cartoesArq.map((c) => {
                  const lista = listaPorId.get(c.list_id);
                  return (
                    <li key={c.id} className="rounded-md border border-border bg-card p-2">
                      <button onClick={() => onAbrirCartao(c.id)} className="text-left w-full text-sm text-foreground hover:underline leading-snug">{c.title}</button>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lista?.title ?? "?"}{lista?.is_archived ? " (lista arquivada)" : ""}{c.archived_at ? ` · arquivado em ${quando(c.archived_at)}` : ""}
                      </p>
                      <div className="flex gap-1 mt-1 -ml-2">
                        <Botao id={c.id} onClick={() => restaurarCartao(c)}><RotateCcw className="h-3 w-3" /> {lista?.is_archived ? "Restaurar (com a lista)" : "Restaurar"}</Botao>
                        <Botao id={`x${c.id}`} perigo onClick={() => excluirCartao(c)}><Trash2 className="h-3 w-3" /> Excluir</Botao>
                      </div>
                    </li>
                  );
                })}
              </ul>)}
          {q.data && aba === "listas" && (listasArq.length === 0
            ? <p className="text-sm text-muted-foreground py-6 text-center">{termo ? "Nenhuma lista arquivada com esse nome." : "Nenhuma lista arquivada."}</p>
            : <ul className="space-y-1.5">
                {listasArq.map((l) => (
                  <li key={l.id} className="rounded-md border border-border bg-card p-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{l.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {cartoesDaLista.get(l.id) ?? 0} cartão(ões){l.archived_at ? ` · arquivada em ${quando(l.archived_at)}` : ""}
                      </p>
                    </div>
                    <Botao id={l.id} onClick={() => restaurarLista(l)}><RotateCcw className="h-3 w-3" /> Restaurar</Botao>
                  </li>
                ))}
              </ul>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}
