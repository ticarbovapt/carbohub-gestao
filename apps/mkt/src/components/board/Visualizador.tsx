import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { FecharComVoltar, confirmar } from "@carbo/shell";
import {
  X, Download, Link2, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Repeat, PictureInPicture2, StepBack, StepForward, FileText, Music, RefreshCw, Loader2, ZoomIn, ZoomOut,
  History, Columns2, RotateCcw, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Attachment, VersaoAnexo } from "@/hooks/useCardDetail";
import { BUCKET, tipoDoArquivo, tamanhoLegivel, urlAssinada, ROTULO_TIPO, type TipoArquivo } from "@/lib/mktArquivos";

// ─────────────────────────────────────────────────────────────────────────────
// Visualizador em tela cheia dos arquivos do cartão — o lugar onde o designer
// confere o que subiu. ← → troca de arquivo (fora do vídeo), Esc / Voltar fecha.
//
// ⚠️ O arquivo só é pedido AQUI, quando alguém abre. A lista do cartão mostra a
// capa; trazer o vídeo para a lista era o que pesava.
//
// VERSÕES: substituir guarda a anterior (v1, v2…). Aqui dá para ver qualquer
// uma, baixar, COMPARAR lado a lado com a atual (vídeo sincronizado) e
// RESTAURAR — que vira uma versão nova, nunca apaga a atual.
//
// ⚠️ Os menus daqui são <select> nativo, não o DropdownMenu do app: o conteúdo
// dele abre em z-50, ABAIXO deste visualizador (z-70), e sumiria por trás.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: unknown) => any };

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = Math.floor(s % 60);
  const mm = String(m).padStart(h ? 2 : 1, "0"), ss = String(seg).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
const QUADRO = 1 / 30; // passo de "um quadro": 30 fps, o padrão de quase todo vídeo de celular e de redes
const VELOCIDADES = [0.25, 0.5, 1, 1.5, 2];
const quando = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

/** O que se mostra na tela: a versão atual (o próprio anexo) ou uma anterior. */
type Fonte = {
  chave: string; versao: number; nome: string; tipo: TipoArquivo; tamanho: number | null | undefined;
  original: string; assistir: string; aguardandoConversao: boolean;
};
function fonteDoAnexo(a: Attachment): Fonte {
  const tipo = tipoDoArquivo(a.mime_type, a.name);
  const web = a.web_status === "pronto" && a.web_path ? a.web_path : null;
  return {
    chave: `${a.id}:${a.storage_path}`, versao: a.versao ?? 1, nome: a.name, tipo, tamanho: a.tamanho,
    original: a.storage_path!, assistir: web ?? a.storage_path!,
    aguardandoConversao: tipo === "video" && !a.web_status,
  };
}
function fonteDaVersao(v: VersaoAnexo): Fonte {
  return {
    chave: v.id, versao: v.versao, nome: v.name, tipo: tipoDoArquivo(v.mime_type, v.name), tamanho: v.tamanho,
    original: v.storage_path, assistir: v.web_path ?? v.storage_path, aguardandoConversao: false,
  };
}

function useUrl(caminho: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!caminho) return;
    let vivo = true;
    setUrl(null); setErro(null);
    urlAssinada(caminho).then((u) => vivo && setUrl(u)).catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [caminho]);
  return { url, erro };
}

