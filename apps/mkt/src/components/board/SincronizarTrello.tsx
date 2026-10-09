import { useState } from "react";
import { Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PessoaDaqui } from "@/lib/trelloImport";
import { planejarSincronizacao, type EstadoDaqui, type PlanoSync, type Patch } from "@/lib/trelloSync";

// "Sincronizar com o Trello": deixa o quadro daqui IGUAL ao do Trello — o
// Trello vence, cartão apagado lá é ARQUIVADO aqui, e o que nasceu aqui fica.
// A regra mora em `lib/trelloSync.ts`; aqui só se lê, mostra e grava.
//
// ⚠️ Mostra o que muda ANTES de gravar, cartão a cartão. Sincronizar é
// sobrescrever trabalho daqui com o de lá, e isso não pode acontecer às cegas.
// ⚠️ Rodar de novo é seguro: a primeira rodada grava o `trello_id` de tudo, e
// a segunda encontra cada coisa pelo id — sem nada a fazer, o plano vem vazio.

const db = supabase as unknown as { from: (t: string) => any; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };

async function chamar(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("trello-migrar", { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.erro) msg = j.erro; } catch { /* fica a genérica */ }
    throw new Error(msg);
  }
  if (data && data.ok === false) throw new Error(data.erro ?? "Falhou");
  return data;
}

async function lerTudo<T>(montar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export function quadroDoLink(s: string): string | null {
  const m = /trello\.com\/b\/([A-Za-z0-9]{8})/.exec(s) ?? /^([A-Za-z0-9]{8}|[0-9a-f]{24})$/.exec(s.trim());
  return m ? m[1] : null;
}

const ok = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };

// Em lotes de 8: update é um por linha, e centenas em série levariam minutos.
async function emLotes<T>(xs: T[], f: (x: T) => Promise<void>) {
  for (let i = 0; i < xs.length; i += 8) await Promise.all(xs.slice(i, i + 8).map(f));
}
async function inserir(tabela: string, linhas: Record<string, unknown>[]) {
  for (let i = 0; i < linhas.length; i += 200) ok(await db.from(tabela).insert(linhas.slice(i, i + 200)));
}
const atualizar = (tabela: string, ps: Patch[]) => emLotes(ps, async (p) => ok(await db.from(tabela).update(p.patch).eq("id", p.id)));

async function lerEstado(boardId: string): Promise<EstadoDaqui> {
  const { data: board, error } = await db.from("mkt_boards").select("id, created_at, trello_id").eq("id", boardId).single();
  if (error) throw new Error(error.message);
  const porQuadro = (t: string, cols: string) => lerTudo<any>(() => db.from(t).select(cols).eq("board_id", boardId).order("id"));
  const [lists, cards, labels, fields] = await Promise.all([
    porQuadro("mkt_lists", "id, title, position, color, is_archived, created_at, trello_id"),
    porQuadro("mkt_cards", "id, list_id, title, description, position, start_date, due_date, is_complete, cover, is_archived, created_at, trello_id, mirror_of"),
    porQuadro("mkt_labels", "id, name, color, created_at, trello_id"),
    porQuadro("mkt_custom_fields", "id, name, type, options, created_at, trello_id"),
  ]);
  // ⚠️ Paginar exige ordem ESTÁVEL: estas tabelas não têm `id`, e a chave é o par.
  const doCartao = (t: string, cols: string, segunda: string) =>
    lerTudo<any>(() => db.from(t).select(`${cols}, mkt_cards!inner(board_id)`).eq("mkt_cards.board_id", boardId).order("card_id").order(segunda));
  const [cardLabels, cardMembers, fieldValues, checklists, attachments] = await Promise.all([
    doCartao("mkt_card_labels", "card_id, label_id", "label_id"),
    doCartao("mkt_card_members", "card_id, user_id", "user_id"),
    doCartao("mkt_card_field_values", "card_id, field_id, value", "field_id"),
    lerTudo<any>(() => db.from("mkt_checklists").select("id, card_id, title, position, created_at, trello_id, mkt_cards!inner(board_id)").eq("mkt_cards.board_id", boardId).order("id")),
    lerTudo<any>(() => db.from("mkt_card_attachments").select("card_id, external_url, mkt_cards!inner(board_id)").eq("mkt_cards.board_id", boardId).order("id")),
  ]);
  const ids = checklists.map((k) => k.id);
  const items: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    items.push(...await lerTudo<any>(() => db.from("mkt_checklist_items")
      .select("id, checklist_id, text, is_done, position, due_date, assignee_id, created_at, trello_id")
      .in("checklist_id", ids.slice(i, i + 200)).order("id")));
  }
  const fora = await lerTudo<{ trello_id: string }>(() => db.from("mkt_cards").select("trello_id")
    .neq("board_id", boardId).not("trello_id", "is", null).order("id"));
  const movidosParaFora = new Set(fora.map((x) => x.trello_id));
  return { board, lists, cards, labels, fields, cardLabels, cardMembers, fieldValues, checklists, items, attachments, movidosParaFora };
}

