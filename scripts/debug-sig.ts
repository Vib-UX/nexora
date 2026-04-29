/**
 * Debug helper: build a UserOp the same way the agent does, sign it with
 * ECDSA, then recover the signer locally — to make sure the SDK's signing
 * round-trip is internally consistent.
 *
 * If this prints `recovered == owner`, the SDK + opHash are fine and the
 * on-chain ECDSA failure is purely a hash-mismatch between the wallet's
 * compute_op_hash and the SDK's computeOpHash.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Address,
  type Hex,
  hexToBytes,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress } from "viem";
import {
  PolicyTag,
  VerifierScheme,
  computeOpHash,
  encodeUserOp,
  type UserOp,
} from "@nexora/wallet-sdk";
import { signEcdsaOpHash } from "@nexora/wallet-sdk/signers";
import { createPublicClient, http } from "viem";

async function main() {

const dep = JSON.parse(readFileSync(resolve("deployments.json"), "utf8"));

const owner = privateKeyToAccount(
  "0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659" as Hex,
);

const op: UserOp = {
  sender: dep.account as Address,
  nonce: 1n,
  target: dep.bridgeMock as Address,
  value: parseEther("0.001"),
  callData: "0x",
  callGasLimit: 1_000_000n,
  validUntil: 0n,
  policyTag: PolicyTag.Low,
  verifierScheme: VerifierScheme.FalconMock,
  signatures: "0x",
};

const opHash = computeOpHash(op, BigInt(dep.chainId), dep.account);
console.log("op           ", op);
console.log("opHash (sdk) ", opHash);

const sig = await signEcdsaOpHash(owner, opHash);
console.log("ecdsa sig    ", sig);

// Reconstruct flat signature and recover.
const flat = (sig.r + sig.s.slice(2) + sig.v.toString(16).padStart(2, "0")) as Hex;
const recovered = await recoverMessageAddress({
  message: { raw: hexToBytes(opHash) },
  signature: flat,
});
console.log("owner addr   ", owner.address);
console.log("recovered    ", recovered);
console.log("ok           ", recovered.toLowerCase() === owner.address.toLowerCase());

// Compare with the on-chain compute_op_hash
const pub = createPublicClient({ transport: http("http://localhost:8547") });
const opBytes = encodeUserOp(op);
const onchain = (await pub.readContract({
  address: dep.account as Address,
  abi: [{
    type: "function",
    name: "opHashView",
    stateMutability: "view",
    inputs: [{ name: "opBytes", type: "bytes" }],
    outputs: [{ type: "bytes32" }],
  }],
  functionName: "opHashView",
  args: [opBytes],
})) as Hex;
console.log("opHash (chain)", onchain);
console.log("hashes match  ", onchain.toLowerCase() === opHash.toLowerCase());

}
main().catch(console.error);
