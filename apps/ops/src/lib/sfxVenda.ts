// Som de caixa registradora na notificação de venda online.
//
// Arquivo em public/sounds/ e não em src/assets/: MP3 importado pelo bundler
// exigiria declaração de tipo (o repo já tropeça nisso com @/assets/*.png) e
// não ganharia nada — o áudio não precisa de hash nem de transformação.
//
// Fonte da verdade deste arquivo: a raiz. Os seis apps têm cópia idêntica.
const SRC = "/sounds/venda-online.mp3";

let el: HTMLAudioElement | null = null;
let liberado = false;
let erroCarga: string | null = null;

function audio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!el) {
    el = new Audio(SRC);
    el.preload = "auto";
    el.volume = 1;
    // Um 404 no MP3 (deploy sem a pasta public/sounds, por exemplo) não aparece
    // em lugar nenhum: o play() rejeita e o catch engole. O listener de `error`
    // deixa isso visível no console em vez de virar "o som não funciona".
    el.addEventListener("error", () => {
      const code = el?.error?.code;
      erroCarga = `não carregou (${SRC}, MediaError ${code ?? "?"})`;
      console.warn("[venda-online] " + erroCarga);
    });
    el.load();
  }
  return el;
}

// ⚠️ Navegador só toca áudio depois de um gesto do usuário na página.
//
// A notificação de venda dispara por Realtime — nunca dentro de um clique. Sem
// destravar antes, o play() é recusado e o som simplesmente não sai, sem erro
// visível. Mesma solução que o sfx.ts do CRM usa para os beeps do Kanban: no
// primeiro clique/tecla/toque da sessão damos um play e pausamos na hora — isso
// marca o elemento como "permitido" para os próximos play().
//
// Usamos `muted` e não `volume = 0`: a política de autoplay do Chrome olha a
// propriedade `muted`, não o volume. Volume zero não é "mudo" para ela.
function destravar(): Promise<boolean> {
  const a = audio();
  if (!a) return Promise.resolve(false);
  if (liberado) return Promise.resolve(true);
  a.muted = true;
  return a
    .play()
    .then(() => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
      liberado = true;
      return true;
    })
    .catch((err: DOMException) => {
      a.muted = false;
      console.warn("[venda-online] áudio ainda travado:", err?.name, err?.message);
      return false;
    });
}

if (typeof window !== "undefined") {
  // Sem `once`: se a primeira tentativa falhar, o próximo clique tenta de novo.
  const opts: AddEventListenerOptions = { passive: true };
  window.addEventListener("pointerdown", () => { void destravar(); }, opts);
  window.addEventListener("keydown",     () => { void destravar(); }, opts);
  window.addEventListener("touchstart",  () => { void destravar(); }, opts);
}

/**
 * Toca o som da venda. Não derruba a notificação se o áudio falhar — a
 * informação é o toast; o som é o que faz alguém olhar. Mas a falha agora
 * aparece no console: silêncio sem explicação já custou uma investigação
 * inteira atrás do arquivo errado.
 */
export function playVendaOnline() {
  const a = audio();
  if (!a) return;
  // Rebobina: duas vendas seguidas precisam soar duas vezes, e um play() em
  // áudio já tocando é ignorado.
  a.currentTime = 0;
  a.muted = false;
  a.volume = 1;
  a.play().catch((err: DOMException) => {
    console.warn("[venda-online] não tocou:", err?.name, err?.message, erroCarga ?? "");
    // Recusado por falta de gesto: destrava e tenta uma vez só. Se o usuário
    // nunca clicou na página desde que abriu, não há o que fazer.
    if (err?.name === "NotAllowedError") {
      void destravar().then((ok) => { if (ok) a.play().catch(() => {}); });
    }
  });
}

/**
 * Diagnóstico manual, para quando "não tocou" e ninguém sabe por quê.
 * No console de qualquer app: `__somVenda.testar()` toca na hora (o clique no
 * console não conta como gesto, mas o da própria página conta) e
 * `__somVenda.estado()` diz se o arquivo carregou e se o áudio está liberado.
 */
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__somVenda = {
    testar: () => { playVendaOnline(); },
    estado: () => ({
      src: SRC,
      liberado,
      erroCarga,
      readyState: el?.readyState ?? "elemento ainda não criado",
      duracao: el?.duration ?? null,
    }),
  };
}