export function Visualizador({ anexos, inicial, onClose, linkDe, onSubstituir, onAbriu, onMudou, registrar }: {
  anexos: Attachment[];
  inicial: number;
  onClose: () => void;
  linkDe: (a: Attachment) => string;
  onSubstituir?: (a: Attachment) => void;
  /** Chamado com a URL quando um arquivo SEM capa é aberto — para gerá-la uma vez. */
  onAbriu?: (a: Attachment, url: string) => void;
  /** Restaurou ou excluiu uma versão: o cartão precisa reler os anexos. */
  onMudou?: () => void;
  /** Grava no histórico do cartão (mkt_activity). */
  registrar?: (type: string, data: Record<string, unknown>) => void;
}) {
  const [i, setI] = useState(inicial);
  const a = anexos[Math.min(i, anexos.length - 1)];
  const [versaoVista, setVersaoVista] = useState<string | null>(null); // id da versão ANTERIOR em tela; null = atual
  const [comparar, setComparar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // As versões anteriores deste arquivo, e o nome de quem fez cada uma.
  const { data: versoes = [], refetch } = useQuery({
    queryKey: ["mkt", "versoes", a?.id, a?.versao],
    enabled: !!a?.id,
    queryFn: async (): Promise<(VersaoAnexo & { quem: string | null })[]> => {
      const r = await db.from("mkt_anexo_versoes").select("*").eq("anexo_id", a!.id).order("versao", { ascending: false });
      if (r.error) return []; // antes da migração: sem histórico, sem quebrar o visualizador
      const linhas = (r.data ?? []) as VersaoAnexo[];
      const ids = [...new Set(linhas.map((v) => v.criado_por).filter(Boolean))] as string[];
      const pr = ids.length ? await db.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
      const nomes = new Map(((pr.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
      return linhas.map((v) => ({ ...v, quem: v.criado_por ? nomes.get(v.criado_por) ?? null : null }));
    },
  });
  const vista = versaoVista ? versoes.find((v) => v.id === versaoVista) ?? null : null;
  // Comparando: a anterior escolhida (ou a mais recente delas) contra a atual.
  const contra = comparar ? (vista ?? versoes[0] ?? null) : null;

  useEffect(() => { setVersaoVista(null); setComparar(false); }, [a?.id]);

  const atual = a ? fonteDoAnexo(a) : null;
  const fonte = vista ? fonteDaVersao(vista) : atual;
  const { url, erro } = useUrl(comparar ? null : fonte?.assistir ?? null);

  // Capa que faltava: gerada uma vez, a partir da versão ATUAL.
  useEffect(() => {
    if (url && a && !vista && !a.poster_path && fonte?.assistir === a.storage_path) onAbriu?.(a, url);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const ir = useCallback((d: number) => setI((x) => (x + d + anexos.length) % anexos.length), [anexos.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("[data-player]")) return; // dentro do vídeo, ← → são do vídeo
      if ((e.target as HTMLElement)?.tagName === "SELECT") return;
      if (e.key === "ArrowRight" && anexos.length > 1) ir(1);
      if (e.key === "ArrowLeft" && anexos.length > 1) ir(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ir, anexos.length]);

  const baixar = async (f: Fonte | null = fonte) => {
    if (!f) return;
    try { window.location.href = await urlAssinada(f.original, { baixar: f.nome }); }
    catch (e) { toast.error((e as Error).message); }
  };
  const copiar = async () => {
    await navigator.clipboard.writeText(linkDe(a));
    toast.success("Link copiado — ele continua valendo mesmo se o arquivo for substituído.");
  };

  const restaurar = async (v: VersaoAnexo) => {
    if (!(await confirmar({
      titulo: `Restaurar a v${v.versao}?`,
      mensagem: `"${v.name}" volta a ser o arquivo atual, como v${Math.max(a.versao ?? 1, ...versoes.map((x) => x.versao)) + 1}. A atual (v${a.versao ?? 1}) fica no histórico — nada é apagado.`,
      confirmar: "Restaurar",
    }))) return;
    setOcupado(true);
    const r = await db.rpc("mkt_anexo_restaurar", { p_versao: v.id });
    setOcupado(false);
    if (r.error) { toast.error(`Não restaurou: ${r.error.message}`); return; }
    registrar?.("anexo.restaurar", { nome: v.name, versao: v.versao });
    toast.success(`v${v.versao} restaurada. O link continua o mesmo.`);
    setVersaoVista(null); setComparar(false);
    onMudou?.(); void refetch();
  };

  const excluirVersao = async (v: VersaoAnexo) => {
    if (!(await confirmar({ titulo: `Excluir a v${v.versao}?`, mensagem: `"${v.name}" é apagado do sistema. A versão atual não muda.`, confirmar: "Excluir", perigo: true }))) return;
    setOcupado(true);
    // ⚠️ Objeto ANTES da linha — ao contrário, sobraria arquivo no bucket que tela nenhuma mostra.
    const objetos = [v.storage_path, v.poster_path, v.web_path].filter(Boolean) as string[];
    const rm = await supabase.storage.from(BUCKET).remove(objetos);
    if (rm.error) { setOcupado(false); toast.error(`Não excluiu: ${rm.error.message}`); return; }
    const del = await db.from("mkt_anexo_versoes").delete().eq("id", v.id);
    setOcupado(false);
    if (del.error) { toast.error(`Não excluiu: ${del.error.message}`); return; }
    toast.success(`v${v.versao} excluída.`);
    setVersaoVista(null); setComparar(false);
    void refetch();
  };

  if (!a || !atual || !fonte) return null;
  const Bt = ({ on, titulo, ativo, children }: { on: () => void; titulo: string; ativo?: boolean; children: React.ReactNode }) => (
    <button type="button" onClick={on} title={titulo} disabled={ocupado}
      className={`h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md text-sm hover:bg-white/10 disabled:opacity-50 ${ativo ? "text-primary" : "text-white/80 hover:text-white"}`}>{children}</button>
  );
  const temHistorico = versoes.length > 0;

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black" />
        <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-0 z-[70] flex flex-col text-white focus:outline-none">
          <FecharComVoltar />
          <div className="flex items-center gap-1.5 px-3 sm:px-4 h-14 shrink-0 border-b border-white/10">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-sm font-semibold truncate">{fonte.nome}</DialogPrimitive.Title>
              <p className="text-xs text-white/60 truncate">
                {ROTULO_TIPO[fonte.tipo]}{fonte.tamanho ? ` · ${tamanhoLegivel(fonte.tamanho)}` : ""}
                {anexos.length > 1 ? ` · ${i + 1} de ${anexos.length}` : ""}
                {!vista && a.atualizado_em ? ` · substituído em ${quando(a.atualizado_em)}` : ""}
              </p>
            </div>
            {temHistorico && (
              <label className="inline-flex items-center gap-1.5 h-9 rounded-md bg-white/10 hover:bg-white/15 pl-2 pr-1 text-sm" title="Versões deste arquivo">
                <History className="h-4 w-4 text-white/70" />
                <select value={versaoVista ?? ""} onChange={(e) => setVersaoVista(e.target.value || null)} disabled={ocupado}
                  className="h-8 bg-transparent text-sm text-white border-0 focus:outline-none pr-1 [&>option]:text-black max-w-[44vw] sm:max-w-none">
                  <option value="">v{atual.versao} · atual</option>
                  {versoes.map((v) => (
                    <option key={v.id} value={v.id}>v{v.versao} · {quando(v.criado_em)}{v.quem ? ` · ${v.quem.split(" ")[0]}` : ""}</option>
                  ))}
                </select>
              </label>
            )}
            {temHistorico && <Bt titulo="Comparar lado a lado com a atual" ativo={comparar} on={() => setComparar((c) => !c)}><Columns2 className="h-4 w-4" /><span className="hidden md:inline">Comparar</span></Bt>}
            {onSubstituir && !vista && !comparar && <Bt titulo="Substituir por outra versão (a atual fica no histórico)" on={() => onSubstituir(a)}><RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Substituir</span></Bt>}
            <Bt titulo="Copiar link" on={copiar}><Link2 className="h-4 w-4" /><span className="hidden lg:inline">Copiar link</span></Bt>
            <Bt titulo={vista ? `Baixar a v${vista.versao}` : "Baixar o original"} on={() => baixar()}><Download className="h-4 w-4" /><span className="hidden lg:inline">Baixar</span></Bt>
            <DialogPrimitive.Close className="h-9 w-9 inline-flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10" title="Fechar (Esc)"><X className="h-5 w-5" /></DialogPrimitive.Close>
          </div>

          {/* Vendo uma versão ANTERIOR: a faixa diz isso e oferece o que fazer com ela. */}
          {vista && (
            <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 shrink-0 bg-amber-500/15 border-b border-amber-500/30 text-sm">
              <History className="h-4 w-4 text-amber-300 shrink-0" />
              <span className="text-amber-100 min-w-0 flex-1">
                Você está vendo a <b>v{vista.versao}</b>{vista.quem ? `, enviada por ${vista.quem}` : ""}{vista.criado_em ? ` em ${quando(vista.criado_em)}` : ""} — substituída em {quando(vista.substituido_em)}.
              </span>
              <button disabled={ocupado} onClick={() => restaurar(vista)} className="h-8 px-3 rounded-md bg-amber-400 text-black font-medium hover:bg-amber-300 inline-flex items-center gap-1.5 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Restaurar esta versão</button>
              <button disabled={ocupado} onClick={() => excluirVersao(vista)} className="h-8 px-3 rounded-md text-amber-100 hover:bg-white/10 inline-flex items-center gap-1.5 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Excluir</button>
              <button onClick={() => { setVersaoVista(null); setComparar(false); }} className="h-8 px-3 rounded-md text-amber-100 hover:bg-white/10">Voltar para a atual</button>
            </div>
          )}

          <div className="relative flex-1 min-h-0 flex items-center justify-center">
            {anexos.length > 1 && !comparar && (
              <>
                <button onClick={() => ir(-1)} title="Anterior (←)" className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><ChevronLeft className="h-6 w-6" /></button>
                <button onClick={() => ir(1)} title="Próximo (→)" className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><ChevronRight className="h-6 w-6" /></button>
              </>
            )}
            {comparar && contra ? (
              <Comparacao key={`${contra.id}|${atual.chave}`} antes={fonteDaVersao(contra)} depois={atual} />
            ) : erro ? (
              <p className="text-sm text-white/70">{erro}</p>
            ) : !url ? (
              <Loader2 className="h-8 w-8 animate-spin text-white/60" />
            ) : fonte.tipo === "video" ? (
              <PlayerVideo key={fonte.chave} src={url} tamanho={fonte.tamanho} onBaixar={() => baixar()} aguardandoConversao={fonte.aguardandoConversao} />
            ) : fonte.tipo === "imagem" ? (
              <VerImagem key={fonte.chave} src={url} nome={fonte.nome} />
            ) : fonte.tipo === "pdf" ? (
              <iframe key={fonte.chave} src={url} title={fonte.nome} className="w-full h-full bg-white" />
            ) : fonte.tipo === "audio" ? (
              <div className="flex flex-col items-center gap-4"><Music className="h-16 w-16 text-white/50" /><audio key={fonte.chave} src={url} controls autoPlay className="w-[min(90vw,480px)]" /></div>
            ) : (
              <SemPrevia onBaixar={() => baixar()} />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SemPrevia({ onBaixar }: { onBaixar: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 text-white/70">
      <FileText className="h-16 w-16" />
      <p className="text-sm">Este tipo de arquivo não tem pré-visualização.</p>
      <button onClick={onBaixar} className="h-9 px-4 rounded-md bg-white/15 hover:bg-white/25 text-sm text-white">Baixar</button>
    </div>
  );
}

// ── COMPARAR ────────────────────────────────────────────────────────────────
// A anterior à esquerda, a atual à direita. Vídeo: os dois tocam, pausam e
// pulam JUNTOS (a direita manda; a esquerda é corrigida se escorregar), e o
// som é o da atual — dois áudios juntos não se ouvem. Imagem: lado a lado.
function Comparacao({ antes, depois }: { antes: Fonte; depois: Fonte }) {
  const ua = useUrl(antes.assistir), ub = useUrl(depois.assistir);
  const rotulo = (f: Fonte, atual: boolean) => (
    <span className={`absolute top-2 left-2 z-10 rounded-md px-2 py-0.5 text-xs font-semibold ${atual ? "bg-primary text-primary-foreground" : "bg-white/20 text-white"}`}>
      v{f.versao}{atual ? " · atual" : ""}
    </span>
  );
  if (!ua.url || !ub.url) return ua.erro || ub.erro ? <p className="text-sm text-white/70">{ua.erro ?? ub.erro}</p> : <Loader2 className="h-8 w-8 animate-spin text-white/60" />;
  if (antes.tipo === "video" && depois.tipo === "video") return <VideosLadoALado a={ua.url} b={ub.url} va={antes.versao} vb={depois.versao} />;
  const painel = (f: Fonte, url: string, atual: boolean) => (
    <div className="relative flex-1 min-w-0 min-h-0 flex items-center justify-center p-2 border-white/10 first:border-b md:first:border-b-0 md:first:border-r">
      {rotulo(f, atual)}
      {f.tipo === "imagem" ? <img src={url} alt={f.nome} className="max-w-full max-h-full object-contain" />
        : f.tipo === "pdf" ? <iframe src={url} title={f.nome} className="w-full h-full bg-white" />
        : f.tipo === "video" ? <video src={url} controls className="max-w-full max-h-full" />
        : <div className="text-center text-sm text-white/70 space-y-1"><FileText className="h-10 w-10 mx-auto" /><p className="truncate max-w-[40vw]">{f.nome}</p></div>}
    </div>
  );
  return <div className="w-full h-full flex flex-col md:flex-row">{painel(antes, ua.url, false)}{painel(depois, ub.url, true)}</div>;
}

function VideosLadoALado({ a, b, va, vb }: { a: string; b: string; va: number; vb: number }) {
  const ra = useRef<HTMLVideoElement>(null), rb = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [falhou, setFalhou] = useState<string | null>(null);
  const ambos = (f: (v: HTMLVideoElement) => void) => { if (ra.current) f(ra.current); if (rb.current) f(rb.current); };
  const alternar = () => {
    if (tocando) { ambos((v) => v.pause()); setTocando(false); }
    else { ambos((v) => { void v.play().catch(() => null); }); setTocando(true); }
  };
  const ir = (s: number) => ambos((v) => { v.currentTime = Math.max(0, Math.min(v.duration || s, s)); });
  const quadro = (d: number) => { ambos((v) => v.pause()); setTocando(false); ir((rb.current?.currentTime ?? 0) + d); };
  const sync = () => {
    const x = ra.current, y = rb.current;
    if (!x || !y) return;
    setT(y.currentTime);
    if (Math.abs(x.currentTime - y.currentTime) > 0.15 && y.currentTime <= (x.duration || 0)) x.currentTime = y.currentTime;
  };
  const video = (ref: React.RefObject<HTMLVideoElement>, src: string, v: number, atual: boolean) => (
    <div className="relative flex-1 min-w-0 min-h-0 flex items-center justify-center bg-black first:border-b md:first:border-b-0 md:first:border-r border-white/10">
      <span className={`absolute top-2 left-2 z-10 rounded-md px-2 py-0.5 text-xs font-semibold ${atual ? "bg-primary text-primary-foreground" : "bg-white/20 text-white"}`}>v{v}{atual ? " · atual" : ""}</span>
      <video ref={ref} src={src} playsInline preload="auto" muted={!atual} className="max-w-full max-h-full" onClick={alternar}
        onTimeUpdate={atual ? sync : undefined}
        onLoadedMetadata={(e) => { const d0 = e.currentTarget.duration || 0; setDur((d) => Math.max(d, d0)); }}
        onEnded={() => { if (atual) setTocando(false); }}
        onError={() => setFalhou(`A v${v} não toca neste navegador (provavelmente .MOV de iPhone ainda sem a cópia convertida).`)} />
    </div>
  );
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">{video(ra, a, va, false)}{video(rb, b, vb, true)}</div>
      {falhou && <p className="px-4 py-1.5 text-xs text-amber-200 bg-amber-500/15">{falhou}</p>}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-white/10">
        <button onClick={alternar} title="Reproduzir os dois" className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-white/15">{tocando ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}</button>
        <button onClick={() => quadro(-QUADRO)} title="Quadro anterior" className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-white/15"><StepBack className="h-4 w-4" /></button>
        <button onClick={() => quadro(QUADRO)} title="Próximo quadro" className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-white/15"><StepForward className="h-4 w-4" /></button>
        <input type="range" min={0} max={dur || 0} step={0.01} value={t} aria-label="Posição"
          onChange={(e) => { const s = Number(e.target.value); setT(s); ir(s); }}
          className="flex-1 accent-[hsl(var(--primary))]" />
        <span className="tabular-nums text-xs text-white/80 w-24 text-right">{fmt(t)} / {fmt(dur)}</span>
      </div>
    </div>
  );
}

function VerImagem({ src, nome }: { src: string; nome: string }) {
  const [real, setReal] = useState(false);
  const [dim, setDim] = useState<[number, number] | null>(null);
  return (
    <div className={`relative w-full h-full ${real ? "overflow-auto" : "flex items-center justify-center p-4"}`}>
      <img src={src} alt={nome} onLoad={(e) => setDim([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
        onClick={() => setReal((v) => !v)}
        className={real ? "max-w-none cursor-zoom-out m-auto" : "max-w-full max-h-full object-contain cursor-zoom-in"} />
      {dim && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white/80">
          {dim[0]}×{dim[1]} px
          <button onClick={() => setReal((v) => !v)} className="inline-flex items-center gap-1 hover:text-white">
            {real ? <><ZoomOut className="h-3.5 w-3.5" /> Ajustar</> : <><ZoomIn className="h-3.5 w-3.5" /> 100%</>}
          </button>
        </div>
      )}
    </div>
  );
}

// Player com o que o designer usa para conferir uma peça: quadro a quadro,
// velocidade, repetição, tela cheia, resolução real e duração.
function PlayerVideo({ src, tamanho, onBaixar, aguardandoConversao }: {
  src: string; tamanho: number | null | undefined; onBaixar: () => void;
  /** O conversor ainda não olhou este vídeo: se não tocar, a cópia que toca está a caminho. */
  aguardandoConversao?: boolean;
}) {
  const v = useRef<HTMLVideoElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  const [tocando, setTocando] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [buf, setBuf] = useState(0);
  const [vol, setVol] = useState(1);
  const [mudo, setMudo] = useState(false);
  const [vel, setVel] = useState(1);
  const [loop, setLoop] = useState(false);
  const [cheia, setCheia] = useState(false);
  const [res, setRes] = useState<[number, number] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [controles, setControles] = useState(true);
  const esconder = useRef<number>();

  const el = () => v.current!;
  const alternar = () => { const x = el(); if (x.paused) void x.play(); else x.pause(); };
  const pular = (s: number) => { const x = el(); x.pause(); x.currentTime = Math.max(0, Math.min(x.duration || 0, x.currentTime + s)); };
  const tela = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void caixa.current?.requestFullscreen(); };
  const mostrar = () => {
    setControles(true);
    window.clearTimeout(esconder.current);
    esconder.current = window.setTimeout(() => { if (!el()?.paused) setControles(false); }, 2500);
  };

  useEffect(() => {
    const f = () => setCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => { document.removeEventListener("fullscreenchange", f); window.clearTimeout(esconder.current); };
  }, []);

  const tecla = (e: React.KeyboardEvent) => {
    const x = el();
    const k = e.key.toLowerCase();
    const feito = () => { e.preventDefault(); e.stopPropagation(); mostrar(); };
    if (k === " " || k === "k") { alternar(); feito(); }
    else if (k === "arrowright") { x.currentTime = Math.min(x.duration, x.currentTime + 5); feito(); }
    else if (k === "arrowleft") { x.currentTime = Math.max(0, x.currentTime - 5); feito(); }
    else if (k === ".") { pular(QUADRO); feito(); }
    else if (k === ",") { pular(-QUADRO); feito(); }
    else if (k === "f") { tela(); feito(); }
    else if (k === "m") { x.muted = !x.muted; feito(); }
    else if (k === "l") { setLoop((l) => !l); feito(); }
    else if (k === "home") { x.currentTime = 0; feito(); }
  };

  const buscar = (clientX: number) => {
    const r = barra.current!.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    el().currentTime = frac * (dur || 0);
  };

  if (falhou) {
    return (
      <div className="max-w-md text-center space-y-3 px-6">
        {aguardandoConversao ? (
          <p className="text-sm text-white/80">Este vídeo está no formato do <b>iPhone (HEVC)</b>, que o navegador não reproduz. <b>Uma cópia que toca está sendo gerada</b> e aparece aqui sozinha em até ~15 minutos. Enquanto isso, baixe o original para assistir.</p>
        ) : (
          <p className="text-sm text-white/80">Este navegador não consegue reproduzir este vídeo — é comum em <b>.MOV gravado no iPhone</b> (formato HEVC) quando a conversão não deu certo. O arquivo está inteiro: baixe para assistir, ou abra no Safari.</p>
        )}
        <button onClick={onBaixar} className="h-9 px-4 rounded-md bg-white/15 hover:bg-white/25 text-sm inline-flex items-center gap-2"><Download className="h-4 w-4" /> Baixar o original</button>
      </div>
    );
  }

  const Bt = ({ on, titulo, ativo, children }: { on: () => void; titulo: string; ativo?: boolean; children: React.ReactNode }) => (
    <button type="button" onClick={on} title={titulo} className={`h-9 min-w-9 px-1.5 inline-flex items-center justify-center rounded-md hover:bg-white/15 ${ativo ? "text-primary" : "text-white"}`}>{children}</button>
  );

  return (
    <div ref={caixa} data-player tabIndex={0} onKeyDown={tecla} onMouseMove={mostrar}
      className={`relative w-full h-full flex items-center justify-center bg-black focus:outline-none ${controles ? "" : "cursor-none"}`}>
      <video ref={v} src={src} autoPlay playsInline preload="metadata" loop={loop}
        className="max-w-full max-h-full" onClick={alternar} onDoubleClick={tela}
        onPlay={() => { setTocando(true); mostrar(); }} onPause={() => { setTocando(false); setControles(true); }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); setRes([e.currentTarget.videoWidth, e.currentTarget.videoHeight]); caixa.current?.focus(); }}
        onCanPlay={() => setCarregando(false)} onWaiting={() => setCarregando(true)} onPlaying={() => setCarregando(false)}
        onProgress={(e) => { const b = e.currentTarget.buffered; if (b.length) setBuf(b.end(b.length - 1)); }}
        onVolumeChange={(e) => { setVol(e.currentTarget.volume); setMudo(e.currentTarget.muted); }}
        onError={() => setFalhou(true)} />
      {carregando && <Loader2 className="absolute h-10 w-10 animate-spin text-white/70 pointer-events-none" />}
      {!tocando && !carregando && (
        <button onClick={alternar} className="absolute h-16 w-16 rounded-full bg-black/60 hover:bg-black/75 flex items-center justify-center" title="Reproduzir (espaço)"><Play className="h-8 w-8 fill-current ml-1" /></button>
      )}

      <div className={`absolute inset-x-0 bottom-0 px-3 pb-2 pt-8 bg-gradient-to-t from-black/85 to-transparent transition-opacity ${controles ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {/* Barra de tempo: o que já baixou em cinza, o que tocou na cor, e o tempo sob o mouse. */}
        <div ref={barra} className="relative h-5 flex items-center cursor-pointer group"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); buscar(e.clientX); }}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
            setHover({ x: e.clientX - r.left, t: frac * dur });
            if (e.buttons === 1) buscar(e.clientX);
          }}
          onPointerLeave={() => setHover(null)}>
          <div className="relative w-full h-1 group-hover:h-1.5 transition-all rounded-full bg-white/20 overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${dur ? (buf / dur) * 100 : 0}%` }} />
            <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${dur ? (t / dur) * 100 : 0}%` }} />
          </div>
          <div className="absolute h-3 w-3 rounded-full bg-primary -translate-x-1/2 opacity-0 group-hover:opacity-100" style={{ left: `${dur ? (t / dur) * 100 : 0}%` }} />
          {hover && <div className="absolute -top-7 -translate-x-1/2 rounded bg-black/90 px-1.5 py-0.5 text-[11px] tabular-nums" style={{ left: hover.x }}>{fmt(hover.t)}</div>}
        </div>

        <div className="flex items-center gap-0.5 text-sm">
          <Bt titulo={tocando ? "Pausar (espaço)" : "Reproduzir (espaço)"} on={alternar}>{tocando ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}</Bt>
          <Bt titulo="Quadro anterior ( , )" on={() => pular(-QUADRO)}><StepBack className="h-4 w-4" /></Bt>
          <Bt titulo="Próximo quadro ( . )" on={() => pular(QUADRO)}><StepForward className="h-4 w-4" /></Bt>
          <div className="flex items-center group/vol">
            <Bt titulo="Som (m)" on={() => { el().muted = !el().muted; }}>{mudo || vol === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</Bt>
            <input type="range" min={0} max={1} step={0.05} value={mudo ? 0 : vol} aria-label="Volume"
              onChange={(e) => { el().volume = Number(e.target.value); el().muted = Number(e.target.value) === 0; }}
              className="w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100 transition-all accent-[hsl(var(--primary))]" />
          </div>
          <span className="ml-2 tabular-nums text-white/85 text-xs">{fmt(t)} / {fmt(dur)}</span>
          <span className="flex-1" />
          {res && <span className="hidden sm:inline text-xs text-white/60 mr-2 tabular-nums">{res[0]}×{res[1]}{tamanho ? ` · ${tamanhoLegivel(tamanho)}` : ""}</span>}
          <select value={vel} onChange={(e) => { const n = Number(e.target.value); setVel(n); el().playbackRate = n; }} title="Velocidade"
            className="h-8 rounded-md bg-white/10 hover:bg-white/15 px-1.5 text-xs text-white border-0 focus:outline-none [&>option]:text-black">
            {VELOCIDADES.map((n) => <option key={n} value={n}>{n === 1 ? "1×" : `${String(n).replace(".", ",")}×`}</option>)}
          </select>
          <Bt titulo="Repetir (l)" ativo={loop} on={() => setLoop((l) => !l)}><Repeat className="h-4 w-4" /></Bt>
          {"pictureInPictureEnabled" in document && (
            <Bt titulo="Janela flutuante" on={() => { if (document.pictureInPictureElement) void document.exitPictureInPicture(); else void el().requestPictureInPicture(); }}><PictureInPicture2 className="h-4 w-4" /></Bt>
          )}
          <Bt titulo="Tela cheia (f)" on={tela}>{cheia ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}</Bt>
        </div>
      </div>
    </div>
  );
}