// A ordem é a das chaves estrangeiras: o que é apontado entra antes de quem aponta.
async function aplicar(boardId: string, p: PlanoSync, passo: (s: string) => void) {
  passo("Etiquetas e campos…");
  await inserir("mkt_labels", p.labelsInsert); await atualizar("mkt_labels", p.labelsUpdate);
  await inserir("mkt_custom_fields", p.fieldsInsert); await atualizar("mkt_custom_fields", p.fieldsUpdate);
  passo("Listas…");
  await inserir("mkt_lists", p.listsInsert); await atualizar("mkt_lists", p.listsUpdate);
  passo("Cartões…");
  await inserir("mkt_cards", p.cardsInsert); await atualizar("mkt_cards", p.cardsUpdate);
  passo("Etiquetas e membros dos cartões…");
  await emLotes(p.cardLabelsDelete, async (x) => ok(await db.from("mkt_card_labels").delete().eq("card_id", x.card_id).eq("label_id", x.label_id)));
  await inserir("mkt_card_labels", p.cardLabelsInsert);
  await emLotes(p.membersDelete, async (x) => ok(await db.from("mkt_card_members").delete().eq("card_id", x.card_id).eq("user_id", x.user_id)));
  await inserir("mkt_card_members", p.membersInsert);
  passo("Campos dos cartões…");
  for (let i = 0; i < p.valuesUpsert.length; i += 200) {
    ok(await db.from("mkt_card_field_values").upsert(p.valuesUpsert.slice(i, i + 200), { onConflict: "card_id,field_id" }));
  }
  await emLotes(p.valuesDelete, async (x) => ok(await db.from("mkt_card_field_values").delete().eq("card_id", x.card_id).eq("field_id", x.field_id)));
  passo("Checklists…");
  await inserir("mkt_checklists", p.checklistsInsert); await atualizar("mkt_checklists", p.checklistsUpdate);
  await inserir("mkt_checklist_items", p.itemsInsert); await atualizar("mkt_checklist_items", p.itemsUpdate);
  for (let i = 0; i < p.itemsDelete.length; i += 200) ok(await db.from("mkt_checklist_items").delete().in("id", p.itemsDelete.slice(i, i + 200)));
  for (let i = 0; i < p.checklistsDelete.length; i += 200) ok(await db.from("mkt_checklists").delete().in("id", p.checklistsDelete.slice(i, i + 200)));
  passo("Anexos…");
  await inserir("mkt_card_attachments", p.attachmentsInsert);
  // Por último: o quadro só se diz sincronizado depois de tudo ter entrado.
  ok(await db.from("mkt_boards").update(p.boardPatch).eq("id", boardId));
}

