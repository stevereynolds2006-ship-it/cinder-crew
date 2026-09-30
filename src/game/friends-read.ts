import { isAddress, type Address } from "viem";
import { readGenerationEligibility } from "@rarefriends/friendsdk/identity";
import { readOwnedFriends } from "@rarefriends/friendsdk/owned";
import { createFriendReader } from "@rarefriends/friendsdk/sprites";
import { createFriendPublicClient } from "@rarefriends/friendsdk/wallet";

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

/** Reads the wallet in the browser. The Robinhood RPC allows this from a public page. */
export async function discoverFriends(account: string): Promise<{
  friends: DiscoveredFriend[];
  hiddenCount: number;
  total: number;
}> {
  const owner = accountOf(account);
  const client = createFriendPublicClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const owned = await readOwnedFriends(client, owner, { signal: controller.signal });
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
    return { friends, hiddenCount: owned.hiddenCount, total: ranked.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read this wallet's Friends.";
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}

export async function loadSprite(tokenId: string): Promise<{ familyName: string; frames: string[] }> {
  if (!/^\d+$/.test(tokenId) || tokenId === "0") throw new Error("Bad Friend id.");
  const sprites = await createFriendReader().read(BigInt(tokenId));
  return {
    familyName: sprites.familyName,
    frames: sprites.clips.idle.down.map((frame) => frame.bitmap.toString(16)),
  };
}

export async function confirmFriend(
  account: string,
  tokenId: string,
): Promise<{ eligible: boolean; generation: number; hardwired: boolean }> {
  if (!/^\d+$/.test(tokenId)) throw new Error("Missing Friend.");
  const client = createFriendPublicClient();
  const result = await readGenerationEligibility(client, BigInt(tokenId), accountOf(account));
  return {
    eligible: result.eligible === true,
    generation: result.generation,
    hardwired: result.hardwired,
  };
}
