import { type Hex } from "viem";
import { type EcdsaSig, type PqSig } from "../types.js";
/**
 * Encode `(EcdsaSig, PqSig)` into the bytes blob expected by
 * `NexoraAccount.execute_user_op` in the `signatures` field.
 */
export declare function encodeSignatures(ecdsa: EcdsaSig | null, pq: PqSig | null): Hex;
//# sourceMappingURL=envelope.d.ts.map