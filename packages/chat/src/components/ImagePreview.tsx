import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { toast } from "sonner";
import { X, Crop, Check, Send, Plus, Loader2, RotateCcw, ImageOff } from "lucide-react";
import { comprimirImagem, formatarBytes, ALVO_BYTES } from "../lib/imagem";

// ─────────────────────────────────────────────────────────────────────────────
// Pré-visualização de imagem antes de enviar (estilo WhatsApp).
//
// Existe por dois motivos, e o segundo é o que importa mais:
//
//  1. Conferir o que foi colado. Print colado é invisível: sem ver, manda-se
//     a janela errada para o grupo errado.
//  2. TRATAR o arquivo antes de subir. Print 4K em PNG passa de 8 MB, e o
//     custo não é de quem envia (uma vez) e sim de quem lê (toda vez, por
//     pessoa, inclusive no 4G). O tratamento acontece aqui, no confirmar.
//
// Só há UMA ferramenta de edição: recorte. Filtro, texto e desenho ficam de
// fora de propósito — cada um seria um caminho a mais para manter num chat
// interno que existe para resolver problema, não para editar foto.
// ─────────────────────────────────────────────────────────────────────────────

export interface ImagemPendente {
  id: string;
  arquivo: File;
  url: string;
}

interface Props {
  itens: ImagemPendente[];
  /** Legenda inicial (o que já estava digitado no campo). */
  legendaInicial?: string;
  onCancelar: () => void;
  onAdicionarMais: () => void;
  onRemover: (id: string) => void;
  /** Recebe os arquivos JÁ tratados e a legenda. */
  onEnviar: (arquivos: File[], legenda: string) => void;
}

