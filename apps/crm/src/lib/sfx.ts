// Efeitos sonoros curtos via WebAudio (sem asset/lib). Usado no Kanban para
// confirmar a movimentação do card (encaixe) ou sinalizar erro.
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

// O AudioContext só inicia/retoma dentro de um gesto do usuário. O som do card
// dispara DEPOIS do round-trip no banco (fora do gesto), então "destravamos" o
// contexto no primeiro clique/tecla/toque — aí o beep async já toca normalmente.
if (typeof window !== "undefined") {
  const prime = () => { audioCtx(); };
  window.addEventListener("pointerdown", prime, { passive: true });
  window.addEventListener("keydown", prime, { passive: true });
  window.addEventListener("touchstart", prime, { passive: true });
}

function beep(freqs: number[], { dur = 0.09, type = "sine" as OscillatorType, gain = 0.07 } = {}) {
  const ac = audioCtx();
  if (!ac) return;
  // Agenda os osciladores só quando o contexto estiver de fato "running" — se
  // ainda estiver "suspended", agendar no currentTime congelado não toca.
  const render = () => {
    let t = ac.currentTime + 0.01;
    for (const f of freqs) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.value = f;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t); osc.stop(t + dur);
      t += dur * 0.9;
    }
  };
  if (ac.state === "suspended") ac.resume().then(render).catch(() => {});
  else render();
}

// "Encaixou" — duas notas ascendentes rápidas.
// gain = volume (escala Web Audio 0..1). 0.30 = audível sem ser estridente.
export function playMoveSuccess() { beep([587.33, 880], { dur: 0.1, type: "sine", gain: 0.5 }); }
// Erro — descida grave.
export function playMoveError() { beep([220, 155], { dur: 0.16, type: "square", gain: 0.5 }); }
