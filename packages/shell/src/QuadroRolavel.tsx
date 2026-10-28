import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Move } from "lucide-react";

// O quadro (kanban) que rola para o lado — o MESMO em todos os quadros dos oito
// apps (pedido do dono do processo, 28/10/2026: "padronizar, todos sem
// exceção"). Quadro novo: embrulhe o contêiner que rola com ele. Três jeitos de
// andar, além da barra de baixo:
//
//   1. SETAS nas bordas: passar o mouse rola (acelerando), clicar pula ~uma
//      tela. Só aparecem do lado para onde ainda há o que ver, e só com mouse
//      — no celular o dedo já arrasta o quadro.
//   2. BOTÃO DO MEIO ("bolinha"): o do navegador não funcionava em cima de uma
//      coluna, porque a coluna rola na VERTICAL e ele a escolhia no lugar do
//      quadro. Aqui o movimento lateral rola o QUADRO e o vertical, a coluna em
//      que se clicou. Segurando, para ao soltar; clique rápido fixa até o
//      próximo clique (como o do navegador). Esc também para.
//   3. ARRASTAR com o botão esquerdo o que não é card arrastável nem controle.
//      Se o arraste começou num card só clicável, o clique de soltar é
//      engolido — senão o card abriria ao fim de cada pan.
//
// ⚠️ Arrastar CARD continua sendo do dnd-kit: o pan ignora card arrastável
// (`aria-roledescription` do dnd-kit, `draggable`, ou `[data-card]` para quem
// quiser marcar à mão). As setas recebem o ponteiro durante o arraste se o
// DragOverlay for `pointer-events-none`, e levar o card até a borda rola o
// quadro. ⚠️ A coluna rolada pelo botão do meio é a primeira com rolagem
// vertical acima do clique (`[data-coluna-rola]` força uma).
// ⚠️ Quadro com arraste NATIVO do navegador (HTML5 `draggable`, o md) não
// dispara pointer events durante o arraste — por isso as setas também andam
// com `dragenter`/`dragleave`.
//
// ⚠️ Arquivo IDÊNTICO no `packages/shell` (carbohub-gestao) e no
// `apps/micro/src/shared/ui` (carbohub-produtos). Mudou um, copie o outro.

const NAO_ARRASTA =
  "[data-card], [aria-roledescription], [draggable='true'], button, a, input, textarea, select, label, " +
  "[role='combobox'], [role='button'], [role='checkbox'], [role='switch'], [contenteditable='true']";

