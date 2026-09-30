import { createServerFn } from "@tanstack/react-start";
import { isAddress, type Address } from "viem";
import { createFriendReader } from "@rarefriends/friendsdk/sprites";
import { createFriendPublicClient } from "@rarefriends/friendsdk/wallet";
import { readOwnedFriends } from "@rarefriends/friendsdk/owned";
import { readGenerationEligibility } from "@rarefriends/friendsdk/identity";

const SPRITE_CAP = 12;

export type DiscoveredFriend = {
  id: string;
  label: string;
  generation: number;
  walletAddress: string;
  familyName: string | null;
  frames: string[] | null;
};

function accountOf(value: string): Address {
  if (!isAddress(value)) throw new Error("That is not a wallet address.");
  return value;
}

export const discoverFriends = createServerFn({ method: "POST" })
  .validator((input: { account: string }) => {
    if (!input || typeof input.account !== "string") throw new Error("Missing wallet.");
    accountOf(input.account);
    return { account: input.account };
  })
  .handler(async ({ data }) => {
    const account = accountOf(data.account);
    const client = createFriendPublicClient();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const owned = await readOwnedFriends(client, account, { signal: controller.signal });
      const ranked = [...owned.friends].sort((a, b) => a.generation - b.generation || (a.id < b.id ? -1 : 1));
      const reader = createFriendReader();
      const friends: DiscoveredFriend[] = [];
      for (const friend of ranked) {
        const payload: DiscoveredFriend = {
          id: friend.id.toString(),
          label: friend.label,
          generation: friend.generation,
          walletAddress: friend.walletAddress,
          familyName: null,
          frames: null,
        };
        if (friends.length < SPRITE_CAP) {
          try {
            const sprites = await reader.read(friend.id);
            payload.familyName = sprites.familyName;
            payload.frames = sprites.clips.idle.down.map((frame) => frame.bitmap.toString(16));
          } catch {
            payload.familyName = null;
            payload.frames = null;
          }
        }
        friends.push(payload);
      }
      return {
        friends,
        hiddenCount: owned.hiddenCount,
        total: ranked.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read this wallet's Friends.";
      throw new Error(message);
    } finally {
      clearTimeout(timer);
    }
  });

export const loadSprite = createServerFn({ method: "POST" })
  .validator((input: { tokenId: string }) => {
    if (!input || !/^\d+$/.test(input.tokenId) || input.tokenId === "0") throw new Error("Bad Friend id.");
    return { tokenId: input.tokenId };
  })
  .handler(async ({ data }) => {
    const sprites = await createFriendReader().read(BigInt(data.tokenId));
    return {
      familyName: sprites.familyName,
      frames: sprites.clips.idle.down.map((frame) => frame.bitmap.toString(16)),
    };
  });

export const confirmFriend = createServerFn({ method: "POST" })
  .validator((input: { account: string; tokenId: string }) => {
    if (!input || typeof input.account !== "string" || !/^\d+$/.test(input.tokenId ?? "")) {
      throw new Error("Missing Friend.");
    }
    accountOf(input.account);
    return input;
  })
  .handler(async ({ data }) => {
    const client = createFriendPublicClient();
    const result = await readGenerationEligibility(client, BigInt(data.tokenId), accountOf(data.account));
    return {
      eligible: result.eligible === true,
      generation: result.generation,
      hardwired: result.hardwired,
    };
  });
