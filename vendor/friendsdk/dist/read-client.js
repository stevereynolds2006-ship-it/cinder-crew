import { createClient, http } from "viem";
import { getBlockNumber, getChainId, getLogs, readContract } from "viem/actions";
/** Public RPC client with only the actions used by previews and artwork reads. */
export function createFriendReadClient(rpcUrl, options = {}) {
    const client = createClient({ transport: http(rpcUrl, options), cacheTime: 0, pollingInterval: 1_000 });
    return {
        getBlockNumber: parameters => getBlockNumber(client, parameters),
        getChainId: () => getChainId(client),
        getLogs: parameters => getLogs(client, parameters),
        readContract: parameters => readContract(client, parameters),
    };
}