function colunaQueRola(alvo: HTMLElement, quadro: HTMLElement): HTMLElement | null {
  const marcada = alvo.closest<HTMLElement>("[data-coluna-rola]");
  if (marcada && quadro.contains(marcada)) return marcada;
  for (let el: HTMLElement | null = alvo; el && el !== quadro; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return null;
}

export function QuadroRolavel({ className, children, envolve, rolaRef, onScroll, style }: {
  className: string;
  children: ReactNode;
  /** Classes do envoltório (posicionado). Padrão: ocupa a altura que sobra. */
  envolve?: string;
  // ⚠️ Tipos ESTRUTURAIS, não os do React: os apps têm cópias próprias de
  // `@types/react` e `CSSProperties`/`Ref` nominais falham no app (o mesmo
  // caso do `SupabaseLite` da tarja).
  /** O contêiner que rola, para quem precisa dele (ir até uma coluna etc.). */
  rolaRef?: ((el: HTMLDivElement | null) => void) | { current: HTMLDivElement | null } | null;
  onScroll?: () => void;
  style?: object;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const prender = useCallback((el: HTMLDivElement | null) => {
    ref.current = el;
    if (typeof rolaRef === "function") rolaRef(el);
    else if (rolaRef) rolaRef.current = el;
  }, [rolaRef]);
  const [lados, setLados] = useState({ esq: false, dir: false });
  const [ponto, setPonto] = useState<{ x: number; y: number } | null>(null);

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const esq = el.scrollLeft > 2;
    const dir = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setLados((p) => (p.esq === esq && p.dir === dir ? p : { esq, dir }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    for (const filho of Array.from(el.children)) ro.observe(filho);
    return () => { el.removeEventListener("scroll", medir); ro.disconnect(); };
  }, [medir]);

  // ── 1. setas ───────────────────────────────────────────────────────────────
  const laco = useRef<number | null>(null);
  const parar = useCallback(() => {
    if (laco.current != null) cancelAnimationFrame(laco.current);
    laco.current = null;
  }, []);
  useEffect(() => {
    // Arraste nativo que termina em cima da seta não dispara `dragleave`.
    window.addEventListener("dragend", parar);
    return () => { window.removeEventListener("dragend", parar); parar(); };
  }, [parar]);

  const rolarContinuo = (sentido: 1 | -1) => {
    parar();
    const inicio = performance.now();
    const passo = (t: number) => {
      const el = ref.current;
      if (!el) return;
      // Começa devagar (dá para mirar uma coluna) e acelera segurando ali.
      const v = Math.min(22, 5 + (t - inicio) / 45);
      const antes = el.scrollLeft;
      el.scrollLeft += sentido * v;
      if (el.scrollLeft === antes) { laco.current = null; return; }
      laco.current = requestAnimationFrame(passo);
    };
    laco.current = requestAnimationFrame(passo);
  };
  const pular = (sentido: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: sentido * el.clientWidth * 0.8, behavior: "smooth" });
  };

  // ── 2. botão do meio ───────────────────────────────────────────────────────
  const iniciarAuto = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    e.preventDefault(); // sem isto o navegador abre a "bolinha" dele por cima
    const coluna = colunaQueRola(e.target as HTMLElement, el);
    const a = { ox: e.clientX, oy: e.clientY, mx: e.clientX, my: e.clientY, moveu: false, t0: performance.now() };
    setPonto({ x: e.clientX, y: e.clientY });
    document.body.style.cursor = "all-scroll";

    let raf = 0;
    const passo = () => {
      const vel = (d: number) => (Math.abs(d) <= 10 ? 0 : Math.sign(d) * (Math.abs(d) - 10) * 0.12);
      el.scrollLeft += vel(a.mx - a.ox);
      if (coluna) coluna.scrollTop += vel(a.my - a.oy);
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);

    const mover = (ev: MouseEvent) => {
      a.mx = ev.clientX; a.my = ev.clientY;
      if (Math.hypot(a.mx - a.ox, a.my - a.oy) > 8) a.moveu = true;
    };
    const soltar = (ev: MouseEvent) => {
      if (ev.button !== 1) return;
      // Segurou e moveu ⇒ para ao soltar. Clique rápido ⇒ fica até o próximo clique.
      if (a.moveu || performance.now() - a.t0 > 400) encerrar();
    };
    const clicar = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); encerrar(); };
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") encerrar(); };
    const semClique = (ev: MouseEvent) => { if (ev.button === 1) ev.preventDefault(); };
    function encerrar() {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", soltar);
      window.removeEventListener("mousedown", clicar, true);
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("blur", encerrar);
      setTimeout(() => window.removeEventListener("auxclick", semClique, true), 0);
      document.body.style.cursor = "";
      setPonto(null);
    }
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
    window.addEventListener("keydown", tecla);
    window.addEventListener("blur", encerrar);
    window.addEventListener("auxclick", semClique, true);
    // No próximo tique: registrado agora, pegaria este mesmo clique.
    setTimeout(() => window.addEventListener("mousedown", clicar, true), 0);
  };

  // ── 3. arrastar o vazio ────────────────────────────────────────────────────
  const iniciarPan = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(NAO_ARRASTA)) return;
    const el = ref.current;
    if (!el) return;
    const x0 = e.clientX;
    const s0 = el.scrollLeft;
    let ativo = false;
    const mover = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!ativo) {
        if (Math.abs(dx) < 5) return;
        ativo = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
      el.scrollLeft = s0 - dx;
    };
    const fim = () => {
      if (ativo) {
        const engole = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); };
        window.addEventListener("click", engole, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", engole, true), 0);
      }
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
  };

  return (
    <div className={envolve ?? "relative flex-1 min-h-0 flex flex-col"}>
      <div
        ref={prender}
        className={className}
        style={style as never}
        onScroll={onScroll}
        onMouseDown={(e) => { if (e.button === 1) iniciarAuto(e); }}
        onPointerDown={iniciarPan}
      >
        {children}
      </div>
      <Seta lado="esq" visivel={lados.esq} onEntra={() => rolarContinuo(-1)} onSai={parar} onClique={() => pular(-1)} />
      <Seta lado="dir" visivel={lados.dir} onEntra={() => rolarContinuo(1)} onSai={parar} onClique={() => pular(1)} />
      {ponto && (
        <div
          className="fixed z-50 pointer-events-none h-8 w-8 -ml-4 -mt-4 rounded-full border border-border bg-card/90 shadow-md flex items-center justify-center text-muted-foreground"
          style={{ left: ponto.x, top: ponto.y }}
        >
          <Move className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function Seta({ lado, visivel, onEntra, onSai, onClique }: {
  lado: "esq" | "dir";
  visivel: boolean;
  onEntra: () => void;
  onSai: () => void;
  onClique: () => void;
}) {
  const esq = lado === "esq";
  const Icone = esq ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={esq ? "Rolar para a esquerda" : "Rolar para a direita"}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") onEntra(); }}
      onPointerLeave={onSai}
      onDragEnter={onEntra}
      onDragLeave={onSai}
      onDrop={onSai}
      onClick={onClique}
      className={`group absolute inset-y-0 z-20 w-11 hidden [@media(hover:hover)]:flex items-center transition-opacity duration-200 ${
        esq ? "left-0 justify-start pl-1 bg-gradient-to-r rounded-l-2xl" : "right-0 justify-end pr-1 bg-gradient-to-l rounded-r-2xl"
      } from-background/80 to-transparent ${visivel ? "opacity-60 hover:opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      <span className="h-9 w-9 rounded-full border border-border bg-card/90 shadow-md flex items-center justify-center text-foreground transition-transform group-hover:scale-110">
        <Icone className="h-5 w-5" />
      </span>
    </button>
  );
}
