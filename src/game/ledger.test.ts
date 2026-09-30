import assert from "node:assert/strict";
import { test } from "node:test";
import { createGamePreview, RF } from "@rarefriends/friendsdk/game";
import { practiceCrew } from "./crew.ts";
import { CINDER_GAME, EXPECTED_REWARD, gradeNeedle, needleAt, timingWindow } from "./economy.ts";
import { createCinderLedger } from "./ledger.ts";

test("chance table pays about 0.90 RF", () => {
  assert.equal(EXPECTED_REWARD, 899_300_000_000_000_000n);
});

test("buy, settle, and redeem match FriendSDK preview accounting", async () => {
  const draw = () => 1600;
  const preview = createGamePreview(CINDER_GAME, {
    stake: 100n * RF,
    rfBalance: 24n * RF,
    friendId: 7730n,
    draw,
  });
  const ledger = createCinderLedger(CINDER_GAME, {
    stake: 100n * RF,
    rfBalance: 24n * RF,
    friendId: 7730n,
    draw,
  });
  await preview.client.buy(1n);
  ledger.buy(1n);
  const plays = await preview.client.play(1n);
  const ours = ledger.play(1n);
  assert.equal(plays[0]?.id, ours[0]?.id);
  await preview.client.settle(plays[0]!.id);
  const settled = ledger.settle(ours[0]!.id);
  assert.equal(settled.outcomeId, 2);
  await preview.client.redeem(2, 1n);
  ledger.redeem(2);
  const sdk = await preview.client.read();
  const oursSnap = ledger.snapshot();
  assert.equal(sdk.rfBalance, oursSnap.rfBalance);
  assert.equal(sdk.stake, oursSnap.stake);
  assert.equal(sdk.consumables, oursSnap.consumables);
  assert.equal(sdk.freeStake, oursSnap.freeStake);
  assert.equal(sdk.reservedPlays, oursSnap.reservedPlays);
  assert.equal(sdk.rewardLiability, oursSnap.rewardLiability);
  assert.deepEqual([...sdk.inventory], [...oursSnap.inventory]);
});

test("scorch destroys payout and kindle burns purse RF", () => {
  const ledger = createCinderLedger(CINDER_GAME, {
    stake: 100n * RF,
    rfBalance: 24n * RF,
    draw: () => 1600,
  });
  const before = ledger.snapshot().rfBalance;
  ledger.buy(1n);
  const [play] = ledger.play(1n);
  ledger.settle(play!.id);
  const afterBuy = ledger.snapshot();
  ledger.scorch(2, 1);
  const scorched = ledger.snapshot();
  assert.equal(scorched.rfBalance, afterBuy.rfBalance);
  assert.equal(scorched.burned, (RF * 25n) / 100n);
  assert.equal(scorched.inventory[1], 0n);
  ledger.kindle("Kindled Friend #3412");
  const kindled = ledger.snapshot();
  assert.equal(kindled.rfBalance, before - RF - RF / 4n);
  assert.equal(kindled.burned, (RF * 25n) / 100n + RF / 4n);
});

test("gen 1 crew widens the stamp more than a stand-in", () => {
  const bare = timingWindow(2, [], 0);
  const withGen1 = timingWindow(2, [1], 0);
  const withGen6 = timingWindow(2, [6], 0);
  assert.ok(withGen1 > withGen6);
  assert.ok(withGen6 > bare);
  assert.equal(gradeNeedle(0.5, withGen1), "perfect");
  assert.equal(gradeNeedle(0, withGen1), "miss");
  assert.equal(needleAt(0, 1000), 0);
  assert.equal(needleAt(250, 1000), 0.5);
});

test("practice crew keeps canonical samples and 16px stand-ins", () => {
  const { player, crew } = practiceCrew();
  assert.equal(player.id, "7730");
  assert.equal(player.familyName, "Hoverer");
  assert.equal(crew[0]?.id, "3412");
  assert.equal(crew[0]?.familyName, "Skeleton");
  for (const member of crew) {
    if (member.pattern) {
      assert.equal(member.pattern.length, 16);
      for (const row of member.pattern) assert.equal(row.length, 16);
    }
  }
});
