import { heatMultiplier, scorchHeat, type Grade } from "./economy.ts";

export const WHITE_HEAT_AT = 3;
export const SCORE_CAP = 500_000;
export const STRIKE_LIMIT = 3;
export const BLAZE_EVERY = 4;

export const BOUNTIES = [
  { id: "perfects", label: "Land 3 perfect stamps", reward: 450, goal: 3 },
  { id: "scorch", label: "Burn a relic for heat", reward: 280, goal: 1 },
  { id: "blaze", label: "Stamp inside a blaze sweep", reward: 360, goal: 1 },
  { id: "kindle", label: "Kindle three crew", reward: 320, goal: 3 },
] as const;

export type BountyId = (typeof BOUNTIES)[number]["id"];
export type StampKind = "perfect" | "good" | "graze" | "miss";

export type ShiftState = {
  combo: number;
  strikes: number;
  score: number;
  bountyIndex: number;
  bountyProgress: number;
  cracked: boolean;
};

export type ShiftTick = {
  state: ShiftState;
  points: number;
  cleared: string | null;
};

const CALLSIGN = /^[A-Za-z0-9](?:[A-Za-z0-9 ]{0,14}[A-Za-z0-9])?$/;

export function parseCallsign(raw: string): string {
  const handle = raw.trim().replace(/\s+/g, " ");
  if (handle.length < 2 || handle.length > 16 || !CALLSIGN.test(handle)) {
    throw new Error("Callsign needs 2–16 letters or numbers.");
  }
  return handle;
}

export function suggestCallsign(label: string): string {
  const cleaned = label.replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 16).trim();
  try {
    return parseCallsign(cleaned);
  } catch {
    return "Cinder";
  }
}

export function bountyFor(index: number) {
  return BOUNTIES[index % BOUNTIES.length] ?? BOUNTIES[0];
}

export function isBlazeStoke(completedStokes: number): boolean {
  return (completedStokes + 1) % BLAZE_EVERY === 0;
}

export function classifyStamp(needle: number, windowWidth: number): StampKind {
  const distance = Math.abs(needle - 0.5);
  const half = Math.max(0, windowWidth) / 2;
  if (half <= 0) return "miss";
  if (distance <= half * 0.35) return "perfect";
  if (distance <= half) return "good";
  if (distance <= half * 1.45) return "graze";
  return "miss";
}

/** Extra burn heat once a combo is running hot. Never changes the relic. */
export function heatBonus(combo: number): number {
  if (combo < WHITE_HEAT_AT) return 1;
  return 1 + (combo - WHITE_HEAT_AT + 1) * 0.25;
}

export function tunedHeat(reward: bigint, grade: Grade, combo: number): number {
  return scorchHeat(reward, grade) * heatBonus(combo);
}

export function burnHeatLabel(grade: Grade, combo: number): string {
  const mult = heatMultiplier(grade) * heatBonus(combo);
  const rounded = Math.round(mult * 10) / 10;
  const text = Number.isInteger(rounded) ? `${rounded}× heat` : `${rounded.toFixed(1)}× heat`;
  return combo >= WHITE_HEAT_AT ? `${text} · white heat` : text;
}

export function stampPoints(stamp: StampKind, comboAfter: number, blaze: boolean): number {
  const base = stamp === "perfect" ? 150 : stamp === "good" ? 70 : stamp === "graze" ? 25 : 10;
  const mult = 1 + Math.max(0, comboAfter - 1) * 0.2;
  return Math.round(base * mult * (blaze ? 1.6 : 1));
}

export function scorchPoints(heatGained: number, combo: number): number {
  if (!Number.isFinite(heatGained) || heatGained <= 0) return 0;
  return Math.round(35 * heatGained * (combo >= WHITE_HEAT_AT ? 1.5 : 1));
}

function cap(score: number): number {
  return Math.max(0, Math.min(SCORE_CAP, Math.round(score)));
}

function grant(state: ShiftState, id: BountyId): { state: ShiftState; cleared: string | null; bonus: number } {
  const bounty = bountyFor(state.bountyIndex);
  if (state.cracked || bounty.id !== id) return { state, cleared: null, bonus: 0 };
  const progress = state.bountyProgress + 1;
  if (progress < bounty.goal) return { state: { ...state, bountyProgress: progress }, cleared: null, bonus: 0 };
  return {
    state: {
      ...state,
      bountyIndex: state.bountyIndex + 1,
      bountyProgress: 0,
      score: cap(state.score + bounty.reward),
    },
    cleared: bounty.label,
    bonus: bounty.reward,
  };
}

export function applyStamp(state: ShiftState, stamp: StampKind, blaze: boolean): ShiftTick {
  const combo = Math.min(
    99,
    stamp === "perfect" ? state.combo + 1 : stamp === "graze" ? Math.max(0, state.combo - 1) : stamp === "miss" ? 0 : state.combo,
  );
  const strikes = stamp === "miss" ? state.strikes + 1 : stamp === "perfect" ? Math.max(0, state.strikes - 1) : state.strikes;
  const points = stampPoints(stamp, combo, blaze);
  let next: ShiftState = {
    ...state,
    combo,
    strikes,
    score: cap(state.score + points),
    cracked: strikes >= STRIKE_LIMIT,
  };
  let cleared: string | null = null;
  let bonus = 0;
  if (stamp === "perfect") {
    const bounty = grant(next, "perfects");
    next = bounty.state;
    cleared = bounty.cleared;
    bonus += bounty.bonus;
  }
  if (blaze && stamp !== "miss") {
    const bounty = grant(next, "blaze");
    next = bounty.state;
    cleared = cleared ?? bounty.cleared;
    bonus += bounty.bonus;
  }
  return { state: next, points: points + bonus, cleared };
}

export function applyScorch(state: ShiftState, heat: number): ShiftTick {
  const points = scorchPoints(heat, state.combo);
  let next: ShiftState = { ...state, score: cap(state.score + points) };
  const bounty = grant(next, "scorch");
  next = bounty.state;
  return { state: next, points: points + bounty.bonus, cleared: bounty.cleared };
}

export function applyKindle(state: ShiftState): ShiftTick {
  const bounty = grant(state, "kindle");
  return { state: bounty.state, points: bounty.bonus, cleared: bounty.cleared };
}

export function freshShift(previous: ShiftState): ShiftState {
  return {
    combo: 0,
    strikes: 0,
    score: 0,
    bountyIndex: previous.bountyIndex,
    bountyProgress: previous.bountyProgress,
    cracked: false,
  };
}
