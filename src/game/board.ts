import { createServerFn } from "@tanstack/react-start";
import { RANK_TITLES, type RankTitle } from "./economy";
import { parseCallsign, SCORE_CAP } from "./shift";

export type BoardRow = {
  handle: string;
  score: number;
  rankTitle: string;
  combo: number;
};

export type PostResult = {
  placed: boolean;
  score: number;
};

const ranks = new Set<string>(RANK_TITLES);

function asRank(value: string): RankTitle {
  if (!ranks.has(value)) throw new Error("That rank isn't from this furnace.");
  return value as RankTitle;
}

function asScore(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > SCORE_CAP) {
    throw new Error("That shift score can't be posted.");
  }
  return value;
}

function asCombo(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 99) throw new Error("Combo is out of range.");
  return value;
}

export const listBoard = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ handle: string; score: number; rank_title: string; combo: number }>`
    select handle, score, rank_title, combo
    from cinder_scores
    order by score desc, created_at asc
    limit 12
  `;
  return rows.map((row) => ({
    handle: row.handle,
    score: Number(row.score),
    rankTitle: row.rank_title,
    combo: Number(row.combo),
  })) satisfies BoardRow[];
});

export const postScore = createServerFn({ method: "POST" })
  .validator((input: { handle: string; score: number; rankTitle: string; combo: number }) => {
    if (!input || typeof input.handle !== "string" || typeof input.rankTitle !== "string") {
      throw new Error("Missing score.");
    }
    return {
      handle: parseCallsign(input.handle),
      score: asScore(input.score),
      rankTitle: asRank(input.rankTitle),
      combo: asCombo(input.combo),
    };
  })
  .handler(async ({ data }): Promise<PostResult> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const key = data.handle.toLowerCase();
    const updated = await sql<{ score: number }>`
      insert into cinder_scores (handle, handle_key, score, rank_title, combo)
      values (${data.handle}, ${key}, ${data.score}, ${data.rankTitle}, ${data.combo})
      on conflict (handle_key) do update
      set handle = excluded.handle,
          score = excluded.score,
          rank_title = excluded.rank_title,
          combo = excluded.combo,
          created_at = now()
      where cinder_scores.score < excluded.score
      returning score
    `;
    const placed = updated[0];
    if (placed) return { placed: true, score: Number(placed.score) };
    const current = await sql<{ score: number }>`
      select score from cinder_scores where handle_key = ${key} limit 1
    `;
    return { placed: false, score: Number(current[0]?.score ?? data.score) };
  });
