import {
  defineChanceGame,
  expectedReward,
  maximumPrize,
  RF,
  type ChanceGameDefinition,
} from "@rarefriends/friendsdk/game";

/** Reviewable chance table. Chances are basis points and must total 10,000. */
export const CINDER_GAME: ChanceGameDefinition = defineChanceGame({
  name: "Cinder Crew",
  consumable: "Ember",
  price: RF,
  outcomes: [
    { name: "Cinder Dust", chanceBps: 1600, reward: 0n },
    { name: "Warm Coal", chanceBps: 2700, reward: (RF * 25n) / 100n },
    { name: "Bright Shard", chanceBps: 2200, reward: (RF * 64n) / 100n },
    { name: "Tempered Ingot", chanceBps: 1600, reward: RF },
    { name: "Crew Brand", chanceBps: 1100, reward: (RF * 160n) / 100n },
    { name: "Furnace Heart", chanceBps: 500, reward: (RF * 350n) / 100n },
    { name: "Mythic Core", chanceBps: 300, reward: 6n * RF },
  ],
});

export const EXPECTED_REWARD = expectedReward(CINDER_GAME);
export const MAX_PRIZE = maximumPrize(CINDER_GAME);
export const STARTING_PURSE = 24n * RF;
export const STARTING_STAKE = 100n * RF;
export const KINDLE_COST = RF / 4n;
export const OFFERING_COST = RF;
export const DUST_HEAT = 0.15;
export const MAX_KINDLED = 3;

const GEN_WINDOW: Record<number, number> = {
  1: 0.22,
  2: 0.18,
  3: 0.15,
  4: 0.13,
  5: 0.11,
  6: 0.1,
};

export type Grade = "perfect" | "good" | "miss";

export function formatRf(value: bigint, digits = 2): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const whole = abs / RF;
  const frac = (abs % RF).toString().padStart(18, "0").slice(0, digits);
  return `${sign}${whole.toString()}.${frac}`;
}

export function timingWindow(generation: number, attunedGenerations: readonly number[], heat: number): number {
  const base = GEN_WINDOW[generation] ?? 0.1;
  const crew = attunedGenerations.reduce((sum, gen) => sum + (GEN_WINDOW[gen] ?? 0.1) * 0.45, 0);
  const fromHeat = Math.min(0.06, Math.max(0, heat) * 0.0015);
  return Math.min(0.46, base + crew + fromHeat);
}

/** Needle travels the bar and back once over `periodMs`. 0.5 is the center. */
export function needleAt(elapsedMs: number, periodMs: number): number {
  const t = Math.min(Math.max(elapsedMs, 0), periodMs) / periodMs;
  return t < 0.5 ? t * 2 : (1 - t) * 2;
}

export function gradeNeedle(needle: number, windowWidth: number): Grade {
  const distance = Math.abs(needle - 0.5);
  const half = windowWidth / 2;
  if (distance > half) return "miss";
  if (distance <= half * 0.35) return "perfect";
  return "good";
}

export function heatMultiplier(grade: Grade): number {
  if (grade === "perfect") return 2;
  if (grade === "good") return 1;
  return 0.5;
}

/** Timing never changes the relic. It only changes heat gained by burning it. */
export function scorchHeat(reward: bigint, grade: Grade): number {
  const base = reward === 0n ? DUST_HEAT : Number(reward) / 1e18;
  return base * heatMultiplier(grade);
}

export const RANK_TITLES = ["Spark", "Coalhand", "Furnace Kin", "Mythic Smith", "Cinder Saint"] as const;
export type RankTitle = (typeof RANK_TITLES)[number];

export function rankFor(burned: bigint): RankTitle {
  const rf = Number(burned) / 1e18;
  if (rf >= 40) return "Cinder Saint";
  if (rf >= 15) return "Mythic Smith";
  if (rf >= 5) return "Furnace Kin";
  if (rf >= 1) return "Coalhand";
  return "Spark";
}

export function percentLabel(chanceBps: number): string {
  return `${(chanceBps / 100).toFixed(chanceBps % 100 === 0 ? 0 : 1)}%`;
}
