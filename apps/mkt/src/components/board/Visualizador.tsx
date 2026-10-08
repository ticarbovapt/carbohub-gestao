import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FecharComVoltar } from "@carbo/shell";
import {
  X, Download, Link2, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Repeat, PictureInPicture2, StepBack, StepForward, FileText, Music, RefreshCw, Loader2, ZoomIn, ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import type { Attachment } from "@/hooks/useCardDetail";
import { tipoDoArquivo, tamanhoLegivel, urlAssinada, ROTULO_TIPO } from "@/lib/mktArquivos";

// ─────────────────────────────────────────────────────────────────────────────
// Visualizador em tela cheia dos arquivos do cartão — o lugar onde o designer
// confere o que subiu. ← → troca de arquivo (fora do vídeo), Esc / Voltar fecha.
//
// ⚠️ O arquivo só é pedido AQUI, quando alguém abre. A lista do cartão mostra a
// capa; trazer o vídeo para a lista era o que pesava.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = Math.floor(s % 60);
  const mm = String(m).padStart(h ? 2 : 1, "0"), ss = String(seg).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
const QUADRO = 1 / 30; // passo de "um quadro": 30 fps, o padrão de quase todo vídeo de celular e de redes
const VELOCIDADES = [0.25, 0.5, 1, 1.5, 2];

export function Visualizador({ anexos, inicial, onClose, linkDe, onSubstituir, onAbriu }: {
  anexos: Attachment[];
  inicial: number;
  onClose: () => void;
  linkDe: (a: Attachment) => string;
  onSubstituir?: (a: Attachment) => void;
  /** Chamado com a URL quando um arquivo SEM capa é aberto — para gerá-la uma vez. */
  onAbriu?: (a: Attachment, url: string) => void;
}) {
  const [i, setI] = useState(inicial);
  const a = anexos[Math.min(i, anexos.length - 1)];
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const tipo = a ? tipoDoArquivo(a.mime_type, a.name) : "outro";

  useEffect(() => {
    if (!a?.storage_path) return;
    let vivo = true;
    setUrl(null); setErro(null);
    urlAssinada(a.storage_path).then((u) => { if (vivo) { setUrl(u); if (!a.poster_path) onAbriu?.(a, u); } })
      .catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [a?.id, a?.storage_path]); // eslint-disable-line react-hooks/exhaustive-deps

  const ir = useCallback((d: number) => setI((x) => (x + d + anexos.length) % anexos.length), [anexos.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("[data-player]")) return; // dentro do vídeo, ← → são do vídeo
      if (e.key === "ArrowRight" && anexos.length > 1) ir(1);
      if (e.key === "ArrowLeft" && anexos.length > 1) ir(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ir, anexos.length]);

  const baixar = async () => {
    if (!a?.storage_path) return;
    try { window.location.href = await urlAssinada(a.storage_path, { baixar: a.name }); }
    catch (e) { toast.error((e as Error).message); }
  };
  const copiar = async () => {
    await navigator.clipboard.writeText(linkDe(a));
    toast.success("Link copiado — ele continua valendo mesmo se o arquivo for substituído.");
  };

  if (!a) return null;
  const Bt = ({ on, titulo, children }: { on: () => void; titulo: string; children: React.ReactNode }) => (
    <button type="button" onClick={on} title={titulo} className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md text-sm text-white/80 hover:text-white hover:bg-white/10">{children}</button>
  );

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black" />
        <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-0 z-[70] flex flex-col text-white focus:outline-none">
          <FecharComVoltar />
          <div className="flex items-center gap-2 px-3 sm:px-4 h-14 shrink-0 border-b border-white/10">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-sm font-semibold truncate">{a.name}</DialogPrimitive.Title>
              <p className="text-xs text-white/60 truncate">
                {ROTULO_TIPO[tipo]}{a.tamanho ? ` · ${tamanhoLegivel(a.tamanho)}` : ""}
                {anexos.length > 1 ? ` · ${i + 1} de ${anexos.length}` : ""}
                {a.atualizado_em ? ` · substituído em ${new Date(a.atualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
              </p>
            </div>
            {onSubstituir && <Bt titulo="Substituir por outra versão" on={() => onSubstituir(a)}><RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Substituir</span></Bt>}
            <Bt titulo="Copiar link" on={copiar}><Link2 className="h-4 w-4" /><span className="hidden sm:inline">Copiar link</span></Bt>
            <Bt titulo="Baixar o original" on={baixar}><Download className="h-4 w-4" /><span className="hidden sm:inline">Baixar</span></Bt>
            <DialogPrimitive.Close className="h-9 w-9 inline-flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10" title="Fechar (Esc)"><X className="h-5 w-5" /></DialogPrimitive.Close>
          </div>

          <div className="relative flex-1 min-h-0 flex items-center justify-center">
            {anexos.length > 1 && (
              <>
                <button onClick={() => ir(-1)} title="Anterior (←)" className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><ChevronLeft className="h-6 w-6" /></button>
                <button onClick={() => ir(1)} title="Próximo (→)" className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><ChevronRight className="h-6 w-6" /></button>
              </>
            )}
            {erro ? (
              <p className="text-sm text-white/70">{erro}</p>
            ) : !url ? (
              <Loader2 className="h-8 w-8 animate-spin text-white/60" />
            ) : tipo === "video" ? (
              <PlayerVideo key={a.id} src={url} tamanho={a.tamanho} onBaixar={baixar} />
            ) : tipo === "imagem" ? (
              <VerImagem key={a.id} src={url} nome={a.name} />
            ) : tipo === "pdf" ? (
              <iframe key={a.id} src={url} title={a.name} className="w-full h-full bg-white" />
            ) : tipo === "audio" ? (
              <div className="flex flex-col items-center gap-4"><Music className="h-16 w-16 text-white/50" /><audio key={a.id} src={url} controls autoPlay className="w-[min(90vw,480px)]" /></div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-white/70">
                <FileText className="h-16 w-16" />
                <p className="text-sm">Este tipo de arquivo não tem pré-visualização.</p>
                <button onClick={baixar} className="h-9 px-4 rounded-md bg-white/15 hover:bg-white/25 text-sm text-white">Baixar</button>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
function PlayerVideo({ src, tamanho, onBaixar }: { src: string; tamanho: number | null | undefined; onBaixar: () => void }) {
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
        <p className="text-sm text-white/80">Este navegador não consegue reproduzir este vídeo — é comum em <b>.MOV gravado no iPhone</b> (formato HEVC). O arquivo está inteiro: baixe para assistir, ou abra no Safari.</p>
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
