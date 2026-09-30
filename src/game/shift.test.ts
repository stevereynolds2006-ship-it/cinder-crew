import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyKindle,
  applyScorch,
  applyStamp,
  bountyFor,
  classifyStamp,
  freshShift,
  heatBonus,
  isBlazeStoke,
  parseCallsign,
  WHITE_HEAT_AT,
  type ShiftState,
} from "./shift.ts";

const blank: ShiftState = {
  combo: 0,
  strikes: 0,
  score: 0,
  bountyIndex: 0,
  bountyProgress: 0,
  cracked: false,
};

test("perfect center, graze just outside, miss at the edge", () => {
  assert.equal(classifyStamp(0.5, 0.2), "perfect");
  assert.equal(classifyStamp(0.58, 0.2), "good");
  assert.equal(classifyStamp(0.64, 0.2), "graze");
  assert.equal(classifyStamp(0.02, 0.2), "miss");
});

test("combo climbs, a graze slips, a miss breaks and strikes", () => {
  const perfect = applyStamp(blank, "perfect", false);
  assert.equal(perfect.state.combo, 1);
  assert.equal(perfect.state.strikes, 0);
  const grazed = applyStamp({ ...perfect.state, combo: 4, strikes: 1 }, "graze", false);
  assert.equal(grazed.state.combo, 3);
  assert.equal(grazed.state.strikes, 1);
  const missed = applyStamp(grazed.state, "miss", false);
  assert.equal(missed.state.combo, 0);
  assert.equal(missed.state.strikes, 2);
});

test("third strike cracks the shift and a perfect gives a strike back", () => {
  const cracked = applyStamp({ ...blank, strikes: 2, combo: 2 }, "miss", false);
  assert.equal(cracked.state.cracked, true);
  assert.equal(cracked.state.strikes, 3);
  const forgiven = applyStamp({ ...blank, strikes: 1 }, "perfect", false);
  assert.equal(forgiven.state.strikes, 0);
});

test("blaze pays more and every fourth stoke is a blaze", () => {
  const calm = applyStamp(blank, "perfect", false).points;
  const blaze = applyStamp(blank, "perfect", true).points;
  assert.ok(blaze > calm);
  assert.equal(isBlazeStoke(0), false);
  assert.equal(isBlazeStoke(3), true);
  assert.equal(isBlazeStoke(4), false);
});

test("white heat starts at three and bounties pay once", () => {
  assert.equal(heatBonus(WHITE_HEAT_AT - 1), 1);
  assert.ok(heatBonus(WHITE_HEAT_AT) > 1);
  let state: ShiftState = { ...blank, bountyIndex: 0 };
  state = applyStamp(state, "perfect", false).state;
  state = applyStamp(state, "perfect", false).state;
  const third = applyStamp(state, "perfect", false);
  assert.equal(third.cleared, bountyFor(0).label);
  assert.equal(third.state.bountyIndex, 1);
  assert.ok(third.state.score >= bountyFor(0).reward);
});

test("scorch and a full kindle clear their bounties", () => {
  const burning = { ...blank, bountyIndex: 1, combo: 3 };
  const scorched = applyScorch(burning, 2);
  assert.equal(scorched.cleared, "Burn a relic for heat");
  assert.ok(scorched.points > 0);
  let kindling: ShiftState = { ...blank, bountyIndex: 3 };
  kindling = applyKindle(kindling).state;
  kindling = applyKindle(kindling).state;
  const done = applyKindle(kindling);
  assert.equal(done.cleared, "Kindle three crew");
});

test("a fresh shift keeps the bounty and drops the score", () => {
  const next = freshShift({ ...blank, score: 900, combo: 4, strikes: 2, cracked: true, bountyIndex: 2, bountyProgress: 1 });
  assert.equal(next.score, 0);
  assert.equal(next.cracked, false);
  assert.equal(next.bountyIndex, 2);
  assert.equal(next.bountyProgress, 1);
});

test("callsigns stay short and plain", () => {
  assert.equal(parseCallsign("  Ash  Maw "), "Ash Maw");
  assert.throws(() => parseCallsign("nope!"));
  assert.throws(() => parseCallsign("x"));
});
