import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { casarPessoas, criadoEm, type PessoaDaqui } from "@/lib/trelloImport";
import { SincronizarTrello, quadroDoLink } from "./SincronizarTrello";

// "Trazer do Trello": completa um quadro IMPORTADO com o que o JSON não traz —
// os arquivos enviados ao Trello (que viraram link para lá) e os comentários
// além das últimas 1.000 ações. Quem fala com o Trello é a função
// `trello-migrar`; a chave e o token nunca chegam ao navegador.
//
// ⚠️ Rodar de novo é SEGURO, e é o jeito de retomar: arquivo já copiado sai da
// lista de pendentes, e comentário já trazido é reconhecido pelo id da ação do
// Trello (ou, nos 1.000 que vieram no JSON, pelo cartão + instante).

const db = supabase as unknown as { from: (t: string) => any; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };
const URL_ARQUIVO_TRELLO = "https://trello.com/1/cards/%/attachments/%/download/%";

interface Pendente { id: string; name: string }
interface ComentarioTrello {
  id: string; data: string; cartao: string | null; cartaoNome: string | null; texto: string;
  membro: string | null; membroNome: string | null; membroUsuario: string | null;
}

async function chamar(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("trello-migrar", { body });
  if (error) {
    // Erro HTTP da função: a mensagem útil está no corpo, não no `error`.
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.erro) msg = j.erro; } catch { /* fica a genérica */ }
    throw new Error(msg);
  }
  if (data && data.ok === false) throw new Error(data.erro ?? "Falhou");
  return data;
}

// Lê tudo em páginas: o PostgREST corta em 1.000 linhas sem avisar.
async function lerTudo<T>(montar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export function TrazerDoTrello({ boardId }: { boardId: string }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);

  // O botão só existe em quadro que veio do Trello.
  const { data: veioDoTrello } = useQuery({
    queryKey: ["mkt-veio-do-trello", boardId],
    queryFn: async () => {
      const { count } = await db.from("mkt_card_attachments")
        .select("id, mkt_cards!inner(board_id)", { count: "exact", head: true })
        .eq("mkt_cards.board_id", boardId).like("external_url", URL_ARQUIVO_TRELLO);
      return (count ?? 0) > 0;
    },
  });

  if (!veioDoTrello) return null;
  return (
    <>
      <button onClick={() => setAberto(true)} title="Sincronizar com o Trello · arquivos · comentários"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-2.5 py-1.5 transition-colors">
        <RefreshCw className="h-4 w-4" /> Trello
      </button>
      {aberto && <Painel boardId={boardId} onClose={() => setAberto(false)} atualizar={() => qc.invalidateQueries({ queryKey: ["mkt"] })} />}
    </>
  );
}