export function ImagePreview({
  itens, legendaInicial = "", onCancelar, onAdicionarMais, onRemover, onEnviar,
}: Props) {
  const [ativo, setAtivo] = useState(0);
  const [legenda, setLegenda] = useState(legendaInicial);
  const [recortando, setRecortando] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  // Recorte confirmado por imagem — só é aplicado no envio, para o usuário
  // poder trocar de imagem e voltar sem perder o que ajustou.
  const [recortes, setRecortes] = useState<Record<string, Area>>({});
  const [enviando, setEnviando] = useState(false);

  const atual = itens[Math.min(ativo, itens.length - 1)];

  // Índice fora da faixa quando se remove a última da lista.
  useEffect(() => { if (ativo > itens.length - 1) setAtivo(Math.max(0, itens.length - 1)); }, [itens.length, ativo]);

  // Trocar de imagem zera o enquadramento da ferramenta — o recorte já
  // confirmado fica guardado em `recortes`.
  useEffect(() => { setRecortando(false); setCrop({ x: 0, y: 0 }); setZoom(1); setArea(null); }, [atual?.id]);

  useEffect(() => {
    const onTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); recortando ? setRecortando(false) : onCancelar(); }
    };
    window.addEventListener("keydown", onTecla);
    return () => window.removeEventListener("keydown", onTecla);
  }, [recortando, onCancelar]);

  const aoRecortar = useCallback((_a: Area, pixels: Area) => setArea(pixels), []);

  const confirmarRecorte = () => {
    if (atual && area) setRecortes((r) => ({ ...r, [atual.id]: area }));
    setRecortando(false);
  };

  const desfazerRecorte = () => {
    if (!atual) return;
    setRecortes((r) => { const c = { ...r }; delete c[atual.id]; return c; });
  };

  const enviar = async () => {
    if (enviando || itens.length === 0) return;
    setEnviando(true);
    try {
      const tratados: File[] = [];
      let antes = 0, depois = 0;
      for (const item of itens) {
        const r = await comprimirImagem(item.arquivo, { recorte: recortes[item.id] ?? null });
        tratados.push(r.arquivo);
        antes += r.bytesAntes; depois += r.bytesDepois;
      }
      // Só vale contar quando a economia é perceptível — avisar "poupou 3 KB"
      // é ruído.
      if (antes - depois > 300 * 1024) {
        toast.success(`Imagens otimizadas: ${formatarBytes(antes)} → ${formatarBytes(depois)}`);
      }
      onEnviar(tratados, legenda.trim());
    } catch (e) {
      toast.error((e as Error)?.message || "Não foi possível preparar a imagem.");
      setEnviando(false);
    }
  };

  const pesoTotal = useMemo(() => itens.reduce((n, i) => n + i.arquivo.size, 0), [itens]);
  const vaiComprimir = pesoTotal > ALVO_BYTES;

  if (!atual) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/92 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label="Pré-visualização da imagem"
    >
      {/* ── Barra superior ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 text-white">
        <button onClick={onCancelar} aria-label="Cancelar envio"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{atual.arquivo.name}</p>
          <p className="text-xs text-white/60">
            {formatarBytes(atual.arquivo.size)}
            {recortes[atual.id] && " · recortada"}
            {itens.length > 1 && ` · ${ativo + 1} de ${itens.length}`}
          </p>
        </div>

        {recortando ? (
          <>
            <button onClick={() => setRecortando(false)}
              className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10">Cancelar</button>
            <button onClick={confirmarRecorte}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-white/90">
              <Check className="h-4 w-4" /> Aplicar
            </button>
          </>
        ) : (
          <>
            {recortes[atual.id] && (
              <button onClick={desfazerRecorte} title="Desfazer recorte"
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10">
                <RotateCcw className="h-5 w-5" />
              </button>
            )}
            <button onClick={() => setRecortando(true)} title="Recortar"
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10">
              <Crop className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* ── Palco ──────────────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        {recortando ? (
          <Cropper
            image={atual.url}
            crop={crop}
            zoom={zoom}
            // Sem proporção fixa: print não tem formato canônico, e forçar
            // 1:1 ou 16:9 obrigaria a cortar o que interessa.
            aspect={undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={aoRecortar}
            restrictPosition={false}
            showGrid
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4">
            <img
              src={atual.url}
              alt={atual.arquivo.name}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            />
          </div>
        )}
      </div>

      {recortando && (
        <div className="flex items-center gap-3 px-6 py-3 text-white">
          <span className="text-xs text-white/60">Zoom</span>
          <input
            type="range" min={1} max={4} step={0.01} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom do recorte"
            className="h-1 flex-1 cursor-pointer accent-white"
          />
        </div>
      )}

      {/* ── Rodapé: miniaturas, legenda e envio ───────────────────────── */}
      {!recortando && (
        <div className="border-t border-white/10 px-4 py-3">
          {itens.length > 1 && (
            <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
              {itens.map((it, i) => (
                <div key={it.id} className="relative shrink-0">
                  <button
                    onClick={() => setAtivo(i)}
                    aria-label={`Ver ${it.arquivo.name}`}
                    className={`h-14 w-14 overflow-hidden rounded-lg border-2 transition-colors ${
                      i === ativo ? "border-carbo-green" : "border-white/20 hover:border-white/50"}`}
                  >
                    <img src={it.url} alt="" className="h-full w-full object-cover" />
                  </button>
                  <button
                    onClick={() => onRemover(it.id)}
                    aria-label={`Remover ${it.arquivo.name}`}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-white hover:bg-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={onAdicionarMais}
                aria-label="Adicionar mais imagens"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-white/25 text-white/60 hover:border-white/50 hover:text-white"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {itens.length === 1 && (
              <button
                onClick={onAdicionarMais}
                aria-label="Adicionar mais imagens"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 text-white/70 hover:border-white/50 hover:text-white"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
            <input
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              placeholder="Legenda…"
              aria-label="Legenda da imagem"
              autoFocus
              className="h-11 flex-1 rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-carbo-green"
            />
            <button
              onClick={enviar}
              disabled={enviando}
              aria-label="Enviar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-carbo-green text-black disabled:opacity-60"
            >
              {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>

          {/* Dito ANTES de enviar, não depois: quem manda precisa saber que a
              imagem vai ser reduzida, senão acha que o sistema estragou. */}
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/45">
            <ImageOff className="h-3 w-3 shrink-0" />
            {vaiComprimir
              ? "Imagens grandes são reduzidas antes do envio para não pesar o carregamento."
              : "Enter envia · Esc cancela"}
          </p>
        </div>
      )}
    </div>
  );
}
