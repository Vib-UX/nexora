import { type Hex, encodeAbiParameters, parseAbiParameters } from "viem";
import { type EcdsaSig, type PqSig, EMPTY_ECDSA, EMPTY_PQ } from "../types.js";

/**
 * Encode `(EcdsaSig, PqSig)` into the bytes blob expected by
 * `NexoraAccount.execute_user_op` in the `signatures` field.
 */
export function encodeSignatures(
  ecdsa: EcdsaSig | null,
  pq: PqSig | null,
): Hex {
  return encodeAbiParameters(
    parseAbiParameters(
      "(bytes32 r, bytes32 s, uint8 v) ecdsa, (uint16 scheme, bytes32 pubkeyHash, bytes sigBytes) pq",
    ),
    [ecdsa ?? EMPTY_ECDSA, pq ?? EMPTY_PQ],
  );
}
