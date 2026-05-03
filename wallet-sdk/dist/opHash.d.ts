import { type Address, type Hex } from "viem";
import type { UserOp } from "./types.js";
export declare function domainSeparator(chainId: bigint, account: Address): Hex;
export declare function structHash(op: UserOp): Hex;
/**
 * Compute the EIP-712 op hash a Nexora wallet expects.
 *
 * @param op       UserOp (signatures field is ignored)
 * @param chainId  Chain id (e.g. 20056n for Nexora Devnet)
 * @param account  Address of the smart account that will validate the op
 */
export declare function computeOpHash(op: UserOp, chainId: bigint, account: Address): Hex;
export declare function padU8(v: number): Hex;
//# sourceMappingURL=opHash.d.ts.map