export function SincronizarTrello({ boardId, linkInicial, setOcupado, aoTerminar }: {
  boardId: string; linkInicial: string; setOcupado: (b: boolean) => void; aoTerminar: () => void;
}) {
  const [link, setLink] = useState(linkInicial);
  const [fase, setFase] = useState<"ocioso" | "lendo" | "pronto" | "gravando" | "feito">("ocioso");
  const [passo, setPasso] = useState("");
  const [plano, setPlano] = useState<PlanoSync | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const ler = async () => {
    const quadro = quadroDoLink(link);
    if (!quadro) { setErro("Cole o link do quadro no Trello (trello.com/b/…)."); return; }
    setErro(null); setFase("lendo"); setOcupado(true); setPlano(null);
    try {
      setPasso("Lendo o Trello…");
      const { quadro: t } = await chamar({ acao: "quadro", quadro });
      setPasso("Lendo o quadro daqui…");
      const aqui = await lerEstado(boardId);
      if (aqui.board.trello_id && aqui.board.trello_id !== t.id) {
        throw new Error(`Este quadro já está ligado a OUTRO quadro do Trello. Confira o link: o Trello devolveu "${t.name}".`);
      }
      const { data: u } = await db.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada. Entre de novo.");
      const perfis = await db.from("profiles").select("id, full_name").not("department", "is", null);
      setPlano(planejarSincronizacao(t, aqui, { userId: u.user.id, pessoas: (perfis.data ?? []) as PessoaDaqui[] }));
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
      await aplicar(boardId, plano, setPasso);
      setFase("feito");
      aoTerminar();
    } catch (e) {
      // O que entrou já está ligado pelo `trello_id`; ler de novo traz só o resto.
      setErro(`${e instanceof Error ? e.message : String(e)} — o que já foi gravado fica; clique em "Comparar" de novo para terminar.`);
      setFase("ocioso");
    }
    setOcupado(false);
  };

  const r = plano?.resumo;
  const nada = r && r.listasNovas + r.listasAlteradas + r.cartoesNovos + r.cartoesAlterados + r.cartoesArquivados + r.cartoesDesarquivados === 0;
  const totalOps = plano ? [
    plano.labelsInsert, plano.labelsUpdate, plano.fieldsInsert, plano.fieldsUpdate, plano.listsInsert, plano.listsUpdate,
    plano.cardsInsert, plano.cardsUpdate, plano.cardLabelsInsert, plano.cardLabelsDelete, plano.membersInsert, plano.membersDelete,
    plano.valuesUpsert, plano.valuesDelete, plano.checklistsInsert, plano.checklistsUpdate, plano.checklistsDelete,
    plano.itemsInsert, plano.itemsUpdate, plano.itemsDelete, plano.attachmentsInsert,
  ].reduce((s, x) => s + x.length, 0) : 0;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Sincronizar com o Trello</h3>
      <p className="text-sm text-muted-foreground">
        Deixa este quadro igual ao do Trello: o Trello vence, cartão apagado lá é arquivado aqui, e o que foi criado aqui continua.
      </p>
      {(fase === "ocioso" || fase === "lendo") && (
        <>
          <div className="flex gap-2">
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://trello.com/b/…" className="h-9 text-sm" disabled={fase === "lendo"} />
            <Button size="sm" onClick={ler} disabled={fase === "lendo" || !link.trim()}>
              {fase === "lendo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-1" /> Comparar</>}
            </Button>
          </div>
          {fase === "lendo" && <p className="text-xs text-muted-foreground">{passo}</p>}
        </>
      )}
      {plano && r && (fase === "pronto" || fase === "gravando") && (
        <div className="space-y-2 text-sm">
          {nada && totalOps === 0 ? (
            <p className="text-success flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Já está igual ao Trello. Nada a fazer.</p>
          ) : (
            <>
              <ul className="space-y-0.5 text-muted-foreground">
                {r.cartoesNovos > 0 && <li><span className="text-foreground font-medium">{r.cartoesNovos}</span> cartão(ões) novo(s)</li>}
                {r.cartoesAlterados > 0 && <li><span className="text-foreground font-medium">{r.cartoesAlterados}</span> cartão(ões) com mudança</li>}
                {r.cartoesArquivados > 0 && <li><span className="text-foreground font-medium">{r.cartoesArquivados}</span> vão ser arquivados (arquivados ou apagados no Trello)</li>}
                {r.cartoesDesarquivados > 0 && <li><span className="text-foreground font-medium">{r.cartoesDesarquivados}</span> voltam a aparecer (abertos no Trello)</li>}
                {(r.listasNovas > 0 || r.listasAlteradas > 0) && <li><span className="text-foreground font-medium">{r.listasNovas + r.listasAlteradas}</span> lista(s) nova(s) ou com mudança (nome, ordem, cor)</li>}
                {r.nasceramAqui > 0 && <li><span className="text-foreground font-medium">{r.nasceramAqui}</span> cartão(ões) criados aqui ficam como estão</li>}
                {nada && totalOps > 0 && <li>Só ligações internas a gravar (primeira sincronização).</li>}
              </ul>
              {r.mudancas.length > 0 && (
                <div className="rounded-md border border-border max-h-64 overflow-y-auto">
                  <ul className="divide-y divide-border">
                    {r.mudancas.map((m, i) => (
                      <li key={i} className="px-2 py-1.5">
                        <p className="text-foreground text-[13px] leading-snug">{m.cartao}</p>
                        <p className="text-xs text-muted-foreground">{m.lista} · {m.o_que.join(" · ")}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {r.pessoas.some((p) => !p.casou) && (
                <p className="text-xs text-muted-foreground">
                  Sem par aqui (não entram como membro): {r.pessoas.filter((p) => !p.casou).map((p) => p.trello).join(", ")}.
                </p>
              )}
              <Button size="sm" onClick={gravar} disabled={fase === "gravando"}>
                {fase === "gravando" ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {passo}</> : "Aplicar"}
              </Button>
            </>
          )}
        </div>
      )}
      {fase === "feito" && (
        <div className="space-y-1">
          <p className="text-sm text-success flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Quadro sincronizado com o Trello.</p>
          <p className="text-xs text-muted-foreground">Comentários novos e arquivos enviados ao Trello entram pelas seções abaixo.</p>
          <Button size="sm" variant="outline" onClick={() => { setFase("ocioso"); setPlano(null); }}>Comparar de novo</Button>
        </div>
      )}
      {erro && <p className="text-sm text-destructive break-words">{erro}</p>}
    </section>
  );
}
