import confetti from "canvas-confetti";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function playCompletionSound() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const frequencies = [523.25, 659.25, 783.99];

  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + i * 0.07);
    gain.gain.linearRampToValueAtTime(0.25, now + i * 0.07 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.07);
    osc.stop(now + i * 0.07 + 0.4);
  });
}

export function playSkipSound() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const notes = [
    { freq: 311, start: 0, end: 0.25 },
    { freq: 293, start: 0.25, end: 0.5 },
    { freq: 277, start: 0.5, end: 0.75 },
    { freq: 233, start: 0.75, end: 1.6 },
  ];

  notes.forEach((note) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";

    osc.frequency.setValueAtTime(note.freq, now + note.start);
    if (note === notes[notes.length - 1]) {
      osc.frequency.setValueAtTime(note.freq, now + note.start);
      osc.frequency.linearRampToValueAtTime(note.freq * 0.7, now + note.end);
    }

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 5;
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(now + note.start);
    lfo.stop(now + note.end + 0.1);

    gain.gain.setValueAtTime(0, now + note.start);
    gain.gain.linearRampToValueAtTime(0.15, now + note.start + 0.03);
    gain.gain.setValueAtTime(0.15, now + note.end - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + note.end + 0.05);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now + note.start);
    osc.stop(now + note.end + 0.1);
  });
}

export function triggerConfetti() {
  confetti({
    particleCount: 80,
    spread: 60,
    origin: { y: 0.7 },
    colors: ["#5b4ff0", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"], // chart-1…5
    ticks: 150,
    gravity: 1.2,
    scalar: 0.9,
  });
}

export function showFrownyFace() {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:9999;pointer-events:none;";

  const face = document.createElement("div");
  face.style.cssText =
    "width:120px;height:120px;border-radius:50%;border:6px solid #EF4444;position:relative;opacity:0;transition:all 0.3s ease-out;transform:scale(0.5);";

  const eyes = document.createElement("div");
  eyes.style.cssText =
    "position:absolute;top:30px;left:50%;transform:translateX(-50%);display:flex;gap:24px;";
  eyes.innerHTML =
    '<div style="width:12px;height:12px;border-radius:50%;background:#EF4444;"></div><div style="width:12px;height:12px;border-radius:50%;background:#EF4444;"></div>';

  const mouth = document.createElement("div");
  mouth.style.cssText =
    "position:absolute;bottom:25px;left:50%;transform:translateX(-50%);width:40px;height:20px;border-top:5px solid #EF4444;border-radius:50% 50% 0 0;";

  face.appendChild(eyes);
  face.appendChild(mouth);
  overlay.appendChild(face);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    face.style.opacity = "0.85";
    face.style.transform = "scale(1)";
    setTimeout(() => {
      face.style.opacity = "0";
      face.style.transform = "scale(0.8)";
      setTimeout(() => overlay.remove(), 300);
    }, 700);
  });
}
