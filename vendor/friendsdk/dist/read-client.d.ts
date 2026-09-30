import { http, type PublicClient } from "viem";
export type FriendReadClient = Pick<PublicClient, "getBlockNumber" | "getChainId" | "getLogs" | "readContract">;
/** Public RPC client with only the actions used by previews and artwork reads. */
export declare function createFriendReadClient(rpcUrl: string, options?: Parameters<typeof http>[1]): FriendReadClient;
