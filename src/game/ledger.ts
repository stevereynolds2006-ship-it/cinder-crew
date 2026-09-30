import {
  outcomeForRoll,
  samplePreviewRoll,
  type ChanceGameDefinition,
  type GamePlay,
  type GameSnapshot,
} from "@rarefriends/friendsdk/game";
import { CINDER_GAME, KINDLE_COST, MAX_PRIZE, OFFERING_COST } from "./economy.ts";

const UINT256_MAX = (1n << 256n) - 1n;

export type LedgerEvent = Readonly<{
  kind: "stoke" | "redeem" | "kindle" | "offering" | "scorch";
  label: string;
  amount: bigint;
}>;

export type CinderSnapshot = GameSnapshot &
  Readonly<{
    burned: bigint;
    heat: number;
    log: readonly LedgerEvent[];
  }>;

export type LedgerSave = {
  rfBalance: string;
  stake: string;
  consumables: string;
  reservedPlays: string;
  rewardLiability: string;
  inventory: string[];
  plays: { id: string; outcomeId: number | null }[];
  burned: string;
  heat: number;
  log: { kind: LedgerEvent["kind"]; label: string; amount: string }[];
};

type Options = {
  stake?: bigint;
  rfBalance?: bigint;
  friendId?: bigint;
  burned?: bigint;
  heat?: number;
  draw?: () => number;
  save?: LedgerSave;
};

function uint(value: bigint, name: string, positive = false): bigint {
  if (typeof value !== "bigint" || value < (positive ? 1n : 0n) || value > UINT256_MAX) {
    throw new RangeError(`Invalid ${name}.`);
  }
  return value;
}

/**
 * FriendSDK v0.1.4 chance-game ledger (buy / play / settle / redeem) plus burn.
 * Burn is not in the SDK client, so scorch, kindle, and offering live here.
 * Buy, play, settle, and redeem follow createGamePreview's accounting.
 */
