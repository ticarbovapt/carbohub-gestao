import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { montarImportacao, type Importacao, type PessoaDaqui } from "@/lib/trelloImport";

// Importa um quadro do Trello (JSON exportado) como quadro NOVO. Mostra o
// resumo ANTES de gravar; a gravação segue a ordem das chaves estrangeiras e,
// se algo falhar no meio, apaga o quadro criado (cascata) em vez de deixar um
// quadro pela metade parecendo completo.

const db = supabase as unknown as {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

async function gravar(tabela: string, linhas: Record<string, unknown>[], passo: (t: string) => void) {
  for (let i = 0; i < linhas.length; i += 200) {
    passo(`${tabela} ${Math.min(i + 200, linhas.length)}/${linhas.length}`);
    const res = await db.from(tabela).insert(linhas.slice(i, i + 200));
    if (res.error) throw new Error(`${tabela}: ${res.error.message}`);
  }
}

export function ImportarTrello({ pessoas, titulosExistentes }: { pessoas: PessoaDaqui[]; titulosExistentes: string[] }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [imp, setImp] = useState<Importacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);

  const ler = async (f: File) => {
    setErro(null); setImp(null);
    try {
      const json = JSON.parse(await f.text());
      const { data } = await db.auth.getUser();
      if (!data.user) throw new Error("Sessão expirada. Entre de novo.");
      const ws = await db.from("mkt_workspaces").select("id").order("created_at").limit(1).maybeSingle();
      setImp(montarImportacao(json, { userId: data.user.id, workspaceId: ws.data?.id ?? null, pessoas }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ler o arquivo.");
    }
    setAberto(true);
  };

  const importar = async () => {
    if (!imp) return;
    setErro(null);
    const boardId = imp.board.id as string;
    try {
      setGravando("quadro");
      const b = await db.from("mkt_boards").insert(imp.board);
      if (b.error) throw new Error(`quadro: ${b.error.message}`);
      await gravar("mkt_lists", imp.lists, setGravando);
      await gravar("mkt_labels", imp.labels, setGravando);
      await gravar("mkt_custom_fields", imp.fields, setGravando);
      await gravar("mkt_cards", imp.cards, setGravando);
      await gravar("mkt_card_labels", imp.cardLabels, setGravando);
      await gravar("mkt_card_members", imp.cardMembers, setGravando);
      await gravar("mkt_checklists", imp.checklists, setGravando);
      await gravar("mkt_checklist_items", imp.checklistItems, setGravando);
      await gravar("mkt_card_attachments", imp.attachments, setGravando);
      await gravar("mkt_comments", imp.comments, setGravando);
      await gravar("mkt_card_field_values", imp.fieldValues, setGravando);
      await db.from("mkt_activity").insert({
        board_id: boardId, card_id: null, user_id: imp.board.created_by, type: "board.import",
        data: { origem: "trello", ...imp.resumo, pessoas: undefined },
      });
      qc.invalidateQueries({ queryKey: ["mkt"] });
      setGravando(null); setAberto(false);
      navigate(`/quadros/${boardId}`);
    } catch (e) {
      // Desfaz: quadro pela metade é pior que quadro nenhum.
      await db.from("mkt_boards").delete().eq("id", boardId);
      setGravando(null);
      setErro(`A importação parou e foi desfeita (nada ficou gravado). ${e instanceof Error ? e.message : ""}`);
    }
  };

  const r = imp?.resumo;
  const repetido = r && titulosExistentes.some((t) => t.trim().toLowerCase() === r.titulo.trim().toLowerCase());

  return (
    <>
      <input ref={input} type="file" accept=".json,application/json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) ler(f); }} />
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => input.current?.click()}>
        <Upload className="h-3.5 w-3.5 text-accent" /> Importar do Trello
      </Button>

      <Dialog open={aberto} onOpenChange={(o) => { if (!gravando) setAberto(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar quadro do Trello</DialogTitle>
            <DialogDescription>Confira o que vai entrar. Ele vira um quadro novo; nada existente é alterado.</DialogDescription>
          </DialogHeader>

          {erro && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</div>
          )}

          {r && (
            <div className="space-y-3 text-sm">
              <p className="font-semibold text-foreground">{r.titulo}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                <span>Listas ativas</span><span className="text-foreground">{r.listasAtivas}</span>
                <span>Listas arquivadas</span><span className="text-foreground">{r.listasArquivadas}</span>
                <span>Cartões visíveis</span><span className="text-foreground">{r.cartoesVisiveis}</span>
                <span>Cartões arquivados</span><span className="text-foreground">{r.cartoesArquivados}</span>
                <span>Checklists</span><span className="text-foreground">{r.checklists} ({r.itens} itens)</span>
                <span>Etiquetas · campos</span><span className="text-foreground">{r.etiquetas} · {r.campos}</span>
                <span>Comentários</span><span className="text-foreground">{r.comentarios}</span>
                <span>Anexos</span><span className="text-foreground">{r.anexosLink + r.anexosNoTrello}</span>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pessoas</p>
                {r.pessoas.map((p) => (
                  <p key={p.trello} className="text-xs">
                    {p.trello} → {p.casou
                      ? <span className="text-foreground">{p.casou}</span>
                      : <span className="text-amber-600 dark:text-amber-400">sem correspondente (cartões ficam sem essa pessoa; comentários levam o nome no texto)</span>}
                  </p>
                ))}
              </div>

              {r.anexosNoTrello > 0 && (
                <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    <b>{r.anexosNoTrello} anexos ({r.anexosNoTrelloMB} MB) são arquivos guardados no Trello.</b> Eles entram como link
                    para o Trello: abrem só com login lá e deixam de existir se o quadro do Trello for apagado. Antes de cancelar o
                    Trello, baixe esses arquivos.
                  </span>
                </div>
              )}
              {r.comentariosDesde && (
                <p className="text-xs text-muted-foreground">
                  O export do Trello só traz as últimas 1.000 ações: comentários anteriores a{" "}
                  {new Date(r.comentariosDesde).toLocaleDateString("pt-BR")} não estão no arquivo.
                </p>
              )}
              {repetido && (
                <p className="text-xs text-amber-700 dark:text-amber-400">Já existe um quadro com este nome. Importar de novo cria uma segunda cópia.</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" disabled={!!gravando} onClick={() => setAberto(false)}>Cancelar</Button>
                <Button size="sm" disabled={!!gravando} onClick={importar} className="gap-1.5">
                  {gravando ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gravando {gravando}…</> : <><CheckCircle2 className="h-3.5 w-3.5" /> Importar</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
