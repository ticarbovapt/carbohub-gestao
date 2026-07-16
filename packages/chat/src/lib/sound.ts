// Som de "mensagem recebida" — dois toques suaves (E5 → B5) via Web Audio,
// sem arquivo de áudio. Silencioso se o navegador bloquear (autoplay/policy).
let ctx: AudioContext | null = null;

export function playMessageChime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const notes: [number, number][] = [[659.25, 0], [987.77, 0.085]]; // E5, B5
    for (const [freq, t] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = now + t;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      osc.start(start);
      osc.stop(start + 0.36);
    }
  } catch {
    /* sem áudio disponível — ignora */
  }
}
