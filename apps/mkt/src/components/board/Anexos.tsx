import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Paperclip, Upload, MoreHorizontal, RefreshCw, Download, Link2, Trash2, Play, FileText, Music,
  Image as ImageIcon, ExternalLink, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirmar } from "@carbo/shell";
import { supabase } from "@/integrations/supabase/client";
import type { Attachment } from "@/hooks/useCardDetail";
import { Visualizador } from "@/components/board/Visualizador";
import {
  BUCKET, tipoDoArquivo, ROTULO_TIPO, tamanhoLegivel, caminhoDoArquivo, caminhoDaCapa, enviar, gerarCapa, urlAssinada,
} from "@/lib/mktArquivos";

// ─────────────────────────────────────────────────────────────────────────────
// Anexos do cartão. O diferencial pedido pelo dono do processo: o arquivo mora
// NO NOSSO BANCO, e SUBSTITUIR troca o conteúdo sem trocar o anexo — o link
// copiado continua levando à versão nova. Acaba o "subir no Drive, voltar ao
// cartão e trocar o link em todo lugar".
//
// ⚠️ Substituir grava um objeto NOVO e só depois apaga o antigo: se o envio
//    cair no meio, o anexo continua apontando para o arquivo que existe.
// ⚠️ Excluir apaga o OBJETO antes da linha: ao contrário, sobraria arquivo no
//    bucket que nenhuma tela mostra (e que ninguém mais acharia para apagar).
// ⚠️ A lista carrega só a CAPA. Arquivo sem capa (os do Trello) ganha uma na
//    primeira vez que alguém o abre.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };
type Envio = { id: string; nome: string; frac: number; erro?: string };

