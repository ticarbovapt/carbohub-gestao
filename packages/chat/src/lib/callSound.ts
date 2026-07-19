// Toques de chamada via WebAudio (sem asset/lib). Ringback = quem liga ("tuu…
// tuu…"); ring = quem recebe (bip duplo mais urgente). Repetem até parar.
let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

// Destrava o contexto no primeiro gesto (autoplay policy) — o ring de entrada
// muitas vezes chega sem gesto; ao menos depois de qualquer clique já toca.
if (typeof window !== "undefined") {
  const prime = () => audioCtx();
  window.addEventListener("pointerdown", prime, { passive: true });
  window.addEventListener("keydown", prime, { passive: true });
  window.addEventListener("touchstart", prime, { passive: true });
}

function beep(freq: number, dur: number, gain = 0.06) {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.setValueAtTime(gain, t + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(ac.destination);
  osc.start(t); osc.stop(t + dur + 0.02);
}

let ringbackTimer: number | null = null;
let ringTimer: number | null = null;

export function playRingback() {
  stopRingback();
  const play = () => beep(425, 1.0, 0.05);
  play();
  ringbackTimer = window.setInterval(play, 3000);
}
export function stopRingback() {
  if (ringbackTimer != null) { window.clearInterval(ringbackTimer); ringbackTimer = null; }
}

export function playRing() {
  stopRing();
  const play = () => { beep(880, 0.25, 0.07); window.setTimeout(() => beep(880, 0.25, 0.07), 350); };
  play();
  ringTimer = window.setInterval(play, 2000);
}
export function stopRing() {
  if (ringTimer != null) { window.clearInterval(ringTimer); ringTimer = null; }
}

export function stopAllCallSounds() { stopRingback(); stopRing(); }