function Painel({ boardId, onClose, atualizar }: { boardId: string; onClose: () => void; atualizar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  // O quadro guarda o id do Trello depois da primeira sincronização: o link
  // não precisa ser colado de novo.
  const { data: trelloId, isLoading } = useQuery({
    queryKey: ["mkt-board-trello", boardId],
    queryFn: async () => {
      const { data } = await db.from("mkt_boards").select("trello_id").eq("id", boardId).maybeSingle();
      return (data?.trello_id as string | null) ?? null;
    },
  });
  const linkInicial = trelloId ?? "";
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !ocupado) { atualizar(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trello</DialogTitle>
          <DialogDescription>Pode rodar quantas vezes quiser: o que já veio não duplica.</DialogDescription>
        </DialogHeader>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
          <>
            <SincronizarTrello boardId={boardId} linkInicial={linkInicial} setOcupado={setOcupado} aoTerminar={atualizar} />
            <div className="border-t border-border" />
            <Arquivos boardId={boardId} setOcupado={setOcupado} />
            <div className="border-t border-border" />
            <Comentarios boardId={boardId} setOcupado={setOcupado} linkInicial={linkInicial} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Arquivos({ boardId, setOcupado }: { boardId: string; setOcupado: (b: boolean) => void }) {
  const [pendentes, setPendentes] = useState<Pendente[] | null>(null);
  const [copiados, setCopiados] = useState(0);
  const [falhas, setFalhas] = useState<{ nome: string; erro: string }[]>([]);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const parar = useRef(false);

  const carregar = async () => {
    setErro(null);
    try {
      const rows = await lerTudo<Pendente>(() => db.from("mkt_card_attachments")
        .select("id, name, mkt_cards!inner(board_id)").eq("mkt_cards.board_id", boardId)
        .like("external_url", URL_ARQUIVO_TRELLO).neq("kind", "arquivo").order("id"));
      setPendentes(rows.map((r) => ({ id: r.id, name: r.name })));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { carregar(); }, [boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  const copiar = async () => {
    if (!pendentes?.length) return;
    parar.current = false; setRodando(true); setOcupado(true); setFalhas([]); setCopiados(0);
    const fila = [...pendentes];
    // Erro que é do CAMINHO (não do arquivo) falha igual em todos: 5 seguidos
    // sem nenhum acerto param a fila, em vez de listar 481 vezes a mesma frase.
    let seguidas = 0, algumOk = false;
    // Dois de cada vez: o Trello e o Storage aguentam, e um arquivo grande não
    // segura a fila inteira atrás dele.
    const trabalhador = async () => {
      for (;;) {
        if (parar.current) return;
        const a = fila.shift();
        if (!a) return;
        try { await chamar({ acao: "anexo", attachment_id: a.id }); setCopiados((n) => n + 1); seguidas = 0; algumOk = true; }
        catch (e) {
          setFalhas((f) => [...f, { nome: a.name, erro: e instanceof Error ? e.message : String(e) }]);
          if (!algumOk && ++seguidas >= 5) parar.current = true;
        }
      }
    };
    await Promise.all([trabalhador(), trabalhador()]);
    setRodando(false); setOcupado(false);
    await carregar();
  };

  const total = pendentes?.length ?? 0;
  const feitos = copiados + falhas.length;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Arquivos</h3>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {pendentes === null && !erro && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Contando…</p>}
      {pendentes !== null && !rodando && total === 0 && falhas.length === 0 && (
        <p className="text-sm text-success flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Todos os arquivos já estão no sistema.</p>
      )}
      {pendentes !== null && (total > 0 || rodando) && (
        <>
          <p className="text-sm text-muted-foreground">
            {rodando ? `Copiando… ${feitos} de ${total}` : `${total} arquivo(s) ainda guardados só no Trello.`}
          </p>
          {rodando && (
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${total ? (feitos / total) * 100 : 0}%` }} />
            </div>
          )}
          <div className="flex gap-2">
            {!rodando && <Button size="sm" onClick={copiar}>Copiar para o sistema</Button>}
            {rodando && <Button size="sm" variant="outline" onClick={() => { parar.current = true; }}>Parar depois dos que estão em andamento</Button>}
          </div>
        </>
      )}
      {!rodando && copiados > 0 && <p className="text-sm text-success">{copiados} arquivo(s) copiado(s).</p>}
      {falhas.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 space-y-1">
          <p className="text-sm text-destructive flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {falhas.length} não copiaram — continuam no Trello e entram de novo ao clicar "Copiar".</p>
          <ul className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5">
            {falhas.map((f, i) => <li key={i} className="break-words"><span className="text-foreground">{f.nome}</span>: {f.erro}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

interface Plano {
  noTrello: number; jaAqui: number; semCartao: number;
  linhas: Record<string, unknown>[];
  pessoas: { trello: string; casou: string | null }[];
}

function Comentarios({ boardId, setOcupado, linkInicial }: { boardId: string; setOcupado: (b: boolean) => void; linkInicial: string }) {
  const [link, setLink] = useState(linkInicial);
  const [fase, setFase] = useState<"ocioso" | "buscando" | "pronto" | "gravando" | "feito">("ocioso");
  const [progresso, setProgresso] = useState("");
  const [plano, setPlano] = useState<Plano | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = async () => {
    const quadro = quadroDoLink(link);
    if (!quadro) { setErro("Cole o link do quadro no Trello (trello.com/b/…)."); return; }
    setErro(null); setFase("buscando"); setOcupado(true);
    try {
      // 1. Todos os comentários do quadro, de 1.000 em 1.000, do novo ao velho.
      const lista: ComentarioTrello[] = [];
      for (let antes: string | undefined; ;) {
        setProgresso(`Lendo o Trello… ${lista.length}`);
        const r = await chamar({ acao: "comentarios", quadro, antes });
        lista.push(...r.comentarios);
        if (r.fim || r.comentarios.length === 0) break;
        antes = r.comentarios[r.comentarios.length - 1].id;
      }
      setProgresso("Cruzando com os cartões daqui…");

      // 2. Cartões daqui (inclusive arquivados). O id do Trello carrega o
      //    instante de criação, e a importação gravou EXATAMENTE esse instante
      //    — é por ele que se casa, porque o nome pode ter mudado depois.
      const cartoes = await lerTudo<{ id: string; title: string; created_at: string }>(() =>
        db.from("mkt_cards").select("id, title, created_at").eq("board_id", boardId).order("id"));
      const porInstante = new Map<number, { id: string; title: string }[]>();
      for (const c of cartoes) {
        const t = new Date(c.created_at).getTime();
        porInstante.set(t, [...(porInstante.get(t) ?? []), c]);
      }
      const cartaoDaqui = new Map<string, string | null>();
      const acharCartao = (idTrello: string, nome: string | null) => {
        if (cartaoDaqui.has(idTrello)) return cartaoDaqui.get(idTrello)!;
        const iso = criadoEm(idTrello);
        let cands = iso ? porInstante.get(new Date(iso).getTime()) ?? [] : [];
        if (cands.length > 1 && nome) cands = cands.filter((c) => c.title === nome);
        // Dois cartões no mesmo segundo e nome que não desempata: não escolhe.
        const achou = cands.length === 1 ? cands[0].id : null;
        cartaoDaqui.set(idTrello, achou);
        return achou;
      };

      // 3. O que já está aqui: pelo id da ação, ou cartão + instante (os
      //    1.000 que vieram no JSON não guardaram o id).
      const existentes = await lerTudo<{ card_id: string; created_at: string; trello_action_id: string | null }>(() =>
        db.from("mkt_comments").select("card_id, created_at, trello_action_id, mkt_cards!inner(board_id)")
          .eq("mkt_cards.board_id", boardId).order("id"));
      const jaIds = new Set(existentes.map((e) => e.trello_action_id).filter(Boolean));
      const jaPar = new Set(existentes.map((e) => `${e.card_id}|${new Date(e.created_at).getTime()}`));

      // 4. Pessoas: a MESMA regra do import.
      const { data: u } = await db.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada. Entre de novo.");
      const perfis = await db.from("profiles").select("id, full_name").not("department", "is", null);
      const daqui = (perfis.data ?? []) as PessoaDaqui[];
      const membros = new Map<string, { id: string; fullName: string | null; username: string | null }>();
      for (const c of lista) if (c.membro && !membros.has(c.membro)) membros.set(c.membro, { id: c.membro, fullName: c.membroNome, username: c.membroUsuario });
      const { membro, pessoas } = casarPessoas([...membros.values()], daqui);

      let jaAqui = 0, semCartao = 0;
      const linhas: Record<string, unknown>[] = [];
      for (const c of lista) {
        if (!c.cartao || !c.texto) continue;
        const card = acharCartao(c.cartao, c.cartaoNome);
        if (!card) { semCartao++; continue; }
        if (jaIds.has(c.id) || jaPar.has(`${card}|${new Date(c.data).getTime()}`)) { jaAqui++; continue; }
        const autor = c.membro ? membro.get(c.membro) : undefined;
        linhas.push({
          card_id: card, user_id: autor ?? u.user.id,
          body: autor ? c.texto : `**${c.membroNome ?? c.membroUsuario ?? "alguém"}** (no Trello): ${c.texto}`,
          created_at: c.data, updated_at: c.data, trello_action_id: c.id,
        });
      }
      setPlano({ noTrello: lista.length, jaAqui, semCartao, linhas, pessoas: pessoas.map((p) => ({ trello: p.trello, casou: p.casou })) });
      setFase("pronto");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e)); setFase("ocioso");
    }
    setOcupado(false);
  };

  const gravar = async () => {
    if (!plano) return;
    setFase("gravando"); setOcupado(true); setErro(null);
    try {
      for (let i = 0; i < plano.linhas.length; i += 200) {
        setProgresso(`Gravando… ${i} de ${plano.linhas.length}`);
        const { error } = await db.from("mkt_comments").insert(plano.linhas.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }
      setFase("feito");
    } catch (e) {
      // O que gravou fica (tem o id da ação); rodar de novo traz só o resto.
      setErro(`${e instanceof Error ? e.message : String(e)} — o que já gravou fica; busque de novo para trazer o resto.`);
      setFase("pronto");
    }
    setOcupado(false);
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Comentários</h3>
      {(fase === "ocioso" || fase === "buscando") && (
        <>
          <p className="text-sm text-muted-foreground">Cole o link do quadro no Trello.</p>
          <div className="flex gap-2">
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://trello.com/b/…" className="h-9 text-sm" disabled={fase === "buscando"} />
            <Button size="sm" onClick={buscar} disabled={fase === "buscando" || !link.trim()}>
              {fase === "buscando" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
            </Button>
          </div>
          {fase === "buscando" && <p className="text-xs text-muted-foreground">{progresso}</p>}
        </>
      )}
      {plano && (fase === "pronto" || fase === "gravando") && (
        <div className="space-y-2 text-sm">
          <ul className="space-y-0.5 text-muted-foreground">
            <li><span className="text-foreground font-medium">{plano.noTrello}</span> comentários no Trello</li>
            <li><span className="text-foreground font-medium">{plano.jaAqui}</span> já estão aqui</li>
            <li><span className="text-foreground font-medium">{plano.linhas.length}</span> vão entrar agora</li>
            {plano.semCartao > 0 && <li><span className="text-foreground font-medium">{plano.semCartao}</span> sem cartão correspondente aqui (ficam de fora)</li>}
          </ul>
          {plano.pessoas.length > 0 && (
            <div className="rounded-md border border-border p-2">
              <p className="mkt-meta-label mb-1">Autores</p>
              <ul className="text-xs space-y-0.5">
                {plano.pessoas.map((p, i) => (
                  <li key={i}>{p.trello} → {p.casou ? <span className="text-foreground">{p.casou}</span> : <span className="text-muted-foreground">nome vai no texto do comentário</span>}</li>
                ))}
              </ul>
            </div>
          )}
          {plano.linhas.length > 0 && (
            <Button size="sm" onClick={gravar} disabled={fase === "gravando"}>
              {fase === "gravando" ? progresso : `Trazer ${plano.linhas.length} comentário(s)`}
            </Button>
          )}
        </div>
      )}
      {fase === "feito" && plano && (
        <p className="text-sm text-success flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {plano.linhas.length} comentário(s) trazido(s).</p>
      )}
      {erro && <p className="text-sm text-destructive break-words">{erro}</p>}
    </section>
  );
}
