import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { diceBearUrl } from "@/components/ui/profile-avatar";
import { confirmar } from "@carbo/shell";
import { useAuth } from "@/contexts/AuthContext";

// Membros do QUADRO (`mkt_board_membros`, 20261070) — as fotos no cabeçalho e o
// "Compartilhar", como no Trello.
// ⚠️ Membro é QUEM PARTICIPA, não quem pode ver: todo o time interno continua
// vendo todos os quadros. O diálogo DIZ isso, para ninguém tirar alguém
// achando que tirou o acesso.
// ⚠️ Adicionar AVISA a pessoa no sininho (gatilho no banco), nunca quem se
// adicionou. Tabela ausente (migração não rodou) = lista vazia, sem quebrar.

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { from: (t: string) => any };

interface Pessoa { id: string; full_name: string | null; avatar_url: string | null }
export interface Membro extends Pessoa { papel: "admin" | "membro" }

export function useMembrosDoQuadro(boardId: string | undefined) {
  return useQuery({
    queryKey: ["mkt", "membros-quadro", boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<Membro[]> => {
      const r = await db.from("mkt_board_membros").select("user_id, papel, created_at").eq("board_id", boardId).order("created_at");
      if (r.error || !r.data?.length) return [];
      const linhas = r.data as { user_id: string; papel: "admin" | "membro" }[];
      const p = await db.from("profiles").select("id, full_name, avatar_url").in("id", linhas.map((l) => l.user_id));
      const porId = new Map(((p.data ?? []) as Pessoa[]).map((x) => [x.id, x]));
      return linhas.map((l) => ({ id: l.user_id, papel: l.papel, full_name: porId.get(l.user_id)?.full_name ?? null, avatar_url: porId.get(l.user_id)?.avatar_url ?? null }));
    },
  });
}

const Foto = ({ p, className = "h-7 w-7" }: { p: Pessoa; className?: string }) => (
  <img src={p.avatar_url || diceBearUrl(p.id)} alt={p.full_name ?? ""} title={p.full_name ?? ""}
    className={`${className} rounded-full object-cover ring-2 ring-background bg-muted`} />
);

export function MembrosNoCabecalho({ boardId, tituloQuadro, sugestoes }: {
  boardId: string; tituloQuadro: string; sugestoes: Pessoa[];
}) {
  const [aberto, setAberto] = useState(false);
  const { data: membros = [] } = useMembrosDoQuadro(boardId);
  const visiveis = membros.slice(0, 5);
  return (
    <>
      <div className="flex items-center gap-2">
        {membros.length > 0 && (
          <button type="button" onClick={() => setAberto(true)} className="hidden sm:flex -space-x-2" title="Membros do quadro">
            {visiveis.map((m) => <Foto key={m.id} p={m} />)}
            {membros.length > 5 && (
              <span className="h-7 w-7 rounded-full ring-2 ring-background bg-muted text-[11px] font-medium grid place-items-center text-muted-foreground">+{membros.length - 5}</span>
            )}
          </button>
        )}
        <button type="button" onClick={() => setAberto(true)}
          className="flex items-center gap-1.5 text-sm rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <UserPlus className="h-4 w-4" /> <span className="hidden md:inline">Compartilhar</span>
        </button>
      </div>
      {aberto && <Compartilhar boardId={boardId} tituloQuadro={tituloQuadro} membros={membros} sugestoes={sugestoes} onClose={() => setAberto(false)} />}
    </>
  );
}

function Compartilhar({ boardId, tituloQuadro, membros, sugestoes, onClose }: {
  boardId: string; tituloQuadro: string; membros: Membro[]; sugestoes: Pessoa[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState(false);
  // O time interno inteiro (perfis com departamento) — a mesma lista da menção.
  const { data: internos = [] } = useQuery({
    queryKey: ["mkt", "pessoas-internas"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Pessoa[]> => {
      const r = await db.from("profiles").select("id, full_name, avatar_url").not("department", "is", null).order("full_name");
      return ((r.data ?? []) as Pessoa[]).filter((p) => p.full_name);
    },
  });
  const ids = new Set(membros.map((m) => m.id));
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const encontrados = useMemo(() => {
    const t = norm(busca.trim());
    if (!t) return [];
    return internos.filter((p) => !ids.has(p.id) && norm(p.full_name ?? "").includes(t)).slice(0, 8);
  }, [busca, internos, membros]); // eslint-disable-line react-hooks/exhaustive-deps
  // Quem já está nos CARTÕES deste quadro e ainda não é membro: um clique.
  const sugeridos = sugestoes.filter((p) => !ids.has(p.id) && p.full_name).slice(0, 8);

  const atualizar = () => qc.invalidateQueries({ queryKey: ["mkt", "membros-quadro", boardId] });
  const adicionar = async (p: Pessoa) => {
    setOcupado(true);
    const r = await db.from("mkt_board_membros").insert({ board_id: boardId, user_id: p.id, papel: "membro", adicionado_por: user?.id ?? null });
    setOcupado(false);
    if (r.error) { toast.error(`Não adicionou: ${r.error.message}`); return; }
    toast.success(p.id === user?.id ? "Você entrou no quadro." : `${p.full_name} foi adicionado e avisado no sininho.`);
    setBusca(""); atualizar();
  };
  const trocarPapel = async (m: Membro, papel: "admin" | "membro") => {
    const r = await db.from("mkt_board_membros").update({ papel }).eq("board_id", boardId).eq("user_id", m.id);
    if (r.error) toast.error(`Não mudou: ${r.error.message}`); else atualizar();
  };
  const remover = async (m: Membro) => {
    const eu = m.id === user?.id;
    if (!(await confirmar({
      titulo: eu ? "Sair deste quadro?" : `Tirar ${m.full_name ?? "esta pessoa"} do quadro?`,
      mensagem: "Ela deixa de aparecer como membro. Continua podendo abrir o quadro, como todo o time interno.",
      confirmar: eu ? "Sair" : "Tirar",
    }))) return;
    const r = await db.from("mkt_board_membros").delete().eq("board_id", boardId).eq("user_id", m.id);
    if (r.error) toast.error(`Não tirou: ${r.error.message}`); else atualizar();
  };
  const copiarLink = async () => {
    const url = `${window.location.origin}/quadros/${boardId}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link do quadro copiado."); } catch { toast.message(url); }
  };

  const Linha = ({ p, children }: { p: Pessoa; children: React.ReactNode }) => (
    <div className="flex items-center gap-2.5 py-1.5">
      <Foto p={p} className="h-8 w-8" />
      <span className="flex-1 min-w-0 truncate text-sm">{p.full_name ?? "Usuário"}{p.id === user?.id ? <span className="text-muted-foreground"> (você)</span> : null}</span>
      {children}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar quadro</DialogTitle>
          <DialogDescription className="truncate">{tituloQuadro}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Adicionar pessoa do time pelo nome…" className="pl-8 h-9 text-sm" />
            {encontrados.length > 0 && (
              <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-[var(--radius)] border border-border bg-popover shadow-[var(--shadow-elevated)] p-1">
                {encontrados.map((p) => (
                  <button key={p.id} type="button" disabled={ocupado} onClick={() => adicionar(p)} className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                    <Foto p={p} className="h-6 w-6" /> <span className="truncate">{p.full_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mkt-meta-label pb-1">Membros do quadro · {membros.length}</p>
            {membros.length === 0 && <p className="text-xs text-muted-foreground py-2">Ninguém ainda — adicione pela busca ou pelas sugestões abaixo.</p>}
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {membros.map((m) => (
                <Linha key={m.id} p={m}>
                  <select value={m.papel} onChange={(e) => trocarPapel(m, e.target.value as "admin" | "membro")} className="mkt-field text-xs h-8">
                    <option value="admin">Administrador</option>
                    <option value="membro">Membro</option>
                  </select>
                  <button type="button" onClick={() => remover(m)} title={m.id === user?.id ? "Sair do quadro" : "Tirar do quadro"} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"><X className="h-4 w-4" /></button>
                </Linha>
              ))}
            </div>
          </div>

          {sugeridos.length > 0 && (
            <div>
              <p className="mkt-meta-label pb-1">Já estão nos cartões deste quadro</p>
              {sugeridos.map((p) => (
                <Linha key={p.id} p={p}>
                  <Button size="sm" variant="outline" className="h-7" disabled={ocupado} onClick={() => adicionar(p)}>Adicionar</Button>
                </Linha>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copiarLink}><Link2 className="h-3.5 w-3.5" /> Copiar link do quadro</Button>
            {user?.id && !membros.some((m) => m.id === user.id) && (
              <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => adicionar({ id: user.id, full_name: "Você", avatar_url: null })}>Entrar no quadro</Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Membro é quem participa: aparece aqui e no topo do quadro, e é avisado quando entra. Todo o time interno continua podendo abrir o quadro.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