export function createCinderLedger(definition: ChanceGameDefinition = CINDER_GAME, options: Options = {}) {
  const maxPrize = MAX_PRIZE;
  const friendId = uint(options.save ? 0n : (options.friendId ?? 0n), "friend ID");
  let stake = uint(options.save ? BigInt(options.save.stake) : (options.stake ?? 0n), "stake");
  let rfBalance = uint(options.save ? BigInt(options.save.rfBalance) : (options.rfBalance ?? 0n), "RF balance");
  let consumables = options.save ? uint(BigInt(options.save.consumables), "consumables") : 0n;
  let reservedPlays = options.save ? uint(BigInt(options.save.reservedPlays), "reserved") : 0n;
  let rewardLiability = options.save ? uint(BigInt(options.save.rewardLiability), "liability") : 0n;
  let burned = options.save ? uint(BigInt(options.save.burned), "burned") : uint(options.burned ?? 0n, "burned");
  let heat = options.save ? options.save.heat : (options.heat ?? 0);
  const inventory = definition.outcomes.map((_, index) =>
    options.save ? uint(BigInt(options.save.inventory[index] ?? "0"), "inventory") : 0n,
  );
  const plays: GamePlay[] = options.save
    ? options.save.plays.map((play) =>
        Object.freeze({ id: uint(BigInt(play.id), "play ID", true), outcomeId: play.outcomeId }),
      )
    : [];
  const log: LedgerEvent[] = options.save
    ? options.save.log.map((event) =>
        Object.freeze({ kind: event.kind, label: event.label, amount: BigInt(event.amount) }),
      )
    : [];
  const draw = options.draw ?? samplePreviewRoll;
  const freeStake = () => stake - reservedPlays - rewardLiability;

  function push(event: LedgerEvent) {
    log.unshift(Object.freeze(event));
    if (log.length > 12) log.pop();
  }

  function canBuy(quantity: bigint): boolean {
    if (typeof quantity !== "bigint" || quantity < 1n || quantity > UINT256_MAX) return false;
    const cost = quantity * definition.price;
    const reserve = quantity * maxPrize;
    return (
      cost <= UINT256_MAX &&
      reserve <= UINT256_MAX &&
      stake + cost <= UINT256_MAX &&
      freeStake() >= maxPrize &&
      freeStake() + cost >= reserve &&
      cost <= rfBalance
    );
  }

  function snapshot(): CinderSnapshot {
    return Object.freeze({
      mode: "preview" as const,
      friendId,
      rfBalance,
      consumables,
      stake,
      freeStake: freeStake(),
      reservedPlays,
      rewardLiability,
      inventory: Object.freeze([...inventory]),
      plays: Object.freeze(plays.map((play) => Object.freeze({ ...play }))),
      burned,
      heat,
      log: Object.freeze([...log]),
    });
  }

  function buy(quantity: bigint) {
    uint(quantity, "quantity", true);
    const cost = quantity * definition.price;
    if (!canBuy(quantity)) {
      if (cost > rfBalance) throw new Error("Not enough simulated RF in this Friend's purse.");
      throw new Error("The furnace float can't back another ember yet. Redeem or scorch a kept relic.");
    }
    stake += cost;
    rfBalance -= cost;
    consumables += quantity;
    reservedPlays += quantity * maxPrize;
    push({ kind: "stoke", label: `Spent ${quantity} ember`, amount: cost });
  }

  function play(quantity = 1n) {
    uint(quantity, "quantity", true);
    if (quantity > consumables) throw new Error("No ember is ready.");
    consumables -= quantity;
    const added: GamePlay[] = [];
    for (let index = 0n; index < quantity; index++) {
      const play = Object.freeze({ id: BigInt(plays.length + 1), outcomeId: null });
      plays.push(play);
      added.push(play);
    }
    return added;
  }

  function settle(playId: bigint) {
    uint(playId, "play ID", true);
    if (playId > BigInt(plays.length)) throw new RangeError("Unknown play.");
    const index = Number(playId - 1n);
    const play = plays[index];
    if (!play || play.outcomeId !== null) throw new Error("Play is already settled.");
    const outcomeId = outcomeForRoll(definition, draw());
    const outcome = definition.outcomes[outcomeId - 1];
    if (!outcome) throw new Error("Invalid outcome table.");
    reservedPlays -= maxPrize;
    rewardLiability += outcome.reward;
    inventory[outcomeId - 1] = (inventory[outcomeId - 1] ?? 0n) + 1n;
    const result = Object.freeze({ id: play.id, outcomeId });
    plays[index] = result;
    return result;
  }

  function redeem(outcomeId: number, quantity = 1n) {
    uint(quantity, "quantity", true);
    if (!Number.isInteger(outcomeId) || outcomeId < 1 || outcomeId > definition.outcomes.length) {
      throw new RangeError("Unknown outcome.");
    }
    const index = outcomeId - 1;
    const outcome = definition.outcomes[index];
    if (!outcome || outcome.reward === 0n) throw new Error("This relic has no RF to return.");
    if ((inventory[index] ?? 0n) < quantity) throw new Error("That relic isn't in the purse.");
    const amount = outcome.reward * quantity;
    uint(rfBalance + amount, "RF balance");
    inventory[index] = (inventory[index] ?? 0n) - quantity;
    rewardLiability -= amount;
    stake -= amount;
    rfBalance += amount;
    push({ kind: "redeem", label: `Redeemed ${outcome.name}`, amount });
  }

  function burnFromPurse(amount: bigint, kind: "kindle" | "offering", label: string) {
    uint(amount, "burn", true);
    if (amount > rfBalance) throw new Error("Not enough simulated RF to burn.");
    rfBalance -= amount;
    burned += amount;
    push({ kind, label, amount });
  }

  function scorch(outcomeId: number, heatGain: number) {
    if (!Number.isInteger(outcomeId) || outcomeId < 1 || outcomeId > definition.outcomes.length) {
      throw new RangeError("Unknown outcome.");
    }
    if (!Number.isFinite(heatGain) || heatGain < 0) throw new RangeError("Invalid heat.");
    const index = outcomeId - 1;
    const outcome = definition.outcomes[index];
    if (!outcome) throw new RangeError("Unknown outcome.");
    if ((inventory[index] ?? 0n) < 1n) throw new Error("That relic isn't in the purse.");
    const reward = outcome.reward;
    if (reward > 0n && (rewardLiability < reward || stake < reward)) {
      throw new Error("The furnace float can't destroy a prize this large. Redeem it instead.");
    }
    inventory[index] = (inventory[index] ?? 0n) - 1n;
    if (reward > 0n) {
      rewardLiability -= reward;
      stake -= reward;
      burned += reward;
    }
    heat += heatGain;
    push({
      kind: "scorch",
      label: reward === 0n ? `Burned ${outcome.name} for heat` : `Burned ${outcome.name}`,
      amount: reward,
    });
  }

  return {
    definition,
    snapshot,
    canBuy,
    buy,
    play,
    settle,
    redeem,
    kindle(label: string) {
      burnFromPurse(KINDLE_COST, "kindle", label);
    },
    offering() {
      burnFromPurse(OFFERING_COST, "offering", "Offering to the furnace");
    },
    scorch,
    save(): LedgerSave {
      return {
        rfBalance: rfBalance.toString(),
        stake: stake.toString(),
        consumables: consumables.toString(),
        reservedPlays: reservedPlays.toString(),
        rewardLiability: rewardLiability.toString(),
        inventory: inventory.map((count) => count.toString()),
        plays: plays.map((play) => ({ id: play.id.toString(), outcomeId: play.outcomeId })),
        burned: burned.toString(),
        heat,
        log: log.map((event) => ({ kind: event.kind, label: event.label, amount: event.amount.toString() })),
      };
    },
  };
}

export type CinderLedger = ReturnType<typeof createCinderLedger>;