async function meuId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export function Anexos({ cardId, boardId, anexos, anexoInicial, onAdicionarLink, onRemoverLink }: {
  cardId: string; boardId: string; anexos: Attachment[];
  anexoInicial?: string | null;
  onAdicionarLink: (url: string, ok: () => void) => void;
  onRemoverLink: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [link, setLink] = useState("");
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [substituindo, setSubstituindo] = useState<Record<string, number>>({});
  const [arrastando, setArrastando] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);
  const inputNovo = useRef<HTMLInputElement>(null);
  const inputTroca = useRef<HTMLInputElement>(null);
  const alvoTroca = useRef<Attachment | null>(null);
  const capasTentadas = useRef(new Set<string>());

  const arquivos = useMemo(() => anexos.filter((a) => a.kind === "arquivo" && a.storage_path), [anexos]);
  const links = useMemo(() => anexos.filter((a) => !(a.kind === "arquivo" && a.storage_path)), [anexos]);

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["mkt", "card", cardId] });
    qc.invalidateQueries({ queryKey: ["mkt", "board", boardId] });
  };
  const registrar = async (type: string, data: Record<string, unknown>) => {
    await db.from("mkt_activity").insert({ board_id: boardId, card_id: cardId, user_id: await meuId(), type, data });
  };
  const linkDe = (a: Attachment) => `${window.location.origin}/quadros/${boardId}?card=${cardId}&anexo=${a.id}`;

  // Capas: UMA chamada para todas as URLs assinadas da lista.
  const chavesCapa = arquivos.map((a) => a.poster_path).filter(Boolean) as string[];
  const [capas, setCapas] = useState<Record<string, string>>({});
  useEffect(() => {
    const faltam = chavesCapa.filter((k) => !capas[k]);
    if (!faltam.length) return;
    supabase.storage.from(BUCKET).createSignedUrls(faltam, 3600).then(({ data }) => {
      if (!data) return;
      setCapas((c) => { const n = { ...c }; for (const d of data) if (d.path && d.signedUrl) n[d.path] = d.signedUrl; return n; });
    });
  }, [chavesCapa.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Link copiado de um arquivo (`?card=…&anexo=…`) abre direto nele.
  const jaAbriuInicial = useRef(false);
  useEffect(() => {
    if (!anexoInicial || jaAbriuInicial.current) return;
    const idx = arquivos.findIndex((a) => a.id === anexoInicial);
    if (idx >= 0) { jaAbriuInicial.current = true; setAberto(idx); }
  }, [anexoInicial, arquivos]);

  // ── enviar ────────────────────────────────────────────────────────────────
  const enviarCapa = async (anexoId: string, fonte: Blob | string, tipo: ReturnType<typeof tipoDoArquivo>) => {
    if (tipo !== "imagem" && tipo !== "video") return null;
    const capa = await gerarCapa(fonte, tipo);
    if (!capa) return null;
    const caminho = caminhoDaCapa(anexoId);
    try { await enviar(capa, caminho, "image/jpeg"); return caminho; } catch (e) { console.warn("[mkt] capa não enviada:", e); return null; }
  };

  const enviarNovos = async (lista: FileList | File[]) => {
    for (const f of Array.from(lista)) {
      const eid = crypto.randomUUID();
      setEnvios((x) => [...x, { id: eid, nome: f.name, frac: 0 }]);
      const caminho = caminhoDoArquivo(cardId, f.name);
      const tipoMime = f.type || "application/octet-stream";
      try {
        await enviar(f, caminho, tipoMime, (frac) => setEnvios((x) => x.map((e) => e.id === eid ? { ...e, frac } : e)));
        const ins = await db.from("mkt_card_attachments").insert({
          card_id: cardId, kind: "arquivo", name: f.name, external_url: `storage://${BUCKET}/${caminho}`,
          storage_path: caminho, mime_type: f.type || null, tamanho: f.size, created_by: await meuId(),
        }).select("id").single();
        if (ins.error) { await supabase.storage.from(BUCKET).remove([caminho]); throw new Error(ins.error.message); }
        setEnvios((x) => x.filter((e) => e.id !== eid));
        atualizar();
        void registrar("anexo.adicionar", { nome: f.name });
        const capa = await enviarCapa(ins.data.id, f, tipoDoArquivo(f.type, f.name));
        if (capa) { await db.from("mkt_card_attachments").update({ poster_path: capa }).eq("id", ins.data.id); atualizar(); }
      } catch (e) {
        setEnvios((x) => x.map((en) => en.id === eid ? { ...en, erro: (e as Error).message } : en));
      }
    }
  };

  // ── substituir ────────────────────────────────────────────────────────────
  const pedirTroca = (a: Attachment) => { alvoTroca.current = a; inputTroca.current?.click(); };
  const substituir = async (a: Attachment, f: File) => {
    const caminho = caminhoDoArquivo(cardId, f.name);
    setSubstituindo((s) => ({ ...s, [a.id]: 0 }));
    try {
      await enviar(f, caminho, f.type || "application/octet-stream", (frac) => setSubstituindo((s) => ({ ...s, [a.id]: frac })));
      const capa = await enviarCapa(a.id, f, tipoDoArquivo(f.type, f.name));
      const up = await db.from("mkt_card_attachments").update({
        name: f.name, storage_path: caminho, external_url: `storage://${BUCKET}/${caminho}`, mime_type: f.type || null,
        tamanho: f.size, poster_path: capa, atualizado_em: new Date().toISOString(), atualizado_por: await meuId(), kind: "arquivo",
      }).eq("id", a.id);
      if (up.error) { await supabase.storage.from(BUCKET).remove([caminho, ...(capa ? [capa] : [])]); throw new Error(up.error.message); }
      // Só agora o antigo some — o anexo já aponta para o novo.
      const velhos = [a.storage_path, a.poster_path].filter(Boolean) as string[];
      if (velhos.length) await supabase.storage.from(BUCKET).remove(velhos);
      void registrar("anexo.substituir", { de: a.name, para: f.name });
      toast.success(`"${a.name}" substituído por "${f.name}". O link continua o mesmo.`);
      atualizar();
    } catch (e) {
      toast.error(`Não substituiu: ${(e as Error).message}`);
    } finally {
      setSubstituindo((s) => { const n = { ...s }; delete n[a.id]; return n; });
    }
  };

  // ── excluir ───────────────────────────────────────────────────────────────
  const excluir = async (a: Attachment) => {
    if (!(await confirmar({ titulo: `Excluir "${a.name}"?`, mensagem: "O arquivo é apagado do sistema e o link dele para de funcionar.", confirmar: "Excluir", perigo: true }))) return;
    const objetos = [a.storage_path, a.poster_path].filter(Boolean) as string[];
    const rm = await supabase.storage.from(BUCKET).remove(objetos);
    if (rm.error) { toast.error(`Não excluiu: ${rm.error.message}`); return; }
    const del = await db.from("mkt_card_attachments").delete().eq("id", a.id);
    if (del.error) { toast.error(`Não excluiu: ${del.error.message}`); return; }
    void registrar("anexo.excluir", { nome: a.name });
    atualizar();
  };

  const baixar = async (a: Attachment) => {
    try { window.location.href = await urlAssinada(a.storage_path!, { baixar: a.name }); }
    catch (e) { toast.error((e as Error).message); }
  };
  const copiar = async (a: Attachment) => {
    await navigator.clipboard.writeText(linkDe(a));
    toast.success("Link copiado — ele continua valendo mesmo se o arquivo for substituído.");
  };

  // Capa que faltava (anexo antigo): gera a partir do arquivo que acabou de abrir.
  const capaNaPrimeiraAbertura = (a: Attachment, url: string) => {
    if (capasTentadas.current.has(a.id)) return;
    capasTentadas.current.add(a.id);
    void (async () => {
      const capa = await enviarCapa(a.id, url, tipoDoArquivo(a.mime_type, a.name));
      if (capa) { await db.from("mkt_card_attachments").update({ poster_path: capa }).eq("id", a.id).is("poster_path", null); atualizar(); }
    })();
  };

  // ── arrastar e soltar em qualquer lugar do cartão ──────────────────────────
  useEffect(() => {
    let n = 0;
    const temArquivo = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const entra = (e: DragEvent) => { if (temArquivo(e)) { n++; setArrastando(true); } };
    const sai = (e: DragEvent) => { if (temArquivo(e) && --n <= 0) { n = 0; setArrastando(false); } };
    const sobre = (e: DragEvent) => { if (temArquivo(e)) e.preventDefault(); };
    const solta = (e: DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault(); n = 0; setArrastando(false);
      if (e.dataTransfer?.files.length) void enviarNovos(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", entra); window.addEventListener("dragleave", sai);
    window.addEventListener("dragover", sobre); window.addEventListener("drop", solta);
    return () => {
      window.removeEventListener("dragenter", entra); window.removeEventListener("dragleave", sai);
      window.removeEventListener("dragover", sobre); window.removeEventListener("drop", solta);
    };
  }, [cardId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif" }}>
          <Paperclip className="h-4 w-4 text-muted-foreground" /> Anexos
        </p>
        <Button size="sm" variant="secondary" className="h-8 gap-1.5" onClick={() => inputNovo.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Enviar arquivo
        </Button>
        <input ref={inputNovo} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) void enviarNovos(e.target.files); e.target.value = ""; }} />
        <input ref={inputTroca} type="file" hidden onChange={(e) => {
          const f = e.target.files?.[0]; const a = alvoTroca.current;
          if (f && a) void substituir(a, f);
          e.target.value = ""; alvoTroca.current = null;
        }} />
      </div>

      {/* Envios em andamento */}
      {envios.map((e) => (
        <div key={e.id} className="rounded-[var(--radius)] border border-border bg-card p-2.5 space-y-1.5">
          <div className="flex items-center gap-2 text-sm">
            {e.erro ? <span className="text-destructive">Falhou</span> : <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <span className="truncate flex-1">{e.nome}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{e.erro ? "" : `${Math.round(e.frac * 100)}%`}</span>
            {e.erro && <button onClick={() => setEnvios((x) => x.filter((y) => y.id !== e.id))} className="text-xs text-muted-foreground hover:text-foreground">fechar</button>}
          </div>
          {e.erro ? <p className="text-xs text-destructive">{e.erro}</p> : (
            <div className="mkt-progress"><div className="mkt-progress-fill" style={{ width: `${Math.round(e.frac * 100)}%` }} /></div>
          )}
        </div>
      ))}

      {/* Arquivos do NOSSO banco */}
      {arquivos.length > 0 && (
        <div className="space-y-2">
          {arquivos.map((a, idx) => {
            const tipo = tipoDoArquivo(a.mime_type, a.name);
            const capa = a.poster_path ? capas[a.poster_path] : undefined;
            const Icone = tipo === "audio" ? Music : tipo === "imagem" ? ImageIcon : tipo === "video" ? Play : FileText;
            const prog = substituindo[a.id];
            return (
              <div key={a.id} className="relative flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card p-2 shadow-[var(--shadow-card)] group">
                <button type="button" onClick={() => setAberto(idx)} title="Abrir"
                  className="relative h-14 w-24 shrink-0 rounded-md bg-muted overflow-hidden flex items-center justify-center text-muted-foreground">
                  {capa ? <img src={capa} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icone className="h-5 w-5" />}
                  {tipo === "video" && capa && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25"><span className="h-7 w-7 rounded-full bg-black/60 flex items-center justify-center text-white"><Play className="h-3.5 w-3.5 fill-current ml-0.5" /></span></span>
                  )}
                </button>
                <button type="button" onClick={() => setAberto(idx)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {ROTULO_TIPO[tipo]}{a.tamanho ? ` · ${tamanhoLegivel(a.tamanho)}` : ""} · {a.atualizado_em
                      ? `substituído em ${new Date(a.atualizado_em).toLocaleDateString("pt-BR")}`
                      : `adicionado em ${new Date(a.created_at).toLocaleDateString("pt-BR")}`}
                  </p>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Ações"><MoreHorizontal className="h-4 w-4" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => pedirTroca(a)}><RefreshCw className="h-4 w-4 mr-2" /> Substituir arquivo</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copiar(a)}><Link2 className="h-4 w-4 mr-2" /> Copiar link</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => baixar(a)}><Download className="h-4 w-4 mr-2" /> Baixar</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => excluir(a)} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {prog !== undefined && (
                  <div className="absolute inset-0 rounded-[var(--radius)] bg-card/90 flex items-center gap-3 px-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm">Substituindo…</span>
                    <div className="mkt-progress flex-1"><div className="mkt-progress-fill" style={{ width: `${Math.round(prog * 100)}%` }} /></div>
                    <span className="text-xs tabular-nums text-muted-foreground">{Math.round(prog * 100)}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Links (Drive e outros) */}
      <div className="flex gap-2">
        <Input value={link} onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && link.trim()) onAdicionarLink(link, () => setLink("")); }}
          placeholder="Ou cole um link (Google Drive, Figma, Canva…)" className="h-9 text-sm" />
        <Button size="sm" variant="outline" disabled={!link.trim()} onClick={() => onAdicionarLink(link, () => setLink(""))}>Anexar link</Button>
      </div>
      {links.map((a) => (
        <div key={a.id} className="flex items-center gap-2.5 rounded-[var(--radius)] border border-border bg-card p-2 shadow-[var(--shadow-card)] group">
          {a.thumbnail_url ? (
            <img src={a.thumbnail_url} alt="" className="h-10 w-14 rounded-md object-cover bg-muted" referrerPolicy="no-referrer"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <div className="h-10 w-14 rounded-md bg-muted flex items-center justify-center text-muted-foreground"><FileText className="h-5 w-5" /></div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground truncate">{a.name}</p>
            <span className="text-xs text-muted-foreground">{a.kind === "drive" ? "Google Drive" : "Link"}</span>
          </div>
          <a href={a.external_url} target="_blank" rel="noreferrer" className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60" title="Abrir"><ExternalLink className="h-4 w-4" /></a>
          <button onClick={() => onRemoverLink(a.id)} className="p-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100" title="Remover"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}

      {arrastando && (
        <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center bg-primary/10 backdrop-blur-[1px]">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-background/95 px-10 py-8 text-center shadow-xl">
            <Upload className="h-8 w-8 mx-auto text-primary" />
            <p className="mt-2 text-base font-semibold">Solte para anexar ao cartão</p>
            <p className="text-sm text-muted-foreground">Vídeos, imagens, PDFs — vão direto para o nosso banco</p>
          </div>
        </div>
      )}

      {aberto !== null && arquivos.length > 0 && (
        <Visualizador anexos={arquivos} inicial={aberto} onClose={() => setAberto(null)} linkDe={linkDe}
          onSubstituir={pedirTroca} onAbriu={capaNaPrimeiraAbertura} />
      )}
    </div>
  );
}
