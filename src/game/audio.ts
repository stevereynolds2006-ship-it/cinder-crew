let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(next: boolean) {
  muted = next;
}

export function isMuted() {
  return muted;
}

/** Call inside the first click or tap. Resume is synchronous with the gesture. */
export function unlockAudio() {
  const AudioCtx =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  if (!ctx) ctx = new AudioCtx({ latencyHint: "interactive" });
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(frequency: number, duration: number, type: OscillatorType, gain: number, slide = 0) {
  if (!ctx || muted || ctx.state !== "running") return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + slide), now + duration);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
  osc.onended = () => {
    osc.disconnect();
    amp.disconnect();
  };
}

export type Cue = "stoke" | "perfect" | "good" | "miss" | "graze" | "burn" | "redeem" | "kindle" | "bounty";

export function playCue(kind: Cue, combo = 0) {
  const lift = Math.min(8, Math.max(0, combo)) * 22;
  if (kind === "stoke") {
    tone(140, 0.18, "sawtooth", 0.06, -60);
    tone(320, 0.1, "square", 0.03);
  } else if (kind === "perfect") {
    tone(520 + lift, 0.16, "triangle", 0.07);
    tone(780 + lift, 0.22, "sine", 0.05);
  } else if (kind === "good") {
    tone(440 + lift * 0.4, 0.12, "triangle", 0.05);
  } else if (kind === "graze") {
    tone(210, 0.1, "triangle", 0.045, -30);
    tone(320, 0.08, "sine", 0.03);
  } else if (kind === "miss") {
    tone(110, 0.2, "sine", 0.05, -40);
  } else if (kind === "burn") {
    tone(180 + lift * 0.3, 0.22, "sawtooth", 0.05, 80);
    tone(90, 0.28, "triangle", 0.04);
  } else if (kind === "kindle") {
    tone(260, 0.12, "triangle", 0.04, 40);
  } else if (kind === "bounty") {
    tone(523, 0.1, "triangle", 0.06);
    tone(659, 0.12, "triangle", 0.05);
    tone(784, 0.18, "sine", 0.05);
  } else {
    tone(660, 0.1, "square", 0.04);
    tone(880, 0.14, "sine", 0.05);
  }
}
