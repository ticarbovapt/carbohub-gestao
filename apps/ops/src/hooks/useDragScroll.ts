import { useEffect, useRef } from "react";

// Auto-scroll durante o drag NATIVO (HTML5) de um kanban: quando o card chega
// perto da borda do container rolável, a área desliza sozinha — facilita pular
// várias colunas. Funciona nos dois eixos (horizontal no desktop, vertical no
// mobile). Retorna um ref para pôr no container que tem overflow-x/y-auto.
export function useDragScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const EDGE = 90;   // px a partir da borda que ativam o scroll
    const MAX = 24;    // velocidade máxima (px por frame)
    let vx = 0, vy = 0, raf = 0;

    const step = () => {
      if (vx) el.scrollLeft += vx;
      if (vy) el.scrollTop += vy;
      raf = vx || vy ? requestAnimationFrame(step) : 0;
    };
    const ensure = () => { if (!raf && (vx || vy)) raf = requestAnimationFrame(step); };
    // Quanto mais perto da borda, mais rápido (0 na entrada da zona → MAX na borda).
    const ramp = (distFromEdge: number) => Math.max(0, Math.min(1, (EDGE - distFromEdge) / EDGE)) * MAX;

    const onDragOver = (e: DragEvent) => {
      const r = el.getBoundingClientRect();
      vx = 0; vy = 0;
      if (el.scrollWidth > el.clientWidth) {
        if (e.clientX < r.left + EDGE) vx = -ramp(e.clientX - r.left);
        else if (e.clientX > r.right - EDGE) vx = ramp(r.right - e.clientX);
      }
      if (el.scrollHeight > el.clientHeight) {
        if (e.clientY < r.top + EDGE) vy = -ramp(e.clientY - r.top);
        else if (e.clientY > r.bottom - EDGE) vy = ramp(r.bottom - e.clientY);
      }
      ensure();
    };
    const stop = () => { vx = 0; vy = 0; if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", stop);
    // dragend não borbulha até o container quando o card sai dele — ouve global.
    document.addEventListener("dragend", stop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("drop", stop);
      document.removeEventListener("dragend", stop);
      stop();
    };
  }, []);

  return ref;
}
