import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/* ── Filtros no celular ───────────────────────────────────────────────────────
 * No celular as linhas de chips (situação, segmento, unidade, tipo…) e os
 * seletores empilhavam meia tela antes do conteúdo. Lá eles moram atrás deste
 * botão, num painel que sobe de baixo; no computador continuam na tela (quem
 * usa escolhe o que esconder com `hidden md:…` nas próprias linhas).
 * O número no botão diz quantos filtros estão ligados — filtro escondido que
 * está valendo e ninguém vê é como a lista "some" sem motivo. */
export function FiltrosCelular({ ativos, children }: { ativos: number; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className={`md:hidden inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium ${
          ativos > 0 ? "border-carbo-green/50 bg-carbo-green/10 text-carbo-green" : "border-input text-muted-foreground"}`}>
        <SlidersHorizontal className="h-4 w-4" />
        Filtros
        {ativos > 0 && (
          <span className="rounded-full bg-carbo-green px-1.5 text-[11px] font-semibold leading-5 text-white">{ativos}</span>
        )}
      </button>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4 pb-[env(safe-area-inset-bottom)]">{children}</div>
          <button type="button" onClick={() => setAberto(false)}
            className="mt-5 h-10 w-full rounded-md bg-carbo-green text-sm font-semibold text-white">
            Ver resultados
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* Indicadores numa faixa que ROLA DE LADO no celular (em vez de três linhas de
 * cartões), e na grade de sempre do `md` para cima. */
export const FAIXA_KPI_CELULAR =
  "flex gap-2 overflow-x-auto snap-x snap-mandatory scroll-px-4 -mx-4 px-4 pb-1 [&>*]:min-w-[44%] [&>*]:shrink-0 [&>*]:snap-start " +
  "md:mx-0 md:px-0 md:pb-0 md:scroll-px-0 md:overflow-visible md:[&>*]:min-w-0 md:[&>*]:shrink";
