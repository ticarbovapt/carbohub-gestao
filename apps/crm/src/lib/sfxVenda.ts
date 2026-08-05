// Som de caixa registradora na notificação de venda online.
//
// Arquivo em public/sounds/ e não em src/assets/: MP3 importado pelo bundler
// exigiria declaração de tipo (o repo já tropeça nisso com @/assets/*.png) e
// não ganharia nada — o áudio não precisa de hash nem de transformação.
const SRC = "/sounds/venda-online.mp3";

let el: HTMLAudioElement | null = null;
let liberado = false;

function audio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!el) {
    el = new Audio(SRC);
    el.preload = "auto";
    // A venda chega por realtime, fora de qualquer clique. Carregar antes evita
    // o atraso de rede entre o toast aparecer e o som sair.
    el.load();
  }
  return el;
}

// ⚠️ Navegador só toca áudio depois de um gesto do usuário na página.
//
// A notificação de venda dispara por Realtime — nunca dentro de um clique. Sem
// destravar antes, o play() é recusado e o som simplesmente não sai, sem erro
// visível. Mesma solução que o sfx.ts do CRM usa para os beeps do Kanban: no
// primeiro clique/tecla/toque da sessão, damos um play mudo e imediatamente
// pausamos — isso marca o elemento como "permitido" para os próximos play().
if (typeof window !== "undefined") {
  const liberar = () => {
    if (liberado) return;
    const a = audio();
    if (!a) return;
    const volumeAntigo = a.volume;
    a.volume = 0;
    a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
        a.volume = volumeAntigo;
        liberado = true;
      })
      .catch(() => { a.volume = volumeAntigo; });
  };
  window.addEventListener("pointerdown", liberar, { passive: true });
  window.addEventListener("keydown", liberar, { passive: true });
  window.addEventListener("touchstart", liberar, { passive: true });
}

/**
 * Toca o som da venda. Silencioso em caso de falha de propósito: som recusado
 * pelo navegador não pode derrubar a notificação, que é a informação de verdade.
 */
export function playVendaOnline() {
  const a = audio();
  if (!a) return;
  // Rebobina: duas vendas seguidas precisam soar duas vezes, e um play() em
  // áudio já tocando é ignorado.
  a.currentTime = 0;
  a.play().catch(() => {});
}
