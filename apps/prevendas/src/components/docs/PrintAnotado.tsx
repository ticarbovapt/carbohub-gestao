import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Caixa } from "@/docs/tipos";
import { MARCADORES } from "@/docs/marcadores";

// Print de tela com marcadores numerados SOBRE a imagem. As caixas vêm em %
// (MARCADORES, gerado pelo harness medindo o elemento de verdade), então o
// marcador acompanha a imagem em qualquer largura — inclusive no celular.
//
// `ativo` liga o destaque do item que a pessoa está lendo (hover na lista).
function Marcadores({ chave, ativo, mostrar }: { chave: string; ativo: number | null; mostrar: number[] }) {
  const caixas = MARCADORES[chave] ?? {};
  return (
    <>
      {mostrar.map((n) => {
        const c: Caixa | undefined = caixas[n];
        if (!c) return null;
        const on = ativo === n;
        return (
          <div key={n} className="pointer-events-none absolute"
            style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%` }}>
            <div className={`absolute -inset-1 rounded-lg border-2 transition-all ${on
              ? "border-rose-500 bg-rose-500/10 shadow-[0_0_0_4px_rgba(244,63,94,0.25)]"
              : "border-rose-500/80"}`} />
            <span className={`absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow ring-2 ring-white dark:ring-slate-900 transition-transform ${on ? "scale-125 bg-rose-600" : "bg-rose-500"}`}>
              {n}
            </span>
          </div>
        );
      })}
    </>
  );
}

export function PrintAnotado({ chave, legenda, ativo, mostrar }: {
  chave: string; legenda: string; ativo: number | null; mostrar: number[];
}) {
  const [zoom, setZoom] = useState(false);
  const src = `/docs/${chave}.jpg`;
  return (
    <figure className="my-3">
      <button type="button" onClick={() => setZoom(true)}
        className="group relative block w-full overflow-visible rounded-xl border bg-muted/30 text-left"
        aria-label={`Ampliar: ${legenda}`}>
        <div className="relative">
          <img src={src} alt={legenda} loading="lazy" className="block w-full rounded-xl" />
          <Marcadores chave={chave} ativo={ativo} mostrar={mostrar} />
        </div>
        <span className="absolute right-2 bottom-2 hidden items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] text-white group-hover:flex">
          <Maximize2 className="h-3 w-3" /> Ampliar
        </span>
      </button>
      <figcaption className="mt-1.5 text-xs text-muted-foreground">{legenda}</figcaption>
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-[min(96vw,1400px)] p-3">
          <DialogTitle className="text-sm">{legenda}</DialogTitle>
          <div className="relative mt-2 max-h-[80vh] overflow-auto">
            <div className="relative">
              <img src={src} alt={legenda} className="block w-full rounded-lg" />
              <Marcadores chave={chave} ativo={null} mostrar={mostrar} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </figure>
  );
}